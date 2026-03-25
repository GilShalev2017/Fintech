import { Client } from '@elastic/elasticsearch';
import {
  AggregationsStringTermsBucket,
  AggregationsDateHistogramBucket,
} from '@elastic/elasticsearch/lib/api/types';
import { SearchQuery, AnalyticsData } from '../types';

// ─────────────────────────────────────────────
// 🔍 ELASTICSEARCH CONNECTION
// ─────────────────────────────────────────────
let esClient: Client | null = null;

export const connectElasticsearch = async (): Promise<Client> => {
  esClient = new Client({
    node: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
    // Auth block is only added when both env vars are present.
    // An empty-string username would cause ES to reject the connection.
    ...(process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
      ? {
          auth: {
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD,
          },
        }
      : {}),
  });

  const health = await esClient.cluster.health();
  console.log(`✅ Elasticsearch cluster status: ${health.status}`);

  await createIndexes();
  return esClient;
};

// ─────────────────────────────────────────────
// 🗂️ INDEX DEFINITIONS
// ─────────────────────────────────────────────
// Indexes are created on startup if they don't exist yet.
// Mapping types matter:
//   text    → full-text analyzed (searchable with fuzziness, stemming)
//   keyword → exact-match / aggregatable (filters, terms, sorting)
//   geo_point → enables distance/bounding-box spatial queries

const createIndexes = async (): Promise<void> => {
  if (!esClient) return;

  try {
    if (!(await esClient.indices.exists({ index: 'hotels' }))) {
      await esClient.indices.create({
        index: 'hotels',
        mappings: {
          properties: {
            name:        { type: 'text', fields: { keyword: { type: 'keyword' } } },
            location:    { type: 'text', fields: { keyword: { type: 'keyword' } } },
            city:        { type: 'keyword' },
            country:     { type: 'keyword' },
            rating:      { type: 'float' },
            price:       { type: 'float' },
            amenities:   { type: 'keyword' },
            description: { type: 'text' },
            coordinates: { type: 'geo_point' },
            createdAt:   { type: 'date' },
            updatedAt:   { type: 'date' },
          },
        },
      });
      console.log('📄 ES index created: hotels');
    }

    if (!(await esClient.indices.exists({ index: 'bookings' }))) {
      await esClient.indices.create({
        index: 'bookings',
        mappings: {
          properties: {
            bookingId:  { type: 'keyword' },
            userId:     { type: 'keyword' },
            companyId:  { type: 'keyword' },
            hotelId:    { type: 'keyword' },
            hotelName:  { type: 'text' },
            city:       { type: 'keyword' },
            checkIn:    { type: 'date' },
            checkOut:   { type: 'date' },
            totalPrice: { type: 'float' },
            status:     { type: 'keyword' },
            createdAt:  { type: 'date' },
          },
        },
      });
      console.log('📄 ES index created: bookings');
    }
  } catch (err) {
    console.error('❌ Error creating ES indexes:', err);
  }
};

// ─────────────────────────────────────────────
// 🔎 SEARCH & INDEX HELPERS
// ─────────────────────────────────────────────

export const searchHelper = {

  // ── Hotel search ────────────────────────────────────────────────────────
  // multi_match with fuzziness lets users type "Parsi" and still find "Paris".
  // Field boosting (city^3, location^2) prioritises city matches over name.
  // filter clause is zero-score (faster than must for range/term filters).
  async searchHotels(query: SearchQuery): Promise<Record<string, unknown>[]> {
    if (!esClient) return [];

    const { city, minPrice, maxPrice, minRating } = query;

    const must: object[] = city
      ? [{ multi_match: { query: city, fields: ['city^3', 'location^2', 'name'], fuzziness: 'AUTO' } }]
      : [{ match_all: {} }];

    const filter: object[] = [];

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.push({ range: { price: { gte: minPrice ?? 0, lte: maxPrice ?? 10_000 } } });
    }
    if (minRating !== undefined) {
      filter.push({ range: { rating: { gte: minRating } } });
    }

    const result = await esClient.search({
      index: 'hotels',
      size: 50,
      query: { bool: { must, filter } },
      sort: [
        { _score: { order: 'desc' } },
        { rating: { order: 'desc' } },
        { price: { order: 'asc' } },
      ],
    });

    return result.hits.hits.map((hit) => ({
      _id: hit._id,
      ...(hit._source as object),
      score: hit._score,
    }));
  },

  // ── Index hotel ─────────────────────────────────────────────────────────
  // toObject() converts a Mongoose document to a plain object.
  // We strip _id from the document body and pass it as the ES document ID
  // so MongoDB _id and ES ID stay in sync.
  async indexHotel(hotel: { _id: unknown; toObject?: () => Record<string, unknown> } & Record<string, unknown>): Promise<boolean> {
    if (!esClient) return false;
    try {
      const { _id, ...doc } = hotel.toObject?.() ?? hotel;
      await esClient.index({ index: 'hotels', id: String(_id), document: doc });
      return true;
    } catch (err) {
      console.error('❌ Hotel index error:', err);
      return false;
    }
  },

  // ── Index booking ────────────────────────────────────────────────────────
  async indexBooking(booking: { _id: unknown; toObject?: () => Record<string, unknown> } & Record<string, unknown>): Promise<boolean> {
    if (!esClient) return false;
    try {
      const { _id, ...rest } = booking.toObject?.() ?? booking;
      await esClient.index({
        index: 'bookings',
        id: String(_id),
        document: {
          bookingId:  String(_id),
          userId:     String(rest.userId),
          companyId:  String(rest.companyId),
          hotelId:    String(rest.hotelId),
          hotelName:  rest.hotelName,
          city:       rest.city,
          checkIn:    rest.checkIn,
          checkOut:   rest.checkOut,
          totalPrice: rest.totalPrice,
          status:     rest.status,
          createdAt:  rest.createdAt,
        },
      });
      return true;
    } catch (err) {
      console.error('❌ Booking index error:', err);
      return false;
    }
  },

  // ── Analytics aggregations ───────────────────────────────────────────────
  // size: 0 means we only want aggregation results, not raw hits (faster).
  // Terms agg → spend grouped by city.
  // Date histogram → spend bucketed by calendar month.
  async getAnalytics(companyId: string, startDate: Date, endDate: Date): Promise<AnalyticsData> {
    if (!esClient) return { spendByCity: [], monthlyTrends: [] };

    const filter = [
      { term: { companyId } },
      { range: { createdAt: { gte: startDate, lte: endDate } } },
    ];

    const [spendByCityRes, monthlyTrendsRes] = await Promise.all([
      esClient.search({
        index: 'bookings',
        size: 0,
        query: { bool: { filter } },
        aggs: {
          cities: {
            terms: { field: 'city', size: 10 },
            aggs: { total_spend: { sum: { field: 'totalPrice' } } },
          },
        },
      }),
      esClient.search({
        index: 'bookings',
        size: 0,
        query: { bool: { filter } },
        aggs: {
          monthly: {
            date_histogram: { field: 'createdAt', calendar_interval: 'month' },
            aggs: {
              total_spend: { sum: { field: 'totalPrice' } },
              booking_count: { value_count: { field: 'bookingId' } },
            },
          },
        },
      }),
    ]);

    const cityBuckets = ((spendByCityRes.aggregations as Record<string, { buckets: AggregationsStringTermsBucket[] }>)
      ?.cities?.buckets ?? []) as (AggregationsStringTermsBucket & { total_spend: { value: number } })[];

    const monthlyBuckets = ((monthlyTrendsRes.aggregations as Record<string, { buckets: AggregationsDateHistogramBucket[] }>)
      ?.monthly?.buckets ?? []) as (AggregationsDateHistogramBucket & { total_spend: { value: number }; booking_count: { value: number } })[];

    return {
      spendByCity: cityBuckets.map((b) => ({
        city:  String(b.key),
        total: b.total_spend.value,
        count: b.doc_count,
      })),
      monthlyTrends: monthlyBuckets.map((b) => ({
        month: String(b.key_as_string),
        total: b.total_spend.value,
        count: b.booking_count.value,
      })),
    };
  },
};

export const getESClient = (): Client | null => esClient;
export default connectElasticsearch;
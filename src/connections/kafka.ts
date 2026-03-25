import { Kafka, Producer, Consumer, Admin, logLevel } from 'kafkajs';
import { KafkaEvent } from '../types';

// ─────────────────────────────────────────────
// 📨 KAFKA CONNECTION
// ─────────────────────────────────────────────
// KafkaJS uses a single Kafka instance to create producers, consumers,
// and admin clients — all sharing the same broker config.
//
// clientId: identifies this app in Kafka broker logs (useful for debugging).
// brokers: comma-separated list from env — supports multi-broker clusters.
//   e.g. KAFKA_BROKERS=broker1:9092,broker2:9092
// logLevel WARN: KafkaJS is very verbose by default — this silences info noise.

let kafka: Kafka | null = null;
let producer: Producer | null = null;

export const connectKafka = async (): Promise<void> => {
  kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'app-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
    logLevel: logLevel.WARN,
  });

  // ── Producer ──────────────────────────────────────────────────────────
  // One shared producer for the whole app — creating a producer per request
  // is wasteful. The producer stays connected and batches messages internally.
  producer = kafka.producer();
  await producer.connect();
  console.log('✅ Kafka producer connected');

  // ── Default topics ────────────────────────────────────────────────────
  // Topics are auto-created by the broker (KAFKA_AUTO_CREATE_TOPICS_ENABLE=true
  // in docker-compose), but explicit creation lets you control partition count
  // and replication factor up front.
  await ensureTopics();
};

// ── Topic provisioning ───────────────────────────────────────────────────
const ensureTopics = async (): Promise<void> => {
  if (!kafka) return;
  const admin: Admin = kafka.admin();
  await admin.connect();

  const existing = await admin.listTopics();
  const desired = [
    'booking.created',
    'booking.confirmed',
    'booking.cancelled',
    'booking.completed',
    'user.registered',
    'user.deactivated',
  ];

  const toCreate = desired
    .filter((t) => !existing.includes(t))
    .map((topic) => ({
      topic,
      numPartitions: 1,       // increase for parallel consumers in production
      replicationFactor: 1,   // increase for fault tolerance in production
    }));

  if (toCreate.length > 0) {
    await admin.createTopics({ topics: toCreate });
    console.log(`📄 Kafka topics created: ${toCreate.map((t) => t.topic).join(', ')}`);
  }

  await admin.disconnect();
};

// ─────────────────────────────────────────────
// 📤 PRODUCER HELPER
// ─────────────────────────────────────────────
// publish() is the only function routes/services need to interact with.
// It wraps the KafkaJS producer and handles serialisation.
//
// KafkaEvent<T> is a typed envelope (defined in types/index.ts) that
// ensures every message has eventType, timestamp, correlationId, and payload.
export const kafkaHelper = {
  async publish<T>(event: KafkaEvent<T>): Promise<boolean> {
    if (!producer) {
      console.warn('⚠️  Kafka producer not available — event not published');
      return false;
    }
    try {
      await producer.send({
        topic: event.eventType,
        messages: [
          {
            // key ensures all events for the same entity go to the same partition
            // (preserving ordering per entity).
            key: event.correlationId,
            value: JSON.stringify(event),
          },
        ],
      });
      return true;
    } catch (err) {
      console.error('❌ Kafka publish error:', err);
      return false;
    }
  },

  // ── Consumer factory ───────────────────────────────────────────────────
  // Creates a new consumer subscribed to the given topics.
  // groupId: consumers with the same groupId share the work (each message
  // goes to only one consumer in the group — load balancing).
  // fromBeginning: true → replay all past messages on first connect.
  //   Use false in production to only process new messages.
  async createConsumer(
    topics: string[],
    handler: (event: KafkaEvent<unknown>) => Promise<void>,
    groupId: string = process.env.KAFKA_GROUP_ID || 'app-group',
  ): Promise<Consumer> {
    if (!kafka) throw new Error('Kafka not initialised — call connectKafka() first');

    const consumer: Consumer = kafka.consumer({ groupId });
    await consumer.connect();

    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const event = JSON.parse(message.value?.toString() ?? '{}') as KafkaEvent<unknown>;
          await handler(event);
        } catch (err) {
          console.error('❌ Kafka message handler error:', err);
        }
      },
    });

    return consumer;
  },
};

export const getKafkaInstance = (): Kafka | null => kafka;
export default connectKafka;
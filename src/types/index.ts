// ─────────────────────────────────────────────────────────────────────────────
// 📁 types/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// This file is the single source of truth for ALL TypeScript types in the app.
//
// FOLDER NAMING ANSWER:
// Keep the folder named `types/` — it's the TypeScript ecosystem convention
// and universally understood. What matters is how you organize *inside* it:
//
//   types/
//     index.ts        ← re-exports everything (this file)
//     models.ts       ← Mongoose document interfaces (IUser, IHotel, etc.)
//     requests.ts     ← Express request extensions (AuthRequest, etc.)
//     payloads.ts     ← JWT, API request/response shapes
//     events.ts       ← Kafka / RabbitMQ event payloads
//
// This way `import { IUser } from '../types'` still works cleanly,
// but each concern lives in its own file as the app grows.
// ─────────────────────────────────────────────────────────────────────────────

import { Document, Types } from "mongoose";
import { Request } from "express";

// ═════════════════════════════════════════════
// 👤 USER
// ═════════════════════════════════════════════

export type UserRole = "user" | "admin" | "finance" | "manager";

// IUser extends Mongoose Document — gives us .save(), ._id, timestamps etc.
export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  companyId: Types.ObjectId;
  department?: string;
  phone?: string;
  isActive: boolean;
  lastLogin?: Date;
  // Mongoose method defined in User.ts schema
  comparePassword(candidatePassword: string): Promise<boolean>;
  // Mongoose virtual defined in User.ts schema
  fullName: string;
  createdAt: Date;
  updatedAt: Date;
}

// ═════════════════════════════════════════════
// 🏢 COMPANY
// ═════════════════════════════════════════════

export type HotelTier = "budget" | "standard" | "premium" | "luxury";
export type CompanySize = "1-50" | "51-200" | "201-500" | "501-1000" | "1000+";

export interface ITravelPolicy {
  maxNightlyRate: number;
  minHotelRating: number;
  allowedCities: string[];
  requiresApproval: boolean;
  approvalThreshold: number;
  allowedHotelTiers: HotelTier[];
}

export interface ICompany extends Document {
  _id: Types.ObjectId;
  name: string;
  domain: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
  industry?: string;
  size?: CompanySize;
  travelPolicy: ITravelPolicy;
  monthlyBudget: number;
  currentSpend: number;
  isActive: boolean;
  settings: {
    autoApproval: boolean;
    notifications: boolean;
    requireCostCenter: boolean;
  };
  // Mongoose method defined in Company.ts schema
  isPolicyCompliant(bookingDetails: {
    price: number;
    hotelRating: number;
    city: string;
  }): { compliant: boolean; reason?: string };
  createdAt: Date;
  updatedAt: Date;
}

// ═════════════════════════════════════════════
// 🏨 HOTEL
// ═════════════════════════════════════════════

export interface IHotel extends Document {
  _id: Types.ObjectId;
  name: string;
  location: string;
  city: string;
  country: string;
  address?: {
    street?: string;
    zipCode?: string;
  };
  // GeoJSON Point — required for MongoDB 2dsphere geospatial queries
  coordinates?: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  rating: number;
  price: number;
  currency: string;
  amenities: string[];
  description?: string;
  images?: Array<{ url: string; alt?: string }>;
  tier: HotelTier;
  rooms: {
    total: number;
    available: number;
  };
  policies: {
    checkIn: string;
    checkOut: string;
    cancellationPolicy?: string;
    petFriendly: boolean;
  };
  supplierInfo?: {
    supplierId?: string;
    supplierName?: string;
    commission?: number;
  };
  isActive: boolean;
  popularity: number;
  // Mongoose method defined in Hotel.ts schema
  checkAvailability(checkIn: Date, checkOut: Date): boolean;
  // Mongoose virtual defined in Hotel.ts schema
  fullAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

// ═════════════════════════════════════════════
// 📋 BOOKING
// ═════════════════════════════════════════════

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "failed";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface IBooking extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  companyId: Types.ObjectId;
  hotelId: Types.ObjectId;
  hotelName: string;
  location: string;
  city: string;
  checkIn: Date;
  checkOut: Date;
  numberOfNights: number;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentDetails?: {
    transactionId?: string;
    method?: string;
    paidAt?: Date;
  };
  guestDetails: {
    name?: string;
    email?: string;
    phone?: string;
  };
  specialRequests?: string;
  confirmationNumber?: string;
  policyCompliant: boolean;
  policyViolationReason?: string;
  approvalRequired: boolean;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  snapshot?: Record<string, unknown>; // avoid `any` — snapshot is an arbitrary object
  cancellationDetails?: {
    cancelledAt?: Date;
    cancelledBy?: Types.ObjectId;
    reason?: string;
    refundAmount?: number;
  };
  // Mongoose method defined in Booking.ts schema
  cancel(userId: Types.ObjectId, reason?: string): Promise<IBooking>;
  // Mongoose virtual defined in Booking.ts schema
  duration: string;
  createdAt: Date;
  updatedAt: Date;
}

// ═════════════════════════════════════════════
// 🔐 AUTH & EXPRESS EXTENSIONS
// ═════════════════════════════════════════════

// Extends Express's Request so route handlers can access req.user with full typing.
// Defined here rather than in a .d.ts file so it stays co-located with IUser.
export interface AuthRequest extends Request {
  user?: IUser;
}

// Shape of the payload encoded inside a JWT token.
export interface JWTPayload {
  id: string;
  iat?: number; // issued at (set automatically by jwt.sign)
  exp?: number; // expiry  (set automatically by jwt.sign)
}

// ═════════════════════════════════════════════
// 🔍 SEARCH
// ═════════════════════════════════════════════

export interface SearchQuery {
  city?: string;
  checkIn?: string;
  checkOut?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
}

// ═════════════════════════════════════════════
// 📊 ANALYTICS
// ═════════════════════════════════════════════

export interface AnalyticsData {
  spendByCity: Array<{
    city: string;
    total: number;
    count: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    total: number;
    count: number;
  }>;
  savings?: number;
}

// ═════════════════════════════════════════════
// 📨 KAFKA EVENT PAYLOADS
// ═════════════════════════════════════════════
// Typed payloads for every Kafka topic the app produces/consumes.
// Keeping them here means producers and consumers share the same contract.

export type KafkaEventType =
  | "booking.created"
  | "booking.confirmed"
  | "booking.cancelled"
  | "booking.completed"
  | "user.registered"
  | "user.deactivated";

export interface KafkaEvent<T = Record<string, unknown>> {
  eventType: KafkaEventType;
  timestamp: string; // ISO 8601
  correlationId: string;
  payload: T;
}

export interface BookingCreatedPayload {
  bookingId: string;
  userId: string;
  companyId: string;
  hotelId: string;
  totalPrice: number;
  checkIn: string;
  checkOut: string;
}

// ═════════════════════════════════════════════
// 🐰 RABBITMQ JOB PAYLOADS
// ═════════════════════════════════════════════
// Each queue has a typed payload so workers and publishers stay in sync.

export type RabbitQueue = "email.send" | "pdf.generate" | "notification.push";

export interface SendEmailJob {
  to: string;
  subject: string;
  templateId: string;
  variables: Record<string, string>;
}

export interface GeneratePdfJob {
  bookingId: string;
  userId: string;
  outputPath: string;
}

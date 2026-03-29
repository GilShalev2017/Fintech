import dotenv from "dotenv";
// ⚠️ dotenv.config() MUST be called before any other imports that read process.env.
// This populates process.env from your .env file so all subsequent modules
// can safely access environment variables at import time.
dotenv.config();

import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";

// ── Connections ───────────────────────────────────────────────────────────────
// Each import path reflects the new `connections/` folder name.
// See bottom of this file for which services are enabled via .env flags.
import connectMongoDB from "./connections/mongodb";
import connectRedis from "./connections/redis";
import connectElasticsearch from "./connections/elasticsearch";
import connectKafka from "./connections/kafka";
import connectRabbitMQ from "./connections/rabbitmq";
import connectMSSQL from "./connections/mssql";
import { connectPostgres } from './connections/postgres';

// Routes
// import authRoutes from './routes/auth';
// import searchRoutes from './routes/search';
// import bookingRoutes from './routes/bookings';
// import analyticsRoutes from './routes/analytics';
// import hotelRoutes from './routes/hotels';
// import companyRoutes from './routes/companies';
import taskRoutes from "./routes/taskRoutes";
import personRoutes from "./routes/personRoutes";

// Middleware
import errorHandler from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import transactionRoutes from "./routes/transactionRoutes";

const app: Application = express();
const PORT = process.env.PORT || 5000;

// ─────────────────────────────────────────────
// 🛡️ SECURITY MIDDLEWARE
// ─────────────────────────────────────────────

// helmet sets a collection of secure HTTP response headers automatically.
// e.g. X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security.
// Protects against common web vulnerabilities like clickjacking and MIME sniffing.
app.use(helmet());

// cors controls which origins (domains) are allowed to call this API from a browser.
// Without this, browsers block cross-origin requests (e.g. frontend on :3000 → API on :5000).
// `credentials: true` allows cookies/auth headers to be sent cross-origin.
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
  }),
);

// ─────────────────────────────────────────────
// 🚦 RATE LIMITING
// ─────────────────────────────────────────────

// rateLimit prevents abuse by capping how many requests a single IP can make
// within a time window. Protects against brute-force attacks and DoS attempts.
//
// standardHeaders: 'draft-7' → sends the modern RateLimit header (RFC standard),
//   telling clients how many requests remain and when the window resets.
// legacyHeaders: false → removes the older X-RateLimit-* headers (redundant noise).
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"), // max 100 reqs per window
  standardHeaders: "draft-7", // RFC-standard RateLimit response header
  legacyHeaders: false, // disable X-RateLimit-* headers
  message: "Too many requests from this IP, please try again later.",
});

// Apply rate limiting only to /api/ routes, not health checks or static assets.
app.use("/api/", limiter);

// ─────────────────────────────────────────────
// 📦 BODY PARSING & COMPRESSION
// ─────────────────────────────────────────────

// express.json() parses incoming requests with JSON payloads (Content-Type: application/json).
// The 10mb limit prevents excessively large payloads from crashing the server.
app.use(express.json({ limit: "10mb" }));

// express.urlencoded() parses HTML form submissions (Content-Type: application/x-www-form-urlencoded).
// `extended: true` allows nested objects in form data.
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// compression() gzip-compresses HTTP responses before sending them to the client.
// Reduces bandwidth usage significantly for JSON-heavy APIs (often 60–80% smaller).
app.use(compression());

// ─────────────────────────────────────────────
// 📋 LOGGING
// ─────────────────────────────────────────────

// morgan logs HTTP requests to stdout.
// 'dev' format: colored, concise output great for development (GET /api/users 200 12ms).
// 'combined' format: Apache-style full logs suited for production log aggregators.
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// ─────────────────────────────────────────────
// ❤️ HEALTH CHECK
// ─────────────────────────────────────────────

// A lightweight endpoint that returns server liveness info.
// Used by load balancers, Docker/Kubernetes, and uptime monitors to verify
// the process is alive. Intentionally placed BEFORE auth middleware so it
// is always publicly accessible without a token.
// `version` reads the npm package version from the environment so you can
// confirm exactly which build is deployed without looking at logs.
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(), // seconds the process has been running
    version: process.env.npm_package_version,
  });
});

// ─────────────────────────────────────────────
// 🛣️ API ROUTES
// ─────────────────────────────────────────────

// app.use('/api/auth', authRoutes);
// app.use('/api/search', searchRoutes);
// app.use('/api/bookings', bookingRoutes);
// app.use('/api/analytics', analyticsRoutes);
// app.use('/api/hotels', hotelRoutes);
// app.use('/api/companies', companyRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/persons", personRoutes);
app.use("/api/transactions", transactionRoutes);

// ─────────────────────────────────────────────
// 🚨 ERROR HANDLING MIDDLEWARE
// ─────────────────────────────────────────────

// notFound must come AFTER all valid routes. It catches any request that
// didn't match a route above and returns a 404 response.
app.use(notFound);

// errorHandler must be the LAST middleware. Express identifies it as an error
// handler because it has 4 parameters (err, req, res, next).
// It catches errors passed via next(err) from any route or middleware above.
app.use(errorHandler);

// ─────────────────────────────────────────────
// 🚀 SERVER STARTUP
// ─────────────────────────────────────────────
// ── Feature flags ─────────────────────────────────────────────────────────
// Each service can be toggled on/off via .env without changing code.
// Set to 'true' to enable, anything else (or omit) to disable.
//
// Quick recipes:
//   MongoDB only:        ENABLED_MONGO=true  (all others omitted/false)
//   Full stack:          all set to true
//   No messaging:        ENABLED_KAFKA=false ENABLED_RABBIT=false
//
// This lets you spin up only the Docker containers you need and match
// the flags, avoiding connection errors from services that aren't running.
const isEnabled = (flag: string): boolean =>
  process.env[flag]?.toLowerCase() === "true";

const startServer = async (): Promise<void> => {
  try {
    // ── MongoDB (usually always on) ──────────────────────────────────────
    if (isEnabled("ENABLED_MONGO")) {
      await connectMongoDB();
      console.log("✅ MongoDB connected");
    } else {
      console.log("⏭️  MongoDB skipped (ENABLED_MONGO != true)");
    }

    // ── Redis ────────────────────────────────────────────────────────────
    if (isEnabled("ENABLED_REDIS")) {
      await connectRedis();
      console.log("✅ Redis connected");
    } else {
      console.log("⏭️  Redis skipped (ENABLED_REDIS != true)");
    }

    // ── Elasticsearch ─────────────────────────────────────────────────────
    if (isEnabled("ENABLED_ES")) {
      await connectElasticsearch();
      console.log("✅ Elasticsearch connected");
    } else {
      console.log("⏭️  Elasticsearch skipped (ENABLED_ES != true)");
    }

    // ── Kafka ─────────────────────────────────────────────────────────────
    if (isEnabled("ENABLED_KAFKA")) {
      await connectKafka();
      console.log("✅ Kafka connected");
    } else {
      console.log("⏭️  Kafka skipped (ENABLED_KAFKA != true)");
    }

    // ── RabbitMQ ──────────────────────────────────────────────────────────
    if (isEnabled("ENABLED_RABBIT")) {
      await connectRabbitMQ();
      console.log("✅ RabbitMQ connected");
    } else {
      console.log("⏭️  RabbitMQ skipped (ENABLED_RABBIT != true)");
    }

    // ── SQL Server ────────────────────────────────────────────────────────
    if (isEnabled("ENABLED_MSSQL")) {
      await connectMSSQL();
      console.log("✅ SQL Server connected");
    } else {
      console.log("⏭️  SQL Server skipped (ENABLED_MSSQL != true)");
    }

    // ── PostgreSQL (NEW) ────────────────────────────────────────────────────
    if (isEnabled("ENABLED_POSTGRES")) {
      await connectPostgres();
      console.log("✅ PostgreSQL connected");
    } else {
      console.log("⏭️  PostgreSQL skipped (ENABLED_POSTGRES != true)");
    }

    // Optional: Just for logging (pgAdmin is a UI, no real "connection" needed)
    if (isEnabled("ENABLED_PGADMIN")) {
      console.log("✅ pgAdmin available at http://localhost:5050");
    }

    // ── HTTP server ───────────────────────────────────────────────────────
    const server = app.listen(PORT, () => {
      console.log(
        `🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`,
      );
    });

    // ─────────────────────────────────────────
    // 🛑 GRACEFUL SHUTDOWN
    // ─────────────────────────────────────────

    // server.close() stops accepting NEW connections and waits for all
    // in-flight requests to finish before the callback fires.
    // Without this, a hard process.exit() would drop active requests mid-response.
    //
    // SIGTERM: sent by orchestrators (Docker, k8s, PM2) when stopping a container/process.
    // SIGINT:  sent when you press Ctrl+C in the terminal during development.
    const shutdown = (signal: string) => {
      console.log(`\n${signal} received — shutting down gracefully`);
      server.close(() => {
        console.log("✅ HTTP server closed, all in-flight requests finished");
        process.exit(0);
      });

      // Safety net: if requests don't finish within 10s, force exit.
      // Prevents the process from hanging forever on a stuck request.
      setTimeout(() => {
        console.error("⚠️ Forced shutdown after timeout");
        process.exit(1);
      }, 10_000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
};

// ─────────────────────────────────────────────
// 💥 UNHANDLED ERRORS (GLOBAL SAFETY NET)
// ─────────────────────────────────────────────

// Catches Promise rejections that were never .catch()-ed anywhere in the app.
// Without this, Node.js will eventually crash with an UnhandledPromiseRejection.
// We exit with code 1 so the process manager restarts the server.
process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Promise Rejection:", reason);
  process.exit(1);
});

// Catches synchronous exceptions that escaped all try/catch blocks.
// Rare but catastrophic — always exit and let the process manager restart.
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

startServer();

export default app;

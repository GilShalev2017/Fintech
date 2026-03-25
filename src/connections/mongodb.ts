import mongoose from 'mongoose';

// ─────────────────────────────────────────────
// 🍃 MONGODB CONNECTION
// ─────────────────────────────────────────────
// maxPoolSize: how many simultaneous connections Mongoose keeps open.
//   10 is a safe default — increase for high-concurrency workloads.
// serverSelectionTimeoutMS: how long to wait before giving up finding a server.
//   5s is tight enough to fail fast on startup if the DB is unreachable.
// socketTimeoutMS: how long an idle socket can stay open before being closed.
//   45s prevents stale connections from lingering.
const connectMongoDB = async (): Promise<typeof mongoose> => {
  const conn = await mongoose.connect(process.env.MONGODB_URI as string, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  console.log(`✅ MongoDB connected: ${conn.connection.host}`);

  // ── Event handlers ───────────────────────────────────────────────────────
  // Registered AFTER connect so they only fire on post-connect state changes.
  // These are lifecycle events — not startup errors (those throw and are
  // caught by the try/catch in startServer).
  mongoose.connection.on('error', (err: Error) => {
    console.error('❌ MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    // Mongoose will automatically attempt to reconnect — this is just a log.
    console.warn('⚠️  MongoDB disconnected — attempting reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('🔄 MongoDB reconnected');
  });

  return conn;
};

export default connectMongoDB;
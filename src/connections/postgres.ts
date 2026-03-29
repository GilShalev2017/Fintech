import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isEnabled = (flag: string): boolean =>
  process.env[flag]?.toLowerCase() === 'true';

// Create a connection pool (recommended for production)
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'Dev@password123',
  database: process.env.POSTGRES_DATABASE || 'money_db',
  
  // Connection pool settings
  max: 20,                    // maximum number of clients in the pool
  idleTimeoutMillis: 30000,   // close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // return an error after 5 seconds if connection could not be established
});

// Optional: Use connection string if you prefer
// const pool = new Pool({
//   connectionString: process.env.POSTGRES_URI,
//   ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
// });

export const connectPostgres = async (): Promise<void> => {
  if (!isEnabled('ENABLED_POSTGRES')) {
    console.log('⏭️  PostgreSQL connection skipped by feature flag');
    return;
  }

  try {
    // Test the connection
    const client = await pool.connect();
    
    // Simple health check query
    const result = await client.query('SELECT NOW() as current_time');
    
    console.log('✅ PostgreSQL connected successfully');
    console.log(`   Database: ${process.env.POSTGRES_DATABASE}`);
    console.log(`   Time: ${result.rows[0].current_time}`);

    client.release();

    // Optional: Listen for pool errors
    pool.on('error', (err) => {
      console.error('❌ Unexpected error on idle PostgreSQL client', err);
      process.exit(1);
    });

  } catch (error: any) {
    console.error('❌ Failed to connect to PostgreSQL:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('   → Make sure PostgreSQL container is running (`docker compose up -d postgres`)');
    } else if (error.code === '28P01') {
      console.error('   → Invalid username or password');
    } else if (error.code === '3D000') {
      console.error('   → Database does not exist');
    }
    
    throw error; // Let the main server handle the crash
  }
};

// Export the pool for use in your services/repositories
export default pool;

// Helper to get a client (for transactions)
export const getClient = async () => {
  return await pool.connect();
};

// Optional: Graceful shutdown helper
export const closePostgres = async (): Promise<void> => {
  try {
    await pool.end();
    console.log('✅ PostgreSQL pool closed');
  } catch (err) {
    console.error('Error closing PostgreSQL pool:', err);
  }
};
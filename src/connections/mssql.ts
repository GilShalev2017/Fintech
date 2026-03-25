import sql, { ConnectionPool, config as MSSQLConfig } from 'mssql';

// ─────────────────────────────────────────────
// 🗄️ SQL SERVER CONNECTION
// ─────────────────────────────────────────────
// mssql uses a ConnectionPool — a set of pre-opened TCP connections
// shared across all queries. This avoids the overhead of opening a new
// connection for every SQL call.
//
// pool.min/max: keep at least 2 connections warm, allow up to 10.
// requestTimeout: how long a single query can run before being killed.
// encrypt: false for local dev (no TLS). Set true in production (Azure etc).
// trustServerCertificate: true for local dev self-signed certs.

let pool: ConnectionPool | null = null;

const config: MSSQLConfig = {
  server: process.env.MSSQL_HOST || 'localhost',
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  user: process.env.MSSQL_USER || 'sa',
  password: process.env.MSSQL_PASSWORD || 'Dev@password123',
  database: process.env.MSSQL_DATABASE || 'master',
  pool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30_000,
  },
  options: {
    encrypt: false,               // true for Azure / production TLS
    trustServerCertificate: true, // required for local self-signed cert
    requestTimeout: 15_000,
  },
};

export const connectMSSQL = async (): Promise<ConnectionPool> => {
  pool = await sql.connect(config);
  console.log(`✅ SQL Server connected: ${config.server}:${config.port}`);

  pool.on('error', (err: Error) => {
    console.error('❌ SQL Server pool error:', err);
  });

  return pool;
};

// ─────────────────────────────────────────────
// 🔧 QUERY HELPERS
// ─────────────────────────────────────────────

export const sqlHelper = {

  // ── Raw query ──────────────────────────────────────────────────────────
  // Use for SELECT / DDL. Returns typed rows.
  // Example: const users = await sqlHelper.query<{ id: number; name: string }>('SELECT * FROM users')
  async query<T = Record<string, unknown>>(queryString: string): Promise<T[]> {
    if (!pool) throw new Error('SQL Server not initialised — call connectMSSQL() first');
    const result = await pool.request().query<T>(queryString);
    return result.recordset;
  },

  // ── Parameterised query ────────────────────────────────────────────────
  // ALWAYS use this for user-supplied values — prevents SQL injection.
  // params: { name: { type: sql.NVarChar, value: 'Alice' } }
  async queryWithParams<T = Record<string, unknown>>(
    queryString: string,
    params: Record<string, { type: sql.ISqlType; value: unknown }>,
  ): Promise<T[]> {
    if (!pool) throw new Error('SQL Server not initialised — call connectMSSQL() first');
    const request = pool.request();
    for (const [key, { type, value }] of Object.entries(params)) {
      request.input(key, type, value);
    }
    const result = await request.query<T>(queryString);
    return result.recordset;
  },
};

export const getMSSQLPool = (): ConnectionPool | null => pool;
export const mssql = sql; // re-export so callers can use sql.NVarChar etc without importing mssql directly
export default connectMSSQL;
import './env.js';
import pg from 'pg';

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error('DATABASE_URL is required. Copy server/.env.example to server/.env and configure it.');
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  query_timeout: 5000,
});

// Avoid logging connection strings, passwords, or provider error details.
pool.on('error', () => {
  console.error('An idle PostgreSQL connection failed.');
});

export default pool;

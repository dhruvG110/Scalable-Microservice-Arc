import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DB_URL,

    // Start small; tune after benchmarking
    max: 5,

    // Close idle connections after 10 seconds
    idleTimeoutMillis: 10000,

    // Fail if a connection cannot be acquired in 5 seconds
    connectionTimeoutMillis: 5000,
});

// Log unexpected errors on idle connections
pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
});

export default pool;
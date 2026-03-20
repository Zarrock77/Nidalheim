import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://nidalheim:changeme@localhost:5432/nidalheim',
});

export default pool;

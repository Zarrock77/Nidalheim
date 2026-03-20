import { config } from 'dotenv';
config({ path: '../../infra/.env' });

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

function getConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = process.env.POSTGRES_USER || 'nidalheim';
  const password = process.env.POSTGRES_PASSWORD || 'changeme';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5432';
  const dbName = process.env.POSTGRES_DB || 'nidalheim';

  return `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
}

async function main() {
  const connectionString = getConnectionString();
  console.log('Running migrations...');

  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: './migrations' });

  console.log('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

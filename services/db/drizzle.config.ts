import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../infra/.env' });

const user = process.env.POSTGRES_USER || 'nidalheim';
const password = process.env.POSTGRES_PASSWORD || 'changeme';
const host = process.env.POSTGRES_HOST || 'localhost';
const port = process.env.POSTGRES_PORT || '5432';
const db = process.env.POSTGRES_DB || 'nidalheim';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: `postgresql://${user}:${password}@${host}:${port}/${db}`,
  },
});

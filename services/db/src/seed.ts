import { config } from 'dotenv';
config({ path: '../../infra/.env' });

import pg from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

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

const BCRYPT_ROUNDS = 12;

const defaultAdmins = [
  {
    username: 'admin',
    email: 'admin@nidalheim.com',
    password: 'admin',
    role: 'admin',
  },
  {
    username: 'merwan',
    email: 'merwan@nidalheim.com',
    password: 'merwan',
    role: 'admin',
  },
];

async function main() {
  const connectionString = getConnectionString();
  const pool = new pg.Pool({ connectionString });

  console.log('Seeding default admin users...');

  for (const admin of defaultAdmins) {
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [admin.username, admin.email]
    );

    if (existing.length > 0) {
      console.log(`  [skip] ${admin.username} already exists`);
      continue;
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(admin.password, BCRYPT_ROUNDS);

    await pool.query(
      'INSERT INTO users (id, username, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [id, admin.username, admin.email, passwordHash, admin.role]
    );

    await pool.query(
      'INSERT INTO player_profiles (user_id) VALUES ($1)',
      [id]
    );

    console.log(`  [created] ${admin.username} (${admin.role})`);
  }

  console.log('Seed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

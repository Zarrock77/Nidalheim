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

function generatePassword(): string {
  return crypto.randomBytes(16).toString('base64url');
}

const BCRYPT_ROUNDS = 12;

interface AdminEntry {
  username: string;
  email: string;
  password: string;
  role: string;
  generated: boolean;
}

function getAdmins(): AdminEntry[] {
  // Format: SEED_ADMINS=username:email:password,username:email:password
  // Password is optional — if omitted, a random one is generated
  // Example: SEED_ADMINS=admin:admin@nidalheim.com:mysecret,merwan:merwan@nidalheim.com
  const raw = process.env.SEED_ADMINS;

  if (!raw) {
    console.error('Error: SEED_ADMINS env var is required.');
    console.error('Format: SEED_ADMINS=username:email:password,username:email');
    console.error('If password is omitted, a random one will be generated.');
    process.exit(1);
  }

  return raw.split(',').map((entry) => {
    const parts = entry.trim().split(':');
    const [username, email, password] = parts;

    if (!username || !email) {
      console.error(`Error: invalid entry "${entry}". Need at least username:email`);
      process.exit(1);
    }

    const hasPassword = !!password;
    return {
      username,
      email,
      password: password || generatePassword(),
      role: 'admin',
      generated: !hasPassword,
    };
  });
}

async function main() {
  const admins = getAdmins();
  const connectionString = getConnectionString();
  const pool = new pg.Pool({ connectionString });

  console.log('Seeding admin users...\n');

  const created: { username: string; password: string; generated: boolean }[] = [];

  for (const admin of admins) {
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

    created.push({ username: admin.username, password: admin.password, generated: admin.generated });
    console.log(`  [created] ${admin.username} (${admin.role})`);
  }

  if (created.length > 0) {
    console.log('\n--- Generated credentials (save these!) ---');
    for (const user of created) {
      if (user.generated) {
        console.log(`  ${user.username}: ${user.password}`);
      } else {
        console.log(`  ${user.username}: (password provided)`);
      }
    }
    console.log('-------------------------------------------');
  }

  console.log('\nSeed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

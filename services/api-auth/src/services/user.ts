import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import pool from './db.js';

const BCRYPT_ROUNDS = 12;

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: string;
}

export async function createUser(
  username: string,
  email: string,
  password: string
): Promise<User> {
  const { rows: existing } = await pool.query(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );

  if (existing.length > 0) {
    throw new Error('Username or email already exists');
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await pool.query(
    'INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4)',
    [id, username, email, passwordHash]
  );

  await pool.query(
    'INSERT INTO player_profiles (user_id) VALUES ($1)',
    [id]
  );

  return { id, username, email, role: 'player' };
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<User> {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, username, email, password_hash, role FROM users WHERE username = $1',
    [username]
  );

  const user = rows[0];
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  return { id: user.id, username: user.username, email: user.email, role: user.role };
}

export async function getUserById(id: string): Promise<User> {
  const { rows } = await pool.query<User>(
    'SELECT id, username, email, role FROM users WHERE id = $1',
    [id]
  );

  const user = rows[0];
  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

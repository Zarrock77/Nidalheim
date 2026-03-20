import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import db from './db.js';

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
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username, email) as { id: string } | undefined;

  if (existing) {
    throw new Error('Username or email already exists');
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  db.prepare(
    'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
  ).run(id, username, email, passwordHash);

  db.prepare('INSERT INTO player_profiles (user_id) VALUES (?)').run(id);

  return { id, username, email, role: 'player' };
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<User> {
  const user = db
    .prepare(
      'SELECT id, username, email, password_hash, role FROM users WHERE username = ?'
    )
    .get(username) as UserRow | undefined;

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  return { id: user.id, username: user.username, email: user.email, role: user.role };
}

export function getUserById(id: string): User {
  const user = db
    .prepare('SELECT id, username, email, role FROM users WHERE id = ?')
    .get(id) as User | undefined;

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

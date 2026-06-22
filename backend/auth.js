import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

export async function register(username, email, password) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const avatarSeed = username + Date.now();
  const stmt = db.prepare(
    'INSERT INTO users (username, email, password_hash, avatar_seed) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(username, email, passwordHash, avatarSeed);
  const user = db.prepare('SELECT id, username, email, avatar_seed, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  return { user, token: signToken(user) };
}

export async function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) throw new Error('Identifiants invalides');
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Identifiants invalides');
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, token: signToken(safeUser) };
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

export function authenticateToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}

export function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    } catch {}
  }
  next();
}

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '..', 'grammerde.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    avatar_seed TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source_url TEXT,
    original_text TEXT NOT NULL,
    corrupted_text TEXT NOT NULL,
    errors_map TEXT NOT NULL DEFAULT '[]',
    difficulty TEXT NOT NULL,
    error_types TEXT NOT NULL DEFAULT '[]',
    score REAL,
    corrections_count INTEGER DEFAULT 0,
    total_errors INTEGER DEFAULT 0,
    duration_seconds INTEGER,
    timer_duration INTEGER DEFAULT 120,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS session_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    span_idx INTEGER NOT NULL,
    user_answer TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0,
    corrected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, span_idx)
  );

  CREATE TABLE IF NOT EXISTS vs_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT UNIQUE NOT NULL,
    player1_id INTEGER REFERENCES users(id),
    player2_id INTEGER REFERENCES users(id),
    corrupted_text TEXT,
    errors_map TEXT DEFAULT '[]',
    difficulty TEXT,
    status TEXT DEFAULT 'waiting',
    winner_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vs_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER REFERENCES vs_rooms(id),
    user_id INTEGER REFERENCES users(id),
    corrections_count INTEGER DEFAULT 0,
    finished_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations for existing databases
[
  'ALTER TABLE sessions ADD COLUMN timer_duration INTEGER DEFAULT 120',
  'ALTER TABLE sessions ADD COLUMN text_size TEXT',
  "ALTER TABLE vs_rooms ADD COLUMN lang TEXT DEFAULT 'fr'",
  "ALTER TABLE sessions ADD COLUMN lang TEXT DEFAULT 'fr'",
  "ALTER TABLE vs_rooms ADD COLUMN text_size TEXT DEFAULT 'moyen'",
  'ALTER TABLE vs_scores ADD COLUMN score REAL',
  'ALTER TABLE vs_rooms ADD COLUMN total_errors INTEGER DEFAULT 0',
].forEach(sql => { try { db.exec(sql); } catch {} });

// Migrate session_corrections: wrong_word → span_idx
try {
  const cols = db.pragma('table_info(session_corrections)');
  if (cols.some(c => c.name === 'wrong_word')) {
    db.exec(`
      DROP TABLE session_corrections;
      CREATE TABLE session_corrections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        span_idx INTEGER NOT NULL,
        user_answer TEXT NOT NULL,
        is_correct INTEGER NOT NULL DEFAULT 0,
        corrected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, span_idx)
      );
    `);
  }
} catch {}

export default db;

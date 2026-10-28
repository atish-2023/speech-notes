import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { runMemoryQuery } from './memoryStore.js';

// Load server/.env using an explicit, absolute path derived from this file's
// location, so the connection string is found regardless of the current
// working directory the process was started from.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

let pool = null;
let isConnected = false;
let connectionError = null;

// True only when we are allowed to use the ephemeral in-memory store.
let allowMemoryFallback = false;

// Check if DATABASE_URL is set and not a placeholder
const isRealDatabaseUrl = Boolean(
  databaseUrl &&
  !databaseUrl.includes('ep-sample') &&
  !databaseUrl.includes('user:password@') &&
  !databaseUrl.includes('MY_DATABASE_URL') &&
  !databaseUrl.includes('your_') &&
  !databaseUrl.includes('changeme')
);

/**
 * Creates the table, index, compatibility column and view if they don't exist.
 * No sample data is inserted.
 */
async function ensureSchema() {
  if (!pool) return;
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transcripts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        language VARCHAR(50) NOT NULL DEFAULT 'auto',
        duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transcripts_created_at_desc ON transcripts (created_at DESC);
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'transcripts' AND column_name = 'transcript_text') THEN
          ALTER TABLE transcripts ADD COLUMN transcript_text TEXT;
          UPDATE transcripts SET transcript_text = content WHERE transcript_text IS NULL;
        END IF;

        IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transcriptions') THEN
          CREATE VIEW transcriptions AS
          SELECT id, title, content, transcript_text, language, duration_seconds, created_at, updated_at
          FROM transcripts;
        END IF;
      END $$;
    `);
    console.log('PostgreSQL transcripts schema verified and ready.');
  } catch (schemaErr) {
    console.error('PostgreSQL schema auto-verification FAILED:', schemaErr.message);
  }
}

if (isRealDatabaseUrl) {
  try {
    const databaseHost = new URL(databaseUrl).hostname;
    const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(databaseHost);

    pool = new Pool({
      connectionString: databaseUrl,
      ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err.message);
    });

    // Test connection once and verify the table exists
    pool.query('SELECT NOW()')
      .then(async () => {
        isConnected = true;
        connectionError = null;
        console.log('Connected to PostgreSQL (Neon).');
        await ensureSchema();
      })
      .catch((err) => {
        // DATABASE_URL is set but unreachable. Do NOT enable the memory store.
        // The pool stays active so every query throws a clear, visible error
        // (surfaced to the client by the controllers) instead of silently
        // writing to memory.
        isConnected = false;
        connectionError = err.message;
        console.error(
          'CRITICAL: DATABASE_URL is configured but the Neon PostgreSQL connection FAILED. ' +
          'Saving to persistent storage is disabled until this is fixed. No in-memory fallback will be used.',
        );
        console.error('Connection error:', err.message);
      });
  } catch (err) {
    connectionError = err.message;
    console.error('PostgreSQL initialization error:', err.message);
  }
} else {
  allowMemoryFallback = true;
  console.warn(
    'WARNING: DATABASE_URL is not configured. Running in EPHEMERAL in-memory mode - ' +
    'transcripts will NOT be persisted to Neon and will be lost on restart. ' +
    'Set DATABASE_URL in server/.env to connect to Neon PostgreSQL.',
  );
}

/**
 * Builds a standardized error for a database failure so the client always
 * receives a clear HTTP 503 with a message stating the data was NOT saved,
 * instead of a silent in-memory write or an opaque 500.
 */
function makeDbUnavailableError(message) {
  const dbErr = new Error(`Database unavailable - your note was NOT saved. ${message || ''}`.trim());
  dbErr.status = 503;
  dbErr.code = 'DB_UNAVAILABLE';
  return dbErr;
}

/**
 * Universal query function.
 * Uses real PostgreSQL when available; only falls back to the in-memory store
 * when DATABASE_URL is missing (allowMemoryFallback is true).
 */
export async function query(text, params = []) {
  if (pool) {
    try {
      const res = await pool.query(text, params);
      isConnected = true;
      connectionError = null;
      return res;
    } catch (err) {
      console.error('PostgreSQL query error:', err.message);
      // Auto-recover if schema/table was missing
      if (err.message && err.message.includes('does not exist')) {
        try {
          await ensureSchema();
          const retryRes = await pool.query(text, params);
          isConnected = true;
          return retryRes;
        } catch (retryErr) {
          console.error('PostgreSQL retry failed:', retryErr.message);
          connectionError = retryErr.message;
          throw makeDbUnavailableError(retryErr.message);
        }
      }
      connectionError = err.message;
      throw makeDbUnavailableError(err.message);
    }
  }

  // If DATABASE_URL is configured but we have no live pool, never write to
  // memory silently - surface a clear error so the client knows the data was
  // not persisted.
  if (!allowMemoryFallback) {
    throw makeDbUnavailableError(connectionError || 'Neon PostgreSQL is not connected.');
  }

  // DATABASE_URL is missing: delegate to the ephemeral in-memory SQL emulator.
  return runMemoryQuery(text, params);
}

export function getDbStatus() {
  let type = 'in-memory';
  if (isConnected) {
    type = 'neon-postgresql';
  } else if (isRealDatabaseUrl) {
    // Configured with a real connection string but not (yet) connected.
    type = 'neon-postgresql';
  }
  return {
    isConfigured: isRealDatabaseUrl,
    isConnected: isConnected,
    // 'neon-postgresql' when a real DATABASE_URL is present, otherwise 'in-memory'
    type,
    // True when transcripts are ephemeral and will be lost on restart
    persistent: !allowMemoryFallback && isConnected,
    usingEphemeralMemory: allowMemoryFallback,
    lastError: isConnected ? null : connectionError
  };
}

/**
 * Returns true when the app is running in the ephemeral in-memory mode
 * (i.e. DATABASE_URL is empty/placeholder).
 */
export function isUsingMemoryStore() {
  return allowMemoryFallback;
}

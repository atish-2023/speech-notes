-- Speech Notes Database Schema
-- Run this in your Neon SQL Editor or psql to initialize the transcripts table.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    language VARCHAR(50) NOT NULL DEFAULT 'auto',
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for ordering history newest first
CREATE INDEX IF NOT EXISTS idx_transcripts_created_at_desc ON transcripts (created_at DESC);

-- Backward compatibility view if older queries reference transcriptions
CREATE OR REPLACE VIEW transcriptions AS 
SELECT id, title, content AS transcript_text, content, language, duration_seconds, created_at, updated_at 
FROM transcripts;

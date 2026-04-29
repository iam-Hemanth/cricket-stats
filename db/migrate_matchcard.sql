-- ============================================================
-- Migration: Match Card columns
-- Run this ONCE on both local and Supabase before re-ingesting.
-- ============================================================

-- Add playing_xi JSONB to store both squads + officials compactly
ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS playing_xi  JSONB,
    ADD COLUMN IF NOT EXISTS day_night   VARCHAR(10);

-- This migration is additive only — no data is wiped.
-- playing_xi and day_night will be NULL for existing rows
-- and will be populated when you re-ingest the JSON files.

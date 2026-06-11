-- ============================================================
-- Entity Canonicalization Schema
-- Canonical team and venue tables with alias resolution support
-- ============================================================

-- 1. Canonical Teams
CREATE TABLE IF NOT EXISTS teams (
    team_id        TEXT PRIMARY KEY,
    canonical_name VARCHAR(120) NOT NULL UNIQUE,
    canonical_key  TEXT NOT NULL UNIQUE,
    country        VARCHAR(80),
    created_at     TIMESTAMP DEFAULT NOW()
);

-- 2. Team Aliases
CREATE TABLE IF NOT EXISTS team_aliases (
    team_id    TEXT NOT NULL REFERENCES teams(team_id),
    alias_name VARCHAR(120) NOT NULL,
    alias_key  TEXT NOT NULL UNIQUE,
    source     VARCHAR(40) NOT NULL DEFAULT 'seed',
    PRIMARY KEY (team_id, alias_key)
);

-- 3. Canonical Venues
CREATE TABLE IF NOT EXISTS venues (
    venue_id        TEXT PRIMARY KEY,
    canonical_name  VARCHAR(150) NOT NULL,
    canonical_key   TEXT NOT NULL UNIQUE,
    city            VARCHAR(100),
    country         VARCHAR(80),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- 4. Venue Aliases
CREATE TABLE IF NOT EXISTS venue_aliases (
    venue_id   TEXT NOT NULL REFERENCES venues(venue_id),
    alias_name VARCHAR(150) NOT NULL,
    alias_key  TEXT NOT NULL UNIQUE,
    source     VARCHAR(40) NOT NULL DEFAULT 'seed',
    PRIMARY KEY (venue_id, alias_key)
);

-- 5. Entity Alias Candidates (for audit/review)
CREATE TABLE IF NOT EXISTS entity_alias_candidates (
    candidate_id      BIGSERIAL PRIMARY KEY,
    entity_type       VARCHAR(20) NOT NULL,
    raw_name          VARCHAR(180) NOT NULL,
    raw_key           TEXT NOT NULL,
    suggested_id      TEXT,
    suggested_name    VARCHAR(180),
    confidence        NUMERIC(4, 3),
    reason            TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast alias lookups
CREATE INDEX IF NOT EXISTS idx_team_aliases_key ON team_aliases(alias_key);
CREATE INDEX IF NOT EXISTS idx_venue_aliases_key ON venue_aliases(alias_key);
CREATE INDEX IF NOT EXISTS idx_entity_candidates_type ON entity_alias_candidates(entity_type, status);

-- ============================================================
-- Raw audit columns on matches
-- ============================================================
ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS team1_id       VARCHAR(80),
    ADD COLUMN IF NOT EXISTS team2_id       VARCHAR(80),
    ADD COLUMN IF NOT EXISTS winner_id      VARCHAR(80),
    ADD COLUMN IF NOT EXISTS toss_winner_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS venue_id       VARCHAR(120),
    ADD COLUMN IF NOT EXISTS team1_raw      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS team2_raw      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS winner_raw     VARCHAR(100),
    ADD COLUMN IF NOT EXISTS toss_winner_raw VARCHAR(100),
    ADD COLUMN IF NOT EXISTS venue_raw      VARCHAR(150);

-- ============================================================
-- Raw audit columns on innings
-- ============================================================
ALTER TABLE innings
    ADD COLUMN IF NOT EXISTS batting_team_id  VARCHAR(80),
    ADD COLUMN IF NOT EXISTS bowling_team_id  VARCHAR(80),
    ADD COLUMN IF NOT EXISTS batting_team_raw VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bowling_team_raw VARCHAR(100);

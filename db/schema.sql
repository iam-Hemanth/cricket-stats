-- Cricket Statistics Platform Schema
-- Stores Cricsheet ball-by-ball data for all men's cricket matches

-- 1. Players
CREATE TABLE players (
    player_id   VARCHAR(20) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- 2. Competitions
CREATE TABLE competitions (
    competition_id  SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    type            VARCHAR(20),
    gender          VARCHAR(10)
);

-- 3. Matches
CREATE TABLE matches (
    match_id        VARCHAR(20) PRIMARY KEY,
    date            DATE,
    season          VARCHAR(10),
    venue           VARCHAR(150),
    city            VARCHAR(100),
    team1           VARCHAR(100),
    team2           VARCHAR(100),
    winner          VARCHAR(100),
    win_by_runs     INTEGER,
    win_by_wickets  INTEGER,
    toss_winner     VARCHAR(100),
    toss_decision   VARCHAR(10),
    format          VARCHAR(10),
    competition_id  INTEGER REFERENCES competitions(competition_id),
    player_of_match VARCHAR(100),
    gender          VARCHAR(10),
    playing_xi      JSONB,                    -- {"team1":[ids…], "team2":[ids…], "umpires":[…], "referee":"…"}
    day_night       VARCHAR(10),              -- "day" | "night" | "day/night"
    match_stage     VARCHAR(50),              -- "Final" | "Semi Final" | "Qualifier 1" | …
    match_number    INTEGER,                  -- match number within tournament (1, 23, 67…)
    match_group     VARCHAR(50),              -- "A" | "B" | "Super Eight" | "Elite Group A" | …
    created_at      TIMESTAMP DEFAULT NOW()
);

-- 4. Innings
CREATE TABLE innings (
    innings_id      SERIAL PRIMARY KEY,
    match_id        VARCHAR(20) REFERENCES matches(match_id),
    innings_number  INTEGER,
    batting_team    VARCHAR(100),
    bowling_team    VARCHAR(100)
);

-- 5. Deliveries (ball-by-ball)
CREATE TABLE deliveries (
    delivery_id     BIGSERIAL PRIMARY KEY,
    innings_id      INTEGER REFERENCES innings(innings_id),
    over_number     INTEGER,
    ball_number     INTEGER,
    batter_id       VARCHAR(20) REFERENCES players(player_id),
    bowler_id       VARCHAR(20) REFERENCES players(player_id),
    non_striker_id  VARCHAR(20) REFERENCES players(player_id),
    runs_batter     INTEGER DEFAULT 0,
    runs_extras     INTEGER DEFAULT 0,
    runs_total      INTEGER DEFAULT 0,
    is_wide         BOOLEAN DEFAULT FALSE,
    is_noball       BOOLEAN DEFAULT FALSE,
    is_bye          BOOLEAN DEFAULT FALSE,
    is_legbye       BOOLEAN DEFAULT FALSE,
    phase           VARCHAR(20)
);

-- 6. Wickets
CREATE TABLE wickets (
    wicket_id       SERIAL PRIMARY KEY,
    delivery_id     BIGINT REFERENCES deliveries(delivery_id),
    player_out_id   VARCHAR(20) REFERENCES players(player_id),
    kind            VARCHAR(30),
    fielder1_id     VARCHAR(20) REFERENCES players(player_id),
    fielder2_id     VARCHAR(20) REFERENCES players(player_id)
);

-- 7. Sync Log
CREATE TABLE sync_log (
    run_id          SERIAL PRIMARY KEY,
    run_at          TIMESTAMP DEFAULT NOW(),
    matches_added   INTEGER DEFAULT 0,
    status          VARCHAR(20),
    error_msg       TEXT
);

-- 8. Entity Canonicalization
CREATE TABLE IF NOT EXISTS teams (
    team_id        TEXT PRIMARY KEY,
    canonical_name VARCHAR(120) NOT NULL UNIQUE,
    canonical_key  TEXT NOT NULL UNIQUE,
    country        VARCHAR(80),
    created_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_aliases (
    team_id    TEXT NOT NULL REFERENCES teams(team_id),
    alias_name VARCHAR(120) NOT NULL,
    alias_key  TEXT NOT NULL UNIQUE,
    source     VARCHAR(40) NOT NULL DEFAULT 'seed',
    PRIMARY KEY (team_id, alias_key)
);

CREATE TABLE IF NOT EXISTS venues (
    venue_id        TEXT PRIMARY KEY,
    canonical_name  VARCHAR(150) NOT NULL,
    canonical_key   TEXT NOT NULL UNIQUE,
    city            VARCHAR(100),
    country         VARCHAR(80),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venue_aliases (
    venue_id   TEXT NOT NULL REFERENCES venues(venue_id),
    alias_name VARCHAR(150) NOT NULL,
    alias_key  TEXT NOT NULL UNIQUE,
    source     VARCHAR(40) NOT NULL DEFAULT 'seed',
    PRIMARY KEY (venue_id, alias_key)
);

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

-- ============================================================
-- Table Alterations for Canonicalization
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

ALTER TABLE innings
    ADD COLUMN IF NOT EXISTS batting_team_id  VARCHAR(80),
    ADD COLUMN IF NOT EXISTS bowling_team_id  VARCHAR(80),
    ADD COLUMN IF NOT EXISTS batting_team_raw VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bowling_team_raw VARCHAR(100);

-- ============================================================
-- Indexes for query performance
-- ============================================================

CREATE INDEX idx_deliveries_batter    ON deliveries(batter_id);
CREATE INDEX idx_deliveries_bowler    ON deliveries(bowler_id);
CREATE INDEX idx_deliveries_innings   ON deliveries(innings_id);
CREATE INDEX idx_matches_date         ON matches(date);
CREATE INDEX idx_matches_format       ON matches(format);
CREATE INDEX idx_wickets_player_out   ON wickets(player_out_id);

-- Additional indexes for mv_player_batting optimization
CREATE INDEX IF NOT EXISTS idx_wickets_delivery_id ON wickets(delivery_id);
CREATE INDEX IF NOT EXISTS idx_matches_competition_id ON matches(competition_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_innings_batter ON deliveries(innings_id, batter_id);

-- Entity lookup indexes
CREATE INDEX IF NOT EXISTS idx_team_aliases_key ON team_aliases(alias_key);
CREATE INDEX IF NOT EXISTS idx_venue_aliases_key ON venue_aliases(alias_key);

-- 12 tables created

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

-- 7 tables created

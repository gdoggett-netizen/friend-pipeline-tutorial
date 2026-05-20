-- decision-log-schema.sql
-- D1 database schema for the pipeline decision loop and run logging.
--
-- Apply with:
--   npx wrangler d1 migrations apply pipeline-decisions --name your-worker-name
--
-- Or create as a migration file:
--   mkdir migrations
--   cp this file migrations/001_init.sql
--   npx wrangler d1 migrations apply pipeline-decisions --name your-worker-name

-- Decisions: keep/reject log. The heart of the decision loop (lesson 07).
CREATE TABLE IF NOT EXISTS decisions (
  id           TEXT PRIMARY KEY,
  ts           TEXT NOT NULL,           -- ISO 8601 timestamp
  proposal_id  TEXT NOT NULL,           -- the UUID from the email's keep/reject URL
  proposal_text TEXT NOT NULL,          -- the actual text of what was proposed (for context)
  action       TEXT NOT NULL,           -- "keep" or "reject"
  reason       TEXT                     -- one sentence; can be null but nudge the user to provide one
);

-- Runs: log of every pipeline execution. For monitoring (lesson 08/09).
CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  ts            TEXT NOT NULL,          -- when the run started
  cron          TEXT,                   -- which cron fired ("main" or "watcher")
  status        TEXT NOT NULL,          -- "success", "failure", "partial", "skipped"
  duration_ms   INTEGER,               -- how long the run took
  input_count   INTEGER,               -- how many inputs were processed
  output_count  INTEGER,               -- how many proposals were generated
  claude_tokens INTEGER,               -- total tokens used (input + output)
  error         TEXT                    -- error message if status is "failure"
);

-- Health alerts: log of heartbeat alerts sent. For audit trail.
CREATE TABLE IF NOT EXISTS health_alerts (
  id       TEXT PRIMARY KEY,
  ts       TEXT NOT NULL,
  kind     TEXT NOT NULL,              -- "stale-heartbeat", "no-inputs", etc.
  message  TEXT NOT NULL               -- the alert message that was sent
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_decisions_ts    ON decisions (ts DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_action ON decisions (action, ts DESC);
CREATE INDEX IF NOT EXISTS idx_runs_ts         ON runs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status     ON runs (status, ts DESC);

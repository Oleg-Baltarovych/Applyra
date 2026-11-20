-- One row per vacancy the owner marked (ADR 028). Title/meta/url are copied from the Telegram message so
-- /status can list them without the digest's state.
CREATE TABLE statuses (
  vacancy_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('a', 'p', 'r', 'x')),
  title TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX statuses_updated_at ON statuses (updated_at);

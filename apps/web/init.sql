-- The monitor state's one table, for wrangler's LOCAL D1 (`pnpm db:init:local`):
-- upstream's init.sql under the table name monitor_state.
CREATE TABLE IF NOT EXISTS monitor_state (
    key VARCHAR(255) PRIMARY KEY,
    value BLOB NOT NULL
);

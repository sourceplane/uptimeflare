-- The monitor state's one table: upstream's init.sql (`key` the state's name,
-- `value` the compacted state the checker writes every few minutes), named
-- monitor_state rather than after the project, and applied by db-migrate
-- before the Worker deploys. IF NOT EXISTS, so a database whose table an
-- earlier hand-run init created takes this migration as a no-op.
-- Owner: app
CREATE TABLE IF NOT EXISTS monitor_state (
    key VARCHAR(255) PRIMARY KEY,
    value BLOB NOT NULL
);

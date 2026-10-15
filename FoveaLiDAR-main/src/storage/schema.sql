-- storage/schema.sql
-- What's persisted vs not: ARCHITECTURE.md S21. Raw point clouds, model
-- weights, and per-point predictions at scale NEVER go in these tables -
-- only run/session/benchmark metadata small enough to compare across
-- experiments.

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    label TEXT
);

CREATE TABLE IF NOT EXISTS processing_runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    config_json TEXT NOT NULL,   -- full config snapshot: bands, tolerances, class mapping version
    dataset_adapter TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS frame_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES processing_runs(id),
    frame_index INTEGER NOT NULL,
    cell_count INTEGER NOT NULL,
    latency_ms REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
    id TEXT PRIMARY KEY,
    run_id TEXT REFERENCES processing_runs(id),
    mode TEXT NOT NULL,          -- "uniform" | "adaptive"
    cell_count INTEGER NOT NULL,
    memory_mb REAL NOT NULL,
    latency_ms REAL NOT NULL,
    input_point_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benchmark_run_id TEXT NOT NULL REFERENCES benchmark_runs(id),
    band_name TEXT NOT NULL,
    accuracy REAL,
    point_count INTEGER
);

CREATE INDEX IF NOT EXISTS idx_processing_runs_session ON processing_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_frame_metrics_run ON frame_metrics(run_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_runs_run ON benchmark_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_metrics_benchmark_run ON metrics(benchmark_run_id);

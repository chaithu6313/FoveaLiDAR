"""
src/storage/db.py

Plain sqlite3, deliberately no ORM (RULES.md - Docker/Dependencies:
"avoid unnecessary infrastructure" - a hackathon-prototype-turned-research-
codebase doesn't need SQLAlchemy's weight for five tables). Every write
here corresponds to exactly one row described in ARCHITECTURE.md S21's
ER diagram - nothing else is persisted.
"""
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

_SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:16]


class Storage:
    def __init__(self, db_path: str = "fovealidar.db"):
        self._db_path = db_path
        self._init_schema()

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(_SCHEMA_PATH.read_text())

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def create_session(self, label: Optional[str] = None) -> str:
        session_id = _new_id()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO sessions (id, created_at, label) VALUES (?, ?, ?)",
                (session_id, _now(), label),
            )
        return session_id

    def create_processing_run(self, session_id: str, config: dict, dataset_adapter: str) -> str:
        run_id = _new_id()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO processing_runs (id, session_id, config_json, dataset_adapter, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (run_id, session_id, json.dumps(config), dataset_adapter, _now()),
            )
        return run_id

    def record_frame_metric(self, run_id: str, frame_index: int, cell_count: int, latency_ms: float) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO frame_metrics (run_id, frame_index, cell_count, latency_ms) VALUES (?, ?, ?, ?)",
                (run_id, frame_index, cell_count, latency_ms),
            )

    def record_benchmark_run(self, run_id: Optional[str], mode: str, cell_count: int,
                              memory_mb: float, latency_ms: float, input_point_count: int) -> str:
        benchmark_id = _new_id()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO benchmark_runs "
                "(id, run_id, mode, cell_count, memory_mb, latency_ms, input_point_count, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (benchmark_id, run_id, mode, cell_count, memory_mb, latency_ms, input_point_count, _now()),
            )
        return benchmark_id

    def record_metric(self, benchmark_run_id: str, band_name: str,
                       accuracy: Optional[float], point_count: Optional[int]) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO metrics (benchmark_run_id, band_name, accuracy, point_count) VALUES (?, ?, ?, ?)",
                (benchmark_run_id, band_name, accuracy, point_count),
            )

    def list_benchmark_runs(self, limit: int = 20) -> list:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM benchmark_runs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

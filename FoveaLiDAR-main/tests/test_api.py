"""tests/test_api.py - RULES.md Testing: API contract tests via TestClient, no real network."""
import os
import tempfile

os.environ.setdefault("FOVEALIDAR_DB_PATH", "")


def _fresh_app_and_client():
    """Build a fresh app against a temp DB so tests don't share state
    with a dev run's fovealidar.db."""
    import importlib
    import src.api.main as main_module
    # point storage at a temp file before the module-level Storage() runs
    tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
    import src.storage.db as db_module
    original_init = db_module.Storage.__init__

    def patched_init(self, db_path: str = tmp_db):
        original_init(self, db_path)

    db_module.Storage.__init__ = patched_init
    importlib.reload(main_module)
    db_module.Storage.__init__ = original_init
    return main_module


def test_stats_endpoint_returns_geometry_estimate_not_measured():
    main_module = _fresh_app_and_client()
    from fastapi.testclient import TestClient
    client = TestClient(main_module.app)

    resp = client.get("/api/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["measured"] is False
    assert body["adaptive_cells"] > 0
    assert body["uniform_cells"] > body["adaptive_cells"]


def test_benchmark_run_returns_measured_numbers_and_persists():
    main_module = _fresh_app_and_client()
    from fastapi.testclient import TestClient
    client = TestClient(main_module.app)

    resp = client.get("/api/benchmark/run")
    assert resp.status_code == 200
    body = resp.json()
    assert body["measured"] is True
    assert body["uniform"]["cell_count"] > 0
    assert body["adaptive"]["cell_count"] > 0
    assert body["input_point_count"] > 0

    history = client.get("/api/benchmark/history").json()
    assert len(history) >= 2, "expected both uniform and adaptive rows persisted"


def test_stats_is_deterministic_across_repeated_calls():
    """PROJECT_REQUIREMENTS.md S26 determinism check."""
    main_module = _fresh_app_and_client()
    from fastapi.testclient import TestClient
    client = TestClient(main_module.app)

    first = client.get("/api/stats").json()
    second = client.get("/api/stats").json()
    assert first == second


def test_websocket_streams_a_well_formed_frame_message():
    main_module = _fresh_app_and_client()
    from fastapi.testclient import TestClient
    client = TestClient(main_module.app)

    with client.websocket_connect("/ws/frames") as ws:
        msg = ws.receive_json()
        assert msg["schema_version"] == main_module.SCHEMA_VERSION
        assert "cell_count" in msg
        assert "cells_by_band" in msg
        assert "tracks" in msg
        assert isinstance(msg["cells"], list)


if __name__ == "__main__":
    import sys
    tests = [v for k, v in list(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS  {t.__name__}")
        except Exception as e:
            failed += 1
            print(f"FAIL  {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)

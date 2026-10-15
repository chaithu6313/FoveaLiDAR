"""tests/test_tracker.py"""
from src.tracking.tracker import Detection, Tracker


def test_single_object_keeps_its_id_moving_in_a_straight_line():
    tracker = Tracker()
    track_id = None
    for step in range(20):
        x = step * 0.3  # well under the match radius per frame
        tracks = tracker.update([Detection(x, 0.0, "dynamic_object")])
        assert len(tracks) == 1
        if track_id is None:
            track_id = tracks[0].track_id
        assert tracks[0].track_id == track_id, f"ID changed at step {step}"
        assert tracks[0].age == step  # age increments on every matched frame after creation

    print("OK: single object retains ID across", 20, "frames")


def test_id_survives_crossing_a_simulated_resolution_boundary():
    """The exact scenario the conversation's earlier demo visualised:
    an object moving from a near zone (say r<10m) into a far zone
    (r>=10m) must keep the same track ID - the tracker doesn't know or
    care about bands at all, which is the point (ARCHITECTURE.md S2)."""
    tracker = Tracker()
    track_id = None
    # sweep r from 5m to 15m in small steps, straight line along x
    r = 5.0
    while r <= 15.0:
        tracks = tracker.update([Detection(r, 0.0, "dynamic_object")])
        assert len(tracks) == 1
        if track_id is None:
            track_id = tracks[0].track_id
        assert tracks[0].track_id == track_id
        r += 0.4

    print("OK: ID survives crossing r=10m with no special-casing needed")


def test_a_track_is_dropped_after_max_misses_consecutive_gaps():
    tracker = Tracker(max_misses=2)
    tracker.update([Detection(0.0, 0.0, "dynamic_object")])
    tracker.update([])  # miss 1
    tracker.update([])  # miss 2
    tracks = tracker.update([])  # miss 3 -> should be dropped now
    assert tracks == []


def test_two_well_separated_objects_get_distinct_stable_ids():
    tracker = Tracker()
    for _ in range(5):
        tracks = tracker.update([
            Detection(0.0, 0.0, "dynamic_object"),
            Detection(50.0, 50.0, "dynamic_object"),
        ])
    ids = {t.track_id for t in tracks}
    assert len(ids) == 2


if __name__ == "__main__":
    import sys
    tests = [v for k, v in list(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS  {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {t.__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)

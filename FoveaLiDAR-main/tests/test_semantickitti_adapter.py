"""
tests/test_semantickitti_adapter.py

No real SemanticKITTI data is available in this sandbox (no network path
to semantic-kitti.org here). This builds a tiny fixture matching the real
.bin/.label binary layout exactly, so the ADAPTER's parsing logic - byte
layout, label masking, shape-mismatch detection - is genuinely verified,
even though it's never run against a real download in this environment.
Running it against the real dataset locally is still required before
trusting it fully (PHASES.md Phase 1).
"""
import struct
import tempfile
from pathlib import Path

import numpy as np

from src.data.semantickitti_adapter import SemanticKittiAdapter


def _write_fixture(root: Path, sequence: str, frame_id: int, points: np.ndarray, raw_label_ids: np.ndarray):
    velodyne = root / "sequences" / sequence / "velodyne"
    labels = root / "sequences" / sequence / "labels"
    velodyne.mkdir(parents=True, exist_ok=True)
    labels.mkdir(parents=True, exist_ok=True)

    points.astype(np.float32).tofile(velodyne / f"{frame_id:06d}.bin")

    # pack instance id (upper 16 bits, zero here) + semantic label (lower 16 bits),
    # exactly as the real format does
    packed = raw_label_ids.astype(np.uint32)
    packed.tofile(labels / f"{frame_id:06d}.label")


def test_reads_a_well_formed_frame_correctly():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        points = np.array([
            [1.0, 2.0, 0.1, 0.5],
            [3.0, -1.0, 0.2, 0.7],
        ], dtype=np.float32)
        raw_labels = np.array([40, 10], dtype=np.uint32)  # road, car
        _write_fixture(root, "00", 0, points, raw_labels)

        adapter = SemanticKittiAdapter(root=str(root), sequence="00")
        frames = list(adapter.frames())

        assert len(frames) == 1
        frame = frames[0]
        assert frame.points.shape == (2, 4)
        np.testing.assert_allclose(frame.points, points)
        assert frame.raw_labels is not None
        assert list(frame.raw_labels) == [40, 10]
        assert frame.frame_id == 0
        assert frame.sequence_id == "00"


def test_instance_id_in_upper_bits_is_masked_off_correctly():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        points = np.array([[0.0, 0.0, 0.0, 0.0]], dtype=np.float32)
        # semantic label 10 ("car"), instance id 7, packed as the real format does:
        # lower 16 bits = semantic, upper 16 bits = instance
        packed_value = (7 << 16) | 10
        raw_labels = np.array([packed_value], dtype=np.uint32)
        _write_fixture(root, "00", 0, points, raw_labels)

        adapter = SemanticKittiAdapter(root=str(root), sequence="00")
        frame = next(adapter.frames())
        assert frame.raw_labels[0] == 10, "instance id bits leaked into the masked semantic label"


def test_label_point_count_mismatch_raises_rather_than_silently_truncating():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        points = np.array([[0.0, 0.0, 0.0, 0.0], [1.0, 1.0, 1.0, 1.0]], dtype=np.float32)
        raw_labels = np.array([40], dtype=np.uint32)  # only 1 label for 2 points
        _write_fixture(root, "00", 0, points, raw_labels)

        adapter = SemanticKittiAdapter(root=str(root), sequence="00")
        try:
            list(adapter.frames())
            assert False, "expected ValueError on point/label count mismatch"
        except ValueError:
            pass


def test_missing_velodyne_directory_raises_immediately_at_construction():
    with tempfile.TemporaryDirectory() as tmp:
        try:
            SemanticKittiAdapter(root=tmp, sequence="00")
            assert False, "expected FileNotFoundError"
        except FileNotFoundError:
            pass


def test_test_sequences_default_to_no_labels_expected():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        points = np.array([[0.0, 0.0, 0.0, 0.0]], dtype=np.float32)
        velodyne = root / "sequences" / "11" / "velodyne"
        velodyne.mkdir(parents=True)
        points.astype(np.float32).tofile(velodyne / "000000.bin")
        # deliberately no labels/ directory - sequence 11 is in OFFICIAL_TEST_SEQUENCES

        adapter = SemanticKittiAdapter(root=str(root), sequence="11")
        frame = next(adapter.frames())
        assert frame.raw_labels is None


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
        except Exception as e:
            failed += 1
            print(f"ERROR {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)

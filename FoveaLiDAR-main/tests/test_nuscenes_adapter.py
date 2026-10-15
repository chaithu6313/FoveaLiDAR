"""
tests/test_nuscenes_adapter.py

Unlike test_semantickitti_adapter.py (a hand-built binary fixture checked
against documentation), this one runs the REAL nuscenes-devkit
(installed successfully in this sandbox, unlike torch) against a minimal
but complete nuScenes-mini table structure - every table nuScenes.__init__
requires (confirmed from its source), a real LidarPointCloud.from_file
call, and a real lidarseg lookup. This is the strongest verification any
adapter in this project has - it actually runs, not just parses.
"""
import json
import tempfile
from pathlib import Path

import numpy as np

from src.data.base_adapter import preprocess_frame
from src.data.nuscenes_adapter import NuScenesAdapter


def _build_fixture(root: Path, samples: list) -> None:
    """samples: list of (points_5xN_array, label_ids_array) pairs, one per sample/frame."""
    table_dir = root / "v1.0-mini"
    lidar_dir = root / "samples" / "LIDAR_TOP"
    lidarseg_dir = root / "lidarseg" / "v1.0-mini"
    for d in (table_dir, lidar_dir, lidarseg_dir):
        d.mkdir(parents=True, exist_ok=True)

    # Category indices used by the fixture's label values: 0=car
    # (dynamic_object), 1=driveable_surface (drivable), 2=pedestrian
    # (dynamic_object), 3=manmade (static_obstacle) - matches
    # nuscenes_class_mapping.py's real mapping.
    categories = [
        {"token": "cat_car", "name": "vehicle.car", "description": "", "index": 0},
        {"token": "cat_road", "name": "flat.driveable_surface", "description": "", "index": 1},
        {"token": "cat_ped", "name": "human.pedestrian.adult", "description": "", "index": 2},
        {"token": "cat_manmade", "name": "static.manmade", "description": "", "index": 3},
    ]

    def write(name, content):
        with open(table_dir / f"{name}.json", "w") as f:
            json.dump(content, f)

    write("category", categories)
    write("attribute", [])
    write("visibility", [])
    write("instance", [])
    write("sensor", [{"token": "sensor_lidar", "channel": "LIDAR_TOP", "modality": "lidar"}])
    write("calibrated_sensor", [{
        "token": "calib1", "sensor_token": "sensor_lidar",
        "translation": [0, 0, 0], "rotation": [1, 0, 0, 0], "camera_intrinsic": [],
    }])
    write("ego_pose", [{"token": "ego1", "timestamp": 0, "rotation": [1, 0, 0, 0], "translation": [0, 0, 0]}])
    write("log", [{"token": "log1", "logfile": "", "vehicle": "", "date_captured": "2020-01-01",
                    "location": "singapore-onenorth"}])
    write("map", [{"token": "map1", "log_tokens": ["log1"], "category": "semantic_prior", "filename": ""}])
    write("sample_annotation", [])

    sample_records, sample_data_records, lidarseg_records = [], [], []
    n = len(samples)
    for i, (points5, labels) in enumerate(samples):
        sample_token = f"sample{i}"
        sd_token = f"sd{i}"
        pc_filename = f"samples/LIDAR_TOP/scan{i}.pcd.bin"
        label_filename = f"lidarseg/v1.0-mini/scan{i}_lidarseg.bin"

        sample_records.append({
            "token": sample_token, "timestamp": i, "scene_token": "scene1",
            "next": f"sample{i+1}" if i + 1 < n else "",
            "prev": f"sample{i-1}" if i > 0 else "",
        })
        sample_data_records.append({
            "token": sd_token, "sample_token": sample_token, "ego_pose_token": "ego1",
            "calibrated_sensor_token": "calib1", "filename": pc_filename,
            "fileformat": "pcd", "width": 0, "height": 0, "timestamp": i,
            "is_key_frame": True, "next": "", "prev": "",
            "sensor_modality": "lidar", "channel": "LIDAR_TOP",
        })
        lidarseg_records.append({"token": sd_token, "sample_data_token": sd_token, "filename": label_filename})

        points5.astype(np.float32).tofile(root / pc_filename)
        labels.astype(np.uint8).tofile(root / label_filename)

    write("sample", sample_records)
    write("sample_data", sample_data_records)
    write("lidarseg", lidarseg_records)
    write("scene", [{
        "token": "scene1", "log_token": "log1", "nbr_samples": n,
        "first_sample_token": "sample0", "last_sample_token": f"sample{n-1}",
        "name": "scene-0001", "description": "test fixture",
    }])


def test_single_frame_loads_correctly():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        points = np.zeros((5, 5), dtype=np.float32)
        points[:, 0] = [1.0, 2.0, 3.0, 4.0, 5.0]
        points[:, 3] = [10, 20, 30, 40, 50]
        labels = np.array([0, 1, 1, 2, 3], dtype=np.uint8)
        _build_fixture(root, [(points, labels)])

        adapter = NuScenesAdapter(dataroot=str(root), version="v1.0-mini")
        frames = list(adapter.frames())

        assert len(frames) == 1
        assert frames[0].points.shape == (5, 4), "ring index (5th column) should be dropped by LidarPointCloud"
        np.testing.assert_allclose(frames[0].points[:, 0], [1.0, 2.0, 3.0, 4.0, 5.0])
        assert list(frames[0].raw_labels) == [0, 1, 1, 2, 3]
        assert frames[0].sequence_id == "scene-0001"


def test_multi_sample_chain_via_next_pointer():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        p1 = np.zeros((2, 5), dtype=np.float32); p1[:, 0] = [1.0, 2.0]
        p2 = np.zeros((3, 5), dtype=np.float32); p2[:, 0] = [7.0, 8.0, 9.0]
        l1 = np.array([0, 1], dtype=np.uint8)
        l2 = np.array([2, 3, 0], dtype=np.uint8)
        _build_fixture(root, [(p1, l1), (p2, l2)])

        adapter = NuScenesAdapter(dataroot=str(root), version="v1.0-mini")
        frames = list(adapter.frames())

        assert len(frames) == 2, "sample['next'] chaining should walk both frames in the scene"
        assert frames[0].points.shape[0] == 2
        assert frames[1].points.shape[0] == 3
        assert frames[0].frame_id == 0 and frames[1].frame_id == 1


def test_label_mapper_resolves_index_through_live_category_table():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        points = np.zeros((4, 5), dtype=np.float32)
        labels = np.array([0, 1, 2, 3], dtype=np.uint8)  # car, road, pedestrian, manmade
        _build_fixture(root, [(points, labels)])

        adapter = NuScenesAdapter(dataroot=str(root), version="v1.0-mini")
        frame = next(adapter.frames())
        mapper = adapter.label_mapper()

        resolved = [mapper(raw) for raw in frame.raw_labels]
        assert resolved == ["dynamic_object", "drivable", "dynamic_object", "static_obstacle"]


def test_full_preprocess_pipeline_with_nuscenes_mapper():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        points = np.zeros((3, 5), dtype=np.float32)
        points[:, 0] = [1.0, 2.0, 3.0]
        labels = np.array([1, 1, 0], dtype=np.uint8)
        _build_fixture(root, [(points, labels)])

        adapter = NuScenesAdapter(dataroot=str(root), version="v1.0-mini")
        frame = next(adapter.frames())
        preprocessed, stats = preprocess_frame(frame, label_mapper=adapter.label_mapper())

        assert stats.kept_points == 3
        assert [p.project_class for p in preprocessed] == ["drivable", "drivable", "dynamic_object"]


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

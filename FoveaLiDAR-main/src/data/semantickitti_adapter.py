"""
src/data/semantickitti_adapter.py

Adapter for the SemanticKITTI dataset (ARCHITECTURE.md S5, S8).
Reads raw .bin point clouds and packed .label files.
"""
from pathlib import Path
from typing import Callable, Iterator, Optional

import numpy as np

from src.data.base_adapter import DatasetAdapter, RawFrame

OFFICIAL_TEST_SEQUENCES = {f"{i:02d}" for i in range(11, 22)}

# SemanticKITTI semantic class ID -> project taxonomy
SEMANTICKITTI_TO_PROJECT_CLASS = {
    # Drivable
    40: "drivable",        # road
    44: "drivable",        # parking
    48: "drivable",        # sidewalk (accessible surface)
    49: "drivable",        # other-ground
    60: "drivable",        # lane-marking
    # Non-drivable
    70: "non_drivable",    # vegetation
    71: "non_drivable",    # trunk
    72: "non_drivable",    # terrain
    # Static obstacle
    50: "static_obstacle", # building
    51: "static_obstacle", # fence
    52: "static_obstacle", # other-structure
    80: "static_obstacle", # pole
    81: "static_obstacle", # traffic-sign
    # Dynamic object (both moving and non-moving variants map to dynamic_object)
    10: "dynamic_object",  # car
    11: "dynamic_object",  # bicycle
    13: "dynamic_object",  # bus
    15: "dynamic_object",  # motorcycle
    16: "dynamic_object",  # on-rails
    18: "dynamic_object",  # truck
    20: "dynamic_object",  # other-vehicle
    30: "dynamic_object",  # person
    31: "dynamic_object",  # bicyclist
    32: "dynamic_object",  # motorcyclist
    252: "dynamic_object", # moving car
    253: "dynamic_object", # moving bicyclist
    254: "dynamic_object", # moving person
    255: "dynamic_object", # moving motorcyclist
    256: "dynamic_object", # moving on-rails
    257: "dynamic_object", # moving bus
    258: "dynamic_object", # moving truck
    259: "dynamic_object", # moving other-vehicle
}


class SemanticKittiAdapter(DatasetAdapter):
    def __init__(self, root: str, sequence: str = "00"):
        self.root = Path(root)
        self.sequence = sequence

        self.velodyne_dir = self.root / "sequences" / sequence / "velodyne"
        if not self.velodyne_dir.is_dir():
            raise FileNotFoundError(f"Velodyne directory not found: {self.velodyne_dir}")

        self.labels_dir = self.root / "sequences" / sequence / "labels"
        self.is_test_seq = sequence in OFFICIAL_TEST_SEQUENCES

    def label_mapper(self) -> Callable[[int], str]:
        def mapper(raw_id: int) -> str:
            return SEMANTICKITTI_TO_PROJECT_CLASS.get(int(raw_id), "unknown")
        return mapper

    def frames(self) -> Iterator[RawFrame]:
        bin_files = sorted(self.velodyne_dir.glob("*.bin"))

        for frame_id, bin_path in enumerate(bin_files):
            points = np.fromfile(str(bin_path), dtype=np.float32).reshape(-1, 4)

            raw_labels: Optional[np.ndarray] = None
            if not self.is_test_seq and self.labels_dir.exists():
                label_path = self.labels_dir / f"{bin_path.stem}.label"
                if label_path.exists():
                    packed = np.fromfile(str(label_path), dtype=np.uint32)
                    if len(packed) != len(points):
                        raise ValueError(
                            f"Frame {frame_id}: point count ({len(points)}) != label count ({len(packed)})"
                        )
                    # Lower 16 bits = semantic label, upper 16 bits = instance ID
                    raw_labels = packed & 0xFFFF

            yield RawFrame(
                points=points,
                raw_labels=raw_labels,
                frame_id=frame_id,
                sequence_id=self.sequence,
            )

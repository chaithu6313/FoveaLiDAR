"""
src/data/base_adapter.py

Base dataset adapter interfaces and preprocessing pipeline (ARCHITECTURE.md S5, S6).
"""
import math
from dataclasses import dataclass
from typing import Callable, Iterator, List, Optional, Protocol, Tuple

import numpy as np


@dataclass
class RawFrame:
    """Raw point cloud frame from a sensor or dataset."""
    points: np.ndarray  # float32 of shape (N, 4) [x, y, z, intensity] or (N, D)
    raw_labels: Optional[np.ndarray] = None  # dataset-specific raw label indices/strings
    frame_id: int = 0
    sequence_id: str = ""


@dataclass
class PreprocessedPoint:
    """Preprocessed point ready for classification and grid ingestion."""
    x_m: float
    y_m: float
    z_m: float
    intensity: float = 0.0
    project_class: Optional[str] = None


@dataclass
class PreprocessStats:
    total_points: int
    kept_points: int
    dropped_nan: int = 0
    dropped_range: int = 0


class DatasetAdapter(Protocol):
    """Fixed interface for all LiDAR data sources."""
    def frames(self) -> Iterator[RawFrame]:
        ...

    def label_mapper(self) -> Optional[Callable[[any], str]]:
        return None


def preprocess_frame(
    frame: RawFrame,
    label_mapper: Optional[Callable[[any], str]] = None,
    max_range_m: float = 100.0,
) -> Tuple[List[PreprocessedPoint], PreprocessStats]:
    """
    Validates, filters range, and applies semantic class mapping (ARCHITECTURE.md S6).
    """
    points = frame.points
    raw_labels = frame.raw_labels
    total_points = len(points)

    if total_points == 0:
        return [], PreprocessStats(total_points=0, kept_points=0)

    kept_points: List[PreprocessedPoint] = []
    dropped_nan = 0
    dropped_range = 0

    has_labels = raw_labels is not None and len(raw_labels) == total_points

    for i in range(total_points):
        x = float(points[i, 0])
        y = float(points[i, 1])
        z = float(points[i, 2])
        intensity = float(points[i, 3]) if points.shape[1] > 3 else 0.0

        if math.isnan(x) or math.isnan(y) or math.isnan(z) or math.isinf(x) or math.isinf(y) or math.isinf(z):
            dropped_nan += 1
            continue

        r = math.sqrt(x * x + y * y)
        if r > max_range_m or r < 0.0:
            dropped_range += 1
            continue

        proj_class: Optional[str] = None
        if has_labels:
            raw_val = raw_labels[i]
            if label_mapper is not None:
                proj_class = label_mapper(raw_val)
            elif isinstance(raw_val, (str, np.str_)):
                proj_class = str(raw_val)
            else:
                proj_class = str(raw_val)

        kept_points.append(
            PreprocessedPoint(
                x_m=x,
                y_m=y,
                z_m=z,
                intensity=intensity,
                project_class=proj_class,
            )
        )

    stats = PreprocessStats(
        total_points=total_points,
        kept_points=len(kept_points),
        dropped_nan=dropped_nan,
        dropped_range=dropped_range,
    )
    return kept_points, stats

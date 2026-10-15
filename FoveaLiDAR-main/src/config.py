"""
Single source of truth for everything that affects a benchmark number.

RULES.md - Configuration: resolution bands are an ordered LIST, not named
near/mid/far fields, so adding or resequencing a band never requires a
schema change. Every module under src/mapping and src/perception reads
these values from here and nowhere else.
"""
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class ResolutionBand:
    name: str
    outer_radius_m: float
    cell_size_m: float
    max_height_layers: int


MAX_RANGE_M = 100.0

# Reference default from the SIH26053 brief's own worked example
# (Document 2): 0-10m/5cm, 10-30m/10cm, 30-60m/25cm, 60-100m/50cm.
# These are design examples, not fixed constants - change this list to
# change the system's behaviour; nothing else needs to change.
RESOLUTION_BANDS: List[ResolutionBand] = [
    ResolutionBand("band_0_10m", outer_radius_m=10.0, cell_size_m=0.05, max_height_layers=6),
    ResolutionBand("band_10_30m", outer_radius_m=30.0, cell_size_m=0.10, max_height_layers=4),
    ResolutionBand("band_30_60m", outer_radius_m=60.0, cell_size_m=0.25, max_height_layers=2),
    ResolutionBand("band_60_100m", outer_radius_m=100.0, cell_size_m=0.50, max_height_layers=1),
]

# A single-band list covering the same range at the finest cell size -
# this is the uniform baseline Phase 4/15 benchmarks the adaptive grid
# against. Deliberately built from the same ResolutionBand type as
# RESOLUTION_BANDS so grid.py needs exactly one code path for both.
UNIFORM_BASELINE_BANDS: List[ResolutionBand] = [
    ResolutionBand("uniform", outer_radius_m=MAX_RANGE_M, cell_size_m=RESOLUTION_BANDS[0].cell_size_m,
                    max_height_layers=RESOLUTION_BANDS[0].max_height_layers),
]

ANGLE_BINS = 360  # 1-degree angular resolution; independent of range bands

HEIGHT_MERGE_TOLERANCE_M = 0.15  # points within this height of an existing
                                   # layer update that layer instead of
                                   # starting a new one - a tuned value,
                                   # see PHASES.md "questions to resolve"

# Project semantic taxonomy (PROJECT_REQUIREMENTS.md S9). Dataset-specific
# classes are translated into these by src/data/class_mapping.py - nothing
# downstream of that module ever sees a raw dataset class name.
SEMANTIC_CLASSES = ("drivable", "non_drivable", "static_obstacle", "dynamic_object", "unknown")

BYTES_PER_CELL_RECORD = 32  # estimate: band id + up to a few packed height
                             # layers: used only for the geometry-derived
                             # memory estimate (src/evaluation/benchmark.py),
                             # never presented as a measured figure

# Tracker (src/tracking/tracker.py)
TRACKER_MAX_MISSES = 5
TRACKER_MATCH_RADIUS_M = 1.5

# Dataset (src/data)
DEFAULT_DATASET_ADAPTER = "nuscenes"  # "nuscenes" | "synthetic" | "semantickitti"
                                        # nuScenes-mini is primary as of this build
                                        # (switched from SemanticKITTI - see ARCHITECTURE.md S5
                                        # and EXECUTION_GUIDE.md Step 1 for why); SemanticKittiAdapter
                                        # stays in the repo as an alternative behind the same interface.
NUSCENES_DATAROOT = None  # set via environment/local override; never hard-coded to a real path in git
SEMANTICKITTI_ROOT = None  # set via environment/local override; never hard-coded to a real path in git

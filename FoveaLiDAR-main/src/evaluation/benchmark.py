"""
Benchmark engine (ARCHITECTURE.md S15, PROJECT_REQUIREMENTS.md S14/FR6).

Two kinds of number, never conflated (RULES.md - Performance):
  - measured: actually build a uniform grid and an adaptive grid from the
    SAME input frame, in the SAME process, and time it with a real clock.
  - geometry_estimate: a closed-form cell-count/memory calculation from
    pure area math - useful as a sanity check and a machine-independent
    headline number, always labelled as an estimate, never presented as
    a measurement.
"""
import time
from dataclasses import asdict, dataclass
from typing import List

from src.config import (
    BYTES_PER_CELL_RECORD,
    MAX_RANGE_M,
    RESOLUTION_BANDS,
    UNIFORM_BASELINE_BANDS,
)
from src.mapping.grid import VariableResolutionGrid
from src.perception.model import ClassifiedPoint


@dataclass
class GridRunResult:
    mode: str  # "uniform" | "adaptive"
    cell_count: int
    cells_by_band: dict
    overhang_cells: int
    rejected_points: int
    build_latency_ms: float
    estimated_memory_mb: float


def _run_grid(points: List[ClassifiedPoint], bands, mode: str) -> GridRunResult:
    grid = VariableResolutionGrid(bands=bands)
    start = time.perf_counter()
    for p in points:
        angle_deg = _angle_deg(p.x_m, p.y_m)
        range_m = (p.x_m ** 2 + p.y_m ** 2) ** 0.5
        grid.ingest_point(angle_deg, range_m, p.z_m, p.semantic_class, p.confidence)
    latency_ms = (time.perf_counter() - start) * 1000.0

    return GridRunResult(
        mode=mode,
        cell_count=grid.cell_count(),
        cells_by_band=grid.cells_by_band(),
        overhang_cells=grid.overhang_cells(),
        rejected_points=grid.rejected_points,
        build_latency_ms=round(latency_ms, 4),
        estimated_memory_mb=round(grid.cell_count() * BYTES_PER_CELL_RECORD / (1024 ** 2), 4),
    )


def _angle_deg(x_m: float, y_m: float) -> float:
    import math
    return math.degrees(math.atan2(y_m, x_m)) % 360.0


def run_measured_benchmark(points: List[ClassifiedPoint]) -> dict:
    """The real thing: build both grids from the same frame, in this
    process, right now, and report what actually happened. This is what
    PROJECT_REQUIREMENTS.md S26 and RULES.md mean by "not invented" -
    every number here came from an actual VariableResolutionGrid run.
    """
    uniform = _run_grid(points, UNIFORM_BASELINE_BANDS, "uniform")
    adaptive = _run_grid(points, RESOLUTION_BANDS, "adaptive")

    compression_ratio = (uniform.cell_count / adaptive.cell_count) if adaptive.cell_count else None

    return {
        "measured": True,
        "input_point_count": len(points),
        "uniform": asdict(uniform),
        "adaptive": asdict(adaptive),
        "compression_ratio": round(compression_ratio, 3) if compression_ratio else None,
        "memory_saved_mb": round(uniform.estimated_memory_mb - adaptive.estimated_memory_mb, 4),
    }


def geometry_derived_estimate() -> dict:
    """Closed-form estimate from pure area math - a sanity check and a
    machine-independent headline number, explicitly not a measurement.
    Uses the SAME config.RESOLUTION_BANDS the live grid engine uses, so
    it can never silently drift out of sync with the actual band list.
    """
    import math

    adaptive_cells = 0.0
    inner = 0.0
    for band in RESOLUTION_BANDS:
        area = math.pi * (band.outer_radius_m ** 2 - inner ** 2)
        adaptive_cells += area / (band.cell_size_m ** 2)
        inner = band.outer_radius_m

    finest_cell = RESOLUTION_BANDS[0].cell_size_m
    uniform_cells = (math.pi * MAX_RANGE_M ** 2) / (finest_cell ** 2)

    return {
        "measured": False,
        "note": "geometry-derived estimate, not a measured benchmark run",
        "adaptive_cells": round(adaptive_cells),
        "uniform_cells": round(uniform_cells),
        "compression_ratio": round(uniform_cells / adaptive_cells, 3),
        "adaptive_mem_mb": round(adaptive_cells * BYTES_PER_CELL_RECORD / (1024 ** 2), 3),
        "uniform_mem_mb": round(uniform_cells * BYTES_PER_CELL_RECORD / (1024 ** 2), 3),
    }

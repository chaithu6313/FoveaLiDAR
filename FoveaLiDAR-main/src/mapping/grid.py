"""
The variable-resolution grid itself.

Cells are keyed on (band_name, angle_bin, range_bin) rather than a naive
(x, y) array index, or a range_bin computed from a single global origin.
The latter is exactly the bug this project already found once during its
own build: two different bands' local bins can land on the same integer
(a near-band point at r=5m and a far-band point at r=65m can both resolve
to range_bin=100 under their own band's cell size) and, without the band
name in the key, silently merge two physically unrelated cells. See
ARCHITECTURE.md S10 and RULES.md - 2.5D mapping.

This same class serves both the adaptive grid (config.RESOLUTION_BANDS)
and the uniform baseline it's benchmarked against (config.UNIFORM_BASELINE_BANDS)
- "uniform" is just a one-band list. One implementation, so Phase 4 and
Phase 8 can never drift into two different codebases being compared
dishonestly (RULES.md - Performance: "same machine, same run").
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from src.config import ANGLE_BINS, HEIGHT_MERGE_TOLERANCE_M, RESOLUTION_BANDS, SEMANTIC_CLASSES
from src.mapping.resolution_policy import OutOfRangeError, ResolvedBand, resolve_band

CellKey = Tuple[str, int, int]  # (band_name, angle_bin, range_bin)


@dataclass
class HeightLayer:
    height_m: float
    semantic_class: str
    confidence: float
    point_count: int = 1


@dataclass
class GridCell:
    band_name: str
    layers: List[HeightLayer] = field(default_factory=list)

    def ingest(self, height_m: float, semantic_class: str, confidence: float,
               max_layers: int, merge_tolerance_m: float = HEIGHT_MERGE_TOLERANCE_M) -> None:
        """Fold one classified point into this cell's height layers.

        Points within merge_tolerance_m of an existing layer update that
        layer (running-average height, point_count incremented, class
        replaced only if the new point is more confident). Otherwise a new
        layer starts, up to max_layers. Once the cap is reached, further
        points fold into their nearest existing layer by height rather
        than being dropped - a cell never exceeds its band's declared
        budget, and every point is accounted for in some layer's
        point_count (ARCHITECTURE.md S12).
        """
        for layer in self.layers:
            if abs(layer.height_m - height_m) <= merge_tolerance_m:
                n = layer.point_count
                layer.height_m = (layer.height_m * n + height_m) / (n + 1)
                layer.point_count += 1
                if confidence > layer.confidence:
                    layer.semantic_class = semantic_class
                    layer.confidence = confidence
                return

        if len(self.layers) < max_layers:
            self.layers.append(HeightLayer(height_m, semantic_class, confidence))
            return

        nearest = min(self.layers, key=lambda l: abs(l.height_m - height_m))
        n = nearest.point_count
        nearest.height_m = (nearest.height_m * n + height_m) / (n + 1)
        nearest.point_count += 1

    @property
    def dominant_class(self) -> str:
        if not self.layers:
            return "unknown"
        return max(self.layers, key=lambda l: l.point_count).semantic_class

    @property
    def dominant_confidence(self) -> float:
        if not self.layers:
            return 0.0
        return max(self.layers, key=lambda l: l.point_count).confidence


class VariableResolutionGrid:
    """Range-graded 2.5D grid with per-band height-layer budgets.

    Pass config.RESOLUTION_BANDS for the adaptive grid, or
    config.UNIFORM_BASELINE_BANDS for the uniform grid it's benchmarked
    against - same class either way.
    """

    def __init__(self, bands: Optional[List] = None, angle_bins: int = ANGLE_BINS):
        self._bands = bands if bands is not None else RESOLUTION_BANDS
        self._angle_bins = angle_bins
        self._angle_step_deg = 360.0 / angle_bins
        self._cells: Dict[CellKey, GridCell] = {}
        self._rejected_points = 0
        self._ingested_points = 0

    def _key_for(self, angle_deg: float, range_m: float) -> Tuple[CellKey, ResolvedBand]:
        resolved = resolve_band(range_m, self._bands)
        angle_bin = int((angle_deg % 360.0) / self._angle_step_deg)
        range_bin = int((range_m - resolved.inner_radius_m) / resolved.cell_size_m)
        return (resolved.name, angle_bin, range_bin), resolved

    def ingest_point(self, angle_deg: float, range_m: float, height_m: float,
                      semantic_class: str, confidence: float) -> None:
        if semantic_class not in SEMANTIC_CLASSES:
            raise ValueError(f"unknown semantic class: {semantic_class!r}")
        try:
            key, resolved = self._key_for(angle_deg, range_m)
        except OutOfRangeError:
            self._rejected_points += 1
            return
        cell = self._cells.get(key)
        if cell is None:
            cell = GridCell(band_name=resolved.name)
            self._cells[key] = cell
        cell.ingest(height_m, semantic_class, confidence, resolved.max_height_layers)
        self._ingested_points += 1

    def cell_count(self) -> int:
        return len(self._cells)

    def cells_by_band(self) -> Dict[str, int]:
        out: Dict[str, int] = {}
        for cell in self._cells.values():
            out[cell.band_name] = out.get(cell.band_name, 0) + 1
        return out

    def overhang_cells(self) -> int:
        """Cells holding more than one height layer - cells where a plain
        single-layer 2.5D map would have silently merged two real surfaces
        (PROJECT_REQUIREMENTS.md S26 acceptance criterion)."""
        return sum(1 for c in self._cells.values() if len(c.layers) > 1)

    @property
    def rejected_points(self) -> int:
        return self._rejected_points

    @property
    def ingested_points(self) -> int:
        return self._ingested_points

    def clear(self) -> None:
        self._cells.clear()
        self._rejected_points = 0
        self._ingested_points = 0

    def get_cell(self, band_name: str, angle_bin: int, range_bin: int) -> Optional[GridCell]:
        return self._cells.get((band_name, angle_bin, range_bin))

    def snapshot(self) -> List[dict]:
        """JSON-serialisable view of every occupied cell, for the API layer."""
        out = []
        for (band_name, angle_bin, range_bin), cell in self._cells.items():
            out.append({
                "band": band_name,
                "angle_bin": angle_bin,
                "range_bin": range_bin,
                "dominant_class": cell.dominant_class,
                "layers": [
                    {"height_m": round(l.height_m, 3), "class": l.semantic_class,
                     "confidence": round(l.confidence, 3), "points": l.point_count}
                    for l in cell.layers
                ],
            })
        return out

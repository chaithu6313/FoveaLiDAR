"""
Distance -> resolution band. Deterministic and configured, never learned
(RULES.md - ML: "Never train the resolution policy").

PROJECT_REQUIREMENTS.md S11: resolution is a function of planar range only
for the MVP. Semantic/uncertainty/motion-aware refinement is a separate,
optional pass in src/mapping/refinement.py (Phase 16) that sits on top of
this policy's output - it never replaces it.
"""
from typing import List

from src.config import ResolutionBand, RESOLUTION_BANDS, MAX_RANGE_M


class OutOfRangeError(ValueError):
    """Raised for a point beyond the configured MAX_RANGE_M.

    RULES.md - Point clouds: a rejected point is a visible, countable
    event, never a silent no-op. Callers (src/mapping/grid.py) catch this
    and increment a rejected-point counter rather than letting a frame
    fail outright.
    """


def _inner_radius(bands: List[ResolutionBand], index: int) -> float:
    return 0.0 if index == 0 else bands[index - 1].outer_radius_m


def resolve_band(range_m: float, bands: List[ResolutionBand] = None) -> "ResolvedBand":
    """Resolve a planar range (metres from the sensor, ground-plane
    distance - see RULES.md "Point clouds": r = sqrt(x^2 + y^2), never
    including z) to the band that owns it.

    Bands are checked in order; a point at exactly a boundary belongs to
    the band whose outer_radius_m equals that value (i.e. bands are
    half-open [inner, outer) except the last, which is closed at
    MAX_RANGE_M) - this is deliberate and covered by
    tests/test_grid_boundaries.py so it never quietly changes.
    """
    if range_m < 0:
        raise ValueError(f"range_m must be non-negative, got {range_m}")

    active_bands = bands if bands is not None else RESOLUTION_BANDS
    for i, band in enumerate(active_bands):
        inner = _inner_radius(active_bands, i)
        is_last = i == len(active_bands) - 1
        if is_last:
            if inner <= range_m <= band.outer_radius_m:
                return ResolvedBand(band, inner)
        else:
            if inner <= range_m < band.outer_radius_m:
                return ResolvedBand(band, inner)

    raise OutOfRangeError(
        f"range_m={range_m} exceeds the configured range "
        f"(max {active_bands[-1].outer_radius_m if active_bands else MAX_RANGE_M})"
    )


class ResolvedBand:
    """A band plus the inner radius it was resolved against, so grid.py
    never has to recompute (or risk recomputing differently) the same
    inner-radius lookup a second time."""

    __slots__ = ("band", "inner_radius_m")

    def __init__(self, band: ResolutionBand, inner_radius_m: float):
        self.band = band
        self.inner_radius_m = inner_radius_m

    @property
    def name(self) -> str:
        return self.band.name

    @property
    def cell_size_m(self) -> float:
        return self.band.cell_size_m

    @property
    def max_height_layers(self) -> int:
        return self.band.max_height_layers

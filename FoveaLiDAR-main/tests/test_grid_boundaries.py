"""
tests/test_grid_boundaries.py

Priority order per RULES.md - Testing: resolution-boundary and layer-cap
tests come first for any change to src/mapping. This file is what makes
the "no cross-band collisions, no boundary seams" claims in ARCHITECTURE.md
S10 actually true rather than just asserted.
"""
import math

from src.config import ResolutionBand
from src.mapping.grid import VariableResolutionGrid
from src.mapping.resolution_policy import OutOfRangeError, resolve_band

TEST_BANDS = [
    ResolutionBand("near", outer_radius_m=10.0, cell_size_m=0.05, max_height_layers=3),
    ResolutionBand("far", outer_radius_m=100.0, cell_size_m=0.50, max_height_layers=1),
]


def test_band_resolves_correctly_well_inside_each_band():
    assert resolve_band(1.0, TEST_BANDS).name == "near"
    assert resolve_band(50.0, TEST_BANDS).name == "far"


def test_boundary_is_exclusive_on_the_lower_band_inclusive_on_the_final_band():
    # Exactly at the near/far boundary: belongs to "far" (half-open [inner, outer)
    # on non-final bands), documented in resolution_policy.resolve_band.
    assert resolve_band(10.0, TEST_BANDS).name == "far"
    # Epsilon below the boundary still belongs to "near".
    assert resolve_band(9.999999, TEST_BANDS).name == "near"
    # Exactly at MAX_RANGE (the final band's outer edge) is valid, not rejected.
    assert resolve_band(100.0, TEST_BANDS).name == "far"


def test_beyond_max_range_raises_rather_than_silently_clamping():
    try:
        resolve_band(100.0001, TEST_BANDS)
        assert False, "expected OutOfRangeError"
    except OutOfRangeError:
        pass


def test_negative_range_raises():
    try:
        resolve_band(-1.0, TEST_BANDS)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_no_cross_band_key_collision():
    """The actual bug this project found once: a near-band point and a
    far-band point whose LOCAL range_bin values coincide must never land
    in the same cell. near cell_size=0.05 -> r=5.0m gives local range_bin
    int(5.0/0.05)=100. far cell_size=0.50, inner=10.0 -> r=10.0+100*0.50=60.0m
    gives local range_bin int((60.0-10.0)/0.50)=100. Same local bin,
    different bands - the grid must keep them as two distinct cells.
    """
    grid = VariableResolutionGrid(bands=TEST_BANDS)
    grid.ingest_point(angle_deg=0.0, range_m=5.0, height_m=0.0,
                       semantic_class="drivable", confidence=0.9)
    grid.ingest_point(angle_deg=0.0, range_m=60.0, height_m=0.0,
                       semantic_class="static_obstacle", confidence=0.9)

    assert grid.cell_count() == 2, "near and far points collapsed into one cell"

    near_cell = grid.get_cell("near", angle_bin=0, range_bin=100)
    far_cell = grid.get_cell("far", angle_bin=0, range_bin=100)
    assert near_cell is not None and far_cell is not None
    assert near_cell.dominant_class == "drivable"
    assert far_cell.dominant_class == "static_obstacle"


def test_multi_height_layer_preserves_an_overhang():
    """Two points at the same (angle, range) but different heights, within
    one band, must produce two layers - this is the overhang case
    (PROJECT_REQUIREMENTS.md S26 acceptance criterion)."""
    grid = VariableResolutionGrid(bands=TEST_BANDS)
    grid.ingest_point(angle_deg=0.0, range_m=2.0, height_m=0.0,
                       semantic_class="drivable", confidence=0.8)
    grid.ingest_point(angle_deg=0.0, range_m=2.0, height_m=2.5,
                       semantic_class="static_obstacle", confidence=0.8)

    assert grid.cell_count() == 1
    assert grid.overhang_cells() == 1
    cell = grid.get_cell("near", angle_bin=0, range_bin=40)
    assert len(cell.layers) == 2


def test_layer_cap_folds_into_nearest_rather_than_dropping():
    """near band caps at 3 layers. A 4th distinct height must fold into
    its nearest existing layer, and every point must still be accounted
    for in some layer's point_count - none silently vanish."""
    grid = VariableResolutionGrid(bands=TEST_BANDS)
    heights = [0.0, 1.0, 2.0, 2.1]  # 4th is close to the 3rd (2.0m)
    for h in heights:
        grid.ingest_point(angle_deg=0.0, range_m=3.0, height_m=h,
                           semantic_class="static_obstacle", confidence=0.7)

    cell = grid.get_cell("near", angle_bin=0, range_bin=60)
    assert len(cell.layers) == 3, "cell exceeded its band's max_height_layers"
    total_points = sum(l.point_count for l in cell.layers)
    assert total_points == 4, "a point vanished instead of folding into the nearest layer"


def test_rejected_points_are_counted_not_silently_dropped():
    grid = VariableResolutionGrid(bands=TEST_BANDS)
    grid.ingest_point(angle_deg=0.0, range_m=150.0, height_m=0.0,
                       semantic_class="drivable", confidence=0.5)
    assert grid.rejected_points == 1
    assert grid.ingested_points == 0
    assert grid.cell_count() == 0


def test_uniform_baseline_has_far_more_cells_than_adaptive_for_the_same_scene():
    """This is the actual claim the project rests on - sanity-check it
    holds for a real synthetic sweep, not just in a formula.

    Point spacing must be finer than the coarse band's cell size, or the
    test scene never exercises any compression (an earlier version of
    this test sampled every 0.5m, which happened to equal the far band's
    cell size exactly, and so trivially produced a 1-point-per-cell
    scene everywhere - a scene realistic point density would never
    produce, since a real LiDAR returns far more points than one every
    half metre along a ray).
    """
    adaptive = VariableResolutionGrid(bands=TEST_BANDS)
    uniform_bands = [ResolutionBand("uniform", outer_radius_m=100.0, cell_size_m=0.05, max_height_layers=3)]
    uniform = VariableResolutionGrid(bands=uniform_bands)

    # Sample every 5cm (finer than both the near band's 5cm cell and,
    # crucially, far finer than the far band's 50cm cell) so the far
    # band's compression actually has something to compress.
    for angle in range(0, 360, 45):  # 8 angles is enough to prove the point cheaply
        r = 0.05
        while r <= 99.95:
            adaptive.ingest_point(angle, r, 0.0, "drivable", 0.6)
            uniform.ingest_point(angle, r, 0.0, "drivable", 0.6)
            r += 0.05

    assert adaptive.cell_count() < uniform.cell_count()
    ratio = uniform.cell_count() / adaptive.cell_count()
    assert ratio > 2.0, f"expected a meaningful compression ratio, got {ratio:.2f}x"


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

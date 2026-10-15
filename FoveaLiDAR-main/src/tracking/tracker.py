"""
Minimal cross-frame tracker for dynamic_object detections.

ARCHITECTURE.md S2 / S13: the grid never stores object identity, and the
tracker never touches grid cells - this module only ever sees (x, y,
class) detections and produces Track objects; src/api is what overlays
them onto a grid snapshot for the frontend.

RULES.md - ML: tracking is a supporting component; its complexity must
never be allowed to grow past the grid engine's, which is the project's
actual novelty (PROJECT_REQUIREMENTS.md S21).
"""
import math
from dataclasses import dataclass
from typing import List

from src.config import TRACKER_MATCH_RADIUS_M, TRACKER_MAX_MISSES


@dataclass
class Detection:
    x_m: float
    y_m: float
    semantic_class: str  # "dynamic_object" in practice


@dataclass
class Track:
    track_id: int
    x_m: float
    y_m: float
    semantic_class: str
    misses: int = 0
    age: int = 0

    def distance_to(self, det: Detection) -> float:
        return math.hypot(self.x_m - det.x_m, self.y_m - det.y_m)


class Tracker:
    """Greedy nearest-neighbour association - deliberately the simplest
    thing that proves cross-frame identity works, including across a
    resolution-band boundary (PROJECT_REQUIREMENTS.md R8). Swap in a
    Kalman filter or Hungarian assignment later without touching the grid
    or API code, since both only ever call this class's public `update`
    method (PHASES.md Phase 11).
    """

    def __init__(self, max_misses: int = TRACKER_MAX_MISSES, match_radius_m: float = TRACKER_MATCH_RADIUS_M):
        self._max_misses = max_misses
        self._match_radius_m = match_radius_m
        self._tracks: List[Track] = []
        self._next_id = 1

    def update(self, detections: List[Detection]) -> List[Track]:
        unmatched = list(detections)

        for track in self._tracks:
            # Deliberately no "if not unmatched: break" shortcut here - an
            # earlier version had one, and it silently stopped
            # incrementing `misses` for every remaining track the moment
            # detections ran out for a frame, so a track with zero
            # detections for an entire frame never aged toward removal.
            # Caught by test_a_track_is_dropped_after_max_misses_consecutive_gaps.
            best, best_dist = None, self._match_radius_m
            for det in unmatched:
                d = track.distance_to(det)
                if d < best_dist:
                    best, best_dist = det, d
            if best is not None:
                track.x_m, track.y_m = best.x_m, best.y_m
                track.semantic_class = best.semantic_class
                track.misses = 0
                track.age += 1
                unmatched.remove(best)
            else:
                track.misses += 1

        for det in unmatched:
            self._tracks.append(Track(self._next_id, det.x_m, det.y_m, det.semantic_class))
            self._next_id += 1

        self._tracks = [t for t in self._tracks if t.misses <= self._max_misses]
        return list(self._tracks)

    def reset(self) -> None:
        self._tracks = []
        self._next_id = 1

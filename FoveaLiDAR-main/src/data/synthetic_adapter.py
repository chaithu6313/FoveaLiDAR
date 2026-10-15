"""
src/data/synthetic_adapter.py

Procedural LiDAR frame generator (ARCHITECTURE.md S5, PIPELINE_VERIFICATION.md).
Produces realistic point clouds for live dashboard streaming and reproducible benchmarks.
"""
import math
from typing import Iterator, List

import numpy as np

from src.data.base_adapter import DatasetAdapter, RawFrame


class SyntheticAdapter(DatasetAdapter):
    """
    Generates plausible synthetic LiDAR frames procedurally at ~10Hz.
    Includes ground plane, static roadside obstacles, overhangs, and 7 moving dynamic objects.
    """

    def __init__(self, num_frames: int = 10_000, points_per_frame: int = 400, seed: int = 42):
        self.num_frames = num_frames
        self.points_per_frame = points_per_frame
        self.seed = seed

        # Define 7 stable moving tracks (x0, y0, vx, vy, speed_scale)
        self.tracks = [
            {"x": -15.0, "y": 8.0, "vx": 0.45, "vy": 0.05},    # Car westbound
            {"x": 12.0, "y": -10.0, "vx": -0.35, "vy": 0.10},  # Car eastbound
            {"x": 5.0, "y": 18.0, "vx": 0.10, "vy": -0.40},   # Pedestrian crossing
            {"x": -8.0, "y": -15.0, "vx": 0.25, "vy": 0.30},  # Cyclist
            {"x": 20.0, "y": 5.0, "vx": -0.50, "vy": -0.15},  # Vehicle merging
            {"x": -4.0, "y": 6.0, "vx": 0.12, "vy": -0.08},   # Pedestrian near center
            {"x": 16.0, "y": 25.0, "vx": -0.20, "vy": -0.30}, # Vehicle turning
        ]

    def frames(self) -> Iterator[RawFrame]:
        rng = np.random.RandomState(self.seed)

        # Fixed static obstacle positions (barriers, trees, light poles, gantries)
        static_obstacles = [
            (8.0, 4.0, 0.8), (-7.0, 12.0, 1.2), (14.0, -12.0, 0.9),
            (-18.0, -8.0, 1.5), (25.0, 15.0, 1.0), (-30.0, 20.0, 1.8),
            (35.0, -25.0, 1.4), (5.0, -8.0, 0.7), (-12.0, 5.0, 1.1),
        ]

        # Overhang structures (e.g. highway gantries / signs at ground and overhead)
        overhang_locations = [(6.0, 6.0), (-10.0, 14.0), (18.0, -8.0)]

        for frame_id in range(self.num_frames):
            pts: List[List[float]] = []
            labels: List[str] = []

            # 1. Drivable surface points (~200 points)
            n_drivable = 200
            angles_d = rng.uniform(0, 2 * math.pi, n_drivable)
            # Quadratic radius distribution to match realistic beam divergence
            radii_d = rng.uniform(0.5, 9.8, n_drivable) ** 2 / 10.0 * 10.0
            radii_d = np.clip(radii_d, 0.5, 95.0)
            for a, r in zip(angles_d, radii_d):
                x = r * math.cos(a)
                y = r * math.sin(a)
                z = rng.normal(0.0, 0.03)
                intensity = float(rng.uniform(0.3, 0.8))
                pts.append([x, y, z, intensity])
                labels.append("drivable")

            # 2. Non-drivable terrain / sidewalks (~60 points)
            n_nondrivable = 60
            angles_nd = rng.uniform(0, 2 * math.pi, n_nondrivable)
            radii_nd = rng.uniform(5.0, 90.0, n_nondrivable)
            for a, r in zip(angles_nd, radii_nd):
                x = r * math.cos(a)
                y = r * math.sin(a)
                z = rng.normal(0.15, 0.05)
                intensity = float(rng.uniform(0.1, 0.5))
                pts.append([x, y, z, intensity])
                labels.append("non_drivable")

            # 3. Static obstacles (~70 points)
            for ox, oy, oz in static_obstacles:
                # 5-8 scatter points per obstacle
                k = rng.randint(5, 9)
                for _ in range(k):
                    dx = rng.normal(0.0, 0.3)
                    dy = rng.normal(0.0, 0.3)
                    dz = rng.uniform(0.05, oz)
                    pts.append([ox + dx, oy + dy, dz, float(rng.uniform(0.6, 0.95))])
                    labels.append("static_obstacle")

            # 4. Overhangs (multi-height cells) (~20 points)
            for hx, hy in overhang_locations:
                # Ground level layer
                pts.append([hx, hy, 0.05, 0.7])
                labels.append("static_obstacle")
                pts.append([hx + 0.02, hy - 0.02, 0.08, 0.7])
                labels.append("static_obstacle")
                # Upper gantry layer (>1.5m clearance)
                pts.append([hx, hy, 2.2, 0.85])
                labels.append("static_obstacle")
                pts.append([hx - 0.02, hy + 0.02, 2.3, 0.85])
                labels.append("static_obstacle")

            # 5. Dynamic objects (7 tracks) (~50 points)
            for t in self.tracks:
                # Update track position
                curr_x = t["x"] + t["vx"] * (frame_id % 120)
                curr_y = t["y"] + t["vy"] * (frame_id % 120)

                # Generate 6-8 clustered points for this moving object
                n_dyn = rng.randint(6, 9)
                for _ in range(n_dyn):
                    dx = rng.normal(0.0, 0.35)
                    dy = rng.normal(0.0, 0.35)
                    dz = rng.uniform(0.3, 1.4)
                    pts.append([curr_x + dx, curr_y + dy, dz, float(rng.uniform(0.7, 1.0))])
                    labels.append("dynamic_object")

            points_arr = np.array(pts, dtype=np.float32)
            labels_arr = np.array(labels)

            yield RawFrame(
                points=points_arr,
                raw_labels=labels_arr,
                frame_id=frame_id,
                sequence_id="synthetic_stream",
            )


def build_dense_benchmark_scene(total_points: int = 51_200, seed: int = 12345) -> RawFrame:
    """
    Builds a single realistic, dense 51,200-point scene for measured benchmarks.
    Deterministic point distribution across all 4 resolution bands with terrain,
    multi-height overhangs, obstacles, and vehicles.
    """
    rng = np.random.RandomState(seed)

    pts: List[List[float]] = []
    labels: List[str] = []

    # Band 0: 0-10m (~8,000 points, high density)
    n_b0 = int(total_points * 0.16)
    angles_0 = rng.uniform(0, 2 * math.pi, n_b0)
    radii_0 = rng.uniform(0.3, 9.9, n_b0)
    for a, r in zip(angles_0, radii_0):
        x = r * math.cos(a)
        y = r * math.sin(a)
        z = rng.normal(0.0, 0.04)
        pts.append([x, y, z, float(rng.uniform(0.2, 0.8))])
        labels.append("drivable")

    # Band 1: 10-30m (~16,000 points)
    n_b1 = int(total_points * 0.31)
    angles_1 = rng.uniform(0, 2 * math.pi, n_b1)
    radii_1 = rng.uniform(10.1, 29.9, n_b1)
    for a, r in zip(angles_1, radii_1):
        x = r * math.cos(a)
        y = r * math.sin(a)
        z = rng.normal(0.05, 0.08)
        pts.append([x, y, z, float(rng.uniform(0.2, 0.8))])
        labels.append("drivable" if rng.rand() > 0.3 else "non_drivable")

    # Band 2: 30-60m (~16,000 points)
    n_b2 = int(total_points * 0.31)
    angles_2 = rng.uniform(0, 2 * math.pi, n_b2)
    radii_2 = rng.uniform(30.1, 59.9, n_b2)
    for a, r in zip(angles_2, radii_2):
        x = r * math.cos(a)
        y = r * math.sin(a)
        z = rng.normal(0.1, 0.12)
        pts.append([x, y, z, float(rng.uniform(0.1, 0.6))])
        labels.append("drivable" if rng.rand() > 0.4 else "non_drivable")

    # Band 3: 60-100m (~11,200 points)
    n_b3 = total_points - (n_b0 + n_b1 + n_b2) - 800
    angles_3 = rng.uniform(0, 2 * math.pi, n_b3)
    radii_3 = rng.uniform(60.1, 99.8, n_b3)
    for a, r in zip(angles_3, radii_3):
        x = r * math.cos(a)
        y = r * math.sin(a)
        z = rng.normal(0.2, 0.2)
        pts.append([x, y, z, float(rng.uniform(0.1, 0.5))])
        labels.append("non_drivable" if rng.rand() > 0.3 else "drivable")

    # Add 400 multi-height overhang points (e.g., highway bridges and road sign gantries)
    gantry_positions = [(5.0, 5.0), (-12.0, 15.0), (22.0, -18.0), (-35.0, -25.0)]
    for gx, gy in gantry_positions:
        for _ in range(50):
            dx = rng.normal(0.0, 0.2)
            dy = rng.normal(0.0, 0.2)
            # Ground post
            pts.append([gx + dx, gy + dy, float(rng.uniform(0.0, 0.8)), 0.85])
            labels.append("static_obstacle")
            # Elevated cross-beam overhang
            pts.append([gx + dx, gy + dy, float(rng.uniform(2.2, 2.7)), 0.9])
            labels.append("static_obstacle")

    # Add 400 dynamic object points (vehicles & pedestrians)
    vehicle_centers = [(7.0, -4.0), (-15.0, 8.0), (24.0, 12.0), (-40.0, 18.0)]
    for vx, vy in vehicle_centers:
        for _ in range(100):
            pts.append([
                vx + float(rng.normal(0.0, 0.8)),
                vy + float(rng.normal(0.0, 0.8)),
                float(rng.uniform(0.3, 1.5)),
                float(rng.uniform(0.7, 0.95)),
            ])
            labels.append("dynamic_object")

    points_arr = np.array(pts, dtype=np.float32)
    labels_arr = np.array(labels)

    return RawFrame(
        points=points_arr,
        raw_labels=labels_arr,
        frame_id=0,
        sequence_id="dense_benchmark_scene",
    )

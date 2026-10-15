"""
src/data/nuscenes_adapter.py

Adapter for the official nuScenes-mini dataset (ARCHITECTURE.md S5).
Uses nuscenes-devkit to load metadata tables and point clouds.
"""
from pathlib import Path
from typing import Callable, Iterator, Optional

import numpy as np

from src.data.base_adapter import DatasetAdapter, RawFrame
from src.data.nuscenes_class_mapping import project_class_for_category_name


class NuScenesAdapter(DatasetAdapter):
    def __init__(self, dataroot: str, version: str = "v1.0-mini"):
        self.dataroot = Path(dataroot)
        self.version = version

        from nuscenes.nuscenes import NuScenes

        self.nusc = NuScenes(version=self.version, dataroot=str(self.dataroot), verbose=False)

    def summary(self) -> dict:
        return {
            "dataset": "nuScenes",
            "version": self.version,
            "dataroot": str(self.dataroot),
            "scenes": len(getattr(self.nusc, "scene", [])),
            "samples": len(getattr(self.nusc, "sample", [])),
            "sample_data": len(getattr(self.nusc, "sample_data", [])),
            "annotations": len(getattr(self.nusc, "sample_annotation", [])),
            "categories": len(getattr(self.nusc, "category", [])),
            "sensors": len(getattr(self.nusc, "sensor", [])),
        }

    def label_mapper(self) -> Callable[[int], str]:
        """
        Builds a callable mapping raw label index (from lidarseg) to project class name.
        Uses category table to map index -> category name -> project class.
        """
        categories = getattr(self.nusc, "category", [])
        idx_to_cat_name = {cat["index"]: cat["name"] for cat in categories if "index" in cat and "name" in cat}

        def mapper(raw_index: int) -> str:
            cat_name = idx_to_cat_name.get(int(raw_index), "")
            return project_class_for_category_name(cat_name)

        return mapper

    def frames(self) -> Iterator[RawFrame]:
        from nuscenes.utils.data_classes import LidarPointCloud

        # Build lookup for lidarseg records by sample_data_token or token
        lidarseg_table = getattr(self.nusc, "lidarseg", [])
        lidarseg_by_sd = {}
        for rec in lidarseg_table:
            sd_tok = rec.get("sample_data_token") or rec.get("token")
            if sd_tok:
                lidarseg_by_sd[sd_tok] = rec

        sample_lookup = {s["token"]: s for s in getattr(self.nusc, "sample", [])}
        sample_data_lookup = {sd["token"]: sd for sd in getattr(self.nusc, "sample_data", [])}

        frame_idx = 0
        for scene in getattr(self.nusc, "scene", []):
            curr_token = scene.get("first_sample_token")
            scene_name = scene.get("name", "unknown_scene")

            while curr_token:
                sample = sample_lookup.get(curr_token)
                if not sample:
                    break

                # Find LIDAR_TOP sample_data token
                sd_token = sample.get("data", {}).get("LIDAR_TOP")
                if not sd_token:
                    # Fallback: scan sample_data for matching sample_token and channel/modality
                    for sd in sample_data_lookup.values():
                        if sd.get("sample_token") == curr_token and (
                            sd.get("channel") == "LIDAR_TOP" or sd.get("sensor_modality") == "lidar"
                        ):
                            sd_token = sd["token"]
                            break

                if sd_token:
                    sd_rec = sample_data_lookup.get(sd_token)
                    if sd_rec:
                        pc_path = self.dataroot / sd_rec["filename"]
                        # LidarPointCloud drops ring index (5th column) returning 4xN
                        pc = LidarPointCloud.from_file(str(pc_path))
                        points_4xN = pc.points[:4, :]
                        points = points_4xN.T.astype(np.float32)

                        # Load semantic labels if lidarseg entry exists
                        raw_labels: Optional[np.ndarray] = None
                        l_rec = lidarseg_by_sd.get(sd_token)
                        if l_rec and "filename" in l_rec:
                            label_path = self.dataroot / l_rec["filename"]
                            if label_path.exists():
                                raw_labels = np.fromfile(str(label_path), dtype=np.uint8)

                        yield RawFrame(
                            points=points,
                            raw_labels=raw_labels,
                            frame_id=frame_idx,
                            sequence_id=scene_name,
                        )
                        frame_idx += 1

                curr_token = sample.get("next")

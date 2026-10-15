"""
src/api/main.py

FastAPI service layer (ARCHITECTURE.md S16-18). Owns exactly two things:
running the pipeline one tick at a time for the live WebSocket feed, and
triggering a real measured benchmark run on demand. It contains no
perception or mapping logic itself - everything here is composition of
the modules built for their own sake.

Run locally:
    PYTHONPATH=. uvicorn src.api.main:app --reload
"""
import asyncio
import math
from dataclasses import asdict
from typing import Dict, List, Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.config import RESOLUTION_BANDS
from src.data.base_adapter import PreprocessedPoint, RawFrame, preprocess_frame
from src.data.inspector import inspect_point_cloud, parse_csv_points, parse_excel_points
from src.data.synthetic_adapter import SyntheticAdapter, build_dense_benchmark_scene
from src.evaluation.benchmark import geometry_derived_estimate, run_measured_benchmark
from src.mapping.grid import VariableResolutionGrid
from src.perception.model import GroundTruthPassthrough, HeuristicPlaceholder
from src.storage.db import Storage
from src.tracking.tracker import Detection, Tracker

SCHEMA_VERSION = 1

app = FastAPI(title="FoveaLidar - SIH26053 Adaptive Variable-Resolution 2.5D LiDAR Mapping")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

storage = Storage()
_session_id = storage.create_session(label="dev session")

_active_dataset: Dict[str, Optional[object]] = {
    "name": "Default Synthetic Stream",
    "filename": "synthetic_stream.pcd",
    "points": None,
    "labels": None,
    "inspection": None,
}


def _angle_deg(x_m: float, y_m: float) -> float:
    return math.degrees(math.atan2(y_m, x_m)) % 360.0


@app.get("/api/stats")
def stats():
    return geometry_derived_estimate()


@app.get("/api/config")
def config():
    bands = []
    inner = 0.0
    for b in RESOLUTION_BANDS:
        bands.append({
            "name": b.name,
            "inner_radius_m": inner,
            "outer_radius_m": b.outer_radius_m,
            "cell_size_m": b.cell_size_m,
            "max_height_layers": b.max_height_layers,
        })
        inner = b.outer_radius_m
    return {"bands": bands, "angle_bins": 360, "max_range_m": bands[-1]["outer_radius_m"] if bands else 0}


class PresetRequest(BaseModel):
    preset_id: str


def _extract_preview_points(points: Optional[np.ndarray], labels: Optional[np.ndarray], max_points: int = 600) -> List[Dict[str, Any]]:
    if points is None or len(points) == 0:
        return []
    valid_mask = ~(np.isnan(points[:, :3]).any(axis=1) | np.isinf(points[:, :3]).any(axis=1))
    clean_pts = points[valid_mask]
    clean_lbls = labels[valid_mask] if labels is not None else None

    sample_size = min(len(clean_pts), max_points)
    if sample_size <= 0:
        return []
    sample_indices = np.linspace(0, len(clean_pts) - 1, sample_size, dtype=int)
    return [
        {
            "x": round(float(clean_pts[i, 0]), 3),
            "y": round(float(clean_pts[i, 1]), 3),
            "z": round(float(clean_pts[i, 2]), 3),
            "intensity": round(float(clean_pts[i, 3]), 2) if clean_pts.shape[1] > 3 else 0.5,
            "class": str(clean_lbls[i]) if clean_lbls is not None and len(clean_lbls) > i else "unknown",
        }
        for i in sample_indices
    ]


@app.post("/api/dataset/upload")
async def upload_dataset(file: UploadFile = File(...)):
    filename = file.filename or "uploaded_dataset.csv"
    contents = await file.read()
    file_size = len(contents)

    ext = "." + filename.split(".")[-1].lower() if "." in filename else ""
    if ext in [".xlsx", ".xls"]:
        points, labels = parse_excel_points(contents)
    else:
        text = contents.decode("utf-8", errors="replace")
        points, labels = parse_csv_points(text)

    if len(points) == 0:
        raise HTTPException(status_code=400, detail="No valid 3D points found in uploaded file")

    inspection = inspect_point_cloud(
        filename=filename,
        points=points,
        raw_labels=labels,
        file_size_bytes=file_size,
    )

    _active_dataset["name"] = filename
    _active_dataset["filename"] = filename
    _active_dataset["points"] = points
    _active_dataset["labels"] = labels
    _active_dataset["inspection"] = asdict(inspection)

    preview_points = _extract_preview_points(points, labels)

    return {
        "status": "success",
        "inspection": asdict(inspection),
        "preview_points": preview_points,
    }


@app.post("/api/dataset/select-preset")
def select_preset(req: PresetRequest):
    pid = req.preset_id.lower()
    if pid in ["dense_benchmark", "nuscenes", "semantickitti"]:
        frame = build_dense_benchmark_scene(total_points=51_200, seed=42)
        name = "nuScenes-mini Realistic Urban Scan (51.2k pts)" if pid == "nuscenes" else "Dense Realistic Corridor (51.2k pts)"
    else:
        frame = build_dense_benchmark_scene(total_points=12_800, seed=99)
        name = "Highway Sequence (12.8k pts)"

    points = frame.points
    labels = frame.raw_labels
    inspection = inspect_point_cloud(
        filename=f"{pid}.csv",
        points=points,
        raw_labels=labels,
        file_size_bytes=int(len(points) * 32),
    )

    _active_dataset["name"] = name
    _active_dataset["filename"] = f"{pid}.csv"
    _active_dataset["points"] = points
    _active_dataset["labels"] = labels
    _active_dataset["inspection"] = asdict(inspection)

    preview_points = _extract_preview_points(points, labels)

    return {
        "status": "success",
        "inspection": asdict(inspection),
        "preview_points": preview_points,
    }


@app.get("/api/dataset/active")
def get_active_dataset():
    insp = _active_dataset.get("inspection")
    points = _active_dataset.get("points")
    labels = _active_dataset.get("labels")

    preview_points = _extract_preview_points(points, labels)

    return {
        "name": _active_dataset.get("name"),
        "filename": _active_dataset.get("filename"),
        "has_custom_data": points is not None,
        "inspection": insp,
        "preview_points": preview_points,
    }


@app.get("/api/benchmark/run")
def benchmark_run():
    active_pts = _active_dataset.get("points")
    active_lbls = _active_dataset.get("labels")

    if active_pts is not None and len(active_pts) > 0:
        frame = RawFrame(
            points=active_pts,
            raw_labels=active_lbls,
            frame_id=0,
            sequence_id=str(_active_dataset.get("name", "custom")),
        )
        adapter_label = f"uploaded_{_active_dataset.get('filename', 'custom')}"
    else:
        frame = build_dense_benchmark_scene()
        adapter_label = "synthetic_dense_benchmark"

    points, _ = preprocess_frame(frame)
    if any(p.project_class is not None for p in points):
        classified = GroundTruthPassthrough().classify(points)
    else:
        classified = HeuristicPlaceholder().classify(points)
    result = run_measured_benchmark(classified)

    run_id = storage.create_processing_run(
        _session_id,
        config={"bands": [asdict(b) for b in RESOLUTION_BANDS]},
        dataset_adapter=adapter_label,
    )
    for mode_result in (result["uniform"], result["adaptive"]):
        storage.record_benchmark_run(
            run_id,
            mode=mode_result["mode"],
            cell_count=mode_result["cell_count"],
            memory_mb=mode_result["estimated_memory_mb"],
            latency_ms=mode_result["build_latency_ms"],
            input_point_count=result["input_point_count"],
        )

    return result


@app.get("/api/benchmark/history")
def benchmark_history(limit: int = 20):
    return storage.list_benchmark_runs(limit=limit)


@app.get("/api/dataset/grid-frame")
def dataset_grid_frame():
    """
    Process the active uploaded dataset through the full adaptive-resolution
    pipeline and return a single grid frame in the same JSON schema as
    /ws/frames. Called by the frontend immediately after upload so the
    Adaptive Grid and 2.5D views reflect the uploaded file, not the synthetic stream.
    """
    active_pts = _active_dataset.get("points")
    active_lbls = _active_dataset.get("labels")

    if active_pts is None or len(active_pts) == 0:
        raise HTTPException(status_code=404, detail="No dataset uploaded yet")

    frame_to_use = RawFrame(
        points=active_pts,
        raw_labels=active_lbls,
        frame_id=0,
        sequence_id=str(_active_dataset.get("name", "uploaded")),
    )

    grid = VariableResolutionGrid(bands=RESOLUTION_BANDS)
    tracker = Tracker()

    points, _ = preprocess_frame(frame_to_use)
    if any(p.project_class is not None for p in points):
        classified = GroundTruthPassthrough().classify(points)
    else:
        classified = HeuristicPlaceholder().classify(points)

    detections = []
    for cp in classified:
        if cp.semantic_class == "dynamic_object":
            detections.append(Detection(cp.x_m, cp.y_m, cp.semantic_class))
        else:
            r = (cp.x_m ** 2 + cp.y_m ** 2) ** 0.5
            grid.ingest_point(_angle_deg(cp.x_m, cp.y_m), r, cp.z_m, cp.semantic_class, cp.confidence)

    tracks = tracker.update(detections)

    return {
        "schema_version": SCHEMA_VERSION,
        "frame_id": 0,
        "source": "uploaded_dataset",
        "dataset_name": _active_dataset.get("filename", "uploaded"),
        "cell_count": grid.cell_count(),
        "cells_by_band": grid.cells_by_band(),
        "overhang_cells": grid.overhang_cells(),
        "cells": grid.snapshot(),
        "tracks": [
            {
                "id": t.track_id,
                "x_m": round(t.x_m, 2),
                "y_m": round(t.y_m, 2),
                "class": t.semantic_class,
                "age": t.age,
            }
            for t in tracks
        ],
        "is_demo": False,
    }


@app.websocket("/ws/frames")
async def frames(ws: WebSocket):
    await ws.accept()
    adapter = SyntheticAdapter(num_frames=10_000, points_per_frame=400)
    grid = VariableResolutionGrid(bands=RESOLUTION_BANDS)
    tracker = Tracker()
    segmenter = GroundTruthPassthrough()

    try:
        for raw_frame in adapter.frames():
            active_pts = _active_dataset.get("points")
            active_lbls = _active_dataset.get("labels")

            if active_pts is not None and len(active_pts) > 0:
                frame_to_use = RawFrame(
                    points=active_pts,
                    raw_labels=active_lbls,
                    frame_id=raw_frame.frame_id,
                    sequence_id="active_uploaded",
                )
            else:
                frame_to_use = raw_frame

            grid.clear()
            points, _ = preprocess_frame(frame_to_use)
            if any(p.project_class is not None for p in points):
                classified = segmenter.classify(points)
            else:
                classified = HeuristicPlaceholder().classify(points)

            detections = []
            for cp in classified:
                if cp.semantic_class == "dynamic_object":
                    detections.append(Detection(cp.x_m, cp.y_m, cp.semantic_class))
                else:
                    r = (cp.x_m ** 2 + cp.y_m ** 2) ** 0.5
                    grid.ingest_point(_angle_deg(cp.x_m, cp.y_m), r, cp.z_m, cp.semantic_class, cp.confidence)

            tracks = tracker.update(detections)

            sample_pts = [
                {
                    "x": round(p.x_m, 2),
                    "y": round(p.y_m, 2),
                    "z": round(p.z_m, 2),
                    "intensity": round(p.intensity, 2),
                    "class": p.project_class or "unknown",
                }
                for p in points[:300]
            ]

            await ws.send_json({
                "schema_version": SCHEMA_VERSION,
                "frame_id": raw_frame.frame_id,
                "cell_count": grid.cell_count(),
                "cells_by_band": grid.cells_by_band(),
                "overhang_cells": grid.overhang_cells(),
                "cells": grid.snapshot(),
                "raw_points": sample_pts,
                "tracks": [
                    {
                        "id": t.track_id,
                        "x_m": round(t.x_m, 2),
                        "y_m": round(t.y_m, 2),
                        "class": t.semantic_class,
                        "age": t.age,
                    }
                    for t in tracks
                ],
            })
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

@dataclass
class InspectionResult:
    filename: str
    file_type: str
    file_size_kb: float
    point_count: int
    has_xyz: bool
    has_intensity: bool
    has_classification: bool
    has_labels: bool
    crs_detected: str
    units_detected: str
    spatial_extent: Dict[str, Tuple[float, float]]
    bounding_box_volume_m3: float
    point_density_pts_m2: float
    missing_values: int
    duplicate_points: int
    data_quality_score: float
    is_pointnet_suitable: bool
    pointnet_reasons: List[str]
    detected_classes: List[str]

def inspect_point_cloud(
    filename: str,
    points: np.ndarray,
    raw_labels: Optional[np.ndarray] = None,
    file_size_bytes: int = 0,
) -> InspectionResult:
    ext = "." + filename.split(".")[-1].lower() if "." in filename else ".unknown"
    n_points = len(points)

    if n_points == 0:
        return InspectionResult(
            filename=filename,
            file_type=ext.upper().replace(".", ""),
            file_size_kb=round(file_size_bytes / 1024.0, 1),
            point_count=0,
            has_xyz=False,
            has_intensity=False,
            has_classification=False,
            has_labels=False,
            crs_detected="Unknown",
            units_detected="Unknown",
            spatial_extent={"x": (0.0, 0.0), "y": (0.0, 0.0), "z": (0.0, 0.0)},
            bounding_box_volume_m3=0.0,
            point_density_pts_m2=0.0,
            missing_values=0,
            duplicate_points=0,
            data_quality_score=0.0,
            is_pointnet_suitable=False,
            pointnet_reasons=["Dataset contains 0 points"],
            detected_classes=[],
        )

    has_xyz = points.shape[1] >= 3
    has_intensity = points.shape[1] >= 4 and bool(np.any(points[:, 3] > 0))
    has_labels = raw_labels is not None and len(raw_labels) == n_points
    has_classification = has_labels

    nan_mask = np.isnan(points[:, :3]).any(axis=1) | np.isinf(points[:, :3]).any(axis=1)
    missing_count = int(np.sum(nan_mask))

    valid_pts = points[~nan_mask, :3] if has_xyz else np.zeros((0, 3))
    valid_count = len(valid_pts)

    if valid_count > 0:
        x_min, y_min, z_min = np.min(valid_pts, axis=0)
        x_max, y_max, z_max = np.max(valid_pts, axis=0)
    else:
        x_min = y_min = z_min = x_max = y_max = z_max = 0.0

    dx = max(0.001, float(x_max - x_min))
    dy = max(0.001, float(y_max - y_min))
    dz = max(0.001, float(z_max - z_min))
    footprint_area = max(0.01, dx * dy)
    volume = dx * dy * dz

    point_density = round(valid_count / footprint_area, 2)

    sample_size = min(valid_count, 5000)
    if sample_size > 0:
        sample_pts = valid_pts[np.random.choice(valid_count, sample_size, replace=False)]
        quantized = np.round(sample_pts, decimals=2)
        _, counts = np.unique(quantized, axis=0, return_counts=True)
        sample_dups = int(np.sum(counts[counts > 1] - 1))
        duplicate_count = int(sample_dups * (valid_count / sample_size))
    else:
        duplicate_count = 0

    max_extent = max(dx, dy, dz)
    if max_extent < 300.0:
        units = "Meters (m)"
        crs = "Ego Sensor Frame (Cartesian Local)"
    elif max_extent < 300000.0:
        units = "Millimeters (mm)"
        crs = "CAD / Object Frame"
    else:
        units = "UTM / Projected Units"
        crs = "Projected CRS (EPSG / UTM)"

    quality_deductions = 0.0
    if missing_count > 0:
        quality_deductions += min(30.0, (missing_count / n_points) * 100.0)
    if duplicate_count > 0:
        quality_deductions += min(20.0, (duplicate_count / n_points) * 100.0)
    if not has_intensity:
        quality_deductions += 5.0
    if not has_classification:
        quality_deductions += 5.0
    data_quality_score = max(10.0, min(100.0, round(100.0 - quality_deductions, 1)))

    pointnet_reasons = []
    is_pointnet_suitable = True

    if valid_count < 1024:
        is_pointnet_suitable = False
        pointnet_reasons.append(f"Insufficient points: {valid_count} (PointNet requires >= 1,024)")
    else:
        pointnet_reasons.append(f"Point count optimal ({valid_count:,} >= 1,024)")

    if has_xyz:
        pointnet_reasons.append("3D Cartesian coordinates (X, Y, Z) verified")
    else:
        is_pointnet_suitable = False
        pointnet_reasons.append("Missing essential X, Y, Z coordinate channels")

    if max_extent > 500.0:
        pointnet_reasons.append(f"Broad coordinate span ({round(max_extent, 1)}m): recommend local unit normalization")
    else:
        pointnet_reasons.append(f"Bounded spatial domain ({round(max_extent, 1)}m): ready for canonical sphere/cube normalization")

    detected_classes = []
    if has_labels:
        unique_labels = np.unique(raw_labels)
        detected_classes = [str(lbl) for lbl in unique_labels[:10]]

    return InspectionResult(
        filename=filename,
        file_type=ext.upper().replace(".", ""),
        file_size_kb=round(file_size_bytes / 1024.0, 1),
        point_count=valid_count,
        has_xyz=has_xyz,
        has_intensity=has_intensity,
        has_classification=has_classification,
        has_labels=has_labels,
        crs_detected=crs,
        units_detected=units,
        spatial_extent={
            "x": (round(float(x_min), 2), round(float(x_max), 2)),
            "y": (round(float(y_min), 2), round(float(y_max), 2)),
            "z": (round(float(z_min), 2), round(float(z_max), 2)),
        },
        bounding_box_volume_m3=round(volume, 2),
        point_density_pts_m2=point_density,
        missing_values=missing_count,
        duplicate_points=duplicate_count,
        data_quality_score=data_quality_score,
        is_pointnet_suitable=is_pointnet_suitable,
        pointnet_reasons=pointnet_reasons,
        detected_classes=detected_classes,
    )

def parse_csv_points(file_content: str) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    lines = [l.strip() for l in file_content.splitlines() if l.strip()]
    if not lines:
        return np.zeros((0, 4), dtype=np.float32), None

    first_line = lines[0].lower()
    delimiter = ","
    if "\t" in first_line:
        delimiter = "\t"
    elif ";" in first_line:
        delimiter = ";"
    elif " " in first_line and "," not in first_line:
        delimiter = None

    tokens = first_line.split(delimiter) if delimiter else first_line.split()
    has_header = any(col in ["x", "y", "z", "intensity", "label", "class", "scalar", "red"] for col in tokens)

    x_idx, y_idx, z_idx = 0, 1, 2
    intensity_idx = None
    label_idx = None

    if has_header:
        for idx, col in enumerate(tokens):
            c = col.strip().replace('"', '').replace("'", "")
            if c in ["x", "x_m", "x_coord"]:
                x_idx = idx
            elif c in ["y", "y_m", "y_coord"]:
                y_idx = idx
            elif c in ["z", "z_m", "z_coord", "elevation"]:
                z_idx = idx
            elif c in ["intensity", "i", "reflectance"]:
                intensity_idx = idx
            elif c in ["label", "class", "classification", "category", "target"]:
                label_idx = idx
        data_lines = lines[1:]
    else:
        if len(tokens) >= 4:
            intensity_idx = 3
        if len(tokens) >= 5:
            label_idx = 4
        data_lines = lines

    points_list = []
    labels_list = []

    for line in data_lines:
        parts = line.split(delimiter) if delimiter else line.split()
        if len(parts) <= max(x_idx, y_idx, z_idx):
            continue
        try:
            x = float(parts[x_idx])
            y = float(parts[y_idx])
            z = float(parts[z_idx])
            intensity = float(parts[intensity_idx]) if intensity_idx is not None and len(parts) > intensity_idx else 0.5
            points_list.append([x, y, z, intensity])
            if label_idx is not None and len(parts) > label_idx:
                labels_list.append(parts[label_idx].strip())
        except ValueError:
            continue

    pts_arr = np.array(points_list, dtype=np.float32) if points_list else np.zeros((0, 4), dtype=np.float32)
    lbls_arr = np.array(labels_list) if labels_list else None
    return pts_arr, lbls_arr


def parse_excel_points(file_bytes: bytes) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    import io
    import openpyxl
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        sheet = wb.active
        rows = list(sheet.iter_rows(values_only=True))
    except Exception:
        return np.zeros((0, 4), dtype=np.float32), None

    if not rows:
        return np.zeros((0, 4), dtype=np.float32), None

    first_row = [str(c).lower().strip() if c is not None else "" for c in rows[0]]
    has_header = any(col in ["x", "y", "z", "intensity", "label", "class", "scalar"] for col in first_row)

    x_idx, y_idx, z_idx = 0, 1, 2
    intensity_idx = None
    label_idx = None

    if has_header:
        for idx, col in enumerate(first_row):
            if col in ["x", "x_m", "x_coord"]:
                x_idx = idx
            elif col in ["y", "y_m", "y_coord"]:
                y_idx = idx
            elif col in ["z", "z_m", "z_coord", "elevation"]:
                z_idx = idx
            elif col in ["intensity", "i", "reflectance"]:
                intensity_idx = idx
            elif col in ["label", "class", "classification", "category"]:
                label_idx = idx
        data_rows = rows[1:]
    else:
        if len(first_row) >= 4:
            intensity_idx = 3
        if len(first_row) >= 5:
            label_idx = 4
        data_rows = rows

    points_list = []
    labels_list = []

    for r in data_rows:
        if len(r) <= max(x_idx, y_idx, z_idx):
            continue
        try:
            x_val = r[x_idx]
            y_val = r[y_idx]
            z_val = r[z_idx]
            if x_val is None or y_val is None or z_val is None:
                continue
            x = float(x_val)
            y = float(y_val)
            z = float(z_val)
            inte = float(r[intensity_idx]) if intensity_idx is not None and len(r) > intensity_idx and r[intensity_idx] is not None else 0.5
            points_list.append([x, y, z, inte])
            if label_idx is not None and len(r) > label_idx and r[label_idx] is not None:
                labels_list.append(str(r[label_idx]).strip())
        except (ValueError, TypeError):
            continue

    pts_arr = np.array(points_list, dtype=np.float32) if points_list else np.zeros((0, 4), dtype=np.float32)
    lbls_arr = np.array(labels_list) if labels_list else None
    return pts_arr, lbls_arr

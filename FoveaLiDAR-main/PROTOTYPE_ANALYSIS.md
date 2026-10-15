# Adaptive LiDAR Mapping — Prototype Analysis

## 1. Existing Project Architecture

**Core Pipeline:**
```
Raw LiDAR Frame 
  ↓
Dataset Adapter (src/data)
  ↓
Preprocessing (range filter, validity check)
  ↓
Segmentation Model (src/perception) - SegmentationModel Protocol
  ↓
ClassifiedPoint[] (x, y, z, semantic_class, confidence)
  ↓
Variable-Resolution Grid (src/mapping/grid.py)
  ↓
2.5D Grid with multi-height cells
  ↓
Tracker (src/tracking) - cross-frame identity for dynamic objects
  ↓
FastAPI + WebSocket API (src/api/main.py)
  ↓
React Dashboard (frontend/)
```

**Architectural Principle:** Fixed interfaces (`DatasetAdapter`, `SegmentationModel`) allow any module to be replaced without touching neighbors. Clean separation: grid never knows about identity; tracker never touches cell data.

---

## 2. Existing Backend Entry Point

**File:** [src/api/main.py](src/api/main.py)

**Current Status:** ✅ **FULLY FUNCTIONAL AND COMPLETE**

**Key Endpoints:**

1. **`GET /api/config`** — Returns band geometry (range boundaries, cell sizes, max layers). Single source of truth the frontend reads instead of hardcoding.

2. **`GET /api/stats`** — Geometry-derived estimate (non-measured, explicitly labelled as such).

3. **`GET /api/benchmark/run`** — Triggers actual measured benchmark: builds uniform + adaptive grid from same synthetic dense scene, times both, persists results to SQLite.

4. **`GET /api/benchmark/history`** — Returns past benchmark runs from storage.

5. **`WebSocket /ws/frames`** — **Live feed** for dashboard. Current implementation:
   - Uses `SyntheticAdapter` (lightweight, 400 points/frame, 10,000 frames)
   - Runs at interactive rate (≥5 updates/sec per NFR4)
   - Streams:
     - Raw frame metadata
     - Cell snapshots (per-band counts, overhang cells, full cell data)
     - Active tracks (Track ID, position, class, age)

**Run Command:**
```bash
PYTHONPATH=. uvicorn src.api.main:app --reload
```

**Status:** Ready to extend with additional endpoints if needed.

---

## 3. Existing Frontend/Dashboard Entry Point

**Location:** [frontend/](frontend/)

**Current Status:** ✅ **FRAMEWORK EXISTS, NEEDS EXPANSION**

**Files:**
- [frontend/src/Dashboard.jsx](frontend/src/Dashboard.jsx) — React component with Vite + TailwindCSS
- [frontend/src/main.jsx](frontend/src/main.jsx) — Entry point
- [frontend/src/index.css](frontend/src/index.css) — TailwindCSS + custom styles
- [frontend/vite.config.js](frontend/vite.config.js) — Vite configuration
- [frontend/package.json](frontend/package.json) — Dependencies: React, React-DOM, Lucide icons

**Current Implementation:** Skeleton dashboard with:
- Five-view tabs: Raw, Semantic, 2.5D, Adaptive Grid, Compare
- WebSocket connection to `/ws/frames`
- Color scheme for semantic classes and bands
- Toggle controls (e.g., playing/paused animation)
- Cell selection / inspection capability

**Run Command:**
```bash
cd frontend && npm install && npm run dev
```

**Default Dev URL:** `http://localhost:5173`

**Status:** Framework is robust; needs visualization component implementation for each tab.

---

## 4. Existing Data Adapters

**Location:** [src/data/](src/data/)

**Implementations:**

### 4.1 SyntheticAdapter ✅ (Preferred for Demo)
- **File:** [src/data/synthetic_adapter.py](src/data/synthetic_adapter.py)
- **Usage:** Generates procedurally (no download, no license, runs anywhere)
- **Scene:** 400 points/frame, seeded terrain scatter + fixed static obstacles + 2 moving objects
- **Output:** RawFrame with SemanticKITTI raw label IDs (maps through class_mapping.py)
- **Status:** Works perfectly, tested, production-ready for demo

### 4.2 NuScenesAdapter
- **File:** [src/data/nuscenes_adapter.py](src/data/nuscenes_adapter.py)
- **Status:** Requires nuScenes-mini download (~4GB)
- **Limitation:** Currently needs manual path configuration (NUSCENES_DATAROOT in config.py)
- **Can be primary real dataset but not for live demo unless pre-downloaded**

### 4.3 SemanticKittiAdapter
- **File:** [src/data/semantickitti_adapter.py](src/data/semantickitti_adapter.py)
- **Status:** Alternative, not primary (see ARCHITECTURE.md S5 for rationale)

**Current Config:**
```python
DEFAULT_DATASET_ADAPTER = "nuscenes"  # But "synthetic" is what works live
```

---

## 5. Existing Mapping Implementation

**File:** [src/mapping/grid.py](src/mapping/grid.py)

**Status:** ✅ **FULLY IMPLEMENTED AND TESTED**

**Class:** `VariableResolutionGrid`

**Key Features:**
- **Cell Key:** `(band_name, angle_bin, range_bin)` — includes band name to prevent collisions
- **Height Layers:** Multiple layers per cell (up to `max_height_layers` per band)
- **Merge Logic:** Points within `HEIGHT_MERGE_TOLERANCE_M` (0.15m) merge with existing layer; beyond cap, fold into nearest layer by height (no points are dropped)
- **Overhang Detection:** Counts cells with >1 height layer
- **Reusable:** Same class serves both adaptive grid (RESOLUTION_BANDS) and uniform baseline (UNIFORM_BASELINE_BANDS)

**Public Methods:**
- `ingest_point(angle_deg, range_m, height_m, semantic_class, confidence)` — Add a classified point
- `cell_count()` — Total cells
- `cells_by_band()` — Cells per band
- `overhang_cells()` — Multi-height cells
- `snapshot()` — Full cell data (used by WebSocket)
- `clear()` — Reset for new frame

**Resolution Policy:**
- **File:** [src/mapping/resolution_policy.py](src/mapping/resolution_policy.py)
- **Function:** `resolve_band(range_m, bands)` — Maps planar range to band
- **Input:** Planar range r = sqrt(x² + y²) (ground footprint, not full 3D distance)

---

## 6. Existing Tracking Implementation

**File:** [src/tracking/tracker.py](src/tracking/tracker.py)

**Status:** ✅ **COMPLETE, MINIMAL BUT SUFFICIENT**

**Class:** `Tracker`

**Algorithm:** Greedy nearest-neighbor association (deliberately simple, proves cross-frame identity works)

**Data Structures:**
- `Detection` — `(x_m, y_m, semantic_class)` input
- `Track` — `(track_id, x_m, y_m, semantic_class, misses, age)` output

**Behavior:**
- Matches detections to existing tracks within `TRACKER_MATCH_RADIUS_M` (1.5m)
- Increments track age on match, misses on no match
- Drops tracks after `TRACKER_MAX_MISSES` (5) consecutive misses
- Creates new track for unmatched detections

**No direct grid access:** Tracker only sees classifications marked `"dynamic_object"`, never cell data.

---

## 7. Existing Benchmark Implementation

**File:** [src/evaluation/benchmark.py](src/evaluation/benchmark.py)

**Status:** ✅ **COMPLETE, NO FABRICATED NUMBERS**

**Two Types of Output:**

### 7.1 Measured Benchmark (`run_measured_benchmark()`)
- Builds **actual** uniform grid from same input
- Builds **actual** adaptive grid from same input
- Times both with `time.perf_counter()`
- Reports:
  - Cell count (uniform vs. adaptive)
  - Cells by band (adaptive only)
  - Overhang cells (multi-height)
  - Build latency (milliseconds)
  - Estimated memory (cell_count × BYTES_PER_CELL_RECORD)
  - Compression ratio
  - Memory saved

### 7.2 Geometry-Derived Estimate (`geometry_derived_estimate()`)
- Pure math from band configuration
- Explicitly marked as `"measured": False`
- Machine-independent sanity check

**Important:** Both use same config.RESOLUTION_BANDS, never drift out of sync.

---

## 8. What Can Be Reused Directly

✅ **Backend API** — All five endpoints work; WebSocket frame feed is production-ready
✅ **Grid Engine** — Adaptive mapping is complete, tested, robust
✅ **Tracker** — Cross-frame identity tracking works correctly
✅ **Benchmark Engine** — No fabricated numbers, measures everything
✅ **Synthetic Adapter** — Reliable demo data source (no download required)
✅ **Frontend Framework** — React + Vite + TailwindCSS + Lucide icons (no build issues expected)
✅ **Configuration System** — Single source of truth for bands, tolerances, etc.

---

## 9. What Needs to Be Added

### 9.1 Frontend Visualization Components

Currently stubbed tabs need implementations:

1. **Raw LiDAR View**
   - 2D top-down visualization of point cloud
   - Color by distance band (optional)
   - Show point count, sensing range
   - Show frame number/timestamp

2. **Semantic Perception View**
   - Same spatial layout as Raw
   - Color by semantic class (drivable/non_drivable/static_obstacle/dynamic_object/unknown)
   - Show class distribution (bar chart or pie)
   - Show dynamic object count

3. **Adaptive 2.5D Map View** (CENTERPIECE)
   - Visualize cells per band with progressive coarsening
   - Color cells by band (warm→cool per existing COLORS.bandRamp)
   - Show resolution band indicator (5cm / 10cm / 25cm / 50cm)
   - Cell inspector on click: show band, distance, layers, semantic info
   - Highlight multi-height/overhang cells
   - Show "Multi-height Cells: XX" metric

4. **Dynamic Object Tracking View**
   - Overlay tracks on map
   - Show Track ID, class, motion trail (last 3-5 positions)
   - Show "Active Tracks: XX"

5. **Uniform vs. Adaptive Benchmark View**
   - Side-by-side comparison
   - Show measured numbers from actual backend (not estimates):
     - Cell count
     - Memory (estimated)
     - Build latency
   - Show compression ratio
   - Clearly label "Measured" vs. "Estimated"

### 9.2 Backend Enhancements (Optional)

- Endpoint to load specific nuScenes frame if user wants real data
- Endpoint to change dataset adapter at runtime (currently only synthetic)
- Endpoint to reset/replay frame stream

**Recommendation:** Keep backend as-is for now; improvements are nice-to-have.

### 9.3 Animation/State Management

- Add Play/Pause controls (skeleton exists)
- Frame navigation (Previous/Next)
- Keep all views in sync (one WebSocket connection, one state)
- Smooth transitions between views

---

## 10. Current Limitations That Must Be Preserved Honestly

1. **Segmentation Model:** Currently using `GroundTruthPassthrough` (passes through raw labels from synthetic adapter) — **NOT a trained neural network**. Dashboard must label this clearly: "Current Demo Path — Ground Truth Labels"

2. **Semantic Labels:** Synthetic adapter generates only: drivable, non_drivable, static_obstacle, dynamic_object, unknown. **No trained model is currently running.**

3. **Point Cloud Density:** Synthetic adapter uses 400 points/frame for interactive rate. Real sensor data would be denser; benchmark uses 51,200 points for realistic measurement.

4. **No Trained Model:** TrainedModel class exists but is not implemented (raises NotImplementedError). Do NOT claim model inference is working.

5. **Flat Ground Assumption:** HeuristicPlaceholder assumes flat ground plane. Documented in code; do not present as general solution.

6. **Dataset Limitations:** nuScenes-mini lacks moving vs. non-moving distinction (unlike SemanticKITTI); dataset adapter choice has trade-offs.

---

## Summary

| Component | Status | File(s) | Production Ready? |
|-----------|--------|---------|------------------|
| Backend API | ✅ Complete | src/api/main.py | Yes |
| Grid Engine | ✅ Complete | src/mapping/grid.py | Yes |
| Tracker | ✅ Complete | src/tracking/tracker.py | Yes |
| Benchmark | ✅ Complete | src/evaluation/benchmark.py | Yes |
| Synthetic Data | ✅ Complete | src/data/synthetic_adapter.py | Yes |
| Frontend Framework | ✅ Ready | frontend/ | Yes (needs visualization) |
| Frontend Visualizations | ❌ Stub | frontend/src/Dashboard.jsx | No (main work) |
| Segmentation | ✅ Passthrough | src/perception/model.py | Yes (but not ML) |

---

## How to Proceed

**Phase 1: Verify Existing System**
1. Install dependencies
2. Start backend (uvicorn)
3. Start frontend (npm run dev)
4. Confirm WebSocket connection and frame stream work

**Phase 2: Implement Visualizations**
1. Implement Raw LiDAR visualization
2. Implement Semantic Perception visualization
3. Implement Adaptive 2.5D Map (centerpiece)
4. Implement Tracking overlay
5. Implement Benchmark comparison

**Phase 3: Polish & Integration**
1. State management synchronization
2. Play/Pause and frame navigation
3. Cell inspector
4. Color scheme refinement
5. Typography and layout

**Phase 4: Verify Results**
1. Run acceptance criteria checks
2. Test data flow end-to-end
3. Verify no invented numbers
4. Create demonstration script

---

**Estimated implementation effort:** 4-6 hours for professional, production-quality visualizations.

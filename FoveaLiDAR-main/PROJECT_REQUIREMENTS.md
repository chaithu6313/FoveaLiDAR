# PROJECT_REQUIREMENTS.md
### FoveaLidar — Adaptive Variable-Resolution 2.5D LiDAR Mapping
SIH Problem Statement 26053 · DRDO, Department of Defence Production / IDEX · Theme: Smart Vehicles

Status: source of truth for scope. Changes to this file should be deliberate — everything else in the repo is built to satisfy it.

---

## 1. Official problem statement (condensed)

Autonomous vehicles need environment perception that is both precise and real-time. Raw 3D LiDAR point clouds are precise but too heavy to process and store at scale; standard 2D occupancy grids are cheap but discard the height information needed to catch curbs, potholes, and overhangs. The brief asks for a **foveated** middle ground: a deep-learning model that semantically labels the point cloud (terrain / static obstacles / dynamic objects), projected into a **variable-resolution 2.5D grid** whose cell size grows with distance from the sensor — fine near the vehicle, coarse far away — with a real-time dashboard and measured evidence of the memory/latency win.

## 2. Project interpretation

Two techniques already exist independently and well-studied: point-cloud semantic segmentation, and 2.5D elevation mapping. What doesn't exist as a standard, published system is the **combination**: segmentation feeding a *distance-graded*, *multi-height* 2.5D grid, benchmarked against a uniform baseline, in real time. That combination — not any one piece of it — is this project's actual scope. See §23 for the explicit novelty boundary.

## 3. Problem scope

**In scope:** point-cloud ingestion from a recorded dataset, semantic segmentation into terrain / static / dynamic classes, a distance-graded 2.5D grid engine with multi-height cells, lightweight cross-frame tracking of dynamic objects, a real-time web dashboard, and a benchmark engine comparing uniform vs. adaptive resolution on measured (not invented) numbers.

**Out of scope:** see §27.

## 4. Objectives

1. Prove, with measured numbers, that distance-graded resolution reduces cell count and memory versus a uniform fine grid, at an acceptable accuracy cost.
2. Preserve height information a plain 2D grid would destroy — specifically overhangs and multi-surface cells — without paying full-3D memory cost everywhere.
3. Classify terrain, static obstacles, and dynamic objects from LiDAR alone, using an interface that isolates the model from the mapping engine so either can change independently.
4. Present all of the above so a non-specialist jury member understands the concept in under two minutes, while a technical reviewer can inspect any individual cell.

## 5. Core requirements

| # | Requirement | Priority |
|---|---|---|
| R1 | Ingest a recorded LiDAR sequence through a dataset-adapter interface | MUST HAVE |
| R2 | Classify each point into terrain (drivable/non-drivable), static obstacle, or dynamic object | MUST HAVE |
| R3 | Project classified points into a non-uniform 2.5D grid, cell size increasing with range | MUST HAVE |
| R4 | Support multiple height layers per cell where distinct surfaces exist at different elevations | MUST HAVE |
| R5 | Resolution bands (radius → cell size → max height layers) fully configurable, not hard-coded | MUST HAVE |
| R6 | Real-time-viewable dashboard showing raw points, semantic labels, and the adaptive grid | MUST HAVE |
| R7 | Benchmark engine comparing uniform-resolution vs. adaptive-resolution on the same input | MUST HAVE |
| R8 | Cross-frame identity for dynamic objects (tracking) | SHOULD HAVE |
| R9 | Per-cell inspection (resolution, distance, elevation, class, confidence, point count) | SHOULD HAVE |
| R10 | Persist run/session/benchmark metadata for later comparison across experiments | SHOULD HAVE |
| R11 | Semantic-, uncertainty-, or motion-aware *additional* refinement on top of the distance policy | ADVANCED |
| R12 | Live sensor input in place of a recorded dataset | FUTURE |

## 6. Functional requirements

- FR1 (MUST): system loads a sequence from a configured dataset adapter without code changes to the mapping engine.
- FR2 (MUST): system exposes a class-mapping configuration translating raw dataset labels to the project's semantic taxonomy (§9).
- FR3 (MUST): system computes, for every classified point, its planar range `r = sqrt(x² + y²)` and resolves the point to a resolution band via that range alone (§11 — distance-only for the MVP).
- FR4 (MUST): system merges points landing in the same grid cell within a configurable height tolerance into one layer; points further apart in height start a new layer up to the band's layer cap; beyond the cap, points fold into their nearest existing layer rather than being dropped.
- FR5 (MUST): system serves the current grid state and active tracks over a live channel (WebSocket) to the frontend.
- FR6 (MUST): system computes benchmark numbers by actually running both a uniform-grid pass and an adaptive-grid pass over the same frame and measuring wall-clock time and cell count — not by formula alone where a measured number is feasible.
- FR7 (SHOULD): system persists each processing run's configuration and resulting metrics to SQLite for later comparison.
- FR8 (SHOULD): the frontend lets a user click any rendered cell and see its full record.

## 7. Non-functional requirements

- NFR1: the full prototype (backend + frontend) runs on a single laptop with no GPU required for the mapping/tracking/API path. GPU is only required for model *training*, not for running the demo with a trained model exported to CPU-friendly inference, or with the heuristic placeholder.
- NFR2: no dataset or model weights are committed to git; both are referenced by path/config and `.gitignore`'d.
- NFR3: every configuration value that affects a benchmark result (resolution bands, height tolerance, class mapping) is externalised, not hard-coded, so a benchmark run is reproducible from its saved config.
- NFR4: the dashboard updates at a rate visible as "live" (target ≥5 updates/sec) on the synthetic/demo path without requiring the trained model to be loaded.
- NFR5: no fabricated accuracy, FPS, or memory figures anywhere in code, UI copy, or documentation — every displayed number is either directly measured or clearly labelled as a geometry-derived estimate.

## 8. Terrain requirements

- Classify each point as `drivable`, `non_drivable`, or `unknown`.
- Curbs and potholes are **not** a labelled class in either nuScenes-lidarseg or SemanticKITTI (§ dataset rationale) — if demonstrated at all, they must be shown as a *derived geometric signal* (local elevation discontinuity within a cell or between adjacent cells), explicitly labelled in the UI as "derived, not a trained class," never presented as a learned detection.
- Terrain confidence is carried per point and aggregated per cell (mean or max, configurable).

## 9. Semantic segmentation requirements

- Input: `[x, y, z, intensity]` per point (§ dataset format).
- Output: per-point class + confidence.
- The model sits behind a fixed `SegmentationModel` interface (`classify(points) -> ClassifiedPoint[]`); the mapping engine never imports a model class directly.
- A non-learned heuristic placeholder must satisfy the same interface so the rest of the pipeline is runnable and testable before any model is trained.
- Project semantic taxonomy: `drivable`, `non_drivable`, `static_obstacle`, `dynamic_object`, `unknown`. Dataset-specific classes map onto this taxonomy through a stored, documented mapping table (see `src/data/class_mapping.py` and ARCHITECTURE.md §11).

## 10. Object detection requirements

- Static obstacles (building, wall, fence, pole, traffic sign, etc.) are a segmentation output, not a separate detector — no bounding-box object detector is in scope for the MVP.
- Dynamic objects (car, truck, person, cyclist, ...) are segmentation output *plus* the tracker (§8/R8), which assigns and maintains an ID.
- Classes not present in the selected dataset must not be claimed as supported.

## 11. Variable-resolution requirements

- Resolution is a function of planar range only for the MVP: `band = policy(r)`. Semantic-, motion-, or uncertainty-weighted refinement is an ADVANCED extension (R11) and must be implemented as an optional pass *after* the distance policy already works, never as a replacement for it.
- Bands are an ordered list of `(outer_radius_m, cell_size_m, max_height_layers)`, loaded from configuration. The reference default (from the brief) is:

| Band | Range | Cell size | Max height layers |
|---|---|---|---|
| 0 | 0–10 m | 5 cm | 6 |
| 1 | 10–30 m | 10 cm | 4 |
| 2 | 30–60 m | 25 cm | 2 |
| 3 | 60–100 m | 50 cm | 1 |

- Grid indexing must not use a dense array sized for the finest resolution over the full range (that would defeat the entire premise). See ARCHITECTURE.md §10 for the chosen indexing scheme and why.

## 12. 2.5D requirements

- A cell stores: band/resolution, angular+range bin (its address), one or more height layers, and per-layer semantic class, confidence, and point count.
- The representation is explicitly **not** a 2D occupancy grid with a colour tacked on — it must retain real elevation and support >1 layer per cell. Documentation and UI copy must describe it accurately as 2.5D, never as "2D."

## 13. Visualization requirements

- Four switchable views, minimum: **Raw LiDAR**, **Semantic**, **2.5D**, **Adaptive Grid** (resolution bands visible as distinct regions).
- A **Compare** view: uniform-resolution vs. adaptive-resolution, same input, side by side, with the measured metrics table from FR6.
- Clicking a cell opens an inspector panel (§ FR8 / R9).
- The UI must work for both audiences at once: a jury-friendly headline number (compression ratio, memory saved) always visible, and a technical layer (per-cell records, per-band counts) available on demand — not hidden behind a separate build.

## 14. Benchmark requirements

- Metrics: cell count, memory estimate, wall-clock grid-build latency, derived FPS, per-class accuracy where ground truth is available.
- Every benchmark run compares against a uniform-grid baseline built from the *same* input frame, not a separately-run or historical number.
- Per-distance-band accuracy is reported separately, never blended into one number — the whole point of the project is that behaviour changes with range, so hiding that in an average would misrepresent the system's own core claim.
- No benchmark number is hard-coded, guessed, or carried over from a different machine/run than the one being reported.

## 15. Dataset requirements

- Primary dataset: **nuScenes-mini** (rationale and switch history: ARCHITECTURE.md §5). SemanticKITTI is kept as an alternative behind the same interface, not deprecated. Waymo remains FUTURE.
- A `DatasetAdapter` interface must exist such that any one real dataset is an implementation, not a hard-wired assumption — a synthetic adapter (no download required) is always available too, used for development, the live demo, and this repository's automated tests.
- No dataset files are committed to git.

## 16. Software-only prototype requirements

- Runs entirely from a recorded dataset or the synthetic adapter; no physical LiDAR is required.
- Architecture must not preclude a live-sensor adapter later (§26 future work) — the boundary is the same `DatasetAdapter`/`SegmentationModel` interfaces used throughout.

## 17. Target users

Primary: autonomous-vehicle / robotics / LiDAR-perception researchers and engineers evaluating this as a technique. Secondary: the SIH/DRDO jury, who need the concept legible in minutes without reading code.

## 18. User journeys

1. **Jury demo journey:** open dashboard → select a demo scenario/sequence → watch raw → semantic → adaptive grid populate live → open Compare view → see measured memory/latency reduction → click a distant cell to see its actual (coarse) resolution and content.
2. **Researcher journey:** change the resolution-band config → re-run the benchmark → compare the new run's metrics against a previous run pulled from SQLite.
3. **Developer journey:** swap `HeuristicPlaceholder` for a trained model implementing the same interface → nothing else in the pipeline changes.

## 19. Jury demo

Must run **without hardware**, from a pre-selected sequence or the synthetic adapter, entirely offline. See PHASES.md Phase 17 for the rehearsed flow and ARCHITECTURE.md §4 for the pipeline it walks through.

## 20. MVP

Distance-only resolution policy (§11), heuristic-or-trained segmentation behind the fixed interface, multi-height cells, live dashboard with the four views + Compare, measured benchmark engine, SQLite run history. Explicitly **excludes** R11 (semantic/uncertainty/motion-aware refinement) and R12 (live sensor).

## 21. Advanced features

R11 only, and only after MVP acceptance criteria (§26) pass. Implemented as an optional refinement pass that can be toggled off to fall back to the pure distance policy, so the MVP claim is never dependent on the advanced path working.

## 22. Future features

Live LiDAR sensor adapter; nuScenes/Waymo validation adapters; learned (rather than geometric) curb/pothole detection if a suitable labelled dataset is identified; multi-vehicle / multi-sensor fusion.

## 23. Innovation / novelty — explicit boundary

**Known techniques, not claimed as novel here:** PointNet++/sparse-convolution segmentation, elevation mapping, occupancy grids, Kalman/nearest-neighbour tracking.

**This project's actual contribution:** engineering and measuring the *combination* — a distance-graded, multi-height 2.5D representation fed by point-level semantics, with a real uniform-vs-adaptive benchmark on the same data. No "first ever" claim is made anywhere in this repo or its documentation; ARCHITECTURE.md §2 and any paper drawn from this work must cite the prior art it builds on (nuScenes and/or SemanticKITTI depending which path was used, PointNet++/sparse-conv literature, elevation-mapping literature).

**Optional advanced contribution:** if R11 is reached, extending the resolution policy from distance-only to distance+semantics/uncertainty/motion is a second, smaller claim, kept clearly separate from the first.

## 24. Constraints

Single-laptop-runnable prototype; GPU only needed for training (Kaggle), not for the demo; Python back end (team's existing stack); no dataset/weights in git; SQLite, not a hosted database.

## 25. Risks

| Risk | Mitigation |
|---|---|
| Real trained model too slow for live demo on the jury's hardware | Ship both a live-inference mode and a clearly-labelled precomputed-inference mode (§ Document 2's Mode A/B) |
| Dataset class taxonomy doesn't map cleanly onto terrain/static/dynamic | Explicit, documented mapping table reviewed before training, not assumed — both `src/data/nuscenes_class_mapping.py` and `src/data/class_mapping.py` (SemanticKITTI) exist and are self-checked at import |
| nuScenes-mini's non-commercial licence conflicts with a later commercial claim | Flag this explicitly before any commercial use is considered (ARCHITECTURE.md §5); switch back to the SemanticKITTI path first if that becomes a real constraint |
| Benchmark numbers look weak on a slow dev machine | Report relative (compression ratio) alongside absolute numbers; run on the actual demo machine before the jury sees it |
| Multi-height merging logic has a boundary bug that silently drops a layer | Unit tests specifically target band-boundary and layer-cap-exceeded cases (RULES.md) |

## 26. Acceptance criteria (MVP)

- A full frame from the synthetic adapter (or a real nuScenes/SemanticKITTI sequence, if downloaded) flows end to end: adapter → segmentation interface → grid → tracker → API → dashboard, with no manual steps.
- The Compare view shows a cell-count and memory number for both uniform and adaptive resolution, computed from the same frame, not pre-baked.
- At least one cell in the demo scene has >1 height layer, and the UI visibly shows both layers when inspected.
- Changing a resolution band in config and restarting changes the grid's behaviour without touching engine code.
- Zero hard-coded benchmark numbers anywhere in frontend or backend source.

## 27. Out-of-scope items

Route/path planning, vehicle control, traffic-signal or fleet management, V2X, full digital twin, cloud-scale deployment, mobile app, production sensor drivers, physical LiDAR integration during the MVP. May appear only as "Future work" mentions.

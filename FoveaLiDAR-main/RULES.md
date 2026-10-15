# RULES.md
### FoveaLidar — engineering constitution

Every rule below exists because of a specific failure mode this project is prone to. Where a rule was learned the hard way during this project's own build, that's noted — it's the strongest justification a rule can have.

---

## Architecture

**ALWAYS**
- Keep perception, mapping, tracking, and evaluation as separate modules communicating through fixed data shapes (`ClassifiedPoint`, grid snapshot, `Track`). See ARCHITECTURE.md §2.
- Put a real interface (`Protocol`/ABC) between the mapping engine and anything that could plausibly change (model, dataset, tracker algorithm).
- Make resolution bands, class mappings, and tolerances configuration, not constants buried in logic.

**NEVER**
- Let the grid engine import anything from `tracking` or `perception` beyond the fixed data shapes.
- Let the tracker read or write grid cells directly.
- Put ML inference inside the React frontend. Inference is a backend concern; the frontend only ever consumes JSON.

## Python

**ALWAYS**
- Type-hint public function signatures in `src/`.
- Raise on invalid input at a module boundary (e.g. `range_m` beyond `MAX_RANGE`) rather than silently clamping — silent clamping is exactly how the band-collision bug (§ below) would have stayed hidden.
- Keep one source of truth for every constant that affects a benchmark number (`src/config.py`); never redefine `MAX_RANGE` or a band boundary in a second file.

**NEVER**
- Use bare `except:`.
- Use mutable default arguments.
- Import `torch` (or any training-only dependency) inside `src/mapping`, `src/tracking`, or `src/api` — those must run on a machine with no ML framework installed, per NFR1.

## TypeScript / React (frontend)

**ALWAYS**
- Keep one WebSocket connection as the single source of truth; every view reads from the same React state, never opens its own connection.
- Treat every number rendered in the UI as either "measured" or "estimated" and label it as such in a tooltip or subtext — never present one as the other.

**NEVER**
- Use `localStorage`/`sessionStorage` (unsupported in the artifact sandbox this was prototyped in, and unnecessary — session state belongs in React state or the backend).
- Fabricate a placeholder FPS/latency number in the frontend when the backend hasn't sent one yet — show an explicit "—" or "not yet measured," never a made-up figure that happens to look plausible.

## ML

**ALWAYS**
- Isolate the model behind `SegmentationModel.classify()`; the mapping engine must work identically whether it's talking to `HeuristicPlaceholder` or a trained network.
- Record `MODEL_METADATA.json` (dataset version, preprocessing version, config, seed, framework version) with every checkpoint.
- Report accuracy per resolution band, never as one blended number (PROJECT_REQUIREMENTS.md §14) — a single mIoU hides the exact effect this project exists to measure.

**NEVER**
- Claim a validation number as a test-set number. SemanticKITTI's true test labels (sequences 11–21) aren't public, and nuScenes-mini has no official held-out test split at all (it's a prototyping subset); anything reported locally is a validation-split number and must be labelled as such.
- Select a model by accuracy alone — latency and memory are part of the decision (ARCHITECTURE.md §7), because this is a real-time system, not an offline benchmark exercise.
- Train the resolution policy. The distance→band mapping is deterministic and configured, never learned, for the MVP (PROJECT_REQUIREMENTS.md §11) — conflating the two is the single most likely way to accidentally misrepresent what this project's novelty actually is.

## Point clouds & coordinate systems

**ALWAYS**
- Compute planar range as `r = sqrt(x² + y²)` (ground-plane distance), not full 3D range `sqrt(x²+y²+z²)` — the resolution policy is about ground footprint, and using 3D range would make a point's band depend on its height, which is wrong.
- Keep `z` as height relative to the sensor origin (or a documented ground-plane offset) consistently across every module that touches it.
- Validate points for NaN/inf before they reach the grid engine.

**NEVER**
- Silently drop a point instead of accounting for it somewhere (a rejected point past `MAX_RANGE` is a visible, countable event, not a silent no-op).
- Assume the sensor is perfectly level; document the flat-ground assumption everywhere it's made (currently: `HeuristicPlaceholder`, band-boundary math) so it's an easy first thing to revisit if real data disagrees.

## 2.5D mapping & adaptive grids

**ALWAYS**
- Include the band identity in a cell's key, not just its numeric bin indices (ARCHITECTURE.md §10 — this is the exact bug this project already hit once).
- Give every band an explicit, finite `max_height_layers`, and define what happens when it's exceeded (fold into nearest layer — never silently drop).
- Benchmark uniform vs. adaptive on the *same* input frame in the *same* run.

**NEVER**
- Describe the output as a "2D grid" anywhere in code, comments, UI copy, or documentation — it is 2.5D with semantic layers, and the distinction is the entire point of the project (PROJECT_REQUIREMENTS.md §12).
- Use a dense array sized to the finest resolution across the full range, even "just for testing" — it will quietly become the thing that ships.
- Let a resolution-band change in config silently fail to propagate (e.g. because a value was cached or hard-coded elsewhere) — if bands change, cell counts must visibly change on the next run.

## Performance & memory

**ALWAYS**
- Measure grid-build latency by timing the actual code path, not by estimating from cell count.
- Report memory as "estimated from record size × cell count" explicitly when it isn't measured with a real memory profiler — don't blur estimate and measurement together in one number.

**NEVER**
- Report a benchmark number from a different machine than the one generating the rest of the numbers in the same comparison.
- Optimize the heuristic placeholder for speed at the expense of it being an honest stand-in — it exists to prove the pipeline shape, not to win a benchmark it was never meant to compete in.

## Datasets

**ALWAYS**
- Route every dataset access through `DatasetAdapter`.
- Document the exact class → project-taxonomy mapping for whichever dataset is active in one place (`src/data/nuscenes_class_mapping.py` or `src/data/class_mapping.py`) and treat any change to it as a versioned decision.
- Split train/validation at the sequence level, never the frame level, to avoid temporal leakage between adjacent frames of the same drive.

**NEVER**
- Commit a dataset file, checkpoint, or anything derived from either to git.
- Claim SemanticKITTI or nuScenes-lidarseg directly provides curb/pothole labels — neither does; any such signal is derived and must be labelled as such (PROJECT_REQUIREMENTS.md §8).
- Assume a dataset class exists in scope just because it's common in the literature — check the actual selected dataset's label set first.

## Configuration

**ALWAYS**
- Keep resolution bands as an ordered list of `{outer_radius_m, cell_size_m, max_height_layers}`, not named fields (`near`/`mid`/`far`) — a list is genuinely extensible; named fields silently cap the design at however many names were chosen.
- Version the preprocessing/model config alongside the data it produced.

**NEVER**
- Hard-code `10.0`, `0.05`, `100.0` etc. inside `src/mapping` or `src/perception` — every one of those belongs in `src/config.py` and nowhere else.

## APIs

**ALWAYS**
- Keep `GET /api/stats` (geometry-derived) and `GET /api/benchmark/run` (measured) as distinct endpoints returning distinctly-labelled payloads — never merge them into one response that blurs which numbers are which.
- Version the WebSocket message schema (a `schema_version` field) so the frontend can detect a mismatch instead of silently misrendering.

**NEVER**
- Return a mock/placeholder value from a REST endpoint without a field marking it as such.

## Database

**ALWAYS**
- Store raw points in files, never in SQLite rows (ARCHITECTURE.md §21).
- Persist the full config snapshot with every `processing_runs` row, so a past benchmark result is reproducible without guessing what config produced it.

**NEVER**
- Store model weights in the database.
- Let a schema migration silently drop a column that a past run's `config_json` still references.

## Testing

**ALWAYS**
- Write the resolution-boundary test first for any change to `src/mapping` (a point exactly at a band boundary, one epsilon on each side) — this is where the project's one real bug actually lived.
- Test the layer-cap-exceeded path explicitly (more distinct heights arrive at a cell than its band allows).
- Test the synthetic adapter as part of CI. The nuScenes adapter's tests run against the real installed devkit and a schema-accurate fixture, so they belong in CI too; the SemanticKITTI adapter's fixture test is documentation-only and should be re-verified locally once real data exists, not trusted from CI alone.

**NEVER**
- Merge a change to `src/mapping/grid.py` without a passing test for both the boundary case and the layer-cap case.

## Logging

**ALWAYS** log frame index, cell count, and latency once per frame at minimum, structured (JSON-lines).

**NEVER** log full point clouds at default verbosity.

## Errors

**ALWAYS** raise a specific, documented exception for an out-of-range point rather than returning `None` or a sentinel that could be mistaken for a valid value.

**NEVER** catch an exception only to log and continue in a code path that affects a benchmark number — a swallowed error there becomes a silently wrong measurement.

## Security

**ALWAYS** keep the WebSocket/REST API unauthenticated-but-local-only for the demo (no internet-facing deployment is in scope, PROJECT_REQUIREMENTS.md §27) and say so explicitly in README.md rather than leaving it implicit.

**NEVER** commit a Kaggle API token or any credential to the repository.

## Git

**ALWAYS** gitignore `data/`, `artifacts/model/`, and `*.db`.

**NEVER** force-push over shared history once a teammate has pulled it.

## Dependencies

**ALWAYS** pin versions in `requirements.txt` for anything that touches a benchmark number (numerics-affecting libraries), so a "why did the numbers change" question has one obvious first answer.

**NEVER** add a dependency to `src/mapping` or `src/tracking` beyond the standard library without a specific reason recorded — these are the modules that must stay runnable anywhere.

## Docker

**ALWAYS**, if a container is added later, keep dataset/model volumes external, never baked into the image.

**NEVER** treat Docker as required for the MVP — NFR1 requires laptop-runnable, and a container adds a failure mode a jury demo doesn't need.

## Documentation

**ALWAYS** update ARCHITECTURE.md in the same change that alters a module boundary — a diagram that no longer matches the code is worse than no diagram.

**NEVER** describe a number in prose more precisely than the code that produced it actually supports.

## Visualization

**ALWAYS** show which resolution band a cell belongs to as a visibly distinct property (colour/region), not just in a tooltip — the entire jury-facing point of this project is that the grid is visibly non-uniform.

**NEVER** render a synthetic/demo data point in a way that's visually indistinguishable from real inference output without a label saying which it is.

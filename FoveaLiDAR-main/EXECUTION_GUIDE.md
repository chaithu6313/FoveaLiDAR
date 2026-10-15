# EXECUTION_GUIDE.md
### Zero to running demo, in order — every file path below exists in this repo right now

Nothing in this guide is aspirational except the parts explicitly marked "on Kaggle" or "on your machine" — those need resources this build environment doesn't have (a GPU, and network access to the actual dataset hosts). Everything else has been run and tested as part of building this repo.

---

## Step 1 — Get the dataset

**Primary path: nuScenes-mini.** Official, purpose-built for exactly this situation — a small, complete slice of the full dataset, not a partial download of something bigger.

1. Register a fr
ee account at `nuscenes.org` (Terms of Use acceptance required — this is normal, not a broken link).
2. Download both, verified against the official tutorial notebook directly:
   - `https://www.nuscenes.org/data/v1.0-mini.tgz` (~4GB — maps, samples, sweeps, the `v1.0-mini` metadata tables)
   - `https://www.nuscenes.org/data/nuScenes-lidarseg-mini-v1.0.tar.bz2` (the semantic labels — a **separate** download from the base mini archive, easy to miss)
3. Extract **both** into the same folder — they merge without overwriting each other. Call this folder `DATASET_ROOT`; it should end up containing `maps/`, `samples/`, `sweeps/`, `v1.0-mini/`, and `lidarseg/v1.0-mini/`.
4. Set `DATASET_ROOT` at the top of each local notebook in Step 2.

**Note the licence:** nuScenes-mini is non-commercial-research use only. Fine for SIH and a paper; flag it explicitly before any commercial claim is drawn from results (README.md's findings list has this too).

**Alternative path: SemanticKITTI**, if nuScenes turns out to be the wrong fit later (taxonomy mismatch, point-density needs, etc.):

```bash
pip install remotezip
python scripts/fetch_semantickitti_sequence.py 00 --dest ./semantic_kitti_subset
```

Pulls only sequence 00 (≈8GB, not the official distribution's 80GB) via HTTP range requests — see the script's own docstring for exactly how, and its honest caveat about needing the server to support range requests (untested against the live server from this sandbox). Then use `notebooks/local/01_dataset_exploration_semantickitti.ipynb` and `02_class_mapping_semantickitti.ipynb` instead of the primary ones in Step 2 — those two SemanticKITTI notebooks are still fully built and tested, just not primary anymore.

## Step 2 — Run the local notebooks, in order, from `notebooks/local/`

| Order | File | What you're waiting to see before moving on |
|---|---|---|
| 1 | `01_dataset_exploration.ipynb` | `loaded N frames across 10 scenes` prints without error (N should be 404 for the full mini split) |
| 2 | `02_class_mapping.ipynb` | The coverage cell prints all 32 categories grouped correctly; the note about `static.manmade` being nuScenes' closest equivalent to a "wall" class makes sense against what you see |
| 3 | `03_lidar_visualization.ipynb` | Four PNGs land next to the notebook — these are your pitch-deck screenshots |
| 4 | `04_preprocessing.ipynb` | `./preprocessed/scene-XXXX/*.npz` folders appear (one per scene), plus `preprocessed/preprocessing_config.json` |
| 5 | `05_dataset_statistics.ipynb` | The per-band class-mix printout — **read this before Kaggle**, it's the real evidence for whether `src/config.py`'s band boundaries need adjusting for this sensor's actual range distribution (nuScenes' 32-beam sensor sees less far-range detail than SemanticKITTI's 64-beam one — this cell is what tells you if that matters) |
| 6 | `06_create_training_dataset.ipynb` | Ends with a printed path to `fovealidar_nuscenes_v1.zip` — **this is the file you upload to Kaggle**. Note its documented (not "official" — mini has none) scene-level val split |
| 7 | `07_validate_export.ipynb` | Final cell prints exactly `PASS - safe to upload to Kaggle`. If it prints `FAIL`, stop — fix the issue before Step 3, don't upload anyway |

**This *is* "what to zip as dataset."** You don't manually assemble a zip — notebook 06 produces it, and notebook 07 is the gate that decides whether it's good enough to upload.

## Step 3 — Kaggle: upload and run, in order

1. Go to Kaggle → Datasets → New Dataset → upload `fovealidar_nuscenes_v1.zip` from Step 2. Name it `fovealidar-nuscenes-processed` (matches the path every Kaggle notebook expects: `/kaggle/input/fovealidar-nuscenes-processed`). Re-uploads go in as a **new version** of the same dataset, not a new dataset.
2. Create a new Kaggle Notebook, attach that dataset, turn **GPU on** (Settings → Accelerator).
3. Copy in, and run, each notebook from `notebooks/kaggle/` **in order**:

| Order | File | Confirms |
|---|---|---|
| 1 | `01_verify_dataset.ipynb` | The upload matches its checksums — the same gate as Step 2.7, run again because uploads are a second place things go wrong |
| 2 | `02_baseline.ipynb` | The shape smoke-test passes and the loss visibly drops over 20 steps — this is your floor to beat, not a result to report anywhere |
| 3 | `03_train_model.ipynb` | Set `MODEL_CHOICE = "baseline"` first, confirm the full loop runs and checkpoints to `/kaggle/working/checkpoints/best_model.pth`. **Only then** try `MODEL_CHOICE = "pointnet_pp"` — its shape-check cell tells you immediately if something's wrong before you burn GPU hours on a broken architecture |
| 4 | `04_validate_model.ipynb` | Per-band mIoU printout on whatever scenes Step 2's notebook 06 held out — mini has no official test split, so don't call this a "test set" number anywhere |
| 5 | `05_inference.ipynb` | `/kaggle/working/predictions/*.npz` — pull these down to sanity-check predictions visually before trusting the mIoU number alone |
| 6 | `06_benchmark.ipynb` | A latency/FPS table — **label this explicitly as "Kaggle GPU" everywhere you write it down**, it is not the number your live demo will show |
| 7 | `07_export_model.ipynb` | `/kaggle/working/export/` containing `best_model.pth`, `classes.json`, `MODEL_METADATA.json` |

## Step 4 — Get the model out of Kaggle

Download the entire `/kaggle/working/export/` folder (Kaggle's notebook output panel → download). You should have exactly three files: `best_model.pth`, `classes.json`, `MODEL_METADATA.json`.

## Step 5 — Put it in this project

1. Copy the three files into a new `artifacts/model/` folder at the repo root (already `.gitignore`'d — it will never accidentally get committed).
2. Open `src/perception/model.py` and finish the `TrainedModel` class:
   - Move `BaselinePointClassifier` and `PointNetPPSegmenter` out of `notebooks/kaggle/03_train_model.ipynb` and into a new `src/perception/architectures.py` — this is the one step left as `NotImplementedError` rather than guessed, specifically so the training notebook and the live loader can never define two different copies of the same architecture that quietly drift apart.
   - `TrainedModel.__init__` then becomes: load the checkpoint, instantiate the matching class from `architectures.py`, call `.load_state_dict(...)`, set `.eval()`.
   - `TrainedModel.classify()` becomes: batch the points into a tensor, run the model, argmax + softmax for class + confidence, map indices back to `checkpoint["classes"]` strings, return `ClassifiedPoint` objects.
3. In `src/api/main.py`, swap `GroundTruthPassthrough()` for `TrainedModel("artifacts/model/best_model.pth")` in both the WebSocket handler and the benchmark endpoint. If you're on the nuScenes path, also swap `SyntheticAdapter` for `NuScenesAdapter(dataroot=..., version="v1.0-mini")` there if you want the live demo running on real (not synthetic) frames.
4. Run the existing test suite (`for f in tests/test_*.py; do PYTHONPATH=. python3 "$f"; done`) — nothing else in the pipeline should need to change, which is the entire point of `SegmentationModel` and `DatasetAdapter` being fixed interfaces (ARCHITECTURE.md §2/§5/§7).

## Step 6 — Deploy (the actual bash)

Two terminals, both from the repo root:

```bash
# terminal 1 - backend
pip install -r requirements.txt
PYTHONPATH=. uvicorn src.api.main:app --reload
```

```bash
# terminal 2 - frontend
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (`http://localhost:5173`). The header should show **Live**, not **Disconnected** — if it says Disconnected, terminal 1 isn't running yet or errored on startup; check its terminal output for a stack trace before touching the frontend.

For the actual jury demo: run both commands ahead of time, confirm **Live**, click **Run benchmark** once on the Compare view so it's not the very first thing that happens live, and keep a recorded backup video ready in case the venue's network misbehaves.

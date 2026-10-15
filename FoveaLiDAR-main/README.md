# FoveaLiDAR

## Adaptive Variable-Resolution LiDAR Perception and Mapping

FoveaLiDAR is a LiDAR perception project built around **nuScenes-mini** data. The project explores efficient point-cloud processing, semantic segmentation, dataset preprocessing, baseline modeling, and a stronger PointNet++-based model for LiDAR scene understanding.

The repository contains the complete notebook workflow from dataset preparation through model training, validation, benchmarking, and model artifact export.

---

## Project Overview

The project follows this pipeline:

```text
nuScenes-mini
      │
      ▼
Dataset Verification
      │
      ▼
LiDAR + Segmentation Data
      │
      ▼
Preprocessing
      │
      ▼
Class Mapping
      │
      ▼
Training Dataset
      │
      ├───────────────┐
      ▼               ▼
Baseline MLP      PointNet++
      │               │
      ▼               ▼
Validation       Validation
      │               │
      └───────┬───────┘
              ▼
       Benchmarking
              │
              ▼
       Model Artifacts
```

The main goal is to establish a reproducible LiDAR perception pipeline that can be extended toward adaptive-resolution mapping and real-time perception.

---

## Repository Structure

```text
FoveaLiDAR/
│
├── README.md
├── requirements.txt
├── .gitignore
│
├── notebooks/
│   ├── local/
│   │   └── 01_dataset_preparation_and_preprocessing.ipynb
│   │
│   └── kaggle/
│       ├── 02_baseline_training_validation_benchmark.ipynb
│       └── 03_pointnetpp_training_validation_export.ipynb
│
├── src/
│   ├── nuscenes_adapter.py
│   ├── nuscenes_class_mapping.py
│   └── ...
│
├── results/
│   ├── validation/
│   ├── benchmarks/
│   └── predictions/
│
├── models/
│   └── README.md
│
└── docs/
    └── ...
```

---

## Notebooks

### 01 — Dataset Preparation and Preprocessing

**File:**

```text
notebooks/local/01_dataset_preparation_and_preprocessing.ipynb
```

This notebook is designed to run locally in Jupyter.

It covers:

* Project and dataset path configuration
* nuScenes-mini dataset verification
* Archive verification
* Dataset extraction
* Metadata inspection
* LiDAR sample inspection
* LiDAR segmentation label inspection
* `nuscenes-devkit` setup
* nuScenes sample loading
* LiDAR and segmentation label inspection
* Class mapping
* Dataset-wide class statistics
* LiDAR preprocessing
* Preprocessed dataset verification
* Training dataset preparation and export

The notebook expects the nuScenes-mini dataset to be available locally.

The dataset root should be configured for the machine on which the notebook is executed rather than relying on a machine-specific absolute path.

---

### 02 — Baseline Training, Validation and Benchmark

**File:**

```text
notebooks/kaggle/02_baseline_training_validation_benchmark.ipynb
```

This notebook is designed for execution on Kaggle with GPU support.

It establishes a baseline LiDAR segmentation model before moving to the stronger architecture.

The baseline uses:

* Per-point MLP
* Global max-pooled context
* Per-point classification head
* Input features:

  * `x`
  * `y`
  * `z`
  * `intensity`

The stored `range` feature is intentionally not used by the baseline model.

The notebook includes:

* Dataset validation
* Training and validation metadata loading
* Training dataset creation
* Baseline model construction
* Training
* Checkpointing
* Validation
* Inference-related evaluation
* GPU benchmark measurements

The benchmark measures inference performance for different point-cloud sizes.

> Benchmark results from Kaggle GPU execution should be interpreted as GPU benchmark results and should not automatically be treated as laptop or edge-device latency.

---

### 03 — PointNet++ Training, Validation and Export

**File:**

```text
notebooks/kaggle/03_pointnetpp_training_validation_export.ipynb
```

This notebook contains the stronger PointNet++ model workflow.

It includes:

* PointNet++ model construction
* Dataset metadata validation
* Training dataset loading
* Training-batch smoke testing
* Class-weight calculation
* Weighted loss validation
* Full model training
* Best-checkpoint saving
* Checkpoint reloading
* Model validation
* Validation result generation
* Model artifact export
* Reproducibility artifact collection

The trained model checkpoint is exported as:

```text
best_model.pth
```

Additional model configuration and preprocessing artifacts are also exported where available.

---

## Dataset

The project uses:

**nuScenes-mini**

The local notebook expects the nuScenes-mini dataset and LiDAR segmentation data to be available under the configured dataset root.

The expected dataset structure includes directories such as:

```text
data/
├── maps/
├── samples/
├── sweeps/
├── v1.0-mini/
└── lidarseg/
    └── v1.0-mini/
```

The dataset itself is **not included in this repository**.

Users should obtain the dataset from the official nuScenes distribution and place it outside the Git repository or configure the notebook to point to its local location.

Do not commit the raw dataset to GitHub.

---

## Data Processing

The preprocessing pipeline converts the raw LiDAR and segmentation information into a training-ready representation.

The workflow includes:

```text
Raw nuScenes LiDAR
        │
        ▼
Sample / Label Matching
        │
        ▼
Class Mapping
        │
        ▼
Point Features
        │
        ▼
Preprocessing
        │
        ▼
Training / Validation Splits
        │
        ▼
Serialized Training Shards
```

Dataset metadata includes information such as:

* Class definitions
* Training manifest
* Validation manifest
* Preprocessing configuration
* Dataset checksums

These metadata files are used by the Kaggle training notebooks to verify that the expected dataset has been prepared correctly.

---

## Models

### Baseline Model

The baseline provides a simple reference point for evaluating the more advanced model.

Its architecture is based on a per-point MLP with global pooled context followed by per-point classification.

Purpose:

* Establish a reproducible baseline
* Verify the training pipeline
* Confirm loss/backpropagation behavior
* Provide a reference for stronger architectures

### PointNet++

The stronger model uses a PointNet++-style architecture for hierarchical point-cloud feature learning.

The training workflow includes:

* GPU acceleration
* Weighted classification loss
* Class imbalance handling
* Checkpointing
* Validation
* Reproducible configuration

The best checkpoint is saved as:

```text
best_model.pth
```

---

## Running the Project

### Step 1 — Prepare the repository

Clone the repository and enter the project directory:

```bash
git clone <your-repository-url>
cd FoveaLiDAR
```

Create a Python environment:

```bash
python -m venv .venv
```

Activate it.

Windows:

```bash
.venv\Scripts\activate
```

Linux/macOS:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

### Step 2 — Prepare the dataset

Download the required nuScenes-mini data and LiDAR segmentation data.

Place the dataset outside the Git repository or configure the notebook with the appropriate local dataset path.

Open:

```text
notebooks/local/01_dataset_preparation_and_preprocessing.ipynb
```

Update the dataset root configuration and execute the notebook.

---

### Step 3 — Prepare the training dataset

Run the preprocessing and training-data generation sections of the local notebook.

The resulting training dataset should contain the metadata required by the Kaggle training notebooks, including:

```text
metadata/
├── classes.json
├── preprocessing_config.json
├── train_manifest.json
└── val_manifest.json
```

---

### Step 4 — Run the baseline

Upload the prepared dataset to Kaggle or configure the Kaggle notebook to use the prepared dataset.

Run:

```text
notebooks/kaggle/02_baseline_training_validation_benchmark.ipynb
```

This notebook establishes the baseline model and produces its training, validation, and benchmark results.

---

### Step 5 — Train PointNet++

Run:

```text
notebooks/kaggle/03_pointnetpp_training_validation_export.ipynb
```

This notebook trains the stronger PointNet++ model and produces the best model checkpoint and validation/export artifacts.

---

## Results

Results generated during experimentation should be organized separately from source code.

Recommended structure:

```text
results/
├── validation/
├── benchmarks/
└── predictions/
```

Typical artifacts may include:

* Validation reports
* Benchmark reports
* Prediction samples
* Metrics
* Model configuration
* Training logs
* Visualizations

Large generated files should not be committed unnecessarily.

---

## Reproducibility

The project is divided into a local data-preparation stage and a GPU training stage.

### Local Jupyter

Used for:

* Dataset preparation
* Dataset inspection
* Preprocessing
* Class mapping
* Dataset statistics
* Training-data creation

### Kaggle

Used for:

* Baseline training
* PointNet++ training
* GPU validation
* GPU benchmarking
* Model export

This separation allows the computationally heavier training stages to run on a GPU environment while keeping dataset preparation reproducible locally.

---

## Important Path Configuration

The notebooks currently contain environment-specific paths, particularly:

```text
C:\Users\...\...
```

for the local Jupyter workflow and:

```text
/kaggle/input/...
/kaggle/working/...
```

for Kaggle.

Before publishing or sharing the repository, replace personal absolute paths with configurable project-relative paths wherever possible.

For example:

```python
from pathlib import Path

PROJECT_ROOT = Path.cwd().resolve()
DATASET_ROOT = PROJECT_ROOT / "data"
```

For Kaggle, keep the `/kaggle/input/` and `/kaggle/working/` paths where they are required by the Kaggle environment.

---

## Git and Large Files

Do not commit:

* Raw nuScenes datasets
* `.tgz` / `.tar.bz2` dataset archives
* Large `.bin` LiDAR files
* Large model checkpoints unless intentionally distributed
* Kaggle working directories
* Python cache files
* Jupyter checkpoint directories
* Personal environment files

A `.gitignore` should include at least:

```gitignore
# Python
__pycache__/
*.py[cod]
.venv/
venv/
env/

# Jupyter
.ipynb_checkpoints/

# Local datasets
data/
datasets/

# Kaggle
kaggle.json

# Model checkpoints
*.pth
*.pt
*.onnx

# Generated results
results/
outputs/
export/

# OS
.DS_Store
Thumbs.db
```

If you want to publish a trained model, store it separately using an appropriate model/artifact hosting service rather than committing a large checkpoint directly to Git.

---

## Project Status

### Completed

* nuScenes-mini dataset verification workflow
* Dataset extraction and inspection
* LiDAR segmentation label inspection
* Class mapping
* Dataset statistics
* Training-data preprocessing
* Training/validation dataset preparation
* Baseline model workflow
* PointNet++ model workflow
* Model checkpointing
* Validation workflow
* GPU benchmarking workflow
* Model artifact export workflow

### Further Development

Potential next steps include:

* Integrating the trained segmentation model with the mapping pipeline
* Adaptive spatial-resolution LiDAR representation
* Temporal accumulation across LiDAR frames
* Real-time inference integration
* Edge-device performance evaluation
* More extensive validation on unseen scenes
* Visualization of semantic and variable-resolution LiDAR maps

---

## License and Dataset Notice

The source code in this repository should be distributed under the license selected by the project author.

The nuScenes dataset is subject to its own terms, conditions, and licensing restrictions. The dataset is not redistributed as part of this repository.

Refer to the official nuScenes documentation and license terms before using the dataset for redistribution or commercial applications.

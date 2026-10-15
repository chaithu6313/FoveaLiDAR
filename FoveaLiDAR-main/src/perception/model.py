"""
SegmentationModel interface (ARCHITECTURE.md S7, PROJECT_REQUIREMENTS.md
S9). The mapping engine (src/mapping) never imports a model class
directly - it only ever calls .classify() on whatever satisfies this
Protocol, so swapping HeuristicPlaceholder for a trained network later
touches this file and nothing downstream of it.

RULES.md - ML: the resolution policy is never learned, and this module
must never import torch or any training-only dependency - a trained
model's INFERENCE code can live here once one exists (behind the same
interface), but training itself stays in the Kaggle notebooks.
"""
from dataclasses import dataclass
from typing import List, Protocol

from src.data.base_adapter import PreprocessedPoint


@dataclass
class ClassifiedPoint:
    x_m: float
    y_m: float
    z_m: float
    semantic_class: str
    confidence: float


class SegmentationModel(Protocol):
    def classify(self, points: List[PreprocessedPoint]) -> List[ClassifiedPoint]:
        ...


class GroundTruthPassthrough:
    """When a PreprocessedPoint already carries a project_class (i.e. the
    frame came with real or synthetic labels), this just carries that
    class through with confidence 1.0. Useful for exercising the grid
    engine and dashboard honestly against labelled data before any model
    exists, without pretending a heuristic or a trained model produced
    the classification.
    """

    def classify(self, points: List[PreprocessedPoint]) -> List[ClassifiedPoint]:
        out = []
        for p in points:
            if p.project_class is None:
                continue
            out.append(ClassifiedPoint(p.x_m, p.y_m, p.z_m, p.project_class, 1.0))
        return out


class HeuristicPlaceholder:
    """Naive geometric stand-in - NOT a trained model, and not claimed to
    be one anywhere (RULES.md - Performance: "exists to prove the
    pipeline shape, not to win a benchmark it was never meant to compete
    in"). Flat-ground-plane assumption throughout (RULES.md - Point
    clouds).

    Exists so src/mapping, src/tracking, and src/api all have real
    classified points to run against on genuinely unlabelled input (e.g.
    a live sensor later, ARCHITECTURE.md S27) before a trained network is
    wired in behind this same interface.
    """

    GROUND_BAND_M = 0.15
    OBSTACLE_HEIGHT_M = 0.4

    def classify(self, points: List[PreprocessedPoint]) -> List[ClassifiedPoint]:
        out = []
        for p in points:
            if abs(p.z_m) <= self.GROUND_BAND_M:
                cls, conf = "drivable", 0.6
            elif p.z_m > self.OBSTACLE_HEIGHT_M:
                cls, conf = "static_obstacle", 0.5
            else:
                cls, conf = "non_drivable", 0.5
            out.append(ClassifiedPoint(p.x_m, p.y_m, p.z_m, cls, conf))
        return out


class TrainedModel:
    """Loads a checkpoint exported by notebooks/kaggle/07_export_model.ipynb
    and satisfies SegmentationModel. This is the concrete landing spot for
    "putting the trained model into this project" - swap HeuristicPlaceholder
    or GroundTruthPassthrough for this in src/api/main.py once a checkpoint
    exists, and nothing else in the pipeline changes (ARCHITECTURE.md S7).

    Not usable in this sandbox: requires torch, which could not be
    installed here (no route to the CPU-only wheel, and a plain PyPI
    install pulls a full CUDA toolkit too large for this environment's
    disk - both tried, see the Kaggle notebooks' disclaimer). Code-complete
    and shape-consistent with notebooks/kaggle/03_train_model.ipynb's
    checkpoint format; untested end-to-end against a real checkpoint.
    """

    def __init__(self, checkpoint_path: str):
        import torch  # deliberately imported here, not at module level -
                       # RULES.md - Python: src/perception may contain a
                       # trained model's inference code, but everything
                       # else that imports this module (src/mapping,
                       # src/tracking, src/api's non-inference paths)
                       # must still work with no ML framework installed.
        checkpoint = torch.load(checkpoint_path, map_location="cpu")
        self._classes = checkpoint["classes"]
        self._model_choice = checkpoint["model_choice"]

        # Import the matching architecture. These class definitions live in
        # notebooks/kaggle/03_train_model.ipynb today (BaselinePointClassifier /
        # PointNetPPSegmenter) - move them to a shared src/perception/architectures.py
        # if/when this class is exercised for real, so the training notebook and
        # this loader can never define two different copies of the same model.
        raise NotImplementedError(
            "Move BaselinePointClassifier/PointNetPPSegmenter out of the "
            "notebook and into src/perception/architectures.py before using "
            "this loader - see this class's docstring."
        )

    def classify(self, points: List[PreprocessedPoint]) -> List[ClassifiedPoint]:
        raise NotImplementedError("finish __init__ first - see the docstring")


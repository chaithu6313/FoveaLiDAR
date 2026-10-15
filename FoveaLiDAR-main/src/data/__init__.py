"""
src/data/__init__.py - Dataset adapters and preprocessing pipeline
"""
from src.data.base_adapter import DatasetAdapter, PreprocessedPoint, PreprocessStats, RawFrame, preprocess_frame
from src.data.synthetic_adapter import SyntheticAdapter, build_dense_benchmark_scene

__all__ = [
    "DatasetAdapter",
    "RawFrame",
    "PreprocessedPoint",
    "PreprocessStats",
    "preprocess_frame",
    "SyntheticAdapter",
    "build_dense_benchmark_scene",
]

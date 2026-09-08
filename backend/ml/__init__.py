"""
TYRETRACE — Machine Learning Module
Physics-Informed Temporal AI Tyre Degradation Modeling.
"""

from backend.ml.baseline_model import (
    AIDegradationPrediction,
    BaselineDegradationModel,
    calculate_model_reliability,
)
from backend.ml.dataset_builder import MLDatasetBuilder
from backend.ml.dataset_discovery import (
    CandidateSessionSummary,
    audit_session_suitability,
    discover_candidate_datasets,
)
from backend.ml.evaluation import (
    EvaluationMetrics,
    calculate_evaluation_metrics,
    run_ablation_study,
)
from backend.ml.features import (
    FEATURE_COLUMNS_MODEL_A,
    FEATURE_COLUMNS_MODEL_B,
    FEATURE_COLUMNS_MODEL_C,
    FEATURE_COLUMNS_MODEL_D,
    FEATURE_COLUMNS_MODEL_E,
    WindowFeatureVector,
    build_temporal_windows,
    extract_window_features,
)
from backend.ml.splits import (
    DatasetSplit,
    split_by_groups,
    verify_no_leakage,
)

__all__ = [
    "CandidateSessionSummary",
    "audit_session_suitability",
    "discover_candidate_datasets",
    "MLDatasetBuilder",
    "WindowFeatureVector",
    "build_temporal_windows",
    "extract_window_features",
    "FEATURE_COLUMNS_MODEL_A",
    "FEATURE_COLUMNS_MODEL_B",
    "FEATURE_COLUMNS_MODEL_C",
    "FEATURE_COLUMNS_MODEL_D",
    "FEATURE_COLUMNS_MODEL_E",
    "DatasetSplit",
    "split_by_groups",
    "verify_no_leakage",
    "AIDegradationPrediction",
    "BaselineDegradationModel",
    "calculate_model_reliability",
    "EvaluationMetrics",
    "calculate_evaluation_metrics",
    "run_ablation_study",
]

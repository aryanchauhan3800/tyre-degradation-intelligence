"""
TYRETRACE — Tyre Degradation Index (TDI) Module
Deterministic, Physics-Informed Tyre Degradation Intelligence.
"""

from backend.tdi.schemas import (
    TDIComponentScores,
    TDIFrame,
    TDILapSummary,
    TDISessionReport,
    TDIState,
    TDITrend,
)
from backend.tdi.scoring import (
    calculate_confounder_penalty,
    calculate_degradation_trend_score,
    calculate_evidence_quality_score,
    calculate_persistence_score,
    calculate_residual_severity,
    calculate_tdi_confidence,
    calculate_tyre_age_score,
    classify_tdi_state,
    compute_tdi_components,
    generate_tdi_explanations,
)
from backend.tdi.tdi_engine import TDIEngine
from backend.tdi.trajectory import TDITrajectoryTracker

__all__ = [
    "TDIState",
    "TDITrend",
    "TDIComponentScores",
    "TDIFrame",
    "TDILapSummary",
    "TDISessionReport",
    "TDIEngine",
    "TDITrajectoryTracker",
    "calculate_residual_severity",
    "calculate_persistence_score",
    "calculate_degradation_trend_score",
    "calculate_tyre_age_score",
    "calculate_evidence_quality_score",
    "calculate_confounder_penalty",
    "compute_tdi_components",
    "calculate_tdi_confidence",
    "classify_tdi_state",
    "generate_tdi_explanations",
]

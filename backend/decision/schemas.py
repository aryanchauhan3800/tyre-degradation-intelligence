"""
TYRETRACE — Decision Twin Schemas
Pydantic contracts for strategic action recommendations, counterfactual scenario evaluation,
degradation cliff forecasting, and pit-window tracking.
"""

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class DecisionAction(str, Enum):
    """Primary strategic tyre decision actions evaluated by the Decision Twin."""
    PIT_NOW = "PIT_NOW"
    STAY_OUT = "STAY_OUT"
    PUSH = "PUSH"
    MANAGE = "MANAGE"


class PitWindowUrgency(str, Enum):
    """Urgency level for pit stop window entry."""
    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class DecisionRisk(str, Enum):
    """Risk classification of a simulated counterfactual action."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class PitWindow(BaseModel):
    """
    Projected pit stop lap window derived from tyre degradation trajectory and compound limits.
    """
    start_lap: Optional[int] = Field(None, description="Earliest viable pit entry lap")
    end_lap: Optional[int] = Field(None, description="Latest recommended pit entry lap before degradation cliff")
    estimated_laps_to_cliff: Optional[float] = Field(None, description="Estimated laps until critical degradation threshold")
    urgency: PitWindowUrgency = Field(PitWindowUrgency.NONE, description="Operational urgency of the pit window")
    reason: str = Field(..., description="Technical engineering rationale for the window calculation")


class DecisionScenario(BaseModel):
    """
    Counterfactual forward-projection of an individual candidate action.
    """
    action: DecisionAction = Field(..., description="Action under counterfactual evaluation")
    decision_score: float = Field(..., ge=0.0, le=100.0, description="Normalized suitability score [0..100]")
    projected_tdi: float = Field(..., ge=0.0, le=100.0, description="Estimated TDI 1-lap into the simulated scenario")
    projected_tdi_trend: str = Field(..., description="Projected trajectory trend under this scenario")
    projected_performance_loss: float = Field(..., description="Estimated lap-time performance deficit in seconds/lap")
    tyre_risk: DecisionRisk = Field(..., description="Risk of thermal/mechanical tyre degradation cliff")
    estimated_laps_remaining: Optional[int] = Field(None, description="Estimated safe tyre life laps remaining before cliff")
    explanation: str = Field(..., description="Explanation of why this action produced this outcome")
    limitations: List[str] = Field(default_factory=list, description="Modelled assumptions and data limitations")


class CliffForecast(BaseModel):
    """
    Deterministic linear/polynomial degradation cliff forecast.
    """
    current_tdi: float = Field(..., description="Current fused TDI [0..100]")
    current_trend: str = Field(..., description="Current trajectory trend classification")
    threshold: float = Field(..., description="Configured critical TDI cliff threshold (e.g. 75.0)")
    estimated_laps_to_threshold: Optional[float] = Field(None, description="Estimated laps until threshold is crossed")
    forecast_quality: float = Field(..., ge=0.0, le=1.0, description="Confidence in forecast based on history & evidence")
    method: str = Field(..., description="Mathematical extrapolation method used")
    explanation: str = Field(..., description="Human-readable summary of the forecast")


class StrategyDecision(BaseModel):
    """
    Comprehensive Decision Twin output returned on every evaluation.
    Provides structured, deterministic, machine-readable strategy guidance.
    """
    recommended_action: DecisionAction = Field(..., description="Highest-scoring candidate strategic action")
    decision_score: float = Field(..., ge=0.0, le=100.0, description="Decision score of the recommended action [0..100]")
    current_lap: int = Field(..., ge=1, description="Current race/replay lap number")
    tyre_age: Optional[int] = Field(None, ge=0, description="Completed laps on current tyre set")
    compound: Optional[str] = Field(None, description="Active tyre compound (e.g. SOFT, MEDIUM, HARD)")
    current_tdi: float = Field(..., ge=0.0, le=100.0, description="Current fused TDI score [0..100]")
    tdi_trend: str = Field(..., description="Current TDI trend (STABLE, DEGRADING_SLOW, DEGRADING_FAST, IMPROVING)")
    estimated_laps_to_cliff: Optional[float] = Field(None, description="Estimated laps until critical degradation threshold")
    pit_window: PitWindow = Field(..., description="Calculated pit stop window and urgency")
    scenarios: List[DecisionScenario] = Field(..., description="Side-by-side evaluation of PIT_NOW, STAY_OUT, PUSH, MANAGE")
    reasons: List[str] = Field(..., description="Bullet-point justifications for the recommended action")
    risks: List[str] = Field(..., description="Risks and caveats associated with the recommendation")
    data_quality: float = Field(..., ge=0.0, le=1.0, description="Telemetry observation and evidence quality")
    modelled_fields: List[str] = Field(default_factory=list, description="Explicit list of fields derived from models/assumptions")
    unavailable_fields: List[str] = Field(default_factory=list, description="Explicit list of unmeasured sensor channels")

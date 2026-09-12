"""
TYRETRACE — Decision Twin Main Engine
Orchestrates degradation forecasting, counterfactual scenario simulation,
and deterministic strategy decision synthesis.
"""

from dataclasses import dataclass, field
import logging
from typing import Any, Dict, List, Optional

from backend.confounders.schemas import ConfounderFrame
from backend.decision.forecasting import DEFAULT_CLIFF_THRESHOLD, estimate_degradation_cliff
from backend.decision.schemas import (
    CliffForecast,
    DecisionAction,
    DecisionScenario,
    PitWindow,
    StrategyDecision,
)
from backend.decision.scoring import evaluate_counterfactual_scenarios
from backend.decision.strategy_rules import calculate_pit_window, resolve_strategy_recommendation
from backend.schemas.telemetry import TelemetryFrame
from backend.tdi.schemas import TDIFrame

logger = logging.getLogger(__name__)


@dataclass
class DecisionTwinConfig:
    """Centralized configuration for the TyreTrace Decision Twin."""
    enabled: bool = True
    cliff_threshold: float = DEFAULT_CLIFF_THRESHOLD
    min_samples: int = 5
    total_race_laps: int = 53
    default_compound: str = "MEDIUM"


class DecisionEngine:
    """
    Authoritative Decision Twin evaluating strategic actions (PIT_NOW, STAY_OUT, PUSH, MANAGE)
    from current vehicle/tyre degradation state.
    """

    def __init__(self, config: Optional[DecisionTwinConfig] = None):
        self.config = config or DecisionTwinConfig()
        self._last_decision: Optional[StrategyDecision] = None
        self._evaluation_count: int = 0

    def reset(self) -> None:
        """Resets engine evaluation history."""
        self._last_decision = None
        self._evaluation_count = 0

    def evaluate(
        self,
        telemetry_frame: TelemetryFrame,
        tdi_frame: TDIFrame,
        final_tdi: float,
        confounder_frame: Optional[ConfounderFrame] = None,
        tdi_history: Optional[List[float]] = None,
        time_history: Optional[List[float]] = None,
    ) -> StrategyDecision:
        """
        Executes end-to-end Decision Twin evaluation on the current frame and TDI state.
        """
        self._evaluation_count += 1

        # 1. Extract Current State
        lap = int(telemetry_frame.lap)
        tyre_ref = telemetry_frame.tyres.fl
        tyre_age = tyre_ref.tyre_life_laps
        compound = tyre_ref.compound or self.config.default_compound

        clean_tdi = float(final_tdi)
        trend_str = str(tdi_frame.trend.value if hasattr(tdi_frame.trend, "value") else tdi_frame.trend)

        ev_quality = float(confounder_frame.tyre_evidence_quality) if confounder_frame else 0.80
        non_tyre = float(confounder_frame.non_tyre_explanation_score) if confounder_frame else 0.20

        # 2. Degradation Cliff Forecast
        cliff_forecast: CliffForecast = estimate_degradation_cliff(
            current_tdi=clean_tdi,
            current_trend=trend_str,
            tdi_history=tdi_history,
            time_history=time_history,
            compound=compound,
            cliff_threshold=self.config.cliff_threshold,
            evidence_quality=ev_quality,
            min_samples=self.config.min_samples,
        )

        # 3. Pit Window Evaluation
        pit_window: PitWindow = calculate_pit_window(
            current_lap=lap,
            tyre_age=tyre_age,
            compound=compound,
            current_tdi=clean_tdi,
            cliff_forecast=cliff_forecast,
            total_laps=self.config.total_race_laps,
        )

        # 4. Counterfactual Scenarios Evaluation
        scenarios: List[DecisionScenario] = evaluate_counterfactual_scenarios(
            current_tdi=clean_tdi,
            current_trend=trend_str,
            current_lap=lap,
            tyre_age=tyre_age,
            compound=compound,
            estimated_laps_to_cliff=cliff_forecast.estimated_laps_to_threshold,
            pit_window_start=pit_window.start_lap,
            pit_window_end=pit_window.end_lap,
            evidence_quality=ev_quality,
            non_tyre_score=non_tyre,
        )

        # 5. Recommendation Resolution
        rec_action, decision_score, reasons, risks = resolve_strategy_recommendation(
            scenarios=scenarios,
            current_tdi=clean_tdi,
            current_trend=trend_str,
            cliff_forecast=cliff_forecast,
            pit_window=pit_window,
            tyre_age=tyre_age,
            compound=compound,
        )

        # 6. Explicit Provenance Documentation
        modelled_fields = [
            "scenarios.projected_tdi (1-lap counterfactual projection)",
            "scenarios.projected_performance_loss (modelled pace delta in s/lap)",
            "cliff_forecast.estimated_laps_to_threshold (linear trajectory extrapolation)",
            "pit_window.start_lap / end_lap (compound nominal wear model)",
            "scenarios.decision_score (weighted multi-criteria evaluation)",
        ]

        unavailable_fields = [
            "tyres.carcass_temperature_array (FIA regulated / unmeasured)",
            "tyres.dynamic_tread_depth_mm (unmeasured in live telemetry)",
            "competitor_pit_exit_traffic_window (single-car telemetry scope)",
            "pit_lane_loss_exact_telemetry (assumed nominal ~21.5s delta)",
            "safety_car_probability_model (not modelled in Phase 1)",
        ]

        decision = StrategyDecision(
            recommended_action=rec_action,
            decision_score=round(decision_score, 1),
            current_lap=lap,
            tyre_age=tyre_age,
            compound=compound,
            current_tdi=round(clean_tdi, 1),
            tdi_trend=trend_str,
            estimated_laps_to_cliff=cliff_forecast.estimated_laps_to_threshold,
            pit_window=pit_window,
            scenarios=scenarios,
            reasons=reasons,
            risks=risks,
            data_quality=round(ev_quality, 2),
            modelled_fields=modelled_fields,
            unavailable_fields=unavailable_fields,
        )

        self._last_decision = decision
        return decision

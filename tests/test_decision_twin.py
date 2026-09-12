"""
TYRETRACE — Decision Twin Unit & Integration Tests (Phase 1)
Tests deterministic degradation cliff forecasting, counterfactual scenario simulation,
strategic action recommendation, REST endpoint, and WebSocket payload integration.
"""

import pytest
from fastapi.testclient import TestClient

from backend.api.app import create_app
from backend.api.pipeline import UnifiedIntelligencePipeline
from backend.decision.decision_engine import DecisionEngine, DecisionTwinConfig
from backend.decision.forecasting import (
    DEFAULT_CLIFF_THRESHOLD,
    estimate_degradation_cliff,
)
from backend.decision.schemas import (
    DecisionAction,
    DecisionRisk,
    DecisionScenario,
    PitWindowUrgency,
    StrategyDecision,
)
from backend.decision.scoring import evaluate_counterfactual_scenarios
from backend.decision.strategy_rules import (
    calculate_pit_window,
    resolve_strategy_recommendation,
)
from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)
from backend.tdi.schemas import TDIComponentScores, TDIFrame, TDIState, TDITrend


def make_dummy_frame(
    lap: int = 24,
    speed_kph: float = 280.0,
    tyre_age: int = 18,
    compound: str = "SOFT",
) -> TelemetryFrame:
    """Constructs a valid canonical TelemetryFrame for decision testing."""
    speed_mps = speed_kph / 3.6
    tyre_fl = TyreState(corner=WheelCorner.FL, compound=compound, tyre_life_laps=tyre_age, stint=1)
    tyre_fr = TyreState(corner=WheelCorner.FR, compound=compound, tyre_life_laps=tyre_age, stint=1)
    tyre_rl = TyreState(corner=WheelCorner.RL, compound=compound, tyre_life_laps=tyre_age, stint=1)
    tyre_rr = TyreState(corner=WheelCorner.RR, compound=compound, tyre_life_laps=tyre_age, stint=1)

    return TelemetryFrame(
        timestamp=100.0,
        session_id="TEST_SESSION",
        lap=lap,
        vehicle=VehicleState(
            speed_mps=speed_mps,
            speed_kph=speed_kph,
            throttle_pct=95.0,
            brake_pct=0.0,
            gear=7,
        ),
        tyres=FourWheelTyreStates(fl=tyre_fl, fr=tyre_fr, rl=tyre_rl, rr=tyre_rr),
        environment=EnvironmentState(),
    )


def make_dummy_tdi(
    tdi: float = 72.0,
    trend: TDITrend = TDITrend.RISING,
) -> TDIFrame:
    """Constructs a valid TDIFrame for decision testing."""
    components = TDIComponentScores(
        residual_severity=0.7,
        persistence=0.8,
        degradation_trend=0.6,
        tyre_age=0.6,
        evidence_quality=0.85,
        confounder_penalty=0.1,
        raw_evidence_score=0.72,
        qualified_score=0.72,
    )
    return TDIFrame(
        timestamp=100.0,
        lap=24,
        tdi=tdi,
        state=TDIState.HIGH_DEGRADATION,
        trend=trend,
        confidence=0.85,
        components=components,
        tyre_evidence_quality=0.85,
        non_tyre_explanation_score=0.10,
        evidence=["High residual severity"],
        counter_evidence=[],
    )


# ==============================================================================
# A. DecisionAction Enum & Validation
# ==============================================================================
def test_decision_action_enum():
    assert DecisionAction.PIT_NOW.value == "PIT_NOW"
    assert DecisionAction.STAY_OUT.value == "STAY_OUT"
    assert DecisionAction.PUSH.value == "PUSH"
    assert DecisionAction.MANAGE.value == "MANAGE"


# ==============================================================================
# B. TDI Cliff Forecasting
# ==============================================================================
def test_forecast_already_exceeded_threshold():
    forecast = estimate_degradation_cliff(
        current_tdi=82.0,
        current_trend="DEGRADING_FAST",
        tdi_history=[70.0, 74.0, 78.0, 82.0, 82.0],
        cliff_threshold=75.0,
    )
    assert forecast.estimated_laps_to_threshold == 0.0
    assert forecast.method == "THRESHOLD_SATURATED"


def test_forecast_insufficient_history():
    forecast = estimate_degradation_cliff(
        current_tdi=50.0,
        current_trend="DEGRADING_SLOW",
        tdi_history=[49.0, 50.0],  # only 2 samples < 5
        min_samples=5,
    )
    assert forecast.estimated_laps_to_threshold is None
    assert forecast.method == "INSUFFICIENT_HISTORY"
    assert "Insufficient TDI history" in forecast.explanation


def test_forecast_rising_trend_linear_extrapolation():
    # Rising slope: +2.0 TDI per step
    history = [50.0, 52.0, 54.0, 56.0, 58.0, 60.0]
    forecast = estimate_degradation_cliff(
        current_tdi=60.0,
        current_trend="DEGRADING_FAST",
        tdi_history=history,
        cliff_threshold=75.0,
    )
    assert forecast.estimated_laps_to_threshold is not None
    assert forecast.estimated_laps_to_threshold > 0.0
    assert forecast.forecast_quality >= 0.40


def test_forecast_stable_or_improving_trend():
    history = [45.0, 45.0, 45.0, 44.8, 45.0]
    forecast = estimate_degradation_cliff(
        current_tdi=45.0,
        current_trend="STABLE",
        tdi_history=history,
        cliff_threshold=75.0,
    )
    assert forecast.estimated_laps_to_threshold is None
    assert forecast.method == "STABLE_NO_CLIFF"


# ==============================================================================
# C. Pit Window Logic
# ==============================================================================
def test_pit_window_critical_urgency():
    frame = make_dummy_frame(lap=30, tyre_age=28)
    tdi = make_dummy_tdi(tdi=80.0)
    forecast = estimate_degradation_cliff(current_tdi=80.0, current_trend="DEGRADING_FAST", tdi_history=[75, 78, 80])
    pw = calculate_pit_window(
        current_lap=30,
        tyre_age=28,
        compound="SOFT",
        current_tdi=80.0,
        cliff_forecast=forecast,
        total_laps=53,
    )
    assert pw.urgency == PitWindowUrgency.CRITICAL
    assert pw.start_lap == 30


def test_pit_window_healthy_tyres():
    forecast = estimate_degradation_cliff(current_tdi=15.0, current_trend="STABLE", tdi_history=[14, 15, 15])
    pw = calculate_pit_window(
        current_lap=5,
        tyre_age=5,
        compound="MEDIUM",
        current_tdi=15.0,
        cliff_forecast=forecast,
        total_laps=53,
    )
    assert pw.urgency in (PitWindowUrgency.LOW, PitWindowUrgency.NONE)
    assert pw.start_lap is not None and pw.start_lap > 5


# ==============================================================================
# D. Counterfactual Scenario Simulation
# ==============================================================================
def test_counterfactual_scenarios_structure_and_scoring():
    scenarios = evaluate_counterfactual_scenarios(
        current_tdi=72.0,
        current_trend="DEGRADING_FAST",
        current_lap=25,
        tyre_age=20,
        compound="SOFT",
        estimated_laps_to_cliff=1.5,
        pit_window_start=24,
        pit_window_end=27,
    )
    assert len(scenarios) == 4
    actions = {s.action for s in scenarios}
    assert actions == {DecisionAction.PIT_NOW, DecisionAction.STAY_OUT, DecisionAction.PUSH, DecisionAction.MANAGE}

    for s in scenarios:
        assert 0.0 <= s.decision_score <= 100.0
        assert 0.0 <= s.projected_tdi <= 100.0
        assert len(s.explanation) > 0
        assert len(s.limitations) > 0

    # In high degradation regime (TDI=72, cliff=1.5 laps), PIT_NOW score should exceed STAY_OUT
    pit_scen = next(s for s in scenarios if s.action == DecisionAction.PIT_NOW)
    stay_scen = next(s for s in scenarios if s.action == DecisionAction.STAY_OUT)
    assert pit_scen.decision_score > stay_scen.decision_score


def test_counterfactual_scenarios_healthy_tyre():
    # Fresh tyre, low degradation
    scenarios = evaluate_counterfactual_scenarios(
        current_tdi=12.0,
        current_trend="STABLE",
        current_lap=4,
        tyre_age=4,
        compound="MEDIUM",
        estimated_laps_to_cliff=22.0,
        pit_window_start=22,
        pit_window_end=28,
    )
    pit_scen = next(s for s in scenarios if s.action == DecisionAction.PIT_NOW)
    stay_scen = next(s for s in scenarios if s.action == DecisionAction.STAY_OUT)
    # Staying out should strongly dominate pitting on lap 4
    assert stay_scen.decision_score > pit_scen.decision_score


# ==============================================================================
# E. Strategy Rules & Recommendation Resolution
# ==============================================================================
def test_strategy_recommendation_resolution():
    scenarios = evaluate_counterfactual_scenarios(
        current_tdi=76.0,
        current_trend="DEGRADING_FAST",
        current_lap=28,
        tyre_age=24,
        compound="SOFT",
        estimated_laps_to_cliff=0.8,
        pit_window_start=26,
        pit_window_end=29,
    )
    forecast = estimate_degradation_cliff(76.0, "DEGRADING_FAST", [70, 72, 74, 76, 76])
    pw = calculate_pit_window(28, 24, "SOFT", 76.0, forecast)

    rec_action, score, reasons, risks = resolve_strategy_recommendation(
        scenarios=scenarios,
        current_tdi=76.0,
        current_trend="DEGRADING_FAST",
        cliff_forecast=forecast,
        pit_window=pw,
        tyre_age=24,
        compound="SOFT",
    )
    assert rec_action == DecisionAction.PIT_NOW
    assert score >= 70.0
    assert len(reasons) > 0
    assert len(risks) > 0


# ==============================================================================
# F. Full DecisionEngine Integration
# ==============================================================================
def test_decision_engine_complete_evaluation():
    engine = DecisionEngine(DecisionTwinConfig(enabled=True, cliff_threshold=75.0))
    frame = make_dummy_frame(lap=22, tyre_age=19, compound="MEDIUM")
    tdi = make_dummy_tdi(tdi=68.0, trend=TDITrend.RISING)

    decision = engine.evaluate(
        telemetry_frame=frame,
        tdi_frame=tdi,
        final_tdi=68.0,
        tdi_history=[60.0, 62.0, 64.0, 66.0, 68.0],
        time_history=[10.0, 20.0, 30.0, 40.0, 50.0],
    )

    assert isinstance(decision, StrategyDecision)
    assert decision.current_lap == 22
    assert decision.compound == "MEDIUM"
    assert decision.current_tdi == 68.0
    assert len(decision.scenarios) == 4
    assert len(decision.modelled_fields) > 0
    assert len(decision.unavailable_fields) > 0


def test_decision_engine_handles_missing_tyre_age():
    engine = DecisionEngine()
    frame = make_dummy_frame(lap=10, tyre_age=0)
    # Set tyre age explicitly None
    frame.tyres.fl.tyre_life_laps = None
    tdi = make_dummy_tdi(tdi=30.0, trend=TDITrend.STABLE)

    decision = engine.evaluate(
        telemetry_frame=frame,
        tdi_frame=tdi,
        final_tdi=30.0,
        tdi_history=None,
    )
    assert decision.tyre_age is None
    assert decision.recommended_action in (DecisionAction.STAY_OUT, DecisionAction.MANAGE)


# ==============================================================================
# G. Pipeline Integration Regression Test
# ==============================================================================
def test_pipeline_produces_decision_twin():
    pipeline = UnifiedIntelligencePipeline()
    frame = make_dummy_frame(lap=15, tyre_age=10, compound="MEDIUM")
    result = pipeline.process_frame(frame)

    assert result.decision is not None
    assert isinstance(result.decision, StrategyDecision)
    assert result.decision.current_lap == 15
    assert len(result.decision.scenarios) == 4


# ==============================================================================
# H. REST API: GET /api/decision
# ==============================================================================
def test_api_get_decision():
    app = create_app()
    client = TestClient(app)

    # Replay controller auto-steps frame 0 on startup lifespan
    with client:
        resp = client.get("/api/decision")
        assert resp.status_code == 200
        data = resp.json()
        assert "recommended_action" in data
        assert "decision_score" in data
        assert "scenarios" in data
        assert len(data["scenarios"]) == 4
        assert data["recommended_action"] in ["PIT_NOW", "STAY_OUT", "PUSH", "MANAGE"]


# ==============================================================================
# I. WebSocket Message Contains Decision Block
# ==============================================================================
def test_websocket_message_contains_decision():
    app = create_app()
    client = TestClient(app)

    with client:
        with client.websocket_connect("/ws/telemetry") as ws:
            ws.send_text("ping")
            reply = ws.receive_text()
            assert reply == "pong"

            # Execute a frame step on pipeline and broadcast via controller
            controller = app.state.controller
            import asyncio
            asyncio.run(controller.step_frame())

            raw_msg = ws.receive_text()
            import json
            payload = json.loads(raw_msg)
            assert "decision" in payload
            assert payload["decision"]["recommended_action"] in ["PIT_NOW", "STAY_OUT", "PUSH", "MANAGE"]
            assert len(payload["decision"]["scenarios"]) == 4

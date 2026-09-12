"""
TYRETRACE — Strategic Decision Rules Engine
Deterministic rule evaluation translating counterfactual scenario outcomes and tyre state
into an authoritative strategy recommendation, pit window, and human-readable explanations.
"""

from typing import List, Optional, Tuple

from backend.decision.schemas import (
    CliffForecast,
    DecisionAction,
    DecisionRisk,
    DecisionScenario,
    PitWindow,
    PitWindowUrgency,
)


# Expected stint lengths by compound (MODEL PARAMETER — DEMO ASSUMPTION: 2023 Pirelli F1 benchmarks)
NOMINAL_COMPOUND_STINT_LAPS = {
    "SOFT": 18,
    "MEDIUM": 26,
    "HARD": 36,
    "INTERMEDIATE": 24,
    "WET": 30,
    "UNKNOWN": 24,
}


def calculate_pit_window(
    current_lap: int,
    tyre_age: Optional[int],
    compound: Optional[str],
    current_tdi: float,
    cliff_forecast: CliffForecast,
    total_laps: int = 53,
) -> PitWindow:
    """
    Deterministically computes the target pit stop window [start_lap, end_lap] and urgency.
    """
    comp_key = (compound or "MEDIUM").upper()
    nom_stint = NOMINAL_COMPOUND_STINT_LAPS.get(comp_key, 25)
    age = tyre_age if tyre_age is not None else 10

    cliff_laps = cliff_forecast.estimated_laps_to_threshold

    # 1. Critical Urgency: Cliff reached or <= 1 lap
    if current_tdi >= cliff_forecast.threshold or (cliff_laps is not None and cliff_laps <= 1.0):
        start = current_lap
        end = min(total_laps, current_lap + 1)
        urgency = PitWindowUrgency.CRITICAL
        reason = (
            f"Degradation cliff active or within 1 lap (Current TDI: {current_tdi:.1f}, "
            f"Threshold: {cliff_forecast.threshold:.0f}). Immediate pit stop required to avoid severe pace collapse."
        )

    # 2. High Urgency: Cliff in 2–3 laps or stint age nearing limit
    elif (cliff_laps is not None and cliff_laps <= 3.0) or age >= (nom_stint - 2):
        start = current_lap
        end = min(total_laps, current_lap + max(1, int(cliff_laps or 2)))
        urgency = PitWindowUrgency.HIGH
        reason = (
            f"Tyre reaching performance limits (TDI: {current_tdi:.1f}, Stint Age: {age}/{nom_stint} laps). "
            f"Pit window open now to execute undercut."
        )

    # 3. Medium Urgency: Mid-stint accumulation or cliff in 4–7 laps
    elif (cliff_laps is not None and cliff_laps <= 7.0) or current_tdi >= 50.0 or age >= (nom_stint - 6):
        start = current_lap + max(1, int((cliff_laps or 5) - 3))
        end = min(total_laps, current_lap + int(cliff_laps or 6))
        urgency = PitWindowUrgency.MEDIUM
        reason = (
            f"Tyre wear progressing nominally for {comp_key} compound. Target pit window opens at "
            f"Lap {start} (in ~{start - current_lap} laps)."
        )

    # 4. Low / None: Early in stint, tyres healthy
    else:
        remaining_nom = max(4, nom_stint - age)
        start = current_lap + max(3, remaining_nom - 4)
        end = min(total_laps, current_lap + remaining_nom)
        urgency = PitWindowUrgency.LOW if current_tdi > 25.0 else PitWindowUrgency.NONE
        reason = (
            f"Tyres in healthy operating window ({current_tdi:.1f} TDI, {age} laps completed). "
            f"Strategic pit window anticipated from Lap {start}."
        )

    return PitWindow(
        start_lap=start,
        end_lap=end,
        estimated_laps_to_cliff=cliff_laps,
        urgency=urgency,
        reason=reason,
    )


def resolve_strategy_recommendation(
    scenarios: List[DecisionScenario],
    current_tdi: float,
    current_trend: str,
    cliff_forecast: CliffForecast,
    pit_window: PitWindow,
    tyre_age: Optional[int],
    compound: Optional[str],
) -> Tuple[DecisionAction, float, List[str], List[str]]:
    """
    Selects the recommended action from evaluated scenarios and generates
    detailed technical justifications and operational risk warnings.
    """
    if not scenarios:
        return DecisionAction.STAY_OUT, 50.0, ["Defaulting to STAY_OUT due to empty scenario set."], []

    # Find highest-scoring scenario
    best_scenario = max(scenarios, key=lambda s: s.decision_score)
    rec_action = best_scenario.action
    best_score = best_scenario.decision_score

    # Deterministic Override: If degradation is CRITICAL, PIT_NOW must dominate
    if pit_window.urgency == PitWindowUrgency.CRITICAL:
        pit_scen = next((s for s in scenarios if s.action == DecisionAction.PIT_NOW), None)
        if pit_scen:
            rec_action = DecisionAction.PIT_NOW
            best_score = pit_scen.decision_score

    reasons: List[str] = []
    risks: List[str] = []

    age_str = f"{tyre_age} laps" if tyre_age is not None else "unspecified"
    comp_str = compound or "MEDIUM"

    # Generate primary reasons based on selected action
    if rec_action == DecisionAction.PIT_NOW:
        reasons.append(f"Current TDI ({current_tdi:.1f}) is elevated, indicating significant grip loss.")
        if pit_window.estimated_laps_to_cliff is not None:
            reasons.append(f"Degradation cliff estimated in {pit_window.estimated_laps_to_cliff:.1f} laps.")
        reasons.append(f"Tyre set has completed {age_str} on {comp_str} compound.")
        reasons.append(f"Pit stop locks in undercut and resets TDI to ~6.0 on fresh rubber.")
        risks.append("Pit stop incurs ~21.5s pit lane loss delta; clean pit lane exit window required.")
        risks.append("Competitors staying out may gain track position if safety car occurs post-pit.")

    elif rec_action == DecisionAction.STAY_OUT:
        reasons.append(f"Tyres operating within acceptable thermal/mechanical bounds (TDI: {current_tdi:.1f}).")
        reasons.append(f"Sufficient tyre life remaining ({pit_window.estimated_laps_to_cliff or '10+'} laps to cliff).")
        reasons.append("Track position is preserved without incurring immediate pit lane delta.")
        risks.append("Monitoring required: a sudden lock-up or high lateral load can accelerate wear.")
        if current_trend in ("RISING", "DEGRADING_FAST", "DEGRADING_SLOW"):
            risks.append("TDI trend is actively increasing; re-evaluate within 2 laps.")

    elif rec_action == DecisionAction.PUSH:
        reasons.append("Tyres have sufficient structural/thermal margin to absorb maximum attack.")
        reasons.append("Pace advantage (~ -0.45s/lap) available for overtaking or building in-lap gap.")
        risks.append("Pushing accelerates TDI degradation rate by approximately +65%.")
        risks.append("Risk of surface graining or overheating if pushed for more than 2 consecutive laps.")

    elif rec_action == DecisionAction.MANAGE:
        reasons.append(f"Active tyre conservation extends current stint life by up to +40%.")
        reasons.append(f"Stabilizes TDI trajectory at ~{current_tdi:.1f} prior to scheduled pit window.")
        reasons.append("Reduces apex slip angle and surface thermal stress.")
        risks.append("Pace sacrifice of ~+0.50s/lap leaves vehicle vulnerable to behind competitors with DRS.")

    # General system limitations
    risks.append("Competitor gaps and clean air pit exit windows are NOT modelled in single-car mode.")

    return rec_action, best_score, reasons, risks

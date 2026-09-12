"""
TYRETRACE — Counterfactual Scenario Scoring Engine
Evaluates and scores candidate strategic actions (PIT_NOW, STAY_OUT, PUSH, MANAGE)
using transparent, deterministic physics-informed criteria.
"""

from typing import Dict, List, Optional, Tuple
from backend.decision.schemas import (
    DecisionAction,
    DecisionRisk,
    DecisionScenario,
)


# ==============================================================================
# CONFIGURABLE SCORING WEIGHTS & THRESHOLDS (MODEL PARAMETER — DEMO ASSUMPTIONS)
# ==============================================================================
# Relative importance of decision criteria (sums to 1.00)
WEIGHT_DEGRADATION_PENALTY: float = 0.35    # Penalty for operating in high degradation regime
WEIGHT_PERFORMANCE_RETENTION: float = 0.25  # Value of sustaining competitive lap-time pace
WEIGHT_TYRE_AGE_FACTOR: float = 0.15        # Penalty for accumulated structural stint laps
WEIGHT_WINDOW_ALIGNMENT: float = 0.15       # Alignment with the calculated pit window
WEIGHT_UNCERTAINTY_PENALTY: float = 0.10    # Discount for unmeasured confounders / low evidence

# Scenario Delta Multipliers
# MODEL PARAMETER — DEMO ASSUMPTION: empirical counterfactual effects
PUSH_DEGRADATION_RATE_MULT: float = 1.65    # Pushing accelerates TDI progression by +65%
MANAGE_DEGRADATION_RATE_MULT: float = 0.55  # Managing reduces TDI progression by 45%
PUSH_PACE_GAIN_SEC: float = -0.45           # Immediate lap-time advantage from maximum attack (-0.45s)
MANAGE_PACE_LOSS_SEC: float = +0.50         # Immediate lap-time sacrifice to conserve rubber (+0.50s)
PIT_FRESH_TYRE_RESET_TDI: float = 6.0       # Expected TDI on fresh out-lap tyres
PIT_STOP_TIME_PENALTY_EQUIV: float = 21.5   # Standard F1 pit stop loss delta (seconds)


def evaluate_counterfactual_scenarios(
    current_tdi: float,
    current_trend: str,
    current_lap: int,
    tyre_age: Optional[int],
    compound: Optional[str],
    estimated_laps_to_cliff: Optional[float],
    pit_window_start: Optional[int],
    pit_window_end: Optional[int],
    evidence_quality: float = 0.80,
    non_tyre_score: float = 0.20,
) -> List[DecisionScenario]:
    """
    Simulates the 4 candidate actions (PIT_NOW, STAY_OUT, PUSH, MANAGE) from the current state
    and returns comprehensive DecisionScenario models.
    """
    age = tyre_age if tyre_age is not None else 10
    comp = (compound or "MEDIUM").upper()
    cliff_dist = estimated_laps_to_cliff if estimated_laps_to_cliff is not None else 15.0

    in_window = False
    if pit_window_start is not None and pit_window_end is not None:
        in_window = (pit_window_start <= current_lap <= pit_window_end)
    elif pit_window_start is not None:
        in_window = current_lap >= pit_window_start

    scenarios: List[DecisionScenario] = []

    # ──────────────────────────────────────────────────────────────────────────
    # 1. PIT_NOW SCENARIO
    # ──────────────────────────────────────────────────────────────────────────
    # Benefit: Resets tyre degradation to near-zero; eliminates imminent cliff risk.
    # Cost: Incurs pit lane delta (~21.5s). Highly favored when TDI >= 65 or inside pit window.
    proj_tdi_pit = PIT_FRESH_TYRE_RESET_TDI
    # Performance loss on in-lap / out-lap amortized against tyre recovery
    if current_tdi >= 70.0 or cliff_dist <= 2.0:
        pit_base_score = 88.0
        pit_perf_loss = 0.0  # Fresh rubber immediately outpaces degrading tyre
        pit_risk = DecisionRisk.LOW
        pit_expl = (
            f"Box now for fresh rubber. Current TDI ({current_tdi:.1f}) is critical or cliff is imminent "
            f"({cliff_dist:.1f} laps). Stopping now maximizes net race pace over the remaining stint."
        )
    elif in_window or current_tdi >= 55.0:
        pit_base_score = 78.0
        pit_perf_loss = 0.2
        pit_risk = DecisionRisk.LOW
        pit_expl = (
            f"Viable pit stop execution. Within strategic pit window (Laps {pit_window_start}–{pit_window_end}). "
            f"Resetting TDI from {current_tdi:.1f} to ~{proj_tdi_pit:.1f} locks in undercut."
        )
    else:
        # Too early to pit; tyre still has high residual life
        pit_base_score = 42.0
        pit_perf_loss = 1.2
        pit_risk = DecisionRisk.MEDIUM
        pit_expl = (
            f"Premature stop. Current TDI ({current_tdi:.1f}) and tyre age ({age} laps) indicate "
            f"substantial usable tyre life remaining ({cliff_dist:.1f} laps to cliff)."
        )

    # Uncertainty discount
    pit_score = round(max(0.0, min(100.0, pit_base_score * (0.85 + 0.15 * evidence_quality))), 1)

    scenarios.append(DecisionScenario(
        action=DecisionAction.PIT_NOW,
        decision_score=pit_score,
        projected_tdi=proj_tdi_pit,
        projected_tdi_trend="IMPROVING",
        projected_performance_loss=round(pit_perf_loss, 2),
        tyre_risk=pit_risk,
        estimated_laps_remaining=25,  # Fresh stint estimate
        explanation=pit_expl,
        limitations=[
            "Assumes standard pit lane loss delta ~21.5s without traffic or pit stop execution delays.",
            "Post-pit tyre warm-up / out-lap grip assumed nominal (C3/C2 compound transition).",
        ],
    ))

    # ──────────────────────────────────────────────────────────────────────────
    # 2. STAY_OUT SCENARIO
    # ──────────────────────────────────────────────────────────────────────────
    # Benefit: Conserves pit stop, sustains current track position.
    # Cost: Continues accumulation on current degradation trend.
    rate_stay = 2.0 if current_trend in ("RISING", "DEGRADING_FAST", "DEGRADING_SLOW") else 1.0
    proj_tdi_stay = min(100.0, current_tdi + rate_stay)
    stay_perf_loss = max(0.0, (proj_tdi_stay - 30.0) * 0.03)

    if current_tdi >= 75.0 or cliff_dist <= 1.0:
        stay_base_score = 35.0
        stay_risk = DecisionRisk.CRITICAL
        stay_expl = (
            f"Severe risk. Staying out exposes vehicle to imminent degradation cliff ({cliff_dist:.1f} laps). "
            f"Pace drop of +{stay_perf_loss:.2f}s/lap will cause significant position loss."
        )
    elif current_tdi >= 55.0 or in_window:
        stay_base_score = 65.0
        stay_risk = DecisionRisk.MEDIUM
        stay_expl = (
            f"Marginal stay-out. Vehicle can complete 1–2 more laps before degradation accelerates, "
            f"but tyre is approaching performance limits."
        )
    else:
        stay_base_score = 86.0
        stay_risk = DecisionRisk.LOW
        stay_expl = (
            f"Maintain current strategy. Low degradation ({current_tdi:.1f}) and healthy tyre life "
            f"({cliff_dist:.1f} laps to cliff) support staying out with minimal pace degradation."
        )

    stay_score = round(max(0.0, min(100.0, stay_base_score * (0.90 + 0.10 * evidence_quality))), 1)

    scenarios.append(DecisionScenario(
        action=DecisionAction.STAY_OUT,
        decision_score=stay_score,
        projected_tdi=round(proj_tdi_stay, 1),
        projected_tdi_trend=current_trend,
        projected_performance_loss=round(stay_perf_loss, 2),
        tyre_risk=stay_risk,
        estimated_laps_remaining=max(0, int(cliff_dist)),
        explanation=stay_expl,
        limitations=[
            "Extrapolates linear degradation rate assuming consistent track surface temperature.",
            "Does not model sudden graining or thermal blistering non-linearities.",
        ],
    ))

    # ──────────────────────────────────────────────────────────────────────────
    # 3. PUSH SCENARIO
    # ──────────────────────────────────────────────────────────────────────────
    # Benefit: Immediate lap-time gain (-0.45s) for overtake or in-lap push.
    # Cost: Sharp escalation in tyre degradation (+65% wear rate).
    rate_push = (2.0 if current_trend in ("RISING", "DEGRADING_FAST", "DEGRADING_SLOW") else 1.2) * PUSH_DEGRADATION_RATE_MULT
    proj_tdi_push = min(100.0, current_tdi + rate_push)
    push_perf_loss = PUSH_PACE_GAIN_SEC  # Net negative loss = positive pace gain

    if current_tdi >= 70.0 or cliff_dist <= 2.0:
        push_base_score = 25.0
        push_risk = DecisionRisk.CRITICAL
        push_expl = (
            f"Extremely high risk. Pushing on heavily degraded tyres ({current_tdi:.1f}) will induce "
            f"immediate thermal saturation and severe graining."
        )
    elif in_window:
        # In-lap before pitting is an ideal window to push
        push_base_score = 80.0
        push_risk = DecisionRisk.HIGH
        push_expl = (
            f"In-lap push window viable. Pushing for 1 lap to maximize in-lap pace prior to pit stop "
            f"yields ~0.45s advantage before tyres are discarded."
        )
    elif current_tdi < 45.0:
        push_base_score = 75.0
        push_risk = DecisionRisk.MEDIUM
        push_expl = (
            f"Controlled attack viable. Fresh tyre set ({age} laps) has sufficient thermal headroom "
            f"to absorb high-load cornering."
        )
    else:
        push_base_score = 50.0
        push_risk = DecisionRisk.HIGH
        push_expl = (
            f"High tyre stress. Pushing now will shorten remaining tyre life from {cliff_dist:.1f} to "
            f"~{cliff_dist * 0.6:.1f} laps."
        )

    push_score = round(max(0.0, min(100.0, push_base_score * (0.85 + 0.15 * evidence_quality))), 1)

    scenarios.append(DecisionScenario(
        action=DecisionAction.PUSH,
        decision_score=push_score,
        projected_tdi=round(proj_tdi_push, 1),
        projected_tdi_trend="DEGRADING_FAST",
        projected_performance_loss=round(push_perf_loss, 2),
        tyre_risk=push_risk,
        estimated_laps_remaining=max(0, int(cliff_dist * 0.6)),
        explanation=push_expl,
        limitations=[
            "Pace gain (-0.45s) is a modelled estimate; actual driver delta depends on traffic and clean air.",
            "Tyre carcass temperature rise is modelled conceptually; internal sensors are unmeasured.",
        ],
    ))

    # ──────────────────────────────────────────────────────────────────────────
    # 4. MANAGE SCENARIO
    # ──────────────────────────────────────────────────────────────────────────
    # Benefit: Preserves tyre life, delays degradation cliff (+40% extra stint life).
    # Cost: Sacrifices immediate lap time (+0.50s) via lift-and-coast and reduced apex speed.
    rate_manage = (2.0 if current_trend in ("RISING", "DEGRADING_FAST", "DEGRADING_SLOW") else 1.0) * MANAGE_DEGRADATION_RATE_MULT
    proj_tdi_manage = min(100.0, current_tdi + rate_manage)
    manage_perf_loss = MANAGE_PACE_LOSS_SEC

    if current_tdi >= 75.0:
        manage_base_score = 60.0
        manage_risk = DecisionRisk.HIGH
        manage_expl = (
            f"Managing tyres will slightly mitigate cliff, but degradation is already severe ({current_tdi:.1f}). "
            f"Pitting remains significantly more effective."
        )
    elif in_window and current_tdi >= 58.0:
        manage_base_score = 72.0
        manage_risk = DecisionRisk.LOW
        manage_expl = (
            f"Stint extension management. Managing high-energy corners can extend stint by 2–4 laps, "
            f"widening strategic options for overcut."
        )
    elif current_tdi < 30.0:
        manage_base_score = 62.0
        manage_risk = DecisionRisk.LOW
        manage_expl = (
            f"Premature management. Tyres are fresh ({current_tdi:.1f} TDI); conserving now sacrifices pace "
            f"(+{manage_perf_loss:.2f}s/lap) unnecessarily."
        )
    else:
        manage_base_score = 76.0
        manage_risk = DecisionRisk.LOW
        manage_expl = (
            f"Effective conservation. Managing apex lateral loads stabilizes TDI at ~{proj_tdi_manage:.1f}, "
            f"extending remaining stint life to ~{cliff_dist * 1.4:.0f} laps."
        )

    manage_score = round(max(0.0, min(100.0, manage_base_score * (0.90 + 0.10 * evidence_quality))), 1)

    scenarios.append(DecisionScenario(
        action=DecisionAction.MANAGE,
        decision_score=manage_score,
        projected_tdi=round(proj_tdi_manage, 1),
        projected_tdi_trend="STABLE",
        projected_performance_loss=round(manage_perf_loss, 2),
        tyre_risk=manage_risk,
        estimated_laps_remaining=max(1, int(cliff_dist * 1.4)),
        explanation=manage_expl,
        limitations=[
            "Assumes driver executes lift-and-coast and reduced lateral slip consistently across sector 2/3.",
            "Assumes track position allows delta sacrifice without competitor overtake.",
        ],
    ))

    return scenarios

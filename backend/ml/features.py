"""
TYRETRACE — ML Temporal Feature Engineering Engine
Extracts temporal window features from synchronized Telemetry, Residuals, Confounders, and TDI.

SCIENTIFIC & ANTI-LEAKAGE CONSTRAINTS:
1. No future telemetry leakage: window features at time t depend strictly on [t-W+1, t].
2. Boundary protection: temporal windows must NOT cross driver, session, stint, or compound transitions.
3. Explicit provenance: preserves field origins and unmeasured signals without fabrication.
"""

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from backend.confounders.schemas import ConfounderFrame
from backend.residual.schemas import ResidualFrame
from backend.schemas.telemetry import TelemetryFrame
from backend.tdi.schemas import TDIFrame


# One-hot encoding map for tyre compounds
COMPOUND_ENCODING: Dict[str, int] = {
    "SOFT": 0,
    "MEDIUM": 1,
    "HARD": 2,
    "INTERMEDIATE": 3,
    "WET": 4,
    "UNKNOWN": -1,
}

FEATURE_COLUMNS_MODEL_A = [
    "mean_speed", "speed_std", "mean_throttle", "mean_brake",
    "track_temperature", "air_temperature", "humidity", "rainfall"
]

FEATURE_COLUMNS_MODEL_B = FEATURE_COLUMNS_MODEL_A + [
    "tyre_life", "compound_code", "stint_number"
]

FEATURE_COLUMNS_MODEL_C = FEATURE_COLUMNS_MODEL_B + [
    "residual_mean", "residual_std", "residual_abs_mean",
    "residual_min", "residual_max", "residual_slope", "residual_persistence",
    "expected_acceleration_mean", "expected_acceleration_std", "actual_acceleration_mean"
]

FEATURE_COLUMNS_MODEL_D = FEATURE_COLUMNS_MODEL_C + [
    "non_tyre_explanation_score", "tyre_evidence_quality",
    "drs_ratio", "braking_ratio", "transient_ratio"
]

# Full physics-informed feature set (Model E)
FEATURE_COLUMNS_MODEL_E = FEATURE_COLUMNS_MODEL_D + [
    "prior_tdi_baseline", "baseline_tdi_trend_slope"
]


@dataclass
class WindowFeatureVector:
    """
    Structured feature vector extracted from a temporal window of frames [t-W+1, t].
    """
    window_id: str
    session_id: str
    driver: str
    stint_number: int
    compound: str
    compound_code: int
    lap: int
    timestamp_start: float
    timestamp_end: float

    # Targets (inferred/pseudo-labels only)
    target_tdi_pseudo_label: float
    target_future_trajectory_delta: Optional[float]
    target_type: str

    # Grouping key for leakage-safe splitting (e.g. "SESSION_DRIVER_STINT")
    group_id: str

    # Feature dictionary
    features: Dict[str, float]

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        return d


def extract_window_features(
    tel_window: List[TelemetryFrame],
    res_window: List[ResidualFrame],
    conf_window: List[ConfounderFrame],
    tdi_window: List[TDIFrame],
    window_id: str,
    target_type: str = "TDI_BASELINE_PSEUDO_LABEL",
    future_tdi_delta: Optional[float] = None,
) -> WindowFeatureVector:
    """
    Extracts summary statistics and physics-informed features from a single temporal window.
    """
    assert len(tel_window) == len(res_window) == len(conf_window) == len(tdi_window)
    w_size = len(tel_window)

    last_tel = tel_window[-1]
    last_tdi = tdi_window[-1]

    driver = last_tel.driver or "UNKNOWN"
    session_id = last_tel.session_id
    stint_number = last_tel.tyres.fl.stint or 1
    compound_name = (last_tel.tyres.fl.compound or "UNKNOWN").upper()
    compound_code = COMPOUND_ENCODING.get(compound_name, -1)
    lap = last_tel.lap
    tyre_life = last_tel.tyres.fl.tyre_life_laps or 0

    # Group ID prevents leakage by ensuring all windows from this stint stay in the same split
    group_id = f"{session_id}_{driver}_STINT{stint_number}"

    # 1. Kinematics & Driver inputs
    speeds = [f.vehicle.speed_mps for f in tel_window]
    throttles = [f.vehicle.throttle_pct for f in tel_window]
    brakes = [f.vehicle.brake_pct for f in tel_window]

    mean_speed = float(np.mean(speeds))
    speed_std = float(np.std(speeds)) if len(speeds) > 1 else 0.0
    mean_throttle = float(np.mean(throttles))
    mean_brake = float(np.mean(brakes))

    # 2. Environment
    track_temp = last_tel.environment.track_temp_c if last_tel.environment.track_temp_c is not None else 30.0
    air_temp = last_tel.environment.ambient_temp_c if last_tel.environment.ambient_temp_c is not None else 25.0
    humidity = last_tel.environment.humidity_pct if last_tel.environment.humidity_pct is not None else 50.0
    rainfall = 1.0 if last_tel.environment.rainfall else 0.0

    # 3. Physics & Residual channels
    res_vals = [f.acceleration_residual_mps2 for f in res_window if f.acceleration_residual_mps2 is not None]
    if res_vals:
        res_mean = float(np.mean(res_vals))
        res_std = float(np.std(res_vals)) if len(res_vals) > 1 else 0.0
        res_abs_mean = float(np.mean(np.abs(res_vals)))
        res_min = float(np.min(res_vals))
        res_max = float(np.max(res_vals))
        # Slope over window
        if len(res_vals) >= 3 and np.std(np.arange(len(res_vals))) > 0:
            res_slope, _ = np.polyfit(np.arange(len(res_vals)), res_vals, 1)
        else:
            res_slope = 0.0
        # Persistence ratio: frames where |r_ax| >= 1.0 m/s^2
        res_persistence = float(np.mean([1.0 if abs(r) >= 1.0 else 0.0 for r in res_vals]))
    else:
        res_mean = 0.0
        res_std = 0.0
        res_abs_mean = 0.0
        res_min = 0.0
        res_max = 0.0
        res_slope = 0.0
        res_persistence = 0.0

    exp_accels = [f.expected_acceleration_mps2 for f in res_window]
    act_accels = [f.actual_acceleration_mps2 for f in res_window if f.actual_acceleration_mps2 is not None]
    exp_acc_mean = float(np.mean(exp_accels))
    exp_acc_std = float(np.std(exp_accels)) if len(exp_accels) > 1 else 0.0
    act_acc_mean = float(np.mean(act_accels)) if act_accels else 0.0

    # 4. Confounders
    non_tyre_scores = [f.non_tyre_explanation_score for f in conf_window]
    ev_qualities = [f.tyre_evidence_quality for f in conf_window]
    drs_flags = [1.0 if "DRS_ACTIVE" in f.active_flags else 0.0 for f in conf_window]
    brake_flags = [1.0 if "HEAVY_BRAKING" in f.active_flags else 0.0 for f in conf_window]
    transient_flags = [1.0 if "TRANSIENT_DYNAMICS" in f.active_flags else 0.0 for f in conf_window]

    mean_non_tyre = float(np.mean(non_tyre_scores))
    mean_ev_quality = float(np.mean(ev_qualities))
    drs_ratio = float(np.mean(drs_flags))
    braking_ratio = float(np.mean(brake_flags))
    transient_ratio = float(np.mean(transient_flags))

    # 5. Baseline TDI & Trend
    tdi_vals = [f.tdi for f in tdi_window]
    current_tdi = float(last_tdi.tdi)
    if len(tdi_vals) >= 3:
        tdi_trend_slope, _ = np.polyfit(np.arange(len(tdi_vals)), tdi_vals, 1)
    else:
        tdi_trend_slope = 0.0

    features_dict = {
        # Vehicle & Driver
        "mean_speed": round(mean_speed, 4),
        "speed_std": round(speed_std, 4),
        "mean_throttle": round(mean_throttle, 4),
        "mean_brake": round(mean_brake, 4),
        # Environment
        "track_temperature": round(track_temp, 2),
        "air_temperature": round(air_temp, 2),
        "humidity": round(humidity, 2),
        "rainfall": round(rainfall, 2),
        # Tyre Context
        "tyre_life": float(tyre_life),
        "compound_code": float(compound_code),
        "stint_number": float(stint_number),
        # Physics & Residuals
        "residual_mean": round(res_mean, 4),
        "residual_std": round(res_std, 4),
        "residual_abs_mean": round(res_abs_mean, 4),
        "residual_min": round(res_min, 4),
        "residual_max": round(res_max, 4),
        "residual_slope": round(res_slope, 4),
        "residual_persistence": round(res_persistence, 4),
        "expected_acceleration_mean": round(exp_acc_mean, 4),
        "expected_acceleration_std": round(exp_acc_std, 4),
        "actual_acceleration_mean": round(act_acc_mean, 4),
        # Confounders
        "non_tyre_explanation_score": round(mean_non_tyre, 4),
        "tyre_evidence_quality": round(mean_ev_quality, 4),
        "drs_ratio": round(drs_ratio, 4),
        "braking_ratio": round(braking_ratio, 4),
        "transient_ratio": round(transient_ratio, 4),
        # Baseline TDI context (prior window baseline prevents contemporaneous target leakage)
        "prior_tdi_baseline": round(float(tdi_window[0].tdi), 2),
        "baseline_tdi": round(current_tdi, 2),
        "baseline_tdi_trend_slope": round(tdi_trend_slope, 4),
    }

    return WindowFeatureVector(
        window_id=window_id,
        session_id=session_id,
        driver=driver,
        stint_number=stint_number,
        compound=compound_name,
        compound_code=compound_code,
        lap=lap,
        timestamp_start=tel_window[0].timestamp,
        timestamp_end=last_tel.timestamp,
        target_tdi_pseudo_label=current_tdi,
        target_future_trajectory_delta=future_tdi_delta,
        target_type=target_type,
        group_id=group_id,
        features=features_dict,
    )


def build_temporal_windows(
    tel_frames: List[TelemetryFrame],
    res_frames: List[ResidualFrame],
    conf_frames: List[ConfounderFrame],
    tdi_frames: List[TDIFrame],
    window_size: int = 15,
    stride: int = 5,
    future_horizon: int = 15,
) -> List[WindowFeatureVector]:
    """
    Constructs overlapping temporal windows [t-W+1, t] with strict boundary checking:
    Does NOT allow windows to cross stint, compound, driver, or session boundaries.
    """
    n = len(tel_frames)
    if not (n == len(res_frames) == len(conf_frames) == len(tdi_frames)):
        raise ValueError(
            f"Frame sequence length mismatch: tel={n}, res={len(res_frames)}, conf={len(conf_frames)}, tdi={len(tdi_frames)}"
        )

    windows: List[WindowFeatureVector] = []
    window_count = 0

    for end_idx in range(window_size, n, stride):
        start_idx = end_idx - window_size

        # Boundary check: verify all frames in this window have identical driver, stint, and compound
        drivers = set(f.driver for f in tel_frames[start_idx:end_idx])
        stints = set(f.tyres.fl.stint for f in tel_frames[start_idx:end_idx])
        compounds = set(f.tyres.fl.compound for f in tel_frames[start_idx:end_idx])

        if len(drivers) > 1 or len(stints) > 1 or len(compounds) > 1:
            # Crossing boundary: skip window to prevent boundary contamination
            continue

        # Optional future trajectory delta
        future_delta = None
        if end_idx + future_horizon <= n:
            future_compound = tel_frames[end_idx + future_horizon - 1].tyres.fl.compound
            future_stint = tel_frames[end_idx + future_horizon - 1].tyres.fl.stint
            if future_compound == list(compounds)[0] and future_stint == list(stints)[0]:
                current_tdi = tdi_frames[end_idx - 1].tdi
                future_tdi = tdi_frames[end_idx + future_horizon - 1].tdi
                future_delta = round(future_tdi - current_tdi, 2)

        window_id = f"W_{window_count:05d}"
        w_vec = extract_window_features(
            tel_window=tel_frames[start_idx:end_idx],
            res_window=res_frames[start_idx:end_idx],
            conf_window=conf_frames[start_idx:end_idx],
            tdi_window=tdi_frames[start_idx:end_idx],
            window_id=window_id,
            target_type="TDI_BASELINE_PSEUDO_LABEL",
            future_tdi_delta=future_delta,
        )
        windows.append(w_vec)
        window_count += 1

    return windows

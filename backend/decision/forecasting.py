"""
TYRETRACE — Degradation Cliff Forecasting Engine
Deterministic mathematical extrapolation estimating when the Tyre Degradation Index (TDI)
will breach critical performance thresholds.
"""

from typing import List, Optional, Tuple
import numpy as np

from backend.decision.schemas import CliffForecast


# ==============================================================================
# CONFIGURABLE CONSTANTS (MODEL PARAMETER — DEMO ASSUMPTIONS)
# ==============================================================================
DEFAULT_CLIFF_THRESHOLD: float = 75.0     # TDI threshold where tyre performance cliff begins
MIN_FORECAST_SAMPLES: int = 5             # Minimum consecutive history samples required
NOMINAL_LAP_SAMPLES: int = 100            # Approximate 10 Hz telemetry samples per lap (100 samples ~ 10s or 1 lap sector)

# Baseline nominal degradation per lap by compound (used when slope is flat/early in stint)
# MODEL PARAMETER — DEMO ASSUMPTION: empirical F1 compound wear pace
COMPOUND_NOMINAL_DEG_PER_LAP = {
    "SOFT": 2.8,
    "MEDIUM": 1.9,
    "HARD": 1.2,
    "INTERMEDIATE": 2.2,
    "WET": 1.5,
    "UNKNOWN": 2.0,
}


def estimate_degradation_cliff(
    current_tdi: float,
    current_trend: str,
    tdi_history: Optional[List[float]] = None,
    time_history: Optional[List[float]] = None,
    compound: Optional[str] = "MEDIUM",
    cliff_threshold: float = DEFAULT_CLIFF_THRESHOLD,
    evidence_quality: float = 0.80,
    min_samples: int = MIN_FORECAST_SAMPLES,
) -> CliffForecast:
    """
    Deterministically forecasts laps remaining until TDI reaches cliff_threshold.

    Mathematical Method:
      1. If current_tdi >= cliff_threshold: 0.0 laps remaining (cliff already active).
      2. If history samples < min_samples: Insufficient data -> None.
      3. Fit linear slope d(TDI)/dt over recent valid samples.
      4. Convert time slope to lap-level slope: deg_per_lap = slope_per_sec * lap_duration_sec.
         If lap duration unavailable, normalize using sample density.
      5. If slope > 0: laps_to_cliff = (cliff_threshold - current_tdi) / deg_per_lap.
      6. If slope <= 0: TDI is stable or recovering; cliff not imminent.

    Returns:
      CliffForecast model with explanation, confidence, and method.
    """
    clean_tdi = float(np.clip(current_tdi, 0.0, 100.0))
    comp_key = (compound or "MEDIUM").upper()
    nominal_deg = COMPOUND_NOMINAL_DEG_PER_LAP.get(comp_key, 2.0)

    # 1. Immediate Threshold Breach
    if clean_tdi >= cliff_threshold:
        return CliffForecast(
            current_tdi=round(clean_tdi, 2),
            current_trend=current_trend,
            threshold=cliff_threshold,
            estimated_laps_to_threshold=0.0,
            forecast_quality=round(evidence_quality, 2),
            method="THRESHOLD_SATURATED",
            explanation=f"Current TDI ({clean_tdi:.1f}) has already reached or breached critical degradation threshold ({cliff_threshold:.1f}).",
        )

    # 2. Insufficient History Guard
    if tdi_history is None or len(tdi_history) < min_samples:
        return CliffForecast(
            current_tdi=round(clean_tdi, 2),
            current_trend=current_trend,
            threshold=cliff_threshold,
            estimated_laps_to_threshold=None,
            forecast_quality=0.20,
            method="INSUFFICIENT_HISTORY",
            explanation="Insufficient TDI history for reliable degradation-cliff forecast.",
        )

    # 3. Slope Calculation
    y = np.array(tdi_history[-25:], dtype=np.float64)  # Use up to 25 most recent frames
    n = len(y)

    if time_history is not None and len(time_history) >= n:
        x = np.array(time_history[-n:], dtype=np.float64)
        dt = x[-1] - x[0]
        if dt > 0.1:
            x_norm = x - x[0]
            cov = np.sum((x_norm - np.mean(x_norm)) * (y - np.mean(y)))
            var = np.sum((x_norm - np.mean(x_norm)) ** 2)
            slope_per_sec = float(cov / var) if var > 1e-9 else 0.0
            # Assume nominal F1 lap duration ~80–90 seconds (Monza ~81s)
            deg_per_lap = slope_per_sec * 80.0
        else:
            deg_per_lap = 0.0
    else:
        # Sample-based slope (frame-to-frame)
        dy = y[-1] - y[0]
        # Extrapolate over nominal lap window of 100 frames (~10 seconds at 10Hz)
        deg_per_lap = (dy / max(1, n - 1)) * 10.0

    delta_tdi = cliff_threshold - clean_tdi

    # 4. Trajectory Assessment
    if deg_per_lap > 0.15:
        estimated_laps = delta_tdi / deg_per_lap
        # Clamp to realistic positive range
        estimated_laps = max(0.5, min(35.0, estimated_laps))
        quality = min(0.95, max(0.40, evidence_quality * (min(n, 20) / 20.0)))
        method = "LINEAR_EXTRAPOLATION_TRAJECTORY"
        explanation = (
            f"TDI projected to reach threshold ({cliff_threshold:.0f}) in approximately "
            f"{estimated_laps:.1f} laps based on active rate (+{deg_per_lap:.2f} TDI/lap)."
        )
    elif current_trend in ("RISING", "DEGRADING_SLOW", "DEGRADING_FAST"):
        # Use nominal compound rate as fallback when measured slope is noisy
        estimated_laps = max(1.0, min(35.0, delta_tdi / nominal_deg))
        quality = round(evidence_quality * 0.65, 2)
        method = "COMPOUND_NOMINAL_FALLBACK"
        explanation = (
            f"TDI degradation trend active; estimated {estimated_laps:.1f} laps to threshold "
            f"using nominal {comp_key} degradation rate (+{nominal_deg:.1f} TDI/lap)."
        )
    else:
        # Stable or improving
        estimated_laps = None
        quality = round(evidence_quality * 0.75, 2)
        method = "STABLE_NO_CLIFF"
        explanation = "TDI trajectory is stable or improving; no imminent degradation cliff projected."

    return CliffForecast(
        current_tdi=round(clean_tdi, 2),
        current_trend=current_trend,
        threshold=cliff_threshold,
        estimated_laps_to_threshold=round(estimated_laps, 1) if estimated_laps is not None else None,
        forecast_quality=round(quality, 2),
        method=method,
        explanation=explanation,
    )

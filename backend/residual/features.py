"""
TYRETRACE — Residual Features & Trend Analytics
Computes rolling window statistics, linear trend slope, persistence ratios,
and data quality confidence scores for vehicle acceleration residuals.
"""

import math
from typing import List, Optional, Tuple
import numpy as np

from backend.residual.schemas import (
    ResidualFrame,
    ResidualQualityStatus,
    ResidualTrend,
    RollingWindowFeatures,
)


def compute_linear_slope(times: List[float], residuals: List[float]) -> Optional[float]:
    """
    Computes numerically stable linear regression slope Delta r / Delta t:
        slope = sum((t_i - mean_t) * (r_i - mean_r)) / sum((t_i - mean_t)^2)
    Returns 0.0 if time variance is zero, or None if fewer than 2 valid points.
    """
    if len(times) < 2 or len(residuals) < 2 or len(times) != len(residuals):
        return None

    t_arr = np.array(times, dtype=np.float64)
    r_arr = np.array(residuals, dtype=np.float64)

    t_mean = np.mean(t_arr)
    r_mean = np.mean(r_arr)

    t_diff = t_arr - t_mean
    r_diff = r_arr - r_mean

    denominator = np.sum(t_diff ** 2)
    if denominator < 1e-9:
        return 0.0

    numerator = np.sum(t_diff * r_diff)
    slope = numerator / denominator
    return float(slope)


def compute_persistence_ratio(
    residuals: List[float],
    threshold: float = 1.0,
    absolute: bool = True,
) -> Optional[float]:
    """
    Calculates persistence ratio:
        persistence_ratio = (number of samples >= threshold) / total_valid_samples
    """
    if not residuals:
        return None

    count = 0
    for r in residuals:
        val = abs(r) if absolute else r
        if val >= threshold:
            count += 1
    return float(count / len(residuals))


def classify_trend(
    slope: Optional[float],
    residuals: List[float],
    std: Optional[float],
    slope_threshold: float = 0.08,
) -> ResidualTrend:
    """
    Classifies residual trajectory into:
        STABLE, INCREASING, DECREASING, SPIKE, or UNKNOWN.
    """
    if slope is None or len(residuals) < 3:
        return ResidualTrend.UNKNOWN

    # Check for isolated transient spike (extreme peak relative to standard deviation)
    if std is not None and std > 0.1:
        mean_r = float(np.mean(residuals))
        max_deviation = max(abs(r - mean_r) for r in residuals)
        if max_deviation > 3.5 * std and len(residuals) <= 15:
            return ResidualTrend.SPIKE

    if slope > slope_threshold:
        return ResidualTrend.INCREASING
    elif slope < -slope_threshold:
        return ResidualTrend.DECREASING
    else:
        return ResidualTrend.STABLE


def calculate_window_features(
    frames: List[ResidualFrame],
    persistence_threshold: float = 1.0,
    slope_threshold: float = 0.08,
) -> RollingWindowFeatures:
    """
    Extracts statistical and trend features from a window of ResidualFrames.
    Filters exclusively for VALID frames with non-None residuals.
    """
    window_size = len(frames)
    valid_frames = [
        f for f in frames
        if f.quality_status == ResidualQualityStatus.VALID and f.acceleration_residual_mps2 is not None
    ]
    valid_count = len(valid_frames)

    if valid_count == 0:
        return RollingWindowFeatures(
            window_size=window_size,
            sample_count=window_size,
            valid_sample_count=0,
            residual_mean=None,
            residual_std=None,
            residual_abs_mean=None,
            residual_min=None,
            residual_max=None,
            residual_slope=None,
            persistence_ratio=None,
            trend=ResidualTrend.UNKNOWN,
        )

    r_vals = [f.acceleration_residual_mps2 for f in valid_frames]
    t_vals = [f.timestamp for f in valid_frames]

    r_mean = float(np.mean(r_vals))
    r_std = float(np.std(r_vals, ddof=1)) if valid_count > 1 else 0.0
    r_abs_mean = float(np.mean(np.abs(r_vals)))
    r_min = float(np.min(r_vals))
    r_max = float(np.max(r_vals))

    r_slope = compute_linear_slope(t_vals, r_vals)
    persistence = compute_persistence_ratio(r_vals, threshold=persistence_threshold)
    trend = classify_trend(r_slope, r_vals, r_std, slope_threshold=slope_threshold)

    return RollingWindowFeatures(
        window_size=window_size,
        sample_count=window_size,
        valid_sample_count=valid_count,
        residual_mean=round(r_mean, 4),
        residual_std=round(r_std, 4),
        residual_abs_mean=round(r_abs_mean, 4),
        residual_min=round(r_min, 4),
        residual_max=round(r_max, 4),
        residual_slope=round(r_slope, 4) if r_slope is not None else None,
        persistence_ratio=round(persistence, 4) if persistence is not None else None,
        trend=trend,
    )


def calculate_residual_quality_confidence(
    total_samples: int,
    valid_samples: int,
    invalid_dt_count: int = 0,
    outlier_count: int = 0,
) -> float:
    """
    Computes residual_quality_confidence score [0.0 - 1.0] based on:
      - Valid sample fraction (valid / total)
      - Penalties for invalid timestamps or numerical outliers
    This is NOT tyre degradation confidence; it evaluates data pipeline integrity.
    """
    if total_samples <= 0:
        return 0.0

    valid_ratio = valid_samples / float(total_samples)
    outlier_penalty = min(0.30, (outlier_count / float(total_samples)) * 1.5)
    dt_penalty = min(0.20, (invalid_dt_count / float(total_samples)) * 2.0)

    score = valid_ratio - outlier_penalty - dt_penalty
    return max(0.0, min(1.0, round(float(score), 3)))

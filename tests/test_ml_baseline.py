"""
TYRETRACE — ML Baseline Model & Evaluation Tests
Tests model fitting, deterministic inference, prediction ranges, fusion, and metrics.
"""

import pytest
import numpy as np
import pandas as pd

from backend.ml.baseline_model import (
    AIDegradationPrediction,
    BaselineDegradationModel,
    calculate_model_reliability,
)
from backend.ml.evaluation import calculate_evaluation_metrics, run_ablation_study


def _make_training_dataframe(n_samples: int = 60) -> pd.DataFrame:
    rng = np.random.RandomState(42)
    rows = []
    for i in range(n_samples):
        speed = 50.0 + rng.uniform(-10, 10)
        throttle = 80.0 + rng.uniform(-15, 15)
        brake = 0.0 if rng.uniform(0, 1) > 0.3 else rng.uniform(10, 50)
        tyre_life = i // 2 + 1
        res_mean = 0.1 * tyre_life + rng.normal(0, 0.2)
        non_tyre = rng.uniform(0.1, 0.6)
        ev_quality = 1.0 - 0.5 * non_tyre
        target_tdi = float(np.clip(5.0 + 1.8 * tyre_life + 2.0 * res_mean, 0.0, 100.0))

        rows.append({
            "mean_speed": speed,
            "speed_std": 2.0,
            "mean_throttle": throttle,
            "mean_brake": brake,
            "track_temperature": 32.0,
            "air_temperature": 25.0,
            "humidity": 45.0,
            "rainfall": 0.0,
            "tyre_life": tyre_life,
            "compound_code": 1,
            "stint_number": 1,
            "residual_mean": res_mean,
            "residual_std": 0.3,
            "residual_abs_mean": abs(res_mean),
            "residual_min": res_mean - 0.5,
            "residual_max": res_mean + 0.5,
            "residual_slope": 0.05,
            "residual_persistence": 0.4,
            "expected_acceleration_mean": 1.5,
            "expected_acceleration_std": 0.2,
            "actual_acceleration_mean": 1.5 + res_mean,
            "non_tyre_explanation_score": non_tyre,
            "tyre_evidence_quality": ev_quality,
            "drs_ratio": 0.2,
            "braking_ratio": 0.1,
            "transient_ratio": 0.1,
            "baseline_tdi": target_tdi,
            "baseline_tdi_trend_slope": 0.1,
            "target_tdi": target_tdi,
        })
    return pd.DataFrame(rows)


def test_model_training():
    df = _make_training_dataframe(50)
    model = BaselineDegradationModel(model_type="random_forest", n_estimators=20, max_depth=4)
    model.fit(df, target_col="target_tdi")

    assert model.is_fitted
    assert len(model.feature_columns) > 0
    assert len(model.feature_importances_) == len(model.feature_columns)


def test_prediction_range():
    df = _make_training_dataframe(40)
    model = BaselineDegradationModel(model_type="random_forest", n_estimators=20, max_depth=4)
    model.fit(df, target_col="target_tdi")

    preds = model.predict(df)
    assert len(preds) == 40
    for p in preds:
        assert 0.0 <= p.predicted_degradation <= 100.0
        assert 0.0 <= p.final_fused_tdi <= 100.0
        assert 0.0 <= p.model_reliability <= 1.0


def test_deterministic_inference():
    df = _make_training_dataframe(30)
    model1 = BaselineDegradationModel(random_state=42)
    model1.fit(df, target_col="target_tdi")

    model2 = BaselineDegradationModel(random_state=42)
    model2.fit(df, target_col="target_tdi")

    preds1 = [p.predicted_degradation for p in model1.predict(df)]
    preds2 = [p.predicted_degradation for p in model2.predict(df)]

    assert preds1 == preds2


def test_feature_importance_validity():
    df = _make_training_dataframe(40)
    model = BaselineDegradationModel(n_estimators=30, max_depth=5, random_state=42)
    model.fit(df, target_col="target_tdi")

    total_imp = sum(model.feature_importances_.values())
    assert total_imp == pytest.approx(1.0, abs=1e-2)
    # Most important features should be tyre_life or baseline_tdi / residuals
    top_feature = list(model.feature_importances_.keys())[0]
    assert top_feature in ("tyre_life", "baseline_tdi", "residual_mean", "actual_acceleration_mean")


def test_evaluation_metrics():
    y_true = np.array([10.0, 20.0, 30.0, 40.0])
    y_pred = np.array([11.0, 19.0, 31.0, 39.0])
    ages = np.array([5, 10, 15, 20])

    metrics = calculate_evaluation_metrics(y_true, y_pred, tyre_ages=ages)
    assert metrics.mae == 1.0
    assert metrics.rmse == 1.0
    assert metrics.r2 > 0.95
    assert metrics.age_monotonicity_spearman == 1.0


def test_physics_ai_fusion():
    df = _make_training_dataframe(20)
    # Test fusion with alpha = 0.70
    model = BaselineDegradationModel(fusion_alpha=0.70)
    model.fit(df, target_col="target_tdi")

    preds = model.predict(df)
    for p in preds:
        expected_fusion = 0.70 * p.physics_tdi + 0.30 * p.predicted_degradation
        assert p.final_fused_tdi == pytest.approx(expected_fusion, abs=0.05)


def test_unseen_session_reliability():
    df_train = _make_training_dataframe(40)
    model = BaselineDegradationModel()
    model.fit(df_train, target_col="target_tdi")

    # Create an out-of-distribution row (extreme speed and high confounding)
    extreme_row = df_train.iloc[0].copy()
    extreme_row["mean_speed"] = 150.0  # Far outside training speed ~50 m/s
    extreme_row["non_tyre_explanation_score"] = 0.95  # Severe confounding
    extreme_row["tyre_evidence_quality"] = 0.20

    rel = calculate_model_reliability(
        row=extreme_row,
        feature_cols=model.feature_columns,
        train_feature_bounds=model.train_feature_bounds,
    )
    # High confounding and OOD values must produce low reliability
    assert rel < 0.25

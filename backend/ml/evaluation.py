"""
TYRETRACE — ML Evaluation & Ablation Engine
Evaluates AI model agreement with deterministic TDI pseudo-labels and runs systematic feature ablations.

SCIENTIFIC PRINCIPLE:
MAE, RMSE, and R^2 measure agreement with the deterministic TDI baseline.
They do NOT measure physical tyre wear accuracy or physical rubber loss.
"""

from dataclasses import asdict, dataclass
import logging
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from backend.ml.baseline_model import BaselineDegradationModel
from backend.ml.features import (
    FEATURE_COLUMNS_MODEL_A,
    FEATURE_COLUMNS_MODEL_B,
    FEATURE_COLUMNS_MODEL_C,
    FEATURE_COLUMNS_MODEL_D,
    FEATURE_COLUMNS_MODEL_E,
)

logger = logging.getLogger(__name__)


@dataclass
class EvaluationMetrics:
    mae: float
    rmse: float
    r2: float
    sample_count: int
    mean_prediction: float
    mean_target: float
    temporal_stability_std_delta: float
    age_monotonicity_spearman: float
    confounder_robustness_corr: float
    scientific_statement: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def calculate_evaluation_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    tyre_ages: Optional[np.ndarray] = None,
    confounder_scores: Optional[np.ndarray] = None,
) -> EvaluationMetrics:
    """
    Computes rigorous error and diagnostic metrics comparing AI predictions to TDI pseudo-labels.
    """
    assert len(y_true) == len(y_pred)
    n = len(y_true)

    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred)) if n >= 2 and np.std(y_true) > 0 else 0.0

    # Temporal stability: variability of delta predictions between consecutive steps
    if n >= 2:
        deltas = np.diff(y_pred)
        stability = float(np.std(deltas))
    else:
        stability = 0.0

    # Monotonicity with tyre age (Spearman rank correlation)
    if tyre_ages is not None and len(tyre_ages) == n and np.std(tyre_ages) > 0:
        rho, _ = spearmanr(tyre_ages, y_pred)
        age_monotonicity = float(rho) if not np.isnan(rho) else 0.0
    else:
        age_monotonicity = 0.0

    # Robustness: correlation between absolute error |y - y_pred| and non_tyre confounder score
    if confounder_scores is not None and len(confounder_scores) == n and np.std(confounder_scores) > 0:
        errors = np.abs(y_true - y_pred)
        r_conf, _ = spearmanr(confounder_scores, errors)
        conf_corr = float(r_conf) if not np.isnan(r_conf) else 0.0
    else:
        conf_corr = 0.0

    statement = (
        "Metrics quantify agreement with deterministic TDI pseudo-labels, "
        "NOT physical ground-truth rubber wear or failure probability."
    )

    return EvaluationMetrics(
        mae=round(mae, 3),
        rmse=round(rmse, 3),
        r2=round(r2, 4),
        sample_count=n,
        mean_prediction=round(float(np.mean(y_pred)), 2),
        mean_target=round(float(np.mean(y_true)), 2),
        temporal_stability_std_delta=round(stability, 3),
        age_monotonicity_spearman=round(age_monotonicity, 3),
        confounder_robustness_corr=round(conf_corr, 3),
        scientific_statement=statement,
    )


def run_ablation_study(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    target_col: str = "target_tdi",
) -> Dict[str, Dict[str, Any]]:
    """
    Executes the 5-stage ablation study:
    Model A: Raw telemetry only
    Model B: Telemetry + tyre age
    Model C: Residual features
    Model D: Residual + confounder features
    Model E: Physics-informed full feature set
    """
    ablation_configs = {
        "MODEL_A_RAW_TELEMETRY": FEATURE_COLUMNS_MODEL_A,
        "MODEL_B_TELEMETRY_TYRE_AGE": FEATURE_COLUMNS_MODEL_B,
        "MODEL_C_RESIDUAL_FEATURES": FEATURE_COLUMNS_MODEL_C,
        "MODEL_D_RESIDUAL_CONFOUNDERS": FEATURE_COLUMNS_MODEL_D,
        "MODEL_E_FULL_PHYSICS_INFORMED": FEATURE_COLUMNS_MODEL_E,
    }

    results = {}
    y_test = test_df[target_col].values
    ages = test_df["tyre_life"].values if "tyre_life" in test_df.columns else None
    conf_scores = test_df["non_tyre_explanation_score"].values if "non_tyre_explanation_score" in test_df.columns else None

    for model_name, feature_cols in ablation_configs.items():
        # Filter features present in train_df
        active_cols = [c for c in feature_cols if c in train_df.columns]
        model = BaselineDegradationModel(model_type="random_forest", n_estimators=50, max_depth=6)
        model.fit(train_df, feature_cols=active_cols, target_col=target_col)

        preds = model.predict(test_df)
        y_pred = np.array([p.predicted_degradation for p in preds])

        metrics = calculate_evaluation_metrics(
            y_true=y_test,
            y_pred=y_pred,
            tyre_ages=ages,
            confounder_scores=conf_scores,
        )

        results[model_name] = {
            "feature_count": len(active_cols),
            "mae": metrics.mae,
            "rmse": metrics.rmse,
            "r2": metrics.r2,
            "age_monotonicity": metrics.age_monotonicity_spearman,
            "top_features": list(model.feature_importances_.items())[:3],
        }

    return results

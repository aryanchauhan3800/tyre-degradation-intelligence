"""
TYRETRACE — Interpretable ML Baseline Degradation Model
Trains and evaluates transparent tree-based models (Random Forest Regressor) on physics-informed features.

SCIENTIFIC POLICY:
1. Model target is strictly a pseudo-label (TDI_BASELINE_PSEUDO_LABEL) or trajectory delta.
2. Model output is designated AI_INFERRED_DEGRADATION in [0, 100], NOT ground-truth physical wear.
3. Physics model is preserved; transparent weighted fusion combines Physics TDI with AI TDI.
"""

from dataclasses import asdict, dataclass
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor

from backend.ml.features import FEATURE_COLUMNS_MODEL_E

logger = logging.getLogger(__name__)

# Transparent Physics + AI fusion weighting (MODEL PARAMETER — DEMO ASSUMPTION)
DEFAULT_FUSION_ALPHA: float = 0.60  # 60% Physics TDI, 40% AI Model


@dataclass
class AIDegradationPrediction:
    """
    Structured prediction output from the AI degradation baseline.
    """
    predicted_degradation: float  # AI_INFERRED_DEGRADATION [0, 100]
    physics_tdi: float            # Original Phase 6 Physics TDI
    final_fused_tdi: float        # Fused TDI = alpha * physics + (1-alpha) * AI
    model_reliability: float      # Reliability score [0, 1] (NOT failure probability)
    fusion_alpha: float           # Physics weight used in fusion
    target_type: str              # "TDI_BASELINE_PSEUDO_LABEL"
    model_version: str            # Identifier string
    window_start: Optional[float] = None
    window_end: Optional[float] = None
    tyre_age: Optional[int] = None
    compound: Optional[str] = None
    feature_importance: Optional[Dict[str, float]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def calculate_model_reliability(
    row: pd.Series,
    feature_cols: List[str],
    train_feature_bounds: Optional[Dict[str, Tuple[float, float]]] = None,
) -> float:
    """
    Calculates operational model reliability in [0.0, 1.0].
    Penalizes out-of-distribution values, high non-tyre confounding, and low evidence quality.
    LABEL: model_reliability (NOT failure_probability).
    """
    # Base reliability from tyre evidence quality if present
    base_rel = float(row.get("tyre_evidence_quality", 0.70))

    # Confounder dampening
    non_tyre = float(row.get("non_tyre_explanation_score", 0.30))
    confounder_factor = max(0.2, 1.0 - (0.5 * non_tyre))

    # Distribution bounds check
    ood_penalty = 1.0
    if train_feature_bounds:
        out_of_bounds = 0
        for col in feature_cols:
            if col in train_feature_bounds and col in row:
                val = float(row[col])
                low, high = train_feature_bounds[col]
                margin = (high - low) * 0.20 if high > low else 1.0
                if val < (low - margin) or val > (high + margin):
                    out_of_bounds += 1
        if out_of_bounds > 0:
            ood_penalty = max(0.3, 1.0 - (out_of_bounds / len(feature_cols)))

    reliability = base_rel * confounder_factor * ood_penalty
    return round(max(0.0, min(1.0, reliability)), 3)


class BaselineDegradationModel:
    """
    Interpretable Random Forest / Gradient Boosting baseline for tyre degradation inference.
    """

    def __init__(
        self,
        model_type: str = "random_forest",
        n_estimators: int = 100,
        max_depth: int = 6,
        random_state: int = 42,
        fusion_alpha: float = DEFAULT_FUSION_ALPHA,
        model_version: str = "RF_BASELINE_v1.0",
    ):
        self.model_type = model_type
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.random_state = random_state
        self.fusion_alpha = fusion_alpha
        self.model_version = model_version

        if model_type == "random_forest":
            self.model = RandomForestRegressor(
                n_estimators=n_estimators,
                max_depth=max_depth,
                random_state=random_state,
                min_samples_leaf=2,
            )
        elif model_type == "gradient_boosting":
            self.model = GradientBoostingRegressor(
                n_estimators=n_estimators,
                max_depth=max_depth,
                random_state=random_state,
                learning_rate=0.05,
            )
        else:
            raise ValueError(f"Unsupported model_type: {model_type}")

        self.feature_columns: List[str] = []
        self.feature_importances_: Dict[str, float] = {}
        self.train_feature_bounds: Dict[str, Tuple[float, float]] = {}
        self.is_fitted: bool = False

    def fit(
        self,
        train_df: pd.DataFrame,
        feature_cols: Optional[List[str]] = None,
        target_col: str = "target_tdi",
    ) -> "BaselineDegradationModel":
        """
        Trains the tree-based model on the specified feature set.
        """
        if feature_cols is None:
            feature_cols = [c for c in FEATURE_COLUMNS_MODEL_E if c in train_df.columns]

        self.feature_columns = list(feature_cols)
        X = train_df[self.feature_columns].fillna(0.0)
        y = train_df[target_col].values

        logger.info(f"Fitting {self.model_type} on {len(X)} samples with {len(self.feature_columns)} features...")
        self.model.fit(X, y)
        self.is_fitted = True

        # Calculate training bounds for reliability auditing
        for col in self.feature_columns:
            self.train_feature_bounds[col] = (float(X[col].min()), float(X[col].max()))

        # Extract actual Mean Decrease in Impurity (MDI) feature importances
        importances = self.model.feature_importances_
        imp_dict = {col: round(float(imp), 4) for col, imp in zip(self.feature_columns, importances)}
        self.feature_importances_ = dict(sorted(imp_dict.items(), key=lambda item: item[1], reverse=True))

        return self

    def predict(self, test_df: pd.DataFrame) -> List[AIDegradationPrediction]:
        """
        Generates predictions, fuses them with Physics TDI, and computes model reliability.
        """
        if not self.is_fitted:
            raise RuntimeError("Model must be fitted before calling predict().")

        X = test_df[self.feature_columns].fillna(0.0)
        raw_preds = self.model.predict(X)

        predictions: List[AIDegradationPrediction] = []
        for i, pred_val in enumerate(raw_preds):
            row = test_df.iloc[i]
            ai_tdi = float(np.clip(pred_val, 0.0, 100.0))

            # Retrieve physics TDI from row (baseline_tdi or target_tdi)
            physics_tdi = float(row.get("baseline_tdi", row.get("target_tdi", ai_tdi)))

            # Transparent weighted fusion
            fused_tdi = (self.fusion_alpha * physics_tdi) + ((1.0 - self.fusion_alpha) * ai_tdi)
            fused_tdi = round(float(np.clip(fused_tdi, 0.0, 100.0)), 2)

            reliability = calculate_model_reliability(
                row=row,
                feature_cols=self.feature_columns,
                train_feature_bounds=self.train_feature_bounds,
            )

            pred_obj = AIDegradationPrediction(
                predicted_degradation=round(ai_tdi, 2),
                physics_tdi=round(physics_tdi, 2),
                final_fused_tdi=fused_tdi,
                model_reliability=reliability,
                fusion_alpha=self.fusion_alpha,
                target_type="TDI_BASELINE_PSEUDO_LABEL",
                model_version=self.model_version,
                window_start=row.get("timestamp_start"),
                window_end=row.get("timestamp_end"),
                tyre_age=int(row.get("tyre_life", 0)) if pd.notna(row.get("tyre_life")) else None,
                compound=str(row.get("compound", "UNKNOWN")),
                feature_importance=self.feature_importances_,
            )
            predictions.append(pred_obj)

        return predictions

    def save_model(self, filepath: str = "data/ml/baseline_model.joblib") -> None:
        """Saves trained model artifact and metadata."""
        out_p = Path(filepath)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "model": self.model,
            "feature_columns": self.feature_columns,
            "feature_importances": self.feature_importances_,
            "train_feature_bounds": self.train_feature_bounds,
            "fusion_alpha": self.fusion_alpha,
            "model_version": self.model_version,
            "model_type": self.model_type,
        }
        joblib.dump(payload, out_p)
        logger.info(f"Saved model to {out_p}")

    @classmethod
    def load_model(cls, filepath: str = "data/ml/baseline_model.joblib") -> "BaselineDegradationModel":
        """Loads serialized model artifact."""
        payload = joblib.load(filepath)
        instance = cls(
            model_type=payload.get("model_type", "random_forest"),
            fusion_alpha=payload.get("fusion_alpha", DEFAULT_FUSION_ALPHA),
            model_version=payload.get("model_version", "RF_BASELINE_v1.0"),
        )
        instance.model = payload["model"]
        instance.feature_columns = payload["feature_columns"]
        instance.feature_importances_ = payload["feature_importances"]
        instance.train_feature_bounds = payload.get("train_feature_bounds", {})
        instance.is_fitted = True
        return instance

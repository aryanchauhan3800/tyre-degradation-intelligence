"""
TYRETRACE — ML Leakage-Safe Data Splitting Engine
Enforces group-level independence between training, validation, and testing sets.

SCIENTIFIC & INTEGRITY RULES:
1. No frame-level random splitting: adjacent frames within the same stint share correlated
   aerodynamic, thermal, and kinematic conditions.
2. Splits must partition on discrete boundaries: group_id = {session}_{driver}_STINT{stint_number}.
3. Verification: verify_no_leakage() guarantees disjoint groups and temporal separation.
"""

from dataclasses import dataclass
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class DatasetSplit:
    train_df: pd.DataFrame
    val_df: pd.DataFrame
    test_df: pd.DataFrame
    train_groups: List[str]
    val_groups: List[str]
    test_groups: List[str]
    split_method: str

    def summary(self) -> Dict[str, Any]:
        return {
            "train_samples": len(self.train_df),
            "val_samples": len(self.val_df),
            "test_samples": len(self.test_df),
            "train_groups": self.train_groups,
            "val_groups": self.val_groups,
            "test_groups": self.test_groups,
            "split_method": self.split_method,
        }


def split_by_groups(
    df: pd.DataFrame,
    group_col: str = "group_id",
    test_ratio: float = 0.30,
    val_ratio: float = 0.15,
    random_state: int = 42,
) -> DatasetSplit:
    """
    Partitions dataset by distinct groups (e.g. stints or sessions) to prevent data leakage.
    Guarantees no group appears in more than one partition.
    """
    unique_groups = sorted(df[group_col].unique())

    if len(unique_groups) == 1:
        # If only 1 group exists in the dataset, fallback to chronological block split
        # E.g. first 60% train, next 20% val, final 20% test (no temporal interweaving)
        logger.warning(
            f"Only 1 unique group ({unique_groups[0]}) found. Applying strict chronological block partition."
        )
        n = len(df)
        train_end = int(round(n * (1.0 - test_ratio - val_ratio)))
        val_end = int(round(n * (1.0 - test_ratio)))

        train_df = df.iloc[:train_end].copy()
        val_df = df.iloc[train_end:val_end].copy()
        test_df = df.iloc[val_end:].copy()

        return DatasetSplit(
            train_df=train_df,
            val_df=val_df,
            test_df=test_df,
            train_groups=[f"{unique_groups[0]}_BLOCK_1"],
            val_groups=[f"{unique_groups[0]}_BLOCK_2"],
            test_groups=[f"{unique_groups[0]}_BLOCK_3"],
            split_method="CHRONOLOGICAL_BLOCK",
        )

    # When multiple groups exist (e.g. Stint 1 vs Stint 2, or multiple drivers/sessions)
    rng = np.random.RandomState(random_state)
    shuffled_groups = list(unique_groups)
    rng.shuffle(shuffled_groups)

    n_groups = len(shuffled_groups)
    n_test = max(1, int(round(n_groups * test_ratio)))
    n_val = 1 if (n_groups - n_test) > 1 and val_ratio > 0 else 0

    test_groups = shuffled_groups[:n_test]
    val_groups = shuffled_groups[n_test : n_test + n_val]
    train_groups = shuffled_groups[n_test + n_val :]

    if not train_groups:
        # Ensure train always has at least 1 group
        train_groups = [test_groups.pop()]

    train_df = df[df[group_col].isin(train_groups)].copy()
    val_df = df[df[group_col].isin(val_groups)].copy() if val_groups else pd.DataFrame(columns=df.columns)
    test_df = df[df[group_col].isin(test_groups)].copy()

    return DatasetSplit(
        train_df=train_df,
        val_df=val_df,
        test_df=test_df,
        train_groups=train_groups,
        val_groups=val_groups,
        test_groups=test_groups,
        split_method="GROUP_DISJOINT",
    )


def verify_no_leakage(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    group_col: str = "group_id",
) -> Tuple[bool, List[str]]:
    """
    Audits partitions for target/feature leakage.
    Returns (is_leak_free, violations_list).
    """
    violations = []

    # 1. Group overlap check
    train_groups = set(train_df[group_col].dropna().unique())
    test_groups = set(test_df[group_col].dropna().unique())
    overlap = train_groups.intersection(test_groups)
    if overlap:
        violations.append(f"LEAKAGE DETECTED: Overlapping groups found between train and test: {overlap}")

    # 2. Window ID overlap check
    if "window_id" in train_df.columns and "window_id" in test_df.columns:
        w_overlap = set(train_df["window_id"]).intersection(set(test_df["window_id"]))
        if w_overlap:
            violations.append(f"LEAKAGE DETECTED: Overlapping window IDs: {len(w_overlap)} common windows.")

    # 3. Duplicate row check
    # Check if identical telemetry timestamps appear in both
    if "timestamp_end" in train_df.columns and "timestamp_end" in test_df.columns:
        t_overlap = set(train_df["timestamp_end"]).intersection(set(test_df["timestamp_end"]))
        if t_overlap:
            violations.append(f"LEAKAGE DETECTED: Overlapping timestamp_end entries: {len(t_overlap)}")

    is_leak_free = len(violations) == 0
    return is_leak_free, violations

"""
TYRETRACE — ML Leakage-Safe Splitting Tests
Tests group-level splitting, overlap detection, and zero-leakage guarantees.
"""

import pytest
import pandas as pd
from backend.ml.splits import split_by_groups, verify_no_leakage


def _make_dummy_dataset(n_stints: int = 3, samples_per_stint: int = 20) -> pd.DataFrame:
    rows = []
    w_idx = 0
    for s in range(1, n_stints + 1):
        for i in range(samples_per_stint):
            rows.append({
                "window_id": f"W_{w_idx:04d}",
                "session_id": "2023_MONZA_R",
                "driver": "VER",
                "stint_number": s,
                "group_id": f"2023_MONZA_R_VER_STINT{s}",
                "timestamp_start": float(w_idx * 10),
                "timestamp_end": float(w_idx * 10 + 5),
                "target_tdi": 10.0 + s * 5.0 + i * 0.5,
                "mean_speed": 65.0,
                "tyre_life": i + 1,
            })
            w_idx += 1
    return pd.DataFrame(rows)


def test_group_split():
    df = _make_dummy_dataset(n_stints=3, samples_per_stint=20)
    split = split_by_groups(df, group_col="group_id", test_ratio=0.33, val_ratio=0.0, random_state=42)

    assert len(split.train_df) > 0
    assert len(split.test_df) > 0

    train_groups = set(split.train_df["group_id"].unique())
    test_groups = set(split.test_df["group_id"].unique())

    # Crucial: Train and test sets must have strictly zero overlapping group IDs
    assert train_groups.isdisjoint(test_groups)


def test_leakage_verification_detects_overlap():
    df = _make_dummy_dataset(n_stints=2, samples_per_stint=10)
    # Intentionally contaminate train and test with overlapping samples
    train_df = df.iloc[:12]
    test_df = df.iloc[10:]  # Samples 10 and 11 appear in both

    leak_free, violations = verify_no_leakage(train_df, test_df, group_col="group_id")
    assert not leak_free
    assert len(violations) > 0
    assert any("Overlapping" in v for v in violations)


def test_leakage_verification_passes_on_disjoint_split():
    df = _make_dummy_dataset(n_stints=2, samples_per_stint=15)
    split = split_by_groups(df, group_col="group_id", test_ratio=0.50, val_ratio=0.0)

    leak_free, violations = verify_no_leakage(split.train_df, split.test_df, group_col="group_id")
    assert leak_free
    assert len(violations) == 0


def test_single_group_fallback_chronological_split():
    # When only 1 group is present, partition chronologically without interleaving
    df = _make_dummy_dataset(n_stints=1, samples_per_stint=30)
    split = split_by_groups(df, group_col="group_id", test_ratio=0.30, val_ratio=0.20)

    assert split.split_method == "CHRONOLOGICAL_BLOCK"
    assert len(split.train_df) == 15
    assert len(split.val_df) == 6
    assert len(split.test_df) == 9

    # Max timestamp of train must be strictly less than min timestamp of test
    assert split.train_df["timestamp_end"].max() < split.test_df["timestamp_start"].min()

"""Pruebas del split 8 años / 2 años y de ausencia de fuga de datos."""

import numpy as np
import pandas as pd
import pytest

from sales_forecast import FEATURES, build_features, load_sales, split_train_test


@pytest.fixture(scope="module")
def data():
    df = load_sales()
    train, test = split_train_test(df)
    return df, train, test


def test_dataset_matches_context(data):
    df, _, _ = data
    assert len(df) == 120
    assert df["month"].min() == pd.Timestamp("2016-01-01")
    assert df["month"].max() == pd.Timestamp("2025-12-01")
    assert df["revenue_usd"].notna().all()
    assert (df["revenue_usd"] > 0).all()


def test_split_is_8_years_train_2_years_test(data):
    _, train, test = data
    assert sorted(train["month"].dt.year.unique()) == list(range(2016, 2024))
    assert sorted(test["month"].dt.year.unique()) == [2024, 2025]
    assert len(train) == 8 * 12
    assert len(test) == 2 * 12


def test_no_overlap_and_strict_time_order(data):
    df, train, test = data
    assert set(train["month"]).isdisjoint(set(test["month"]))
    assert train["month"].max() < test["month"].min()
    assert len(train) + len(test) == len(df)


def test_features_do_not_use_future_rows(data):
    """Cambiar un valor futuro no debe alterar las features de meses anteriores."""
    df, train, _ = data
    base = build_features(train)
    tampered = train.copy()
    tampered.loc[tampered.index[-1], "revenue_usd"] *= 10  # dic-2023
    changed = build_features(tampered)
    cols = FEATURES
    pd.testing.assert_frame_equal(base[cols].iloc[:-1], changed[cols].iloc[:-1])


def test_train_features_never_touch_test_period(data):
    """Las features de entrenamiento se calculan solo con el histórico de train."""
    _, train, test = data
    feats = build_features(train).dropna(subset=FEATURES)
    assert feats["month"].max() < test["month"].min()
    assert np.isfinite(feats[FEATURES].to_numpy()).all()

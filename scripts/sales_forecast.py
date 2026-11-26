"""
Predicción de ventas de Nexova Solutions con un modelo de regresión.

Ticket: "Modelo de predicción de ventas" (RFI de Finanzas).
Dataset: data/raw/nexova_sales.csv (ver docs/sales-forecast/CONTEXT-nexova-sales.es.md)

Uso (desde la raíz del monorepo):
    uv run python scripts/sales_forecast.py

Salidas en docs/sales-forecast/:
    - metrics.json             métricas sobre el conjunto de prueba (2024-2025)
    - forecast_test.csv        real vs predicción + banda P10-P90 por mes
    - forecast_vs_real.png     visualización de la predicción con su rango de variabilidad

---------------------------------------------------------------------------
ELECCIÓN DEL ALGORITMO: Random Forest (RandomForestRegressor de scikit-learn)
---------------------------------------------------------------------------
Criterios:
  1. Tamaño de datos: solo 120 filas mensuales (96 de entrenamiento). Con tan
     pocos datos, XGBoost tiende a sobreajustar si no se ajusta con cuidado
     (learning_rate, max_depth, n_estimators, regularización). Random Forest,
     al promediar muchos árboles entrenados con bootstrap, es robusto "de serie".
  2. Explicabilidad: el stakeholder es Finanzas/Dirección (Laura y Marcos).
     "Promediamos 500 árboles de decisión que han visto meses parecidos" se
     explica en una reunión; el boosting secuencial que corrige errores, no tanto.
     Además RF da importancias de variables fáciles de leer.
  3. Rango de variabilidad gratis: cada árbol del bosque da su propia
     predicción, así que los percentiles P10-P90 entre árboles dan una banda de
     incertidumbre sin modelos extra. Es justo lo que pide el tech lead.
  4. Tiempo de ajuste: RF funciona bien con hiperparámetros razonables, sin
     búsqueda exhaustiva. XGBoost se entrena también como referencia (misma
     validación) para comprobar que no estamos dejando precisión importante
     sobre la mesa — ver "benchmark_xgboost" en metrics.json.

Limitación conocida de los árboles: no extrapolan tendencias (nunca predicen
un valor mayor que los vistos en entrenamiento). Como Nexova crece cada año,
el modelo NO predice el ingreso en USD directamente, sino el RATIO entre el
ingreso del mes y el ingreso del mismo mes del año anterior (crecimiento
interanual, lag 12). Ese ratio sí es estable en el tiempo (entre ~1.01 y
~1.07 según el CONTEXT), y luego se reconstruye: pred_usd = ratio * lag_12.

Variables excluidas a propósito: active_contracts y avg_contract_value_usd del
MISMO mes. revenue_usd = active_contracts * avg_contract_value_usd (comprobado,
ratio ~1.000), así que usarlas sería fuga de información: no se conocen antes
de que termine el mes que queremos predecir. Solo se usan sus valores pasados.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

SEED = 42
ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "raw" / "nexova_sales.csv"
OUT_DIR = ROOT / "docs" / "sales-forecast"

EXPECTED_COLUMNS = ["month", "revenue_usd", "active_contracts", "avg_contract_value_usd", "business_line"]
TRAIN_YEARS = 8
TEST_YEARS = 2

FEATURES = [
    "month_sin",
    "month_cos",
    "is_august",
    "is_jan_feb",
    "yoy_lag_12",  # crecimiento interanual observado hace 12 meses
    "ratio_lag1_lag13",  # crecimiento interanual del mes anterior
    "ratio_lag12_roll12",  # peso estacional del mes el año pasado
    "contracts_lag_12",
    "acv_lag_12",
]
TARGET = "yoy_ratio"


# ---------------------------------------------------------------------------
# 1. Carga y limpieza
# ---------------------------------------------------------------------------
def load_sales(path: Path = DATA_PATH) -> pd.DataFrame:
    """Carga el CSV, valida columnas contra el CONTEXT y trata nulos."""
    df = pd.read_csv(path)
    missing = set(EXPECTED_COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"Faltan columnas descritas en el CONTEXT: {sorted(missing)}")

    df = df[df["business_line"] == "consolidated"].copy()
    df["month"] = pd.to_datetime(df["month"], format="%Y-%m-%d")
    df = df.sort_values("month").drop_duplicates("month").set_index("month")

    # Restricción del CONTEXT: no puede faltar ningún mes del rango.
    full_range = pd.date_range(df.index.min(), df.index.max(), freq="MS")
    df = df.reindex(full_range)
    df.index.name = "month"
    df["business_line"] = "consolidated"

    num_cols = ["revenue_usd", "active_contracts", "avg_contract_value_usd"]
    # revenue_usd <= 0 no es válido según el CONTEXT: se trata como nulo.
    df.loc[df["revenue_usd"] <= 0, "revenue_usd"] = np.nan
    # Interpolación temporal (solo usa vecinos del propio histórico); si el
    # dataset viene completo (caso actual) esto no modifica nada.
    df[num_cols] = df[num_cols].interpolate(method="time", limit_direction="both")
    return df.reset_index()


# ---------------------------------------------------------------------------
# 2. Split temporal 8 años / 2 años
# ---------------------------------------------------------------------------
def split_train_test(df: pd.DataFrame, train_years: int = TRAIN_YEARS, test_years: int = TEST_YEARS):
    """Primeros `train_years` años -> train, últimos `test_years` años -> test.

    Split por año calendario y sin barajar: el modelo nunca ve 2024-2025.
    """
    years = sorted(df["month"].dt.year.unique())
    if len(years) < train_years + test_years:
        raise ValueError(f"Se necesitan {train_years + test_years} años, hay {len(years)}")
    test_years_set = years[-test_years:]
    train_years_set = years[-(train_years + test_years) : -test_years]
    train = df[df["month"].dt.year.isin(train_years_set)].copy()
    test = df[df["month"].dt.year.isin(test_years_set)].copy()
    return train.reset_index(drop=True), test.reset_index(drop=True)


# ---------------------------------------------------------------------------
# 3. Features causales (solo usan el pasado)
# ---------------------------------------------------------------------------
def build_features(history: pd.DataFrame) -> pd.DataFrame:
    """Construye features a partir de una serie ordenada por mes.

    Todas las features de una fila t usan valores de t-1 o anteriores
    (shift >= 1), salvo las de calendario, que se conocen de antemano.
    """
    h = history.sort_values("month").reset_index(drop=True).copy()
    rev = h["revenue_usd"]
    m = h["month"].dt.month

    h["month_sin"] = np.sin(2 * np.pi * m / 12)
    h["month_cos"] = np.cos(2 * np.pi * m / 12)
    h["is_august"] = (m == 8).astype(int)
    h["is_jan_feb"] = m.isin([1, 2]).astype(int)

    lag1, lag12, lag13, lag24 = rev.shift(1), rev.shift(12), rev.shift(13), rev.shift(24)
    roll12_at_lag12 = rev.shift(12).rolling(12).mean()

    h["lag_12"] = lag12
    h["yoy_lag_12"] = lag12 / lag24
    h["ratio_lag1_lag13"] = lag1 / lag13
    h["ratio_lag12_roll12"] = lag12 / roll12_at_lag12
    h["contracts_lag_12"] = h["active_contracts"].shift(12)
    h["acv_lag_12"] = h["avg_contract_value_usd"].shift(12)

    h[TARGET] = rev / lag12
    return h


def make_model() -> Pipeline:
    """Escalado + Random Forest con semilla fija.

    El StandardScaler no cambia las particiones de un árbol, pero lo pide el
    ticket y deja el pipeline listo si se cambia a un modelo sensible a la
    escala (p. ej. regresión lineal) para comparar.
    """
    return Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "rf",
                RandomForestRegressor(
                    n_estimators=500,
                    max_depth=6,
                    min_samples_leaf=2,
                    random_state=SEED,
                    n_jobs=-1,
                ),
            ),
        ]
    )


def make_xgb() -> Pipeline:
    return Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "xgb",
                XGBRegressor(
                    n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=SEED
                ),
            ),
        ]
    )


# ---------------------------------------------------------------------------
# 4. Predicción recursiva sobre los 24 meses de prueba
# ---------------------------------------------------------------------------
def recursive_forecast(model: Pipeline, train: pd.DataFrame, test: pd.DataFrame, with_band: bool = True):
    """Predice 2024-01 ... 2025-12 mes a mes SIN mirar los valores reales de test.

    Cada predicción se añade al histórico y alimenta los lags del mes
    siguiente, igual que pasaría en producción ("¿cuánto venderemos en los
    próximos 24 meses?"). Para los meses 13-24 el lag_12 ya es una predicción,
    así que el error se acumula: es la evaluación honesta que pide el tech lead.
    """
    history = train[["month", "revenue_usd", "active_contracts", "avg_contract_value_usd"]].copy()
    rows = []
    trees = model.named_steps["rf"].estimators_ if with_band else None
    scaler = model.named_steps["scaler"]

    for month in test["month"]:
        # Solo usamos 'month' de la fila de test; el resto se deja en NaN.
        placeholder = pd.DataFrame(
            {"month": [month], "revenue_usd": [np.nan], "active_contracts": [np.nan], "avg_contract_value_usd": [np.nan]}
        )
        feats = build_features(pd.concat([history, placeholder], ignore_index=True)).iloc[[-1]]
        X = feats[FEATURES]
        ratio = float(model.predict(X)[0])
        base = float(feats["lag_12"].iloc[0])
        row = {"month": month, "pred_usd": ratio * base}

        if with_band:
            Xs = scaler.transform(X)
            per_tree = np.array([t.predict(Xs)[0] for t in trees]) * base
            row["p10_usd"], row["p90_usd"] = np.percentile(per_tree, [10, 90])
        rows.append(row)

        # Contratos y ACV futuros tampoco se conocen: se arrastran los del año anterior.
        prev = history.iloc[-12]
        history = pd.concat(
            [
                history,
                pd.DataFrame(
                    {
                        "month": [month],
                        "revenue_usd": [row["pred_usd"]],
                        "active_contracts": [prev["active_contracts"]],
                        "avg_contract_value_usd": [prev["avg_contract_value_usd"]],
                    }
                ),
            ],
            ignore_index=True,
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 5. Métricas
# ---------------------------------------------------------------------------
def psi(expected: np.ndarray, actual: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index entre dos distribuciones.

    Bins por cuantiles de `expected`. <0.1 estable, 0.1-0.25 cambio moderado,
    >0.25 cambio significativo.
    """
    expected, actual = np.asarray(expected, float), np.asarray(actual, float)
    edges = np.unique(np.quantile(expected, np.linspace(0, 1, bins + 1)))
    edges[0], edges[-1] = -np.inf, np.inf
    e = np.histogram(expected, edges)[0] / len(expected)
    a = np.histogram(actual, edges)[0] / len(actual)
    e, a = np.clip(e, 1e-6, None), np.clip(a, 1e-6, None)
    return float(np.sum((a - e) * np.log(a / e)))


def gini_normalized(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Gini normalizado: ¿ordena el modelo los meses de peor a mejor como la realidad?

    1 = ordena los meses exactamente igual que la realidad; 0 = como al azar.
    """

    def _gini(actual, pred):
        order = np.argsort(-np.asarray(pred), kind="mergesort")
        a = np.asarray(actual, float)[order]
        cum = np.cumsum(a) / a.sum()
        n = len(a)
        return cum.sum() / n - (n + 1) / (2 * n)

    return float(_gini(y_true, y_pred) / _gini(y_true, y_true))


def compute_metrics(test: pd.DataFrame, fc: pd.DataFrame, train: pd.DataFrame) -> dict:
    y, p = test["revenue_usd"].to_numpy(), fc["pred_usd"].to_numpy()
    mse = mean_squared_error(y, p)
    mean_rev = float(y.mean())
    inside = ((y >= fc["p10_usd"]) & (y <= fc["p90_usd"])).mean()
    return {
        "mse_usd2": round(mse, 2),
        "rmse_usd": round(float(np.sqrt(mse)), 2),
        "rmse_pct_of_mean_revenue": round(100 * np.sqrt(mse) / mean_rev, 2),
        "mse_pct_of_mean_revenue_squared": round(100 * mse / mean_rev**2, 4),
        "mape_pct": round(100 * mean_absolute_percentage_error(y, p), 2),
        "r2_score": round(float(r2_score(y, p)), 4),
        "gini_normalized": round(gini_normalized(y, p), 4),
        "psi_pred_vs_real_test": round(psi(y, p), 4),
        "psi_revenue_train_vs_test": round(psi(train["revenue_usd"], y), 4),
        "band_p10_p90_coverage_pct": round(100 * float(inside), 1),
        "mean_monthly_revenue_test_usd": round(mean_rev, 2),
    }


# ---------------------------------------------------------------------------
# 6. Visualización
# ---------------------------------------------------------------------------
def plot_forecast(train: pd.DataFrame, test: pd.DataFrame, fc: pd.DataFrame, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(12, 5.5))
    last_train = train.tail(24)
    ax.plot(last_train["month"], last_train["revenue_usd"] / 1e3, color="#9aa0a6", lw=1.5, label="Histórico (entrenamiento)")
    ax.plot(test["month"], test["revenue_usd"] / 1e3, color="#1a1a1a", lw=2, marker="o", ms=4, label="Real 2024-2025 (prueba)")
    ax.plot(fc["month"], fc["pred_usd"] / 1e3, color="#2563eb", lw=2, ls="--", marker="s", ms=4, label="Predicción Random Forest")
    ax.fill_between(fc["month"], fc["p10_usd"] / 1e3, fc["p90_usd"] / 1e3, color="#2563eb", alpha=0.18, label="Rango de variabilidad P10-P90")
    ax.axvline(test["month"].iloc[0], color="#dc2626", lw=1, ls=":")
    ax.text(test["month"].iloc[0], ax.get_ylim()[1] * 0.98, "  inicio prueba", color="#dc2626", va="top", fontsize=9)
    ax.set_title("Nexova — Ingresos mensuales consolidados: predicción vs real (2 años de prueba)")
    ax.set_ylabel("Ingresos (miles de USD)")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper left", fontsize=9)
    fig.tight_layout()
    fig.savefig(path, dpi=80)
    plt.close(fig)
    # PNG ligero para el repo: paleta de 16 colores.
    from PIL import Image

    Image.open(path).convert("RGB").quantize(16).save(path, optimize=True)


# ---------------------------------------------------------------------------
def main() -> dict:
    np.random.seed(SEED)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    df = load_sales()
    train, test = split_train_test(df)

    train_feats = build_features(train).dropna(subset=FEATURES + [TARGET])
    X_train, y_train = train_feats[FEATURES], train_feats[TARGET]

    model = make_model().fit(X_train, y_train)
    fc = recursive_forecast(model, train, test)
    metrics = compute_metrics(test, fc, train)

    # Benchmark XGBoost con exactamente el mismo protocolo (sin banda).
    xgb = make_xgb().fit(X_train, y_train)
    xgb_fc = recursive_forecast(xgb, train, test, with_band=False)
    y = test["revenue_usd"].to_numpy()
    metrics["benchmark_xgboost"] = {
        "rmse_pct_of_mean_revenue": round(100 * np.sqrt(mean_squared_error(y, xgb_fc["pred_usd"])) / y.mean(), 2),
        "mape_pct": round(100 * mean_absolute_percentage_error(y, xgb_fc["pred_usd"]), 2),
        "r2_score": round(float(r2_score(y, xgb_fc["pred_usd"])), 4),
        "gini_normalized": round(gini_normalized(y, xgb_fc["pred_usd"].to_numpy()), 4),
    }

    # Línea base ingenua estacional: "este mes = mismo mes del año pasado".
    # Si el modelo no la mejora, no aporta valor a Finanzas.
    naive = df.set_index("month")["revenue_usd"].shift(12).loc[test["month"]].to_numpy().copy()
    naive[12:] = naive[:12]  # el 2º año de prueba no puede usar valores reales de 2024
    metrics["baseline_seasonal_naive"] = {
        "rmse_pct_of_mean_revenue": round(100 * np.sqrt(mean_squared_error(y, naive)) / y.mean(), 2),
        "mape_pct": round(100 * mean_absolute_percentage_error(y, naive), 2),
        "r2_score": round(float(r2_score(y, naive)), 4),
    }

    importances = dict(zip(FEATURES, model.named_steps["rf"].feature_importances_.round(4).tolist()))
    metrics["feature_importances"] = dict(sorted(importances.items(), key=lambda kv: -kv[1]))
    metrics["split"] = {
        "train": f"{train['month'].min():%Y-%m} a {train['month'].max():%Y-%m} ({len(train)} meses)",
        "test": f"{test['month'].min():%Y-%m} a {test['month'].max():%Y-%m} ({len(test)} meses)",
        "train_rows_used_after_lags": int(len(train_feats)),
    }
    metrics["seed"] = SEED

    out = test[["month", "revenue_usd"]].merge(fc, on="month")
    out["error_pct"] = 100 * (out["pred_usd"] - out["revenue_usd"]) / out["revenue_usd"]
    num = out.select_dtypes("number").columns
    out[num] = out[num].round(2)
    out.to_csv(OUT_DIR / "forecast_test.csv", index=False, date_format="%Y-%m")
    (OUT_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    plot_forecast(train, test, fc, OUT_DIR / "forecast_vs_real.png")

    print(json.dumps(metrics, indent=2, ensure_ascii=False))
    return metrics


if __name__ == "__main__":
    main()

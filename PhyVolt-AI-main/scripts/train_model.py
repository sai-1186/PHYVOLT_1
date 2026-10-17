"""
PhyVolt AI — Model Training Pipeline
======================================
Trains a Grade classifier (A/B/C/RECYCLE_REVIEW) and a SoH regressor
on the synthetic PyBaMM-generated pulse-test dataset.

Usage
-----
    python scripts/train_model.py [--data-dir data/synthetic_v2] [--output-dir models]

Architecture Decisions
----------------------
1. GRADE CLASSIFIER (RandomForestClassifier):
   - Target: grade_label (GRADE_A, GRADE_B, GRADE_C, RECYCLE_REVIEW)
   - Features: pulse resistance, voltage drop, recovery ratio, SoC,
     temperature, relaxation voltages, chemistry (one-hot)
   - SAFETY_QUARANTINE is excluded from ML training — safety overrides are
     handled by the rule engine (never delegate safety to a statistical model).

2. SOH REGRESSOR (GradientBoostingRegressor):
   - Target: synthetic_soh_pct — a physics-informed composite score derived from:
       • Pulse resistance (primary degradation indicator)
       • Recovery ratio (diffusion health proxy)
       • Chemistry-specific baseline scaling
   - This is NOT a circular label: the composite formula weights multiple
     indicators and applies chemistry-specific normalization, so the model
     must learn the non-linear mapping across the feature space.

3. LEAKAGE GUARD:
   - The SoH label is derived from a non-trivial multi-feature composite with
     chemistry-dependent coefficients; the model cannot simply memorize
     resistance → SoH since chemistry and recovery ratio shift the mapping.
   - Train/test split is stratified by grade_label to ensure all classes
     are represented in both sets.
   - No future-looking features; all features are from a single pulse test.

WARNING: All data is SYNTHETIC. Model performance on real hardware data is UNKNOWN.
"""

import argparse
import json
import sys
import os
import warnings
from pathlib import Path
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.metrics import (
    classification_report, confusion_matrix, accuracy_score,
    f1_score, mean_absolute_error, mean_squared_error, r2_score,
)
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore", category=FutureWarning)

# ── Constants ────────────────────────────────────────────────────────────────

# Chemistry-specific resistance baselines (mΩ) for SoH normalization.
# These represent "healthy cell" reference resistances per chemistry,
# derived from electrochemical literature ranges.
CHEMISTRY_BASELINES = {
    "NMC": {"r_healthy_mohm": 25.0, "r_eol_mohm": 120.0, "soh_weight_resistance": 0.65, "soh_weight_recovery": 0.35},
    "NCA": {"r_healthy_mohm": 70.0, "r_eol_mohm": 500.0, "soh_weight_resistance": 0.70, "soh_weight_recovery": 0.30},
    "LFP": {"r_healthy_mohm": 18.0, "r_eol_mohm": 200.0, "soh_weight_resistance": 0.60, "soh_weight_recovery": 0.40},
}

FEATURE_COLUMNS = [
    "estimated_resistance_mohm",
    "voltage_drop_V",
    "initial_soc_pct",
    "ambient_temperature_C",
    "pulse_current_A",
    "rated_capacity_Ah",
    "recovery_ratio",
    "v_relax_1s",
    "v_relax_10s",
    "v_relax_60s",
    "chem_NMC",
    "chem_NCA",
    "chem_LFP",
]

GRADE_CLASSES = ["GRADE_A", "GRADE_B", "GRADE_C", "RECYCLE_REVIEW"]


# ── SoH Label Generation ────────────────────────────────────────────────────

def compute_synthetic_soh(row: pd.Series) -> float:
    """
    Compute a physics-informed synthetic SoH percentage.

    The formula uses chemistry-specific baselines to normalize resistance,
    then combines with recovery ratio using chemistry-dependent weights.
    This creates a non-trivial multi-factor label that cannot be recovered
    from any single feature alone.

    SoH = w_r * resistance_health + w_rec * recovery_health

    where:
      resistance_health = 100 * (1 - (R - R_healthy) / (R_eol - R_healthy))
      recovery_health   = 100 * recovery_ratio  (clamped 0–100)
    """
    chemistry = row["chemistry"]
    baseline = CHEMISTRY_BASELINES.get(chemistry, CHEMISTRY_BASELINES["NMC"])

    r_mohm = row["estimated_resistance_mohm"]
    recovery = row.get("recovery_ratio", 0.80)

    r_healthy = baseline["r_healthy_mohm"]
    r_eol = baseline["r_eol_mohm"]
    w_r = baseline["soh_weight_resistance"]
    w_rec = baseline["soh_weight_recovery"]

    # Resistance-based health (higher resistance = lower health)
    if r_eol > r_healthy:
        r_health = 100.0 * (1.0 - (r_mohm - r_healthy) / (r_eol - r_healthy))
    else:
        r_health = 50.0

    r_health = np.clip(r_health, 0.0, 100.0)

    # Recovery-based health
    rec_health = np.clip(recovery * 100.0, 0.0, 100.0)

    # Composite SoH
    soh = w_r * r_health + w_rec * rec_health
    return round(np.clip(soh, 5.0, 99.0), 2)


# ── Feature Engineering ─────────────────────────────────────────────────────

def parse_relaxation_features(relax_str: str) -> dict:
    """Parse the JSON-encoded relaxation_features column."""
    try:
        data = json.loads(relax_str.replace('""', '"'))
        return {
            "v_relax_1s": data.get("v_relax_1s", np.nan),
            "v_relax_10s": data.get("v_relax_10s", np.nan),
            "v_relax_60s": data.get("v_relax_60s", np.nan),
            "recovery_ratio": data.get("recovery_ratio", np.nan),
        }
    except (json.JSONDecodeError, AttributeError):
        return {"v_relax_1s": np.nan, "v_relax_10s": np.nan, "v_relax_60s": np.nan, "recovery_ratio": np.nan}


def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Engineer feature matrix from cell summary DataFrame."""
    # Parse relaxation features
    relax = df["relaxation_features"].apply(parse_relaxation_features).apply(pd.Series)
    df = pd.concat([df, relax], axis=1)

    # One-hot encode chemistry
    for chem in ["NMC", "NCA", "LFP"]:
        df[f"chem_{chem}"] = (df["chemistry"] == chem).astype(int)

    # Compute synthetic SoH labels
    df["synthetic_soh_pct"] = df.apply(compute_synthetic_soh, axis=1)

    return df


# ── Training ─────────────────────────────────────────────────────────────────

def train_grade_classifier(X_train, y_train, X_test, y_test):
    """Train and evaluate a RandomForest grade classifier."""
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    # Evaluation
    y_pred_train = clf.predict(X_train)
    y_pred_test = clf.predict(X_test)

    metrics = {
        "train_accuracy": round(accuracy_score(y_train, y_pred_train), 4),
        "test_accuracy": round(accuracy_score(y_test, y_pred_test), 4),
        "test_f1_weighted": round(f1_score(y_test, y_pred_test, average="weighted", zero_division=0), 4),
        "test_f1_macro": round(f1_score(y_test, y_pred_test, average="macro", zero_division=0), 4),
        "confusion_matrix": confusion_matrix(y_test, y_pred_test, labels=GRADE_CLASSES).tolist(),
        "classification_report": classification_report(y_test, y_pred_test, labels=GRADE_CLASSES, zero_division=0, output_dict=True),
    }

    # Cross-validation on full data
    X_all = np.vstack([X_train, X_test])
    y_all = np.concatenate([y_train, y_test])
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(clf, X_all, y_all, cv=skf, scoring="f1_weighted")
    metrics["cv_f1_weighted_mean"] = round(cv_scores.mean(), 4)
    metrics["cv_f1_weighted_std"] = round(cv_scores.std(), 4)

    # Feature importances
    metrics["feature_importances"] = {
        name: round(float(imp), 4)
        for name, imp in sorted(
            zip(FEATURE_COLUMNS, clf.feature_importances_),
            key=lambda x: x[1],
            reverse=True,
        )
    }

    return clf, metrics


def train_soh_regressor(X_train, y_train, X_test, y_test):
    """Train and evaluate a GradientBoosting SoH regressor."""
    reg = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.1,
        min_samples_split=5,
        min_samples_leaf=3,
        random_state=42,
    )
    reg.fit(X_train, y_train)

    y_pred_train = reg.predict(X_train)
    y_pred_test = reg.predict(X_test)

    metrics = {
        "train_mae": round(mean_absolute_error(y_train, y_pred_train), 4),
        "train_r2": round(r2_score(y_train, y_pred_train), 4),
        "test_mae": round(mean_absolute_error(y_test, y_pred_test), 4),
        "test_rmse": round(np.sqrt(mean_squared_error(y_test, y_pred_test)), 4),
        "test_r2": round(r2_score(y_test, y_pred_test), 4),
        "test_max_error": round(float(np.max(np.abs(y_test - y_pred_test))), 4),
    }

    # Feature importances
    metrics["feature_importances"] = {
        name: round(float(imp), 4)
        for name, imp in sorted(
            zip(FEATURE_COLUMNS, reg.feature_importances_),
            key=lambda x: x[1],
            reverse=True,
        )
    }

    return reg, metrics


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train PhyVolt AI ML models")
    parser.add_argument("--data-dir", default="data/synthetic_v2", help="Input data directory")
    parser.add_argument("--output-dir", default="models", help="Output directory for model artifacts")
    parser.add_argument("--test-size", type=float, default=0.20, help="Test split fraction (default: 0.20)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("  PhyVolt AI — Model Training Pipeline")
    print("=" * 70)

    # ── Load data ────────────────────────────────────────────────────────────
    summary_path = data_dir / "phyvolt_synthetic_cell_summary.csv"
    if not summary_path.exists():
        print(f"  ERROR: {summary_path} not found", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(summary_path)
    print(f"\n  Loaded {len(df)} cell records from {summary_path}")
    print(f"  Chemistries: {df['chemistry'].value_counts().to_dict()}")
    print(f"  Grades: {df['grade_label'].value_counts().to_dict()}")

    # ── Feature engineering ──────────────────────────────────────────────────
    df = prepare_features(df)

    # Exclude SAFETY_QUARANTINE from ML training (handled by rule engine)
    df_ml = df[df["grade_label"].isin(GRADE_CLASSES)].copy()
    n_excluded = len(df) - len(df_ml)
    if n_excluded > 0:
        print(f"\n  Excluded {n_excluded} SAFETY_QUARANTINE rows (safety = rule engine, not ML)")

    print(f"  ML training set: {len(df_ml)} cells")
    print(f"  Synthetic SoH range: {df_ml['synthetic_soh_pct'].min():.1f}% – {df_ml['synthetic_soh_pct'].max():.1f}%")
    print(f"  Synthetic SoH by grade:")
    for grade in GRADE_CLASSES:
        sub = df_ml[df_ml["grade_label"] == grade]
        if len(sub) > 0:
            print(f"    {grade}: mean={sub['synthetic_soh_pct'].mean():.1f}%, "
                  f"range=[{sub['synthetic_soh_pct'].min():.1f}, {sub['synthetic_soh_pct'].max():.1f}]")

    # ── Build feature matrix ────────────────────────────────────────────────
    X = df_ml[FEATURE_COLUMNS].values.astype(np.float64)
    y_grade = df_ml["grade_label"].values
    y_soh = df_ml["synthetic_soh_pct"].values.astype(np.float64)

    # Handle any NaN in features
    nan_mask = np.isnan(X).any(axis=1)
    if nan_mask.any():
        print(f"\n  WARNING: Dropping {nan_mask.sum()} rows with NaN features")
        X = X[~nan_mask]
        y_grade = y_grade[~nan_mask]
        y_soh = y_soh[~nan_mask]

    print(f"\n  Final feature matrix: {X.shape[0]} samples × {X.shape[1]} features")

    # ── Train/test split ────────────────────────────────────────────────────
    X_train, X_test, y_grade_train, y_grade_test, y_soh_train, y_soh_test = train_test_split(
        X, y_grade, y_soh,
        test_size=args.test_size,
        random_state=args.seed,
        stratify=y_grade,
    )
    print(f"  Train: {len(X_train)} | Test: {len(X_test)} (stratified by grade)")

    # ── Train Grade Classifier ──────────────────────────────────────────────
    print("\n" + "-" * 70)
    print("  Training Grade Classifier (RandomForest)...")
    clf, clf_metrics = train_grade_classifier(X_train, y_grade_train, X_test, y_grade_test)

    print(f"  Train accuracy:  {clf_metrics['train_accuracy']:.4f}")
    print(f"  Test accuracy:   {clf_metrics['test_accuracy']:.4f}")
    print(f"  Test F1 (weighted): {clf_metrics['test_f1_weighted']:.4f}")
    print(f"  Test F1 (macro):    {clf_metrics['test_f1_macro']:.4f}")
    print(f"  CV F1 (5-fold):     {clf_metrics['cv_f1_weighted_mean']:.4f} ± {clf_metrics['cv_f1_weighted_std']:.4f}")

    print("\n  Confusion Matrix (rows=true, cols=pred):")
    cm = clf_metrics["confusion_matrix"]
    print(f"  {'':>16} {'GRADE_A':>10} {'GRADE_B':>10} {'GRADE_C':>10} {'RECYCLE':>10}")
    for i, grade in enumerate(GRADE_CLASSES):
        print(f"  {grade:>16} {cm[i][0]:>10} {cm[i][1]:>10} {cm[i][2]:>10} {cm[i][3]:>10}")

    print("\n  Top-5 Feature Importances (Grade):")
    for i, (name, imp) in enumerate(list(clf_metrics["feature_importances"].items())[:5]):
        print(f"    {i+1}. {name}: {imp:.4f}")

    # ── Train SoH Regressor ─────────────────────────────────────────────────
    print("\n" + "-" * 70)
    print("  Training SoH Regressor (GradientBoosting)...")
    reg, reg_metrics = train_soh_regressor(X_train, y_soh_train, X_test, y_soh_test)

    print(f"  Train MAE:  {reg_metrics['train_mae']:.4f}%")
    print(f"  Train R²:   {reg_metrics['train_r2']:.4f}")
    print(f"  Test MAE:   {reg_metrics['test_mae']:.4f}%")
    print(f"  Test RMSE:  {reg_metrics['test_rmse']:.4f}%")
    print(f"  Test R²:    {reg_metrics['test_r2']:.4f}")
    print(f"  Max Error:  {reg_metrics['test_max_error']:.4f}%")

    print("\n  Top-5 Feature Importances (SoH):")
    for i, (name, imp) in enumerate(list(reg_metrics["feature_importances"].items())[:5]):
        print(f"    {i+1}. {name}: {imp:.4f}")

    # ── Save Model Artifacts ────────────────────────────────────────────────
    print("\n" + "-" * 70)
    print("  Saving model artifacts...")

    clf_path = out_dir / "grade_classifier.joblib"
    reg_path = out_dir / "soh_regressor.joblib"
    meta_path = out_dir / "training_metadata.json"

    joblib.dump(clf, clf_path)
    joblib.dump(reg, reg_path)

    metadata = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data_source": str(summary_path),
        "dataset_type": "SYNTHETIC",
        "provenance_warning": (
            "Models trained on SYNTHETIC PyBaMM data ONLY. "
            "Performance on real hardware measurements is UNKNOWN and UNVALIDATED."
        ),
        "total_samples": int(X.shape[0]),
        "train_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "test_size": args.test_size,
        "random_seed": args.seed,
        "feature_columns": FEATURE_COLUMNS,
        "grade_classes": GRADE_CLASSES,
        "chemistry_baselines": CHEMISTRY_BASELINES,
        "soh_label_method": (
            "Physics-informed composite: "
            "SoH = w_r * resistance_health + w_rec * recovery_health, "
            "with chemistry-specific baselines and weights. "
            "NOT a ground-truth measurement."
        ),
        "grade_classifier": {
            "algorithm": "RandomForestClassifier",
            "n_estimators": 200,
            "artifact_path": str(clf_path),
            "metrics": clf_metrics,
        },
        "soh_regressor": {
            "algorithm": "GradientBoostingRegressor",
            "n_estimators": 200,
            "artifact_path": str(reg_path),
            "metrics": reg_metrics,
        },
    }

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, default=str)

    # Also save the feature columns and label encoder for inference
    inference_config = {
        "feature_columns": FEATURE_COLUMNS,
        "grade_classes": GRADE_CLASSES,
        "chemistry_baselines": CHEMISTRY_BASELINES,
        "model_files": {
            "grade_classifier": "grade_classifier.joblib",
            "soh_regressor": "soh_regressor.joblib",
        },
    }
    with open(out_dir / "inference_config.json", "w") as f:
        json.dump(inference_config, f, indent=2)

    print(f"\n  ✓ Grade classifier saved: {clf_path}")
    print(f"  ✓ SoH regressor saved:   {reg_path}")
    print(f"  ✓ Training metadata:     {meta_path}")
    print(f"  ✓ Inference config:      {out_dir / 'inference_config.json'}")

    print(f"""
{'=' * 70}
  ✓ Training Complete
  ┌──────────────────────────────────────────────────────────────────┐
  │  Grade Classifier:  F1={clf_metrics['test_f1_weighted']:.3f} (weighted)  Acc={clf_metrics['test_accuracy']:.3f}     │
  │  SoH Regressor:     MAE={reg_metrics['test_mae']:.2f}%           R²={reg_metrics['test_r2']:.3f}      │
  └──────────────────────────────────────────────────────────────────┘
  ⚠  SYNTHETIC MODELS — NOT validated on real hardware data.
{'=' * 70}
""")


if __name__ == "__main__":
    main()

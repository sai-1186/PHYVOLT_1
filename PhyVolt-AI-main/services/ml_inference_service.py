"""
PhyVolt AI — ML Inference Service
==================================
Loads trained scikit-learn models (grade classifier + SoH regressor) and
provides prediction functions for the Flask API.

Models are loaded once at import time and reused across requests.

WARNING: Models are trained on SYNTHETIC PyBaMM data only.
Performance on real hardware measurements is UNKNOWN and UNVALIDATED.
"""

import json
import logging
import numpy as np
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent.parent / "models"
INFERENCE_CONFIG_PATH = MODELS_DIR / "inference_config.json"
GRADE_CLF_PATH = MODELS_DIR / "grade_classifier.joblib"
SOH_REG_PATH = MODELS_DIR / "soh_regressor.joblib"
SCALER_PATH = MODELS_DIR / "feature_scaler.joblib"

# ── Lazy-loaded model singletons ─────────────────────────────────────────────
_grade_clf = None
_soh_reg = None
_scaler = None
_inference_config = None
_models_loaded = False
_load_error = None
_has_scaler = False


def _load_models():
    """Load model artifacts from disk. Called once on first prediction."""
    global _grade_clf, _soh_reg, _scaler, _inference_config, _models_loaded, _load_error, _has_scaler

    if _models_loaded:
        return

    try:
        import joblib
    except ImportError:
        _load_error = "joblib not installed. Run: pip install joblib"
        logger.error(_load_error)
        return

    # Load inference config
    if not INFERENCE_CONFIG_PATH.exists():
        _load_error = f"Inference config not found: {INFERENCE_CONFIG_PATH}"
        logger.error(_load_error)
        return

    with open(INFERENCE_CONFIG_PATH, "r", encoding="utf-8") as f:
        _inference_config = json.load(f)

    # Load grade classifier
    if not GRADE_CLF_PATH.exists():
        _load_error = f"Grade classifier not found: {GRADE_CLF_PATH}"
        logger.error(_load_error)
        return

    _grade_clf = joblib.load(GRADE_CLF_PATH)
    logger.info("Loaded grade classifier from %s", GRADE_CLF_PATH)

    # Load SoH regressor
    if not SOH_REG_PATH.exists():
        _load_error = f"SoH regressor not found: {SOH_REG_PATH}"
        logger.error(_load_error)
        return

    _soh_reg = joblib.load(SOH_REG_PATH)
    logger.info("Loaded SoH regressor from %s", SOH_REG_PATH)

    # Load feature scaler (optional — v2 training only)
    if SCALER_PATH.exists():
        _scaler = joblib.load(SCALER_PATH)
        _has_scaler = True
        logger.info("Loaded feature scaler from %s", SCALER_PATH)
    else:
        _has_scaler = False
        logger.info("No feature scaler found — using raw features (v1 compatibility)")

    _models_loaded = True
    _load_error = None
    logger.info("All ML models loaded successfully (scaler=%s).", "yes" if _has_scaler else "no")


def models_available() -> bool:
    """Check whether ML models have been loaded successfully."""
    _load_models()
    return _models_loaded


def get_model_status() -> Dict[str, Any]:
    """Return current model loading status for health-check endpoints."""
    _load_models()
    return {
        "models_loaded": _models_loaded,
        "load_error": _load_error,
        "grade_classifier": str(GRADE_CLF_PATH) if _grade_clf else None,
        "soh_regressor": str(SOH_REG_PATH) if _soh_reg else None,
        "feature_scaler": str(SCALER_PATH) if _has_scaler else None,
        "inference_config": str(INFERENCE_CONFIG_PATH) if _inference_config else None,
        "training_version": _inference_config.get("training_version", "v1") if _inference_config else None,
    }


# ── Feature preparation ─────────────────────────────────────────────────────

def _parse_relaxation_features(relax_data) -> Dict[str, float]:
    """Parse relaxation features from dict or JSON string."""
    if isinstance(relax_data, str):
        try:
            relax_data = json.loads(relax_data.replace('""', '"'))
        except (json.JSONDecodeError, AttributeError):
            return {
                "v_relax_1s": float("nan"),
                "v_relax_10s": float("nan"),
                "v_relax_60s": float("nan"),
                "recovery_ratio": float("nan"),
            }

    if isinstance(relax_data, dict):
        return {
            "v_relax_1s": relax_data.get("v_relax_1s", float("nan")),
            "v_relax_10s": relax_data.get("v_relax_10s", float("nan")),
            "v_relax_60s": relax_data.get("v_relax_60s", float("nan")),
            "recovery_ratio": relax_data.get("recovery_ratio", float("nan")),
        }

    return {
        "v_relax_1s": float("nan"),
        "v_relax_10s": float("nan"),
        "v_relax_60s": float("nan"),
        "recovery_ratio": float("nan"),
    }


def prepare_feature_vector(
    estimated_resistance_mohm: float,
    voltage_drop_v: float,
    initial_soc_pct: float,
    ambient_temperature_c: float,
    pulse_current_a: float,
    rated_capacity_ah: float,
    recovery_ratio: float,
    v_relax_1s: float,
    v_relax_10s: float,
    v_relax_60s: float,
    chemistry: str,
) -> np.ndarray:
    """
    Build a feature vector matching the training pipeline's FEATURE_COLUMNS order.

    Returns shape (1, 13) numpy array ready for model.predict().
    """
    # One-hot encode chemistry
    chem_upper = chemistry.upper()
    chem_nmc = 1 if chem_upper == "NMC" else 0
    chem_nca = 1 if chem_upper == "NCA" else 0
    chem_lfp = 1 if chem_upper == "LFP" else 0

    features = np.array([[
        estimated_resistance_mohm,
        voltage_drop_v,
        initial_soc_pct,
        ambient_temperature_c,
        pulse_current_a,
        rated_capacity_ah,
        recovery_ratio,
        v_relax_1s,
        v_relax_10s,
        v_relax_60s,
        chem_nmc,
        chem_nca,
        chem_lfp,
    ]], dtype=np.float64)

    return features


def prepare_feature_vector_from_dict(data: Dict[str, Any]) -> np.ndarray:
    """
    Build feature vector from a flat dictionary (e.g., from simulation features
    or API request body).

    Supports both simulation_service output format and cell_summary CSV format.
    """
    # Handle relaxation features if provided as nested dict/JSON
    relax = {}
    if "relaxation_features" in data:
        relax = _parse_relaxation_features(data["relaxation_features"])

    return prepare_feature_vector(
        estimated_resistance_mohm=float(data.get("estimated_resistance_mohm",
                                                  data.get("pulse_resistance_mohm", 0.0))),
        voltage_drop_v=float(data.get("voltage_drop_V",
                                       data.get("voltage_drop_v", 0.0))),
        initial_soc_pct=float(data.get("initial_soc_pct", 50.0)),
        ambient_temperature_c=float(data.get("ambient_temperature_C",
                                              data.get("ambient_temperature_c", 25.0))),
        pulse_current_a=float(data.get("pulse_current_A",
                                        data.get("pulse_current_a", 1.0))),
        rated_capacity_ah=float(data.get("rated_capacity_Ah",
                                          data.get("rated_capacity_ah", 3.0))),
        recovery_ratio=float(data.get("recovery_ratio",
                                       relax.get("recovery_ratio", 0.8))),
        v_relax_1s=float(data.get("v_relax_1s",
                                   data.get("v_relaxation_1s_V",
                                            relax.get("v_relax_1s", 0.0)))),
        v_relax_10s=float(data.get("v_relax_10s",
                                    data.get("v_relaxation_10s_V",
                                             relax.get("v_relax_10s", 0.0)))),
        v_relax_60s=float(data.get("v_relax_60s",
                                    data.get("v_relaxation_60s_V",
                                             relax.get("v_relax_60s", 0.0)))),
        chemistry=str(data.get("chemistry", "NMC")),
    )


# ── Prediction API ───────────────────────────────────────────────────────────

def predict_grade(features: np.ndarray) -> Dict[str, Any]:
    """
    Predict battery grade from a feature vector.

    Parameters
    ----------
    features : np.ndarray of shape (1, 13)

    Returns
    -------
    dict with:
        predicted_grade: str  (GRADE_A, GRADE_B, GRADE_C, RECYCLE_REVIEW)
        probabilities: dict   (class -> probability)
        model_type: str
    """
    _load_models()
    if not _models_loaded:
        return {
            "predicted_grade": "UNDETERMINED",
            "probabilities": {},
            "model_type": "unavailable",
            "error": _load_error,
        }

    grade_classes = _inference_config.get("grade_classes",
                                           ["GRADE_A", "GRADE_B", "GRADE_C", "RECYCLE_REVIEW"])

    # Apply scaler if available (v2 training)
    X_input = _scaler.transform(features) if _has_scaler else features

    predicted = _grade_clf.predict(X_input)[0]
    probas = _grade_clf.predict_proba(X_input)[0]

    prob_dict = {}
    for cls, prob in zip(_grade_clf.classes_, probas):
        prob_dict[cls] = round(float(prob), 4)

    algo_name = type(_grade_clf).__name__
    return {
        "predicted_grade": str(predicted),
        "probabilities": prob_dict,
        "model_type": algo_name,
        "confidence": round(float(max(probas)), 4),
    }


def predict_soh(features: np.ndarray) -> Dict[str, Any]:
    """
    Predict State of Health (SoH %) from a feature vector.

    Parameters
    ----------
    features : np.ndarray of shape (1, 13)

    Returns
    -------
    dict with:
        predicted_soh_pct: float
        soh_range: dict (low, high)
        model_type: str
    """
    _load_models()
    if not _models_loaded:
        return {
            "predicted_soh_pct": None,
            "soh_range": {"low": None, "high": None},
            "model_type": "unavailable",
            "error": _load_error,
        }

    # Apply scaler if available (v2 training)
    X_input = _scaler.transform(features) if _has_scaler else features

    soh_raw = _soh_reg.predict(X_input)[0]
    soh_pct = round(float(np.clip(soh_raw, 5.0, 99.0)), 2)

    # Prediction interval: +/-3% nominal (based on test RMSE of ~2.6%)
    margin = 3.5
    soh_low = round(max(5.0, soh_pct - margin), 1)
    soh_high = round(min(99.0, soh_pct + margin), 1)

    algo_name = type(_soh_reg).__name__
    return {
        "predicted_soh_pct": soh_pct,
        "soh_range": {"low": soh_low, "high": soh_high},
        "model_type": algo_name,
    }


def predict_full(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run full ML inference pipeline: prepare features → predict grade + SoH.

    Parameters
    ----------
    data : dict
        Must include pulse test features (resistance, voltage drop, etc.)
        and chemistry type.

    Returns
    -------
    dict with combined grade and SoH predictions, plus recommendation.
    """
    _load_models()
    if not _models_loaded:
        return {
            "success": False,
            "error": _load_error or "Models not loaded",
            "prediction_source": "ml_model",
        }

    # Prepare features
    try:
        X = prepare_feature_vector_from_dict(data)
    except (KeyError, ValueError, TypeError) as e:
        return {
            "success": False,
            "error": f"Feature preparation failed: {str(e)}",
            "prediction_source": "ml_model",
        }

    # Check for NaN in features
    if np.isnan(X).any():
        nan_cols = []
        feature_names = _inference_config.get("feature_columns", [])
        for i, name in enumerate(feature_names):
            if np.isnan(X[0, i]):
                nan_cols.append(name)
        return {
            "success": False,
            "error": f"NaN values in features: {nan_cols}",
            "prediction_source": "ml_model",
        }

    # Run predictions
    grade_result = predict_grade(X)
    soh_result = predict_soh(X)

    # Map grade to recommendation
    grade = grade_result["predicted_grade"]
    soh_mid = soh_result["predicted_soh_pct"]

    if grade == "GRADE_A":
        recommendation = "SECOND_LIFE_SCREENING"
        explanation = (
            f"ML model predicts {grade} with {grade_result['confidence']:.0%} confidence. "
            f"Estimated SoH: {soh_mid:.1f}%. Cell meets high-performance screening criteria."
        )
    elif grade == "GRADE_B":
        recommendation = "REFURBISHMENT_REVIEW"
        explanation = (
            f"ML model predicts {grade} with {grade_result['confidence']:.0%} confidence. "
            f"Estimated SoH: {soh_mid:.1f}%. Intermediate tier — requires further evaluation."
        )
    elif grade == "GRADE_C":
        recommendation = "RECYCLING_REVIEW"
        explanation = (
            f"ML model predicts {grade} with {grade_result['confidence']:.0%} confidence. "
            f"Estimated SoH: {soh_mid:.1f}%. Below second-life reuse threshold."
        )
    elif grade == "RECYCLE_REVIEW":
        recommendation = "RECYCLING_REVIEW"
        explanation = (
            f"ML model predicts {grade} with {grade_result['confidence']:.0%} confidence. "
            f"Estimated SoH: {soh_mid:.1f}%. Severe degradation — recommend recycling."
        )
    else:
        recommendation = "EXPERT_REVIEW"
        explanation = f"ML model returned grade {grade}. Manual review recommended."

    return {
        "success": True,
        "prediction_source": "ml_model",
        "dataset_type": "SYNTHETIC",
        "model_warning": (
            "Models trained on SYNTHETIC PyBaMM data only. "
            "Performance on real hardware measurements is UNKNOWN and UNVALIDATED."
        ),
        "grade": grade_result,
        "soh": soh_result,
        "recommendation": recommendation,
        "explanation": explanation,
        "feature_count": int(X.shape[1]),
        "chemistry": str(data.get("chemistry", "UNKNOWN")).upper(),
    }

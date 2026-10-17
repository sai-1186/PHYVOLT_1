"""
PhyVolt AI - Diagnostic Inference Service (Python)
Stage 1 Baseline Rule & Equivalent Circuit Model
"""

import numpy as np


def estimate_demo_result(features, safety_status="PASS"):
    if safety_status in ["ABORT", "QUARANTINE"] or features["temperature_rise"] > 6.0:
        return {
            "soh_low": None,
            "soh_high": None,
            "usable_power_class": "RESTRICTED",
            "anomaly_score": 0.95,
            "confidence": 0.90,
            "recommendation": "QUARANTINE",
            "explanation": "Critical safety alert or excessive thermal rise overrides electrochemical classification."
        }

    resistance_mOhm = features["pulse_resistance"] * 1000.0

    # Empirical baseline: healthy ~ 24 mOhm -> SoH ~80%; degraded ~ 75 mOhm -> SoH ~ 45%
    score = 100.0 - ((resistance_mOhm - 20.0) / 20.0) * 32.0
    if features.get("recovery_ratio", 0.8) > 0.85:
        score += 2.0
    score = max(20.0, min(95.0, score))

    margin = 5.0
    soh_low = round(max(10.0, score - margin), 1)
    soh_high = round(min(100.0, score + margin), 1)

    if resistance_mOhm < 32.0:
        power_class = "HIGH"
    elif resistance_mOhm < 65.0:
        power_class = "MEDIUM"
    elif resistance_mOhm < 100.0:
        power_class = "LOW"
    else:
        power_class = "RESTRICTED"

    if soh_low >= 70.0 and power_class in ["HIGH", "MEDIUM"]:
        recommendation = "SECOND_LIFE_SCREENING"
        explanation = f"Apparent impedance ({resistance_mOhm:.1f} mΩ) and thermal recovery within second-life baseline."
    elif soh_high < 50.0 or power_class == "RESTRICTED":
        recommendation = "RECYCLING_REVIEW"
        explanation = f"Severe impedance growth ({resistance_mOhm:.1f} mΩ) indicates active material loss."
    else:
        recommendation = "REFURBISHMENT_REVIEW"
        explanation = f"Intermediate health tier ({soh_low}%–{soh_high}%). Rebalancing review recommended."

    return {
        "soh_low": soh_low,
        "soh_high": soh_high,
        "usable_power_class": power_class,
        "anomaly_score": 0.12 if features["temperature_rise"] < 3.0 else 0.45,
        "confidence": 0.84,
        "recommendation": recommendation,
        "explanation": explanation
    }

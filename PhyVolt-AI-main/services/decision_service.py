"""
PhyVolt AI - Decision Service (Python)
Maps extracted metrics and safety signals into explainable circularity decisions
"""

def make_decision(result):
    if result["safety_status"] in ["ABORT", "QUARANTINE"]:
        return {
            "recommendation": "QUARANTINE",
            "reason": "Safety condition overrides health classification"
        }

    if result.get("confidence", 1.0) < 0.60:
        return {
            "recommendation": "EXPERT_REVIEW",
            "reason": "Model confidence is below review threshold (0.60)"
        }

    soh_low = result["soh_range"]["low"]
    soh_high = result["soh_range"]["high"]

    if soh_low >= 70.0:
        return {
            "recommendation": "SECOND_LIFE_SCREENING",
            "reason": "Health range is above prototype screening threshold"
        }

    if soh_high < 50.0:
        return {
            "recommendation": "RECYCLING_REVIEW",
            "reason": "Health range is below second-life screening threshold"
        }

    return {
        "recommendation": "REFURBISHMENT_REVIEW",
        "reason": "Intermediate health range requires further refurbishment assessment"
    }

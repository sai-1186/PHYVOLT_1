"""
PhyVolt AI — Simulation API Bridge
====================================
Called by server.ts /api/simulation/run via child_process.spawn.
Reads JSON from stdin, runs simulation, writes JSON result to stdout.

SYNTHETIC DATA — PyBaMM SIMULATION — NOT LIVE HARDWARE MEASUREMENTS
"""

import sys
import json
import math
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from services.simulation_service import run_pulse_simulation, classify_grade


def nan_safe(val):
    """Convert NaN/inf to None for JSON serialisation."""
    if val is None:
        return None
    try:
        if math.isnan(val) or math.isinf(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


def safe_features(features: dict) -> dict:
    return {k: nan_safe(v) for k, v in features.items()}


def main():
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    chemistry             = payload.get("chemistry", "NMC")
    initial_soc           = float(payload.get("initial_soc", 0.8))
    temperature_c         = float(payload.get("temperature_c", 25.0))
    pulse_current_a       = float(payload.get("pulse_current_a", 1.0))
    pulse_duration_s      = int(payload.get("pulse_duration_s", 120))
    rest_duration_s       = int(payload.get("rest_duration_s", 30))
    relaxation_duration_s = int(payload.get("relaxation_duration_s", 60))
    capacity_ah           = payload.get("capacity_ah")
    if capacity_ah is not None:
        capacity_ah = float(capacity_ah)

    result = run_pulse_simulation(
        chemistry=chemistry,
        initial_soc=initial_soc,
        temperature_c=temperature_c,
        pulse_current_a=pulse_current_a,
        pulse_duration_s=pulse_duration_s,
        rest_duration_s=rest_duration_s,
        relaxation_duration_s=relaxation_duration_s,
        capacity_ah=capacity_ah,
    )

    status = result["status"]
    features = safe_features(result["features"])

    # Grade
    grade_info = {"grade_label": "N/A", "safety_label": "N/A", "label_source": "none", "explanation": []}
    if status == "SUCCESS":
        grade_info = classify_grade(result["features"])

    # Timeseries — convert to list of dicts with NaN→None
    timeseries = []
    if status == "SUCCESS" and not result["timeseries"].empty:
        for _, row in result["timeseries"].iterrows():
            timeseries.append({k: nan_safe(v) for k, v in row.items()})

    output = {
        "success":         status == "SUCCESS",
        "status":          status,
        "simulation_id":   result["simulation_id"],
        "chemistry":       result["chemistry"],
        "param_set":       result["param_set"],
        "model":           result["model"],
        "pybamm_version":  result["pybamm_version"],
        "data_type":       "SYNTHETIC",
        "provenance":      "SYNTHETIC DATA — PyBaMM SIMULATION — NOT LIVE HARDWARE MEASUREMENTS",
        "features":        features,
        "grade":           grade_info,
        "timeseries":      timeseries,
        "metadata":        {k: str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v
                           for k, v in result["metadata"].items()},
        "error":           result["error"],
    }

    print(json.dumps(output))


if __name__ == "__main__":
    main()

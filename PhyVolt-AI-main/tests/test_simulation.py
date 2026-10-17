"""
PhyVolt AI — PyBaMM Simulation Automated Tests
===============================================

Run with:
    python tests/test_simulation.py

Tests:
  1.  PyBaMM is importable with expected version
  2.  Supported chemistry detection (NMC, NCA, LFP)
  3.  Unsupported chemistry rejection (LTO, LCO, LMO)
  4.  Successful NMC SPM simulation
  5.  Successful LFP SPM simulation
  6.  Correct pulse timing and sample counts
  7.  CSV columns present in timeseries output
  8.  Grade A / B / C / RECYCLE_REVIEW boundaries
  9.  Safety quarantine overrides performance grade
  10. Simulation failure does NOT silently return synthetic data
  11. Reproducibility with fixed seed
  12. Non-finite value check
"""

import sys
import json
import math
from pathlib import Path

# Configure utf-8 stdout if available
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
from services.simulation_service import (
    run_pulse_simulation,
    classify_grade,
    check_chemistry_support,
    PYBAMM_VERSION,
    SUPPORTED_PARAM_SETS,
)


PASS = "[PASS]"
FAIL = "[FAIL]"
SKIP = "[SKIP]"

results = {"pass": 0, "fail": 0, "skip": 0}


def run_test(name: str, fn):
    try:
        outcome = fn()
        if outcome is None or outcome is True:
            print(f"  {PASS}  {name}")
            results["pass"] += 1
        elif outcome == "SKIP":
            print(f"  {SKIP}  {name}")
            results["skip"] += 1
        else:
            print(f"  {FAIL}  {name}")
            print(f"        -> {outcome}")
            results["fail"] += 1
    except Exception as exc:
        print(f"  {FAIL}  {name}")
        print(f"        -> Exception: {exc}")
        results["fail"] += 1


# ─── Test 1: PyBaMM importable ────────────────────────────────────────────────

def t1_pybamm_importable():
    try:
        import pybamm
        v = pybamm.__version__
        if not v:
            return "pybamm.__version__ is empty"
    except ImportError as e:
        return f"Cannot import pybamm: {e}"


# ─── Test 2: Supported chemistry detection ────────────────────────────────────

def t2_supported_chemistries():
    for chem in ["NMC", "NCA", "LFP"]:
        info = check_chemistry_support(chem)
        if not info["supported"]:
            return f"{chem} reported unsupported but should be supported"
    return True


# ─── Test 3: Unsupported chemistry rejection ──────────────────────────────────

def t3_unsupported_chemistries():
    for chem in ["LTO", "LCO", "LMO", "RANDOM"]:
        info = check_chemistry_support(chem)
        if info["supported"]:
            return f"{chem} reported as supported but should be rejected"
    return True


# ─── Test 4: NMC simulation succeeds ─────────────────────────────────────────

_nmc_result = None  # cached for later tests

def t4_nmc_simulation():
    global _nmc_result
    _nmc_result = run_pulse_simulation(
        chemistry="NMC",
        initial_soc=0.8,
        temperature_c=25.0,
        pulse_current_a=1.0,
        pulse_duration_s=30,       # short for speed
        rest_duration_s=10,
        relaxation_duration_s=30,
    )
    if _nmc_result["status"] != "SUCCESS":
        return f"Expected SUCCESS, got {_nmc_result['status']}: {_nmc_result['error']}"
    if _nmc_result["timeseries"].empty:
        return "timeseries DataFrame is empty on SUCCESS"


# ─── Test 5: LFP simulation succeeds ─────────────────────────────────────────

def t5_lfp_simulation():
    res = run_pulse_simulation(
        chemistry="LFP",
        initial_soc=0.6,
        temperature_c=20.0,
        pulse_current_a=0.5,
        pulse_duration_s=30,
        rest_duration_s=10,
        relaxation_duration_s=30,
    )
    if res["status"] != "SUCCESS":
        return f"Expected SUCCESS, got {res['status']}: {res['error']}"


# ─── Test 6: Pulse timing and sample counts ───────────────────────────────────

def t6_pulse_timing():
    res = run_pulse_simulation(
        chemistry="NMC",
        initial_soc=0.8,
        temperature_c=25.0,
        pulse_current_a=1.0,
        pulse_duration_s=120,
        rest_duration_s=30,
        relaxation_duration_s=60,
        sampling_interval_s=1.0,
    )
    if res["status"] != "SUCCESS":
        return f"Simulation failed: {res['error']}"

    df = res["timeseries"]

    # Pulse samples: t=30 to t=150 inclusive (at 1 Hz) = 121 samples
    pulse_df = df[df["test_stage"] == "PULSE"]
    expected_pulse_samples = 121  # t=30..150 inclusive
    actual = len(pulse_df)
    # Allow ±2 for floating point edge
    if abs(actual - expected_pulse_samples) > 2:
        return (f"Pulse samples: expected ~{expected_pulse_samples}, got {actual}. "
                f"(120s @ 1Hz inclusive of start = 121 intervals)")

    # Total samples: rest + pulse + relax = 30+1 + 120+1 + 60+1 = 213 (overlapping ends)
    # More precisely: t=0..210 @ 1Hz = 211 samples
    total = len(df)
    if total < 150:
        return f"Total sample count suspiciously low: {total}"

    # Timestamps must be monotonically increasing
    if not df["elapsed_time_s"].is_monotonic_increasing:
        return "elapsed_time_s is not monotonically increasing"

    # Timestamps must be finite
    if not np.isfinite(df["elapsed_time_s"]).all():
        return "Non-finite elapsed_time_s values"


# ─── Test 7: CSV column names ────────────────────────────────────────────────

def t7_csv_columns():
    import tempfile, os
    res = run_pulse_simulation(
        chemistry="NMC",
        initial_soc=0.8,
        temperature_c=25.0,
        pulse_current_a=1.0,
        pulse_duration_s=30,
        rest_duration_s=10,
        relaxation_duration_s=20,
    )
    if res["status"] != "SUCCESS":
        return f"Simulation failed: {res['error']}"

    df = res["timeseries"]
    required = ["elapsed_time_s", "test_stage", "current_A", "voltage_V"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        return f"Missing columns: {missing}"


# ─── Test 8: Grade boundaries ────────────────────────────────────────────────

def t8_grade_boundaries():
    # Grade A: low resistance
    grade_a = classify_grade({"pulse_resistance_mohm": 20.0, "voltage_drop_V": 0.05,
                               "recovery_ratio": 0.90, "v_before_pulse_V": 3.7, "v_pulse_min_V": 3.65})
    if grade_a["grade_label"] != "GRADE_A":
        return f"Expected GRADE_A for 20 mΩ, got {grade_a['grade_label']}"

    # Grade B: mid resistance
    grade_b = classify_grade({"pulse_resistance_mohm": 50.0, "voltage_drop_V": 0.20,
                               "recovery_ratio": 0.70, "v_before_pulse_V": 3.7, "v_pulse_min_V": 3.50})
    if grade_b["grade_label"] != "GRADE_B":
        return f"Expected GRADE_B for 50 mΩ, got {grade_b['grade_label']}"

    # Grade C
    grade_c = classify_grade({"pulse_resistance_mohm": 90.0, "voltage_drop_V": 0.28,
                               "recovery_ratio": 0.50, "v_before_pulse_V": 3.7, "v_pulse_min_V": 3.42})
    if grade_c["grade_label"] != "GRADE_C":
        return f"Expected GRADE_C for 90 mΩ, got {grade_c['grade_label']}"

    # Recycle review: very high resistance
    grade_r = classify_grade({"pulse_resistance_mohm": 150.0, "voltage_drop_V": 0.5,
                               "recovery_ratio": 0.30, "v_before_pulse_V": 3.7, "v_pulse_min_V": 3.20})
    if grade_r["grade_label"] != "RECYCLE_REVIEW":
        return f"Expected RECYCLE_REVIEW for 150 mΩ, got {grade_r['grade_label']}"


# ─── Test 9: Safety quarantine overrides grade ────────────────────────────────

def t9_safety_quarantine_override():
    # Physical condition should trigger quarantine regardless of good resistance
    result = classify_grade(
        features={"pulse_resistance_mohm": 20.0, "voltage_drop_V": 0.05,
                  "recovery_ratio": 0.90, "v_before_pulse_V": 3.7, "v_pulse_min_V": 3.65},
        physical_condition="swollen",
    )
    if result["grade_label"] != "SAFETY_QUARANTINE":
        return f"Expected SAFETY_QUARANTINE for swollen cell, got {result['grade_label']}"
    if result["safety_label"] != "QUARANTINE":
        return f"Expected safety_label=QUARANTINE, got {result['safety_label']}"

    # Voltage below floor
    result2 = classify_grade(
        features={"pulse_resistance_mohm": 20.0, "voltage_drop_V": 0.05,
                  "recovery_ratio": 0.90, "v_before_pulse_V": 3.7, "v_pulse_min_V": 2.0},
        physical_condition="appears_normal",
    )
    if result2["grade_label"] != "SAFETY_QUARANTINE":
        return f"Expected SAFETY_QUARANTINE for under-voltage, got {result2['grade_label']}"


# ─── Test 10: Failed simulation does NOT silently produce data ────────────────

def t10_no_silent_data_on_failure():
    res = run_pulse_simulation(
        chemistry="LTO",  # unsupported
        initial_soc=0.8,
        temperature_c=25.0,
        pulse_current_a=1.0,
        pulse_duration_s=30,
        rest_duration_s=10,
        relaxation_duration_s=30,
    )
    if res["status"] == "SUCCESS":
        return "UNSUPPORTED chemistry returned SUCCESS — should be UNSUPPORTED"
    if not res["timeseries"].empty:
        return "Unsupported chemistry returned non-empty timeseries — must be empty"
    if res["error"] is None:
        return "error field is None on UNSUPPORTED result — must explain why"


# ─── Test 11: Reproducibility with fixed seed ─────────────────────────────────

def t11_reproducibility():
    """Two runs of generate_cell_configs with same seed must produce identical configs."""
    sys.path.insert(0, str(ROOT / "scripts"))
    from generate_synthetic_dataset import generate_cell_configs

    class FakeArgs:
        num_cells = 5
        chemistry = ["NMC"]
        soc_min = 0.2; soc_max = 0.9
        temp_min = 15; temp_max = 35
        current_min = 0.5; current_max = 2.0
        capacity_min = 2.5; capacity_max = 5.0
        seed = 42

    c1 = generate_cell_configs(FakeArgs())
    c2 = generate_cell_configs(FakeArgs())

    for i, (a, b) in enumerate(zip(c1, c2)):
        if a != b:
            return f"Config {i} differs between identical-seed runs"


# ─── Test 12: Non-finite value check ─────────────────────────────────────────

def t12_finite_values():
    res = run_pulse_simulation(
        chemistry="NMC",
        initial_soc=0.8,
        temperature_c=25.0,
        pulse_current_a=1.0,
        pulse_duration_s=30,
        rest_duration_s=10,
        relaxation_duration_s=30,
    )
    if res["status"] != "SUCCESS":
        return f"Simulation failed: {res['error']}"

    df = res["timeseries"]
    if not np.isfinite(df["voltage_V"]).all():
        return "Non-finite voltage_V values in successful simulation"
    if not np.isfinite(df["current_A"]).all():
        return "Non-finite current_A values in successful simulation"
    if not np.isfinite(df["elapsed_time_s"]).all():
        return "Non-finite elapsed_time_s values"


# ─── Runner ───────────────────────────────────────────────────────────────────

def main():
    print(f"\nPhyVolt AI — PyBaMM Simulation Tests")
    print(f"PyBaMM version: {PYBAMM_VERSION}")
    print(f"Supported param sets: {list(SUPPORTED_PARAM_SETS.keys())}")
    print("=" * 60)

    run_test("1. PyBaMM importable",                     t1_pybamm_importable)
    run_test("2. Supported chemistry detection",          t2_supported_chemistries)
    run_test("3. Unsupported chemistry rejection",        t3_unsupported_chemistries)
    run_test("4. NMC SPM simulation succeeds",            t4_nmc_simulation)
    run_test("5. LFP SPM simulation succeeds",            t5_lfp_simulation)
    run_test("6. Pulse timing and sample counts",         t6_pulse_timing)
    run_test("7. CSV column names present",               t7_csv_columns)
    run_test("8. Grade A/B/C/Recycle boundaries",         t8_grade_boundaries)
    run_test("9. Safety quarantine overrides grade",      t9_safety_quarantine_override)
    run_test("10. No silent data on failure/unsupported", t10_no_silent_data_on_failure)
    run_test("11. Reproducibility with fixed seed",       t11_reproducibility)
    run_test("12. Non-finite value check",                t12_finite_values)

    print("=" * 60)
    print(f"  Passed: {results['pass']}  Failed: {results['fail']}  Skipped: {results['skip']}")
    if results["fail"] > 0:
        print("  ✗ Some tests FAILED — see above for details.")
        sys.exit(1)
    else:
        print("  ✓ All tests PASSED.")


if __name__ == "__main__":
    main()

"""
PhyVolt AI — PyBaMM Simulation Service
=======================================
Physics-based battery simulation using PyBaMM for the PhyVolt AI diagnostic workflow.

IMPORTANT:
- This module produces SYNTHETIC simulation data. It is NOT live hardware measurement.
- Supported parameter sets are explicitly listed; unsupported chemistries are refused.
- Do NOT mix output from this module with real ESP32 telemetry in the same database rows
  without a clearly separate 'data_source' field.

Supported chemistries and parameter sets (PyBaMM 26.x):
  NMC  -> Chen2020      (SPM)
  NCA  -> NCA_Kim2011   (SPM)
  LFP  -> Prada2013     (SPM)

Unsupported in this release:
  LTO, LCO, LMO — no validated parameter set in PyBaMM 26.x

Timestamp convention (pulse stage):
  Pulse-start sample IS included (t=0).
  A 120-second pulse at 1 Hz produces 121 samples (t=0 … t=120), i.e., 120 one-second intervals.
"""

import json
import uuid
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import pybamm
    PYBAMM_VERSION = pybamm.__version__
    PYBAMM_AVAILABLE = True
except ImportError:
    PYBAMM_AVAILABLE = False
    PYBAMM_VERSION = "not_installed"

# ── Configuration ───────────────────────────────────────────────────────────

CONFIG_PATH = Path(__file__).parent.parent / "config" / "simulation_config.json"

def _load_config() -> dict:
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)

# ── Supported parameter-set registry ────────────────────────────────────────

SUPPORTED_PARAM_SETS = {
    "NMC": ("Chen2020",      "Single Particle Model"),
    "NCA": ("NCA_Kim2011",   "Single Particle Model"),
    "LFP": ("Prada2013",     "Single Particle Model"),
}

UNSUPPORTED_CHEMISTRIES = {
    "LTO": "No validated LTO parameter set available in PyBaMM 26.x.",
    "LCO": "No validated LCO parameter set available in PyBaMM 26.x.",
    "LMO": "No validated LMO parameter set available in PyBaMM 26.x.",
}


# ── Public API ───────────────────────────────────────────────────────────────

def check_chemistry_support(chemistry: str) -> dict:
    """Return support status for a chemistry string."""
    chemistry = chemistry.upper()
    if chemistry in SUPPORTED_PARAM_SETS:
        ps, model = SUPPORTED_PARAM_SETS[chemistry]
        return {"supported": True, "param_set": ps, "model": model}
    if chemistry in UNSUPPORTED_CHEMISTRIES:
        return {"supported": False, "reason": UNSUPPORTED_CHEMISTRIES[chemistry]}
    return {"supported": False, "reason": f"Chemistry '{chemistry}' is not recognised."}


def run_pulse_simulation(
    chemistry: str,
    initial_soc: float = 0.8,
    temperature_c: float = 25.0,
    pulse_current_a: float = 1.0,
    pulse_duration_s: int = 120,
    rest_duration_s: int = 30,
    relaxation_duration_s: int = 120,
    capacity_ah: Optional[float] = None,
    sampling_interval_s: float = 1.0,
    simulation_id: Optional[str] = None,
) -> dict:
    """
    Run a PyBaMM pulse simulation representing the PhyVolt AI 120-second diagnostic test.

    Protocol stages:
      1. REST     — current = 0 for rest_duration_s seconds
      2. PULSE    — constant discharge current for pulse_duration_s seconds
      3. RELAX    — current = 0 for relaxation_duration_s seconds

    Parameters
    ----------
    chemistry          : str   — 'NMC', 'NCA', or 'LFP'
    initial_soc        : float — initial state of charge (0.0–1.0)
    temperature_c      : float — ambient temperature in °C
    pulse_current_a    : float — discharge current magnitude in A (positive = discharge)
    pulse_duration_s   : int   — pulse duration in seconds (default 120)
    rest_duration_s    : int   — initial rest period in seconds
    relaxation_duration_s : int — post-pulse relaxation in seconds
    capacity_ah        : float or None — rated capacity; overrides param-set default if given
    sampling_interval_s: float — output sample interval in seconds (default 1.0 = 1 Hz)
    simulation_id      : str   — unique run ID (auto-generated if None)

    Returns
    -------
    dict with keys:
      'status'          : 'SUCCESS' | 'FAILED' | 'UNSUPPORTED'
      'simulation_id'   : str
      'chemistry'       : str
      'param_set'       : str
      'model'           : str
      'pybamm_version'  : str
      'timeseries'      : pd.DataFrame (empty on failure)
      'features'        : dict  (empty on failure)
      'metadata'        : dict
      'error'           : str or None
    """
    if not PYBAMM_AVAILABLE:
        return _failure_result("PyBaMM is not installed. Run: pip install pybamm", chemistry, simulation_id)

    if simulation_id is None:
        simulation_id = f"SIM-{uuid.uuid4().hex[:8].upper()}"

    chemistry_upper = chemistry.upper()
    support = check_chemistry_support(chemistry_upper)
    if not support["supported"]:
        return {
            "status": "UNSUPPORTED",
            "simulation_id": simulation_id,
            "chemistry": chemistry_upper,
            "param_set": None,
            "model": None,
            "pybamm_version": PYBAMM_VERSION,
            "timeseries": pd.DataFrame(),
            "features": {},
            "metadata": _base_metadata(simulation_id, chemistry_upper, None, None),
            "error": support["reason"],
        }

    param_set_name, model_name = SUPPORTED_PARAM_SETS[chemistry_upper]

    try:
        return _run_spm_simulation(
            simulation_id=simulation_id,
            chemistry=chemistry_upper,
            param_set_name=param_set_name,
            model_name=model_name,
            initial_soc=initial_soc,
            temperature_c=temperature_c,
            pulse_current_a=pulse_current_a,
            pulse_duration_s=pulse_duration_s,
            rest_duration_s=rest_duration_s,
            relaxation_duration_s=relaxation_duration_s,
            capacity_ah=capacity_ah,
            sampling_interval_s=sampling_interval_s,
        )
    except Exception as exc:
        return _failure_result(str(exc), chemistry_upper, simulation_id, param_set_name, model_name)


# ── Internal simulation logic ────────────────────────────────────────────────

def _run_spm_simulation(
    simulation_id, chemistry, param_set_name, model_name,
    initial_soc, temperature_c, pulse_current_a,
    pulse_duration_s, rest_duration_s, relaxation_duration_s,
    capacity_ah, sampling_interval_s,
) -> dict:

    # Build experiment: REST → PULSE → RELAX
    # PyBaMM current sign: positive = discharge
    experiment = pybamm.Experiment([
        (
            f"Rest for {rest_duration_s} seconds",
            f"Discharge at {pulse_current_a} A for {pulse_duration_s} seconds",
            f"Rest for {relaxation_duration_s} seconds",
        )
    ])

    param = pybamm.ParameterValues(param_set_name)

    # Override capacity if requested
    if capacity_ah is not None:
        try:
            # Try to set the nominal cell capacity
            param["Nominal cell capacity [A.h]"] = capacity_ah
        except Exception:
            pass  # Silently skip if not settable for this param set

    # Temperature in Kelvin
    temperature_k = temperature_c + 273.15
    try:
        param["Ambient temperature [K]"] = temperature_k
    except Exception:
        pass  # Not all param sets expose this

    # SPM model
    model = pybamm.lithium_ion.SPM()

    sim = pybamm.Simulation(model, experiment=experiment, parameter_values=param)
    sim.solve(initial_soc=initial_soc)

    sol = sim.solution

    # ── Extract time and variables ──────────────────────────────────────────
    t_raw = sol["Time [s]"].entries
    v_raw = sol["Terminal voltage [V]"].entries
    i_raw = sol["Current [A]"].entries

    # Temperature: SPM does not provide dynamic cell temperature by default (isothermal);
    # check volume-averaged or spatial mean if available, else mark as unavailable
    has_temperature = False
    t_c_raw = None
    try:
        if "Volume-averaged cell temperature [K]" in sol.all_models[0].variables:
            raw_entries = sol["Volume-averaged cell temperature [K]"].entries
            if getattr(raw_entries, "ndim", 1) > 1:
                t_c_raw = np.mean(raw_entries, axis=0) - 273.15
            else:
                t_c_raw = raw_entries - 273.15
            has_temperature = True
        elif "Cell temperature [K]" in sol.all_models[0].variables:
            raw_entries = sol["Cell temperature [K]"].entries
            if getattr(raw_entries, "ndim", 1) > 1:
                t_c_raw = np.mean(raw_entries, axis=0) - 273.15
            else:
                t_c_raw = raw_entries - 273.15
            has_temperature = True
    except Exception:
        has_temperature = False
        t_c_raw = None

    # ── Determine stage boundaries ─────────────────────────────────────────
    # REST: 0 … rest_duration_s
    # PULSE: rest_duration_s … rest_duration_s + pulse_duration_s
    # RELAX: rest_duration_s + pulse_duration_s … end
    rest_end   = float(rest_duration_s)
    pulse_end  = rest_end + float(pulse_duration_s)

    # ── Resample to 1-second grid ───────────────────────────────────────────
    total_duration = rest_end + pulse_duration_s + relaxation_duration_s
    t_grid = np.arange(0.0, total_duration + sampling_interval_s / 2, sampling_interval_s)

    v_interp = np.interp(t_grid, t_raw, v_raw)
    i_interp = np.interp(t_grid, t_raw, i_raw)
    tc_interp = None
    if has_temperature and t_c_raw is not None:
        try:
            tc_interp = np.interp(t_grid, t_raw, t_c_raw)
        except Exception:
            has_temperature = False
            tc_interp = None

    def _stage(t):
        if t <= rest_end:
            return "REST"
        elif t <= pulse_end:
            return "PULSE"
        else:
            return "RELAX"

    rows = []
    v_before_pulse = None
    for i, t in enumerate(t_grid):
        stage = _stage(t)
        # Voltage before pulse = last REST sample
        if stage == "PULSE" and v_before_pulse is None:
            # Use last REST value
            rest_mask = t_grid <= rest_end
            if rest_mask.any():
                v_before_pulse = float(v_interp[rest_mask][-1])

        row = {
            "elapsed_time_s": round(float(t), 3),
            "test_stage": stage,
            "current_A": round(float(i_interp[i]), 6),
            "voltage_V": round(float(v_interp[i]), 6),
        }
        if has_temperature:
            row["temperature_C"] = round(float(tc_interp[i]), 3)
        else:
            row["temperature_C"] = float("nan")

        rows.append(row)

    df = pd.DataFrame(rows)

    # ── Feature extraction ──────────────────────────────────────────────────
    pulse_df  = df[df["test_stage"] == "PULSE"]
    relax_df  = df[df["test_stage"] == "RELAX"]
    rest_df   = df[df["test_stage"] == "REST"]

    v_before = float(rest_df["voltage_V"].iloc[-1]) if not rest_df.empty else float(df["voltage_V"].iloc[0])
    v_pulse_min = float(pulse_df["voltage_V"].min()) if not pulse_df.empty else float("nan")
    avg_pulse_current = float(abs(pulse_df["current_A"].mean())) if not pulse_df.empty else pulse_current_a
    voltage_drop = v_before - v_pulse_min if not np.isnan(v_pulse_min) else float("nan")

    # Pulse resistance: ΔV / ΔI (Ohm) → converted to mΩ
    # ΔI = pulse_current (since rest current ≈ 0)
    if avg_pulse_current > 0.01 and not np.isnan(voltage_drop):
        pulse_resistance_ohm = voltage_drop / avg_pulse_current
        pulse_resistance_mohm = pulse_resistance_ohm * 1000.0
    else:
        pulse_resistance_ohm = float("nan")
        pulse_resistance_mohm = float("nan")

    # Relaxation features
    v_relax_1s  = float(relax_df["voltage_V"].iloc[1])  if len(relax_df) > 1  else float("nan")
    v_relax_10s = float(relax_df["voltage_V"].iloc[10]) if len(relax_df) > 10 else float("nan")
    v_relax_60s = float(relax_df["voltage_V"].iloc[60]) if len(relax_df) > 60 else float("nan")
    v_relax_end = float(relax_df["voltage_V"].iloc[-1]) if not relax_df.empty else float("nan")

    recovery_ratio = ((v_relax_end - v_pulse_min) / voltage_drop
                      if (not np.isnan(voltage_drop) and voltage_drop > 1e-6) else float("nan"))

    # SoC: PyBaMM SPM does expose SoC in some versions
    soc_initial_pct = initial_soc * 100.0
    soc_final_pct = float("nan")
    try:
        soc_entries = sol["X-averaged cell throughput capacity [A.h]"].entries
        # Estimate final SoC from throughput vs capacity
        nominal_cap = param.get("Nominal cell capacity [A.h]", None)
        if nominal_cap and not np.isnan(soc_entries[-1]):
            throughput_ah = soc_entries[-1]
            soc_final_pct = max(0.0, (initial_soc - throughput_ah / nominal_cap) * 100.0)
    except Exception:
        pass

    features = {
        "v_before_pulse_V":         round(v_before, 5),
        "v_pulse_min_V":            round(v_pulse_min, 5),
        "voltage_drop_V":           round(voltage_drop, 5),
        "avg_pulse_current_A":      round(avg_pulse_current, 5),
        "pulse_resistance_ohm":     round(pulse_resistance_ohm, 6),
        "pulse_resistance_mohm":    round(pulse_resistance_mohm, 3),
        "v_relaxation_1s_V":        round(v_relax_1s, 5),
        "v_relaxation_10s_V":       round(v_relax_10s, 5),
        "v_relaxation_60s_V":       round(v_relax_60s, 5),
        "v_relaxation_end_V":       round(v_relax_end, 5),
        "recovery_ratio":           round(recovery_ratio, 4),
        "initial_soc_pct":          round(soc_initial_pct, 2),
        "final_soc_pct":            round(soc_final_pct, 2) if not np.isnan(soc_final_pct) else None,
        "temperature_available":    has_temperature,
        "pulse_sample_count":       int(len(pulse_df)),
        "total_sample_count":       int(len(df)),
        "_note_pulse_samples": (
            f"Pulse stage: t={rest_end}s to t={pulse_end}s inclusive. "
            f"Sampling at {sampling_interval_s}s interval = {int(pulse_duration_s/sampling_interval_s)+1} samples."
        ),
    }

    metadata = _base_metadata(simulation_id, chemistry, param_set_name, model_name)
    metadata.update({
        "initial_soc": initial_soc,
        "temperature_c": temperature_c,
        "pulse_current_a": pulse_current_a,
        "pulse_duration_s": pulse_duration_s,
        "rest_duration_s": rest_duration_s,
        "relaxation_duration_s": relaxation_duration_s,
        "capacity_ah_override": capacity_ah,
        "solver_status": "SUCCESS",
    })

    return {
        "status": "SUCCESS",
        "simulation_id": simulation_id,
        "chemistry": chemistry,
        "param_set": param_set_name,
        "model": model_name,
        "pybamm_version": PYBAMM_VERSION,
        "timeseries": df,
        "features": features,
        "metadata": metadata,
        "error": None,
    }


# ── Grade classification ─────────────────────────────────────────────────────

def classify_grade(
    features: dict,
    physical_condition: str = "appears_normal",
    config: Optional[dict] = None,
) -> dict:
    """
    Assign a screening grade based on pulse-test features.

    IMPORTANT:
    - Grades are based on synthetic simulation rules only (label_source = 'synthetic_rule').
    - Safety quarantine ALWAYS overrides performance grades.
    - These thresholds are illustrative — NOT validated industry standards.
    - A high performance grade does NOT imply the cell is safe to reuse without
      further physical inspection.

    Returns dict with: grade_label, safety_label, label_source, explanation
    """
    if config is None:
        config = _load_config()

    grading = config["grading"]
    safety_cfg = grading["safety_quarantine"]

    # ── Safety override check (highest priority) ────────────────────────────
    safety_triggers = []

    if physical_condition in safety_cfg["triggers"]["physical_conditions"]:
        safety_triggers.append(
            f"Physical condition '{physical_condition}' triggers safety quarantine "
            f"(simulated scenario — not a real sensor measurement)."
        )

    if not np.isnan(features.get("v_pulse_min_V", float("nan"))):
        if features["v_pulse_min_V"] < safety_cfg["triggers"]["min_voltage_v"]:
            safety_triggers.append(
                f"Simulated voltage {features['v_pulse_min_V']:.3f}V < safety floor "
                f"{safety_cfg['triggers']['min_voltage_v']}V."
            )
        if features["v_before_pulse_V"] > safety_cfg["triggers"]["max_voltage_v"]:
            safety_triggers.append(
                f"Simulated voltage {features['v_before_pulse_V']:.3f}V > safety ceiling "
                f"{safety_cfg['triggers']['max_voltage_v']}V."
            )

    if safety_triggers:
        return {
            "grade_label": "SAFETY_QUARANTINE",
            "safety_label": "QUARANTINE",
            "label_source": "synthetic_rule",
            "explanation": safety_triggers,
        }

    safety_label = "PASS"

    # ── Performance grade ───────────────────────────────────────────────────
    r_mohm = features.get("pulse_resistance_mohm", float("nan"))
    vdrop  = features.get("voltage_drop_V", float("nan"))
    recov  = features.get("recovery_ratio", float("nan"))

    if np.isnan(r_mohm):
        return {
            "grade_label": "UNDETERMINED",
            "safety_label": safety_label,
            "label_source": "synthetic_rule",
            "explanation": ["Pulse resistance could not be computed from simulation output."],
        }

    g_a = grading["grade_A"]
    g_b = grading["grade_B"]
    g_c = grading["grade_C"]
    g_r = grading["recycle_review"]

    if r_mohm >= g_r["min_resistance_mohm"]:
        grade = "RECYCLE_REVIEW"
        expl  = [
            f"Estimated pulse resistance {r_mohm:.1f} mΩ ≥ {g_r['min_resistance_mohm']} mΩ recycle threshold.",
            grading["recycle_review"]["description"],
        ]
    elif (r_mohm <= g_a["max_resistance_mohm"]
          and (np.isnan(vdrop) or vdrop <= g_a["max_voltage_drop_v"])
          and (np.isnan(recov) or recov >= g_a["min_voltage_drop_recovery_ratio"])):
        grade = "GRADE_A"
        expl  = [
            f"Pulse resistance {r_mohm:.1f} mΩ ≤ {g_a['max_resistance_mohm']} mΩ.",
            g_a["description"],
            "label_source: synthetic_rule — requires physical inspection before reuse.",
        ]
    elif r_mohm <= g_b["max_resistance_mohm"]:
        grade = "GRADE_B"
        expl  = [
            f"Pulse resistance {r_mohm:.1f} mΩ within Grade B band ({g_a['max_resistance_mohm']}–{g_b['max_resistance_mohm']} mΩ).",
            g_b["description"],
            "label_source: synthetic_rule — requires further evaluation.",
        ]
    elif r_mohm <= g_c["max_resistance_mohm"]:
        grade = "GRADE_C"
        expl  = [
            f"Pulse resistance {r_mohm:.1f} mΩ within Grade C band ({g_b['max_resistance_mohm']}–{g_c['max_resistance_mohm']} mΩ).",
            g_c["description"],
        ]
    else:
        grade = "RECYCLE_REVIEW"
        expl  = [
            f"Pulse resistance {r_mohm:.1f} mΩ exceeds all reuse screening thresholds.",
            grading["recycle_review"]["description"],
        ]

    return {
        "grade_label":   grade,
        "safety_label":  safety_label,
        "label_source":  "synthetic_rule",
        "explanation":   expl,
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _base_metadata(simulation_id, chemistry, param_set, model):
    return {
        "simulation_id":  simulation_id,
        "chemistry":      chemistry,
        "param_set":      param_set,
        "model":          model,
        "pybamm_version": PYBAMM_VERSION,
        "created_at":     datetime.now(timezone.utc).isoformat(),
        "dataset_type":   "SYNTHETIC",
        "data_source":    "PyBaMM simulation",
        "provenance_note": (
            "SYNTHETIC DATA — PyBaMM SIMULATION — NOT LIVE HARDWARE MEASUREMENTS. "
            "Do not mix with real ESP32 telemetry without explicit source field."
        ),
    }


def _failure_result(error_msg, chemistry, simulation_id, param_set=None, model=None):
    if simulation_id is None:
        simulation_id = f"SIM-FAILED-{uuid.uuid4().hex[:6].upper()}"
    return {
        "status":         "FAILED",
        "simulation_id":  simulation_id,
        "chemistry":      chemistry,
        "param_set":      param_set,
        "model":          model,
        "pybamm_version": PYBAMM_VERSION,
        "timeseries":     pd.DataFrame(),
        "features":       {},
        "metadata":       _base_metadata(simulation_id, chemistry, param_set, model),
        "error":          error_msg,
    }

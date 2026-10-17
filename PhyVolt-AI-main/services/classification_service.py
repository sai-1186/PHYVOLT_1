"""
PhyVolt AI — Battery Cell Classification Service
=================================================
Screens and classifies lithium-ion cells based on diagnostic pulse test features,
simulated degradation indicators, and physical safety conditions.

CRITICAL ARCHITECTURE & SAFETY NOTES:
1. SAFETY OVERRIDE: Physical safety flags or critical voltage boundary violations
   ALWAYS trigger SAFETY_QUARANTINE, overriding all performance indicators.
2. SYNTHETIC & PULSE-TEST RULE BASIS: Labels produced are tagged with
   `label_source: synthetic_rule` or `pulse_screening_rule`.
3. NON-UNIVERSAL THRESHOLDS: The screening bands below are illustrative second-life
   grading guidelines configured in config/simulation_config.json. They do NOT replace
   certified electrochemical testing or physical teardown before commercial reuse.
4. INDEPENDENT SOH: PyBaMM SPM pulse simulation cannot derive true capacity without a
   full C-rate discharge cycle; reference_soh_pct is left unassigned or estimated
   strictly as an indicative throughput metric.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional, List
import numpy as np

CONFIG_PATH = Path(__file__).parent.parent / "config" / "simulation_config.json"


def load_grading_config() -> Dict[str, Any]:
    """Load grading criteria and safety thresholds from simulation_config.json."""
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            return cfg.get("grading", {})
    # Fallback defaults if configuration file is missing
    return {
        "safety_quarantine": {
            "triggers": {
                "physical_conditions": ["swollen", "corrosion", "dented", "punctured", "leaking"],
                "min_voltage_v": 2.50,
                "max_voltage_v": 4.35
            }
        },
        "grade_A": {
            "max_resistance_mohm": 35.0,
            "max_voltage_drop_v": 0.080,
            "min_voltage_drop_recovery_ratio": 0.85,
            "description": "High health tier — suitable for premium stationary or power applications"
        },
        "grade_B": {
            "max_resistance_mohm": 60.0,
            "description": "Medium health tier — suitable for moderate energy storage applications"
        },
        "grade_C": {
            "max_resistance_mohm": 100.0,
            "description": "Degraded health tier — low-demand backup applications only"
        },
        "recycle_review": {
            "min_resistance_mohm": 100.0,
            "description": "Severe degradation — recommend recycling or material recovery"
        }
    }


def classify_grade(
    features: Dict[str, Any],
    physical_condition: str = "appears_normal",
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Assign a screening grade based on pulse-test features and physical inspection.

    Parameters
    ----------
    features : dict
        Extracted features including:
        - pulse_resistance_mohm: float (Internal resistance in mΩ)
        - voltage_drop_V: float (Pulse voltage drop in Volts)
        - recovery_ratio: float (Relaxation voltage recovery ratio)
        - v_pulse_min_V: float (Lowest voltage during pulse)
        - v_before_pulse_V: float (Pre-pulse voltage)
    physical_condition : str
        Visual or physical state (e.g. 'appears_normal', 'swollen', 'corrosion', 'dented')
    config : dict, optional
        Custom config dict containing 'grading' key, or defaults loaded from simulation_config.json

    Returns
    -------
    dict
        {
            "grade_label": "GRADE_A" | "GRADE_B" | "GRADE_C" | "RECYCLE_REVIEW" | "SAFETY_QUARANTINE" | "UNDETERMINED",
            "safety_label": "PASS" | "QUARANTINE",
            "label_source": "synthetic_rule",
            "explanation": List[str]
        }
    """
    if config is not None and "grading" in config:
        grading = config["grading"]
    elif config is not None:
        grading = config
    else:
        grading = load_grading_config()

    safety_cfg = grading.get("safety_quarantine", {})
    safety_triggers_cfg = safety_cfg.get("triggers", {})
    quarantine_conditions = safety_triggers_cfg.get("physical_conditions", [
        "swollen", "corrosion", "dented", "punctured", "leaking"
    ])
    min_voltage_v = safety_triggers_cfg.get("min_voltage_v", 2.50)
    max_voltage_v = safety_triggers_cfg.get("max_voltage_v", 4.35)

    # ── 1. Safety Override Evaluation (Highest Priority) ─────────────────────
    safety_triggers: List[str] = []

    cond_clean = str(physical_condition).strip().lower()
    if cond_clean in quarantine_conditions:
        safety_triggers.append(
            f"Physical condition '{physical_condition}' triggers safety quarantine "
            f"(simulated scenario — requires immediate physical isolation)."
        )

    v_min = features.get("v_pulse_min_V", float("nan"))
    v_before = features.get("v_before_pulse_V", float("nan"))

    if not np.isnan(v_min) and v_min < min_voltage_v:
        safety_triggers.append(
            f"Simulated voltage {v_min:.3f}V below safety cutoff ({min_voltage_v:.2f}V)."
        )
    if not np.isnan(v_before) and v_before > max_voltage_v:
        safety_triggers.append(
            f"Pre-pulse voltage {v_before:.3f}V exceeds maximum safety ceiling ({max_voltage_v:.2f}V)."
        )

    if safety_triggers:
        return {
            "grade_label": "SAFETY_QUARANTINE",
            "safety_label": "QUARANTINE",
            "label_source": "synthetic_rule",
            "explanation": safety_triggers,
        }

    safety_label = "PASS"

    # ── 2. Performance Grade Evaluation ──────────────────────────────────────
    r_mohm = features.get("pulse_resistance_mohm", float("nan"))
    vdrop = features.get("voltage_drop_V", float("nan"))
    recov = features.get("recovery_ratio", float("nan"))

    if np.isnan(r_mohm):
        return {
            "grade_label": "UNDETERMINED",
            "safety_label": safety_label,
            "label_source": "synthetic_rule",
            "explanation": ["Pulse resistance could not be computed from simulation output."],
        }

    g_a = grading.get("grade_A", {"max_resistance_mohm": 35.0, "max_voltage_drop_v": 0.080, "min_voltage_drop_recovery_ratio": 0.85, "description": "High health tier"})
    g_b = grading.get("grade_B", {"max_resistance_mohm": 60.0, "description": "Medium health tier"})
    g_c = grading.get("grade_C", {"max_resistance_mohm": 100.0, "description": "Degraded health tier"})
    g_r = grading.get("recycle_review", {"min_resistance_mohm": 100.0, "description": "Recommend recycling"})

    if r_mohm >= g_r.get("min_resistance_mohm", 100.0):
        grade = "RECYCLE_REVIEW"
        expl = [
            f"Estimated pulse resistance {r_mohm:.1f} mΩ ≥ {g_r.get('min_resistance_mohm', 100.0)} mΩ threshold.",
            g_r.get("description", "Severe degradation — recommend recycling."),
        ]
    elif (r_mohm <= g_a.get("max_resistance_mohm", 35.0)
          and (np.isnan(vdrop) or vdrop <= g_a.get("max_voltage_drop_v", 0.080))
          and (np.isnan(recov) or recov >= g_a.get("min_voltage_drop_recovery_ratio", 0.85))):
        grade = "GRADE_A"
        expl = [
            f"Pulse resistance {r_mohm:.1f} mΩ ≤ {g_a.get('max_resistance_mohm', 35.0)} mΩ.",
            g_a.get("description", "High health tier"),
            "label_source: synthetic_rule — requires physical inspection before reuse.",
        ]
    elif r_mohm <= g_b.get("max_resistance_mohm", 60.0):
        grade = "GRADE_B"
        expl = [
            f"Pulse resistance {r_mohm:.1f} mΩ within Grade B band ({g_a.get('max_resistance_mohm', 35.0)}–{g_b.get('max_resistance_mohm', 60.0)} mΩ).",
            g_b.get("description", "Medium health tier"),
            "label_source: synthetic_rule — requires further evaluation.",
        ]
    elif r_mohm <= g_c.get("max_resistance_mohm", 100.0):
        grade = "GRADE_C"
        expl = [
            f"Pulse resistance {r_mohm:.1f} mΩ within Grade C band ({g_b.get('max_resistance_mohm', 60.0)}–{g_c.get('max_resistance_mohm', 100.0)} mΩ).",
            g_c.get("description", "Degraded health tier"),
        ]
    else:
        grade = "RECYCLE_REVIEW"
        expl = [
            f"Pulse resistance {r_mohm:.1f} mΩ exceeds all reuse screening thresholds.",
            g_r.get("description", "Severe degradation"),
        ]

    return {
        "grade_label": grade,
        "safety_label": safety_label,
        "label_source": "synthetic_rule",
        "explanation": expl,
    }

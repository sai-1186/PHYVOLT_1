"""
PhyVolt AI — Synthetic Dataset Generator
=========================================
Generates PhyVolt AI synthetic battery pulse-test datasets using PyBaMM.

Usage
-----
    python scripts/generate_synthetic_dataset.py [OPTIONS]

Examples
--------
    # Quick test run (5 cells, NMC)
    python scripts/generate_synthetic_dataset.py --num-cells 5

    # 100-cell mixed-chemistry dataset
    python scripts/generate_synthetic_dataset.py --num-cells 100 --chemistry NMC NCA LFP

    # Full options
    python scripts/generate_synthetic_dataset.py \\
        --num-cells 20 \\
        --chemistry NMC LFP \\
        --soc-min 0.2 --soc-max 0.9 \\
        --temp-min 15 --temp-max 35 \\
        --current-min 0.5 --current-max 2.0 \\
        --pulse-duration 120 \\
        --relax-duration 120 \\
        --rest-duration 30 \\
        --seed 42 \\
        --output-dir data/synthetic

Output Files
------------
    data/synthetic/phyvolt_synthetic_pulse_data.csv    — one row per timestamp per cell
    data/synthetic/phyvolt_synthetic_cell_summary.csv  — one row per cell
    data/synthetic/generation_metadata.json            — run configuration

WARNING: All output is SYNTHETIC DATA — PyBaMM SIMULATION — NOT LIVE HARDWARE MEASUREMENTS.
"""

import argparse
import json
import sys
import os
import uuid
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from pathlib import Path

# Configure utf-8 stdout if available
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ── Path setup ───────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from services.simulation_service import (
    run_pulse_simulation,
    classify_grade,
    check_chemistry_support,
    SUPPORTED_PARAM_SETS,
    PYBAMM_VERSION,
)


# ── Constants ─────────────────────────────────────────────────────────────────

CHEMISTRY_PROFILES = {
    "NMC": {"nominal_voltage_V": 3.7, "cell_format": "cylindrical"},
    "NCA": {"nominal_voltage_V": 3.6, "cell_format": "cylindrical"},
    "LFP": {"nominal_voltage_V": 3.2, "cell_format": "prismatic"},
}

BANNER = """
╔══════════════════════════════════════════════════════════════════╗
║   PhyVolt AI — Synthetic Dataset Generator                      ║
║   Source: PyBaMM {version:<8} | SYNTHETIC DATA ONLY            ║
║   NOT live hardware measurements. Not for safety certification. ║
╚══════════════════════════════════════════════════════════════════╝
""".format(version=PYBAMM_VERSION)


# ── CLI ───────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="generate_synthetic_dataset.py",
        description="Generate PhyVolt AI synthetic battery pulse-test datasets using PyBaMM.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--num-cells",       type=int,   default=5,
                   help="Number of cells to simulate (default: 5)")
    p.add_argument("--chemistry",       nargs="+",  default=["NMC"],
                   choices=list(SUPPORTED_PARAM_SETS.keys()),
                   help="Chemistry/chemistries to include (default: NMC)")
    p.add_argument("--soc-min",         type=float, default=0.20,
                   help="Minimum initial SoC 0.0–1.0 (default: 0.20)")
    p.add_argument("--soc-max",         type=float, default=0.90,
                   help="Maximum initial SoC 0.0–1.0 (default: 0.90)")
    p.add_argument("--temp-min",        type=float, default=15.0,
                   help="Minimum ambient temperature °C (default: 15)")
    p.add_argument("--temp-max",        type=float, default=35.0,
                   help="Maximum ambient temperature °C (default: 35)")
    p.add_argument("--current-min",     type=float, default=0.5,
                   help="Minimum pulse current A (default: 0.5)")
    p.add_argument("--current-max",     type=float, default=2.0,
                   help="Maximum pulse current A (default: 2.0)")
    p.add_argument("--pulse-duration",  type=int,   default=120,
                   help="Pulse duration in seconds (default: 120)")
    p.add_argument("--relax-duration",  type=int,   default=120,
                   help="Relaxation duration in seconds (default: 120)")
    p.add_argument("--rest-duration",   type=int,   default=30,
                   help="Initial rest duration in seconds (default: 30)")
    p.add_argument("--capacity-min",    type=float, default=2.5,
                   help="Minimum rated capacity Ah (default: 2.5)")
    p.add_argument("--capacity-max",    type=float, default=5.0,
                   help="Maximum rated capacity Ah (default: 5.0)")
    p.add_argument("--seed",            type=int,   default=42,
                   help="Random seed for reproducibility (default: 42)")
    p.add_argument("--output-dir",      type=str,   default="data/synthetic",
                   help="Output directory (default: data/synthetic)")
    return p


def validate_args(args):
    errors = []
    if args.num_cells < 1:
        errors.append("--num-cells must be ≥ 1")
    if not (0.0 < args.soc_min < args.soc_max <= 1.0):
        errors.append("--soc-min and --soc-max must satisfy 0 < soc_min < soc_max ≤ 1")
    if args.temp_min >= args.temp_max:
        errors.append("--temp-min must be < --temp-max")
    if args.current_min <= 0 or args.current_min >= args.current_max:
        errors.append("--current-min must be > 0 and < --current-max")
    if args.pulse_duration < 1:
        errors.append("--pulse-duration must be ≥ 1")
    if errors:
        for e in errors:
            print(f"  ERROR: {e}", file=sys.stderr)
        sys.exit(1)


# ── Main generation logic ─────────────────────────────────────────────────────

def generate_cell_configs(args) -> list[dict]:
    """Generate randomized but reproducible cell configurations."""
    rng = np.random.default_rng(args.seed)
    chemistries = args.chemistry
    configs = []

    for i in range(args.num_cells):
        chemistry = chemistries[i % len(chemistries)]
        profile   = CHEMISTRY_PROFILES[chemistry]

        soc     = float(rng.uniform(args.soc_min, args.soc_max))
        temp    = float(rng.uniform(args.temp_min, args.temp_max))
        current = float(rng.uniform(args.current_min, args.current_max))
        cap     = float(rng.uniform(args.capacity_min, args.capacity_max))
        cell_id = f"CELL-SYN-{i+1:04d}"

        configs.append({
            "cell_id":        cell_id,
            "chemistry":      chemistry,
            "nominal_voltage_V": profile["nominal_voltage_V"],
            "cell_format":    profile["cell_format"],
            "rated_capacity_Ah": round(cap, 3),
            "initial_soc_pct": round(soc * 100, 2),
            "ambient_temperature_C": round(temp, 2),
            "pulse_current_A": round(current, 3),
        })

    return configs


def run_batch(configs: list[dict], args) -> tuple[list[pd.DataFrame], list[dict], list[dict]]:
    """Run simulations for all cells. Returns (timeseries_frames, summary_rows, metadata_list)."""
    ts_frames  = []
    summaries  = []
    run_meta   = []
    successes  = 0
    failures   = 0
    batch_id   = f"BATCH-{uuid.uuid4().hex[:6].upper()}"

    print(f"\n  Batch ID: {batch_id}  |  Cells: {len(configs)}")
    print(f"  {'Cell ID':<20} {'Chem':<6} {'SoC%':<6} {'T°C':<6} {'I(A)':<6} {'Status':<12} {'Grade'}")
    print("  " + "-" * 78)

    for cfg in configs:
        result = run_pulse_simulation(
            chemistry         = cfg["chemistry"],
            initial_soc       = cfg["initial_soc_pct"] / 100.0,
            temperature_c     = cfg["ambient_temperature_C"],
            pulse_current_a   = cfg["pulse_current_A"],
            pulse_duration_s  = args.pulse_duration,
            rest_duration_s   = args.rest_duration,
            relaxation_duration_s = args.relax_duration,
            capacity_ah       = cfg["rated_capacity_Ah"],
        )

        status = result["status"]
        sim_id = result["simulation_id"]
        feats  = result["features"]

        if status == "SUCCESS":
            grade_info = classify_grade(feats)
            successes += 1
        elif status == "UNSUPPORTED":
            grade_info = {"grade_label": "N/A", "safety_label": "N/A", "label_source": "unsupported", "explanation": [result["error"]]}
            failures += 1
        else:
            grade_info = {"grade_label": "SIMULATION_FAILED", "safety_label": "UNKNOWN", "label_source": "simulation_failed", "explanation": [result["error"]]}
            failures += 1

        print(f"  {cfg['cell_id']:<20} {cfg['chemistry']:<6} "
              f"{cfg['initial_soc_pct']:<6.1f} {cfg['ambient_temperature_C']:<6.1f} "
              f"{cfg['pulse_current_A']:<6.2f} {status:<12} {grade_info['grade_label']}")

        # ── Build time-series rows ──────────────────────────────────────────
        if status == "SUCCESS" and not result["timeseries"].empty:
            df = result["timeseries"].copy()
            df.insert(0, "dataset_type",          "SYNTHETIC")
            df.insert(1, "data_source",            "PyBaMM simulation")
            df.insert(2, "simulation_id",          sim_id)
            df.insert(3, "cell_id",                cfg["cell_id"])
            df.insert(4, "chemistry",              cfg["chemistry"])
            df.insert(5, "cell_format",            cfg["cell_format"])
            df.insert(6, "nominal_voltage_V",      cfg["nominal_voltage_V"])
            df.insert(7, "rated_capacity_Ah",      cfg["rated_capacity_Ah"])
            df.insert(8, "initial_soc_pct",        cfg["initial_soc_pct"])
            df.insert(9, "ambient_temperature_C",  cfg["ambient_temperature_C"])
            # voltage_drop per row = v_before - current voltage (pulse stage only)
            v_before = feats.get("v_before_pulse_V", float("nan"))
            df["voltage_drop_V"] = df.apply(
                lambda r: round(v_before - r["voltage_V"], 6) if r["test_stage"] == "PULSE" else float("nan"),
                axis=1,
            )
            df["estimated_resistance_mohm"] = df.apply(
                lambda r: round(feats.get("pulse_resistance_mohm", float("nan")), 3)
                          if r["test_stage"] == "PULSE" else float("nan"),
                axis=1,
            )
            df["simulation_model"]    = result["model"]
            df["parameter_set"]       = result["param_set"]
            df["simulation_status"]   = status
            ts_frames.append(df)

        # ── Build summary row ───────────────────────────────────────────────
        relax_feat_str = json.dumps({
            "v_relax_1s":  feats.get("v_relaxation_1s_V"),
            "v_relax_10s": feats.get("v_relaxation_10s_V"),
            "v_relax_60s": feats.get("v_relaxation_60s_V"),
            "recovery_ratio": feats.get("recovery_ratio"),
        }) if feats else "{}"

        summary = {
            "cell_id":                 cfg["cell_id"],
            "simulation_id":           sim_id,
            "batch_id":                batch_id,
            "dataset_type":            "SYNTHETIC",
            "data_source":             "PyBaMM simulation",
            "chemistry":               cfg["chemistry"],
            "cell_format":             cfg["cell_format"],
            "rated_capacity_Ah":       cfg["rated_capacity_Ah"],
            # reference_capacity_Ah: not available — SPM does not provide reference
            # capacity independent of the simulation itself.
            "reference_capacity_Ah":   None,
            "reference_soh_pct":       None,
            "_soh_note": (
                "reference_soh_pct is unavailable: SPM pulse simulation cannot derive "
                "independent reference capacity. A validated degradation model or "
                "separate full-charge reference simulation would be required."
            ),
            "initial_soc_pct":         cfg["initial_soc_pct"],
            "ambient_temperature_C":   cfg["ambient_temperature_C"],
            "pulse_current_A":         cfg["pulse_current_A"],
            "pulse_duration_s":        args.pulse_duration,
            "voltage_drop_V":          feats.get("voltage_drop_V"),
            "estimated_resistance_mohm": feats.get("pulse_resistance_mohm"),
            "relaxation_features":     relax_feat_str,
            "grade_label":             grade_info["grade_label"],
            "safety_label":            grade_info["safety_label"],
            "label_source":            grade_info["label_source"],
            "grade_explanation":       " | ".join(grade_info["explanation"]),
            "simulation_model":        result["model"],
            "parameter_set":           result["param_set"],
            "pybamm_version":          result["pybamm_version"],
            "simulation_status":       status,
            "simulation_error":        result["error"] or "",
        }
        summaries.append(summary)
        run_meta.append(result["metadata"])

    print(f"\n  Results: {successes} succeeded, {failures} failed/unsupported")
    return ts_frames, summaries, run_meta, batch_id


def validate_output(pulse_df: pd.DataFrame, summary_df: pd.DataFrame):
    """Data quality checks on generated output."""
    issues = []

    required_pulse_cols = [
        "dataset_type", "simulation_id", "cell_id", "chemistry",
        "elapsed_time_s", "test_stage", "current_A", "voltage_V",
        "simulation_model", "parameter_set", "simulation_status",
    ]
    for col in required_pulse_cols:
        if col not in pulse_df.columns:
            issues.append(f"  MISSING pulse column: {col}")

    if not pulse_df.empty:
        if not np.isfinite(pulse_df["voltage_V"].dropna()).all():
            issues.append("  Non-finite voltage values detected")
        if not np.isfinite(pulse_df["current_A"].dropna()).all():
            issues.append("  Non-finite current values detected")
        for cell_id, grp in pulse_df.groupby("cell_id"):
            if not grp["elapsed_time_s"].is_monotonic_increasing:
                issues.append(f"  Timestamps not monotonically increasing for {cell_id}")

    if issues:
        print("\n  Data Quality Warnings:")
        for iss in issues:
            print(iss)
    else:
        print("  Data quality checks: all PASSED")

    return issues


def write_outputs(ts_frames, summaries, run_meta, batch_id, args):
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pulse_path   = out_dir / "phyvolt_synthetic_pulse_data.csv"
    summary_path = out_dir / "phyvolt_synthetic_cell_summary.csv"
    meta_path    = out_dir / "generation_metadata.json"

    if ts_frames:
        pulse_df = pd.concat(ts_frames, ignore_index=True)
    else:
        pulse_df = pd.DataFrame()

    summary_df = pd.DataFrame(summaries)

    pulse_df.to_csv(pulse_path, index=False)
    summary_df.to_csv(summary_path, index=False)

    meta = {
        "batch_id":           batch_id,
        "created_at":         datetime.now(timezone.utc).isoformat(),
        "pybamm_version":     PYBAMM_VERSION,
        "dataset_type":       "SYNTHETIC",
        "provenance_warning": (
            "SYNTHETIC DATA — PyBaMM SIMULATION — NOT LIVE HARDWARE MEASUREMENTS. "
            "Do not mix with real ESP32 telemetry without an explicit data_source field."
        ),
        "generation_config": {
            "num_cells":        args.num_cells,
            "chemistry":        args.chemistry,
            "soc_range":        [args.soc_min, args.soc_max],
            "temp_range_c":     [args.temp_min, args.temp_max],
            "current_range_a":  [args.current_min, args.current_max],
            "pulse_duration_s": args.pulse_duration,
            "relax_duration_s": args.relax_duration,
            "rest_duration_s":  args.rest_duration,
            "capacity_range_ah": [args.capacity_min, args.capacity_max],
            "random_seed":      args.seed,
        },
        "output_files": {
            "pulse_data_csv":    str(pulse_path),
            "cell_summary_csv":  str(summary_path),
        },
        "simulation_run_metadata": run_meta,
    }
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2, default=str)

    return pulse_df, summary_df, pulse_path, summary_path, meta_path


def main():
    print(BANNER)
    parser = build_parser()
    args   = parser.parse_args()
    validate_args(args)

    print(f"  Chemistry:    {args.chemistry}")
    print(f"  Cells:        {args.num_cells}")
    print(f"  SoC range:    {args.soc_min*100:.0f}% – {args.soc_max*100:.0f}%")
    print(f"  Temp range:   {args.temp_min}°C – {args.temp_max}°C")
    print(f"  Current:      {args.current_min}A – {args.current_max}A")
    print(f"  Pulse:        {args.pulse_duration}s  Relax: {args.relax_duration}s  Rest: {args.rest_duration}s")
    print(f"  Seed:         {args.seed}")
    print(f"  Output dir:   {args.output_dir}")

    configs = generate_cell_configs(args)
    ts_frames, summaries, run_meta, batch_id = run_batch(configs, args)

    print("\n  Writing output files...")
    pulse_df, summary_df, pulse_path, summary_path, meta_path = write_outputs(
        ts_frames, summaries, run_meta, batch_id, args
    )

    print("\n  Validating output...")
    validate_output(pulse_df, summary_df)

    print(f"""
  ✓ Done
  ┌─ Output files ───────────────────────────────────────────────────┐
  │  Pulse data:   {str(pulse_path):<52} │
  │  Cell summary: {str(summary_path):<52} │
  │  Metadata:     {str(meta_path):<52} │
  └──────────────────────────────────────────────────────────────────┘
  ⚠  SYNTHETIC DATA ONLY — NOT live hardware measurements.
""")


if __name__ == "__main__":
    main()

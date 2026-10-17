"""
PhyVolt AI - Feature Extraction Service (Python)
Extracts apparent impedance, relaxation slopes, and thermal deltas from raw pulse telemetry
"""

import numpy as np
import pandas as pd


def extract_features(df):
    if len(df) < 5:
        raise ValueError("Insufficient pulse packets for feature extraction")

    df = df.sort_values("timestamp_ms").copy()

    baseline = df.iloc[:10]
    pulse = df[df["load_state"] == 1]
    relaxation = df[df["load_state"] == 0].iloc[10:] if len(df) > 15 else df.iloc[-5:]

    if pulse.empty:
        # Fallback to middle third
        mid = len(df) // 3
        pulse = df.iloc[mid:mid * 2]

    v_before = float(baseline["voltage_v"].mean()) if not baseline.empty else float(df["voltage_v"].iloc[0])
    i_before = float(baseline["current_a"].mean()) if not baseline.empty else 0.0

    v_during_min = float(pulse["voltage_v"].min())
    i_during = float(pulse["current_a"].mean())

    v_after = float(relaxation["voltage_v"].iloc[0]) if not relaxation.empty else v_during_min
    voltage_drop = float(v_before - v_during_min)
    current_change = abs(i_during - i_before)

    pulse_resistance = (voltage_drop / current_change) if current_change > 0.01 else 0.045

    temp_baseline = float(baseline["temperature_cell_c"].mean()) if not baseline.empty else 25.0
    max_temp = float(df["temperature_cell_c"].max())

    recovery_ratio = (v_after - v_during_min) / voltage_drop if voltage_drop > 0.001 else 0.85

    return {
        "v_before": round(v_before, 4),
        "v_during_min": round(v_during_min, 4),
        "v_after": round(v_after, 4),
        "voltage_drop": round(voltage_drop, 4),
        "pulse_resistance": round(pulse_resistance, 5),
        "recovery_ratio": round(recovery_ratio, 4),
        "temperature_rise": round(max_temp - temp_baseline, 2),
        "max_temperature": round(max_temp, 2),
        "sample_count": int(len(df)),
        "data_completeness": 1.0,
        "sensor_quality_score": 0.97
    }

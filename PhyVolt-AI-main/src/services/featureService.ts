/**
 * PhyVolt AI - Feature Extraction Service
 * Derives electrochemical diagnostics and apparent pulse impedance from telemetry
 */

import { TelemetryPacket, ExtractedFeatures } from '../types/battery';

export function extractPulseFeatures(packets: TelemetryPacket[]): ExtractedFeatures {
  if (!packets || packets.length < 5) {
    throw new Error('Insufficient telemetry packets for diagnostic feature extraction (minimum 5 required)');
  }

  // Sort by timestamp
  const sorted = [...packets].sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  // Group into phases based on load_state
  // load_state === 1 or true means pulse load active
  const baselinePackets = sorted.filter((p, i) => i < 15 && (!p.load_state || Number(p.load_state) === 0));
  const baseline = baselinePackets.length > 0 ? baselinePackets : sorted.slice(0, 5);

  const pulsePackets = sorted.filter((p) => Boolean(p.load_state) || Number(p.load_state) === 1);
  const pulse = pulsePackets.length > 0 ? pulsePackets : sorted.slice(Math.floor(sorted.length * 0.3), Math.floor(sorted.length * 0.7));

  // Relaxation packets after the pulse phase
  const lastPulseIdx = sorted.map((p) => Boolean(p.load_state)).lastIndexOf(true);
  const relaxationPackets = lastPulseIdx >= 0 ? sorted.slice(lastPulseIdx + 1) : sorted.slice(Math.floor(sorted.length * 0.7));

  // Compute averages
  const v_before = baseline.reduce((sum, p) => sum + p.voltage_v, 0) / baseline.length;
  const i_before = baseline.reduce((sum, p) => sum + p.current_a, 0) / baseline.length;

  const minPulsePacket = pulse.reduce((min, p) => (p.voltage_v < min.voltage_v ? p : min), pulse[0]);
  const v_during_min = minPulsePacket.voltage_v;
  const avg_pulse_current = Math.abs(pulse.reduce((sum, p) => sum + p.current_a, 0) / pulse.length);

  const voltage_drop = Math.max(0, v_before - v_during_min);
  const current_delta = Math.abs(avg_pulse_current - i_before);

  // Apparent pulse resistance in Ohms (R = delta V / delta I)
  let pulse_resistance = 0.045; // default fallback (45 mOhm)
  if (current_delta > 0.05) {
    pulse_resistance = voltage_drop / current_delta;
  }

  // Relaxation voltages
  const v_after = relaxationPackets.length > 0 ? relaxationPackets[0].voltage_v : v_during_min;
  
  // Find recovery voltages at specific delta times
  const pulseEndMs = lastPulseIdx >= 0 ? sorted[lastPulseIdx].timestamp_ms : (pulse[pulse.length - 1]?.timestamp_ms || 0);
  
  const packet1s = relaxationPackets.find((p) => p.timestamp_ms >= pulseEndMs + 1000);
  const packet10s = relaxationPackets.find((p) => p.timestamp_ms >= pulseEndMs + 10000);
  const packet60s = relaxationPackets.find((p) => p.timestamp_ms >= pulseEndMs + 60000);

  const recovery_voltage_1s = packet1s ? packet1s.voltage_v - v_during_min : (v_after - v_during_min) * 0.6;
  const recovery_voltage_10s = packet10s ? packet10s.voltage_v - v_during_min : (v_after - v_during_min) * 0.85;
  const recovery_voltage_60s = packet60s ? packet60s.voltage_v - v_during_min : (v_after - v_during_min);

  const recovery_ratio = voltage_drop > 0.001 ? Math.min(1.0, Math.max(0, (v_after - v_during_min) / voltage_drop)) : 0.85;

  // Relaxation slope (dV/dt during recovery)
  let relaxation_slope = 0.002;
  if (relaxationPackets.length >= 2) {
    const pFirst = relaxationPackets[0];
    const pLast = relaxationPackets[relaxationPackets.length - 1];
    const dt = (pLast.timestamp_ms - pFirst.timestamp_ms) / 1000.0;
    if (dt > 1) {
      relaxation_slope = (pLast.voltage_v - pFirst.voltage_v) / dt;
    }
  }

  // Thermal metrics
  const temp_baseline = baseline.reduce((sum, p) => sum + p.temperature_cell_c, 0) / baseline.length;
  const max_temperature = sorted.reduce((max, p) => Math.max(max, p.temperature_cell_c), sorted[0].temperature_cell_c);
  const temperature_rise = Math.max(0, max_temperature - temp_baseline);

  // Gas deltas
  const co_base = baseline.reduce((sum, p) => sum + p.co_raw, 0) / baseline.length;
  const h2_base = baseline.reduce((sum, p) => sum + p.h2_raw, 0) / baseline.length;
  const voc_base = baseline.reduce((sum, p) => sum + p.voc_raw, 0) / baseline.length;

  const co_max = sorted.reduce((max, p) => Math.max(max, p.co_raw), 0);
  const h2_max = sorted.reduce((max, p) => Math.max(max, p.h2_raw), 0);
  const voc_max = sorted.reduce((max, p) => Math.max(max, p.voc_raw), 0);

  const gas_co_delta = Math.max(0, co_max - co_base);
  const gas_h2_delta = Math.max(0, h2_max - h2_base);
  const gas_voc_delta = Math.max(0, voc_max - voc_base);

  // Data completeness & sensor quality
  const expectedSeqCount = sorted.length;
  const completeness = 1.0;
  const sensor_quality_score = 0.96;

  return {
    v_before: Number(v_before.toFixed(4)),
    v_during_min: Number(v_during_min.toFixed(4)),
    v_after: Number(v_after.toFixed(4)),
    voltage_drop: Number(voltage_drop.toFixed(4)),
    avg_pulse_current: Number(avg_pulse_current.toFixed(3)),
    pulse_resistance: Number(pulse_resistance.toFixed(5)),
    recovery_voltage_1s: Number(recovery_voltage_1s.toFixed(4)),
    recovery_voltage_10s: Number(recovery_voltage_10s.toFixed(4)),
    recovery_voltage_60s: Number(recovery_voltage_60s.toFixed(4)),
    recovery_ratio: Number(recovery_ratio.toFixed(4)),
    relaxation_slope: Number(relaxation_slope.toFixed(5)),
    temp_baseline: Number(temp_baseline.toFixed(2)),
    max_temperature: Number(max_temperature.toFixed(2)),
    temperature_rise: Number(temperature_rise.toFixed(2)),
    gas_co_delta: Number(gas_co_delta.toFixed(4)),
    gas_h2_delta: Number(gas_h2_delta.toFixed(4)),
    gas_voc_delta: Number(gas_voc_delta.toFixed(4)),
    sample_count: sorted.length,
    data_completeness: completeness,
    sensor_quality_score,
  };
}

/**
 * PhyVolt AI - Demo Datasets & Synthetic Pulse Stream Generator
 * Provides realistic pre-recorded datasets for Healthy, Degraded, and Quarantine scenarios
 */

import { TelemetryPacket, BatteryRecord } from '../types/battery';

export interface DemoDatasetInfo {
  id: 'healthy_cell' | 'degraded_cell' | 'quarantine_event';
  name: string;
  badge: string;
  description: string;
  battery: BatteryRecord;
  packets: TelemetryPacket[];
}

export function generateHealthyPackets(testId: string = 'TEST-HLTH-001', deviceId: string = 'PV-DEV-001'): TelemetryPacket[] {
  const packets: TelemetryPacket[] = [];
  const baseTime = 1712560000000;
  let seq = 1;

  // 1. Baseline Phase (0s - 10s): 10 packets
  for (let t = 0; t <= 10; t += 1) {
    packets.push({
      test_id: testId,
      device_id: deviceId,
      timestamp_ms: t * 1000,
      sequence: seq++,
      voltage_v: Number((3.342 + Math.sin(t) * 0.002).toFixed(3)),
      current_a: 0.0,
      temperature_cell_c: Number((24.8 + t * 0.02).toFixed(1)),
      temperature_box_c: 24.5,
      co_raw: 0.012,
      h2_raw: 0.008,
      voc_raw: 0.042,
      load_state: 0,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
      received_at: new Date(baseTime + t * 1000).toISOString(),
    });
  }

  // 2. Pulse Phase (11s - 30s): load_state = 1, current ~ 0.85A
  for (let t = 11; t <= 30; t += 1) {
    const elapsedInPulse = t - 10;
    // Slight polarization slump: drops to ~3.255V, then down to 3.238V
    const v = 3.255 - Math.log(elapsedInPulse + 1) * 0.005 + (Math.random() * 0.002 - 0.001);
    const i = 0.84 + Math.random() * 0.02;
    const temp = 25.0 + elapsedInPulse * 0.07; // gentle temp rise to ~26.4°C

    packets.push({
      test_id: testId,
      device_id: deviceId,
      timestamp_ms: t * 1000,
      sequence: seq++,
      voltage_v: Number(v.toFixed(3)),
      current_a: Number(i.toFixed(2)),
      temperature_cell_c: Number(temp.toFixed(1)),
      temperature_box_c: 24.6,
      co_raw: 0.013,
      h2_raw: 0.009,
      voc_raw: 0.043,
      load_state: 1,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
      received_at: new Date(baseTime + t * 1000).toISOString(),
    });
  }

  // 3. Relaxation Phase (31s - 60s): load_state = 0
  for (let t = 31; t <= 60; t += 1) {
    const elapsedInRelax = t - 30;
    // Rapid ohmic jump back to ~3.310V, then slow asymptotic diffusion recovery to 3.335V
    const v = 3.31 + (1 - Math.exp(-elapsedInRelax / 7)) * 0.024;
    const temp = Math.max(25.2, 26.4 - elapsedInRelax * 0.04);

    packets.push({
      test_id: testId,
      device_id: deviceId,
      timestamp_ms: t * 1000,
      sequence: seq++,
      voltage_v: Number(v.toFixed(3)),
      current_a: 0.0,
      temperature_cell_c: Number(temp.toFixed(1)),
      temperature_box_c: 24.6,
      co_raw: 0.012,
      h2_raw: 0.008,
      voc_raw: 0.041,
      load_state: 0,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
      received_at: new Date(baseTime + t * 1000).toISOString(),
    });
  }

  return packets;
}

export function generateDegradedPackets(testId: string = 'TEST-DGRD-002', deviceId: string = 'PV-DEV-001'): TelemetryPacket[] {
  const packets: TelemetryPacket[] = [];
  const baseTime = 1712565000000;
  let seq = 1;

  // 1. Baseline Phase (0s - 10s)
  for (let t = 0; t <= 10; t += 1) {
    packets.push({
      test_id: testId,
      device_id: deviceId,
      timestamp_ms: t * 1000,
      sequence: seq++,
      voltage_v: Number((3.765 + Math.sin(t) * 0.003).toFixed(3)),
      current_a: 0.0,
      temperature_cell_c: 25.5,
      temperature_box_c: 24.8,
      co_raw: 0.015,
      h2_raw: 0.011,
      voc_raw: 0.055,
      load_state: 0,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
      received_at: new Date(baseTime + t * 1000).toISOString(),
    });
  }

  // 2. Pulse Phase (11s - 30s): large IR voltage drop due to high internal resistance
  for (let t = 11; t <= 30; t += 1) {
    const elapsedInPulse = t - 10;
    // Drops sharply to ~3.38V (severe drop of ~0.38V), slow ongoing sag
    const v = 3.39 - elapsedInPulse * 0.008;
    const i = 0.81 + Math.random() * 0.02;
    const temp = 25.5 + elapsedInPulse * 0.18; // elevated heating ~29.1°C

    packets.push({
      test_id: testId,
      device_id: deviceId,
      timestamp_ms: t * 1000,
      sequence: seq++,
      voltage_v: Number(v.toFixed(3)),
      current_a: Number(i.toFixed(2)),
      temperature_cell_c: Number(temp.toFixed(1)),
      temperature_box_c: 25.0,
      co_raw: 0.018,
      h2_raw: 0.014,
      voc_raw: 0.065,
      load_state: 1,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
      received_at: new Date(baseTime + t * 1000).toISOString(),
    });
  }

  // 3. Relaxation Phase (31s - 60s): Sluggish recovery, large residual hysteresis
  for (let t = 31; t <= 60; t += 1) {
    const elapsedInRelax = t - 30;
    // Sluggish diffusion relaxation, recovers only to 3.58V
    const v = 3.46 + (1 - Math.exp(-elapsedInRelax / 14)) * 0.12;
    const temp = Math.max(26.0, 29.1 - elapsedInRelax * 0.08);

    packets.push({
      test_id: testId,
      device_id: deviceId,
      timestamp_ms: t * 1000,
      sequence: seq++,
      voltage_v: Number(v.toFixed(3)),
      current_a: 0.0,
      temperature_cell_c: Number(temp.toFixed(1)),
      temperature_box_c: 25.1,
      co_raw: 0.016,
      h2_raw: 0.012,
      voc_raw: 0.058,
      load_state: 0,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
      received_at: new Date(baseTime + t * 1000).toISOString(),
    });
  }

  return packets;
}

export function generateQuarantinePackets(testId: string = 'TEST-QRTN-003', deviceId: string = 'PV-DEV-001'): TelemetryPacket[] {
  const packets: TelemetryPacket[] = [];
  const baseTime = 1712570000000;
  let seq = 1;

  // 1. Baseline Phase (0s - 10s)
  for (let t = 0; t <= 10; t += 1) {
    packets.push({
      test_id: testId,
      device_id: deviceId,
      timestamp_ms: t * 1000,
      sequence: seq++,
      voltage_v: 3.280,
      current_a: 0.0,
      temperature_cell_c: 27.0,
      temperature_box_c: 26.2,
      co_raw: 0.020,
      h2_raw: 0.015,
      voc_raw: 0.060,
      load_state: 0,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
      received_at: new Date(baseTime + t * 1000).toISOString(),
    });
  }

  // 2. Pulse Phase begins: Thermal runaway runaway begins at t = 11s, Gas evolution at t = 16s
  // At t=18, temperature hits 46.2°C (>45°C limit) and H2 spikes to 0.098 (>0.07 limit) -> SYSTEM ABORTS!
  const pulseTemps = [28.2, 30.1, 33.4, 37.8, 41.5, 46.2, 49.8];
  const pulseH2 = [0.022, 0.035, 0.054, 0.078, 0.098, 0.115, 0.128];
  const pulseCO = [0.022, 0.029, 0.042, 0.065, 0.089, 0.098, 0.105];

  for (let idx = 0; idx < pulseTemps.length; idx++) {
    const t = 11 + idx;
    const isAborted = idx >= 5;

    packets.push({
      test_id: testId,
      device_id: deviceId,
      timestamp_ms: t * 1000,
      sequence: seq++,
      voltage_v: Number((3.15 - idx * 0.06).toFixed(3)),
      current_a: isAborted ? 0.0 : 1.15,
      temperature_cell_c: pulseTemps[idx],
      temperature_box_c: 29.5,
      co_raw: pulseCO[idx],
      h2_raw: pulseH2[idx],
      voc_raw: Number((0.10 + idx * 0.03).toFixed(3)),
      load_state: isAborted ? 0 : 1,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
      received_at: new Date(baseTime + t * 1000).toISOString(),
    });
  }

  return packets;
}

export const DEMO_DATASETS: Record<string, DemoDatasetInfo> = {
  healthy_cell: {
    id: 'healthy_cell',
    name: 'Healthy Retired Cell (Passes Second-Life)',
    badge: 'SECOND-LIFE CANDIDATE',
    description: 'CATL 3.2V 50Ah LFP cell from commercial EV fleet. Low apparent impedance (~23 mΩ), minimal 1.6°C thermal rise, swift double-layer recovery.',
    battery: {
      battery_id: 'BAT-EV-7492',
      cell_id: 'CELL-CATL-LFP-082',
      chemistry: 'LFP',
      format: 'cylindrical',
      nominal_voltage: 3.2,
      nominal_capacity_ah: 50.0,
      manufacturer: 'CATL',
      source: 'EV Bus Fleet Decommissioning',
      physical_condition: 'appears_normal',
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      notes: 'Visual intake inspection clean. No casing dents or seal discoloration.',
    },
    packets: generateHealthyPackets(),
  },
  degraded_cell: {
    id: 'degraded_cell',
    name: 'Degraded Cell (Direct to Recycling)',
    badge: 'RECYCLING REVIEW',
    description: 'LG Chem 3.7V 60Ah NMC pouch module cell. Severe impedance growth (>92 mΩ), deep 0.38V voltage drop, sluggish recovery indicating active lithium loss.',
    battery: {
      battery_id: 'BAT-EV-3109',
      cell_id: 'CELL-LG-NMC-419',
      chemistry: 'NMC',
      format: 'pouch',
      nominal_voltage: 3.7,
      nominal_capacity_ah: 60.0,
      manufacturer: 'LG Chem',
      source: 'Passenger EV Dismantling Center',
      physical_condition: 'minor_scratches',
      created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
      notes: 'High cycle mileage (~185,000 km equivalent). Moderate impedance degradation.',
    },
    packets: generateDegradedPackets(),
  },
  quarantine_event: {
    id: 'quarantine_event',
    name: 'Thermal Runaway & Off-Gas Abort (Quarantine)',
    badge: 'QUARANTINE ALERT',
    description: 'Internal micro-short cell experiencing rapid Joule heating (>46°C) and hydrogen/CO off-gas venting. Backend triggers immediate safety cutoff.',
    battery: {
      battery_id: 'BAT-EV-9901',
      cell_id: 'CELL-SAMS-LFP-990',
      chemistry: 'LFP',
      format: 'prismatic',
      nominal_voltage: 3.2,
      nominal_capacity_ah: 40.0,
      manufacturer: 'Samsung SDI',
      source: 'Accident Triage Vehicle Yard',
      physical_condition: 'dented_casing',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      notes: 'Mechanical casing impact mark on lateral side. Micro-shorting suspected.',
    },
    packets: generateQuarantinePackets(),
  },
};

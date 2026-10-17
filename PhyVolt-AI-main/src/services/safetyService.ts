/**
 * PhyVolt AI - Safety Evaluation Engine
 * Multi-layer hardware & software limits, thermal runaway detection, and gas-sensor screening
 */

import { TelemetryPacket, SafetyStatus, BatteryChemistry } from '../types/battery';

export interface SafetyEvaluationResult {
  status: SafetyStatus;
  action: 'CONTINUE' | 'WARN' | 'STOP' | 'EMERGENCY_QUARANTINE';
  reasons: string[];
  metrics: {
    tempDeltaMax: number;
    voltageDeltaMax: number;
    gasAlertLevel: 'NORMAL' | 'ELEVATED' | 'HAZARDOUS';
  };
}

export const SAFETY_LIMITS = {
  // Demo limits - calibrated for single-cell bench tests
  TEMP_ABORT_MAX: 45.0, // °C
  TEMP_QUARANTINE_MAX: 52.0, // °C
  TEMP_ABORT_MIN: 0.0, // °C
  CURRENT_LIMIT_MAX: 2.2, // A
  CURRENT_WARN_MAX: 1.8, // A
  GAS_CO_THRESHOLD: 0.08, // arbitrary raw sensor delta
  GAS_H2_THRESHOLD: 0.07, // arbitrary raw sensor delta
  GAS_VOC_THRESHOLD: 0.18, // arbitrary raw sensor delta
  RATE_OF_TEMP_RISE_MAX: 1.5, // °C / sec
};

export const CHEMISTRY_VOLTAGE_BOUNDS: Record<BatteryChemistry, { min: number; max: number; nominal: number }> = {
  LFP: { min: 2.0, max: 3.65, nominal: 3.2 },
  NMC: { min: 2.7, max: 4.25, nominal: 3.7 },
  NCA: { min: 2.7, max: 4.25, nominal: 3.6 },
  LTO: { min: 1.5, max: 2.85, nominal: 2.3 },
};

export function evaluateTelemetryPacket(
  packet: TelemetryPacket,
  chemistry: BatteryChemistry = 'LFP',
  previousPacket?: TelemetryPacket
): SafetyEvaluationResult {
  const reasons: string[] = [];
  const bounds = CHEMISTRY_VOLTAGE_BOUNDS[chemistry] || CHEMISTRY_VOLTAGE_BOUNDS.LFP;

  const v = packet.voltage_v;
  const currentAbs = Math.abs(packet.current_a);
  const tempCell = packet.temperature_cell_c;

  let isQuarantine = false;
  let isAbort = false;
  let isWarning = false;

  // 1. Extreme Thermal Safety (Thermal Runaway Early Warning)
  if (tempCell >= SAFETY_LIMITS.TEMP_QUARANTINE_MAX) {
    reasons.push(`Cell temperature critical: ${tempCell.toFixed(1)}°C exceeds quarantine limit (${SAFETY_LIMITS.TEMP_QUARANTINE_MAX}°C)`);
    isQuarantine = true;
  } else if (tempCell >= SAFETY_LIMITS.TEMP_ABORT_MAX) {
    reasons.push(`Cell temperature ${tempCell.toFixed(1)}°C exceeds safe testing ceiling (${SAFETY_LIMITS.TEMP_ABORT_MAX}°C)`);
    isAbort = true;
  } else if (tempCell >= 40.0) {
    reasons.push(`Elevated cell temperature: ${tempCell.toFixed(1)}°C (advisory threshold 40°C)`);
    isWarning = true;
  }

  if (tempCell <= SAFETY_LIMITS.TEMP_ABORT_MIN) {
    reasons.push(`Cell temperature below demo lower limit (${tempCell.toFixed(1)}°C < ${SAFETY_LIMITS.TEMP_ABORT_MIN}°C)`);
    isAbort = true;
  }

  // 2. Temperature Rise Rate (dT/dt)
  let tempDeltaMax = 0;
  if (previousPacket && packet.timestamp_ms > previousPacket.timestamp_ms) {
    const dtSeconds = (packet.timestamp_ms - previousPacket.timestamp_ms) / 1000.0;
    if (dtSeconds > 0) {
      const dTemp = (tempCell - previousPacket.temperature_cell_c) / dtSeconds;
      tempDeltaMax = dTemp;
      if (dTemp > SAFETY_LIMITS.RATE_OF_TEMP_RISE_MAX) {
        reasons.push(`Abnormal thermal rate of change: +${dTemp.toFixed(2)}°C/s exceeds ${SAFETY_LIMITS.RATE_OF_TEMP_RISE_MAX}°C/s`);
        isQuarantine = true;
      }
    }
  }

  // 3. Voltage Safety Range
  if (v < bounds.min) {
    reasons.push(`Cell voltage ${v.toFixed(3)}V below cutoff limit (${bounds.min}V for ${chemistry}) - risk of copper dissolution`);
    isAbort = true;
  } else if (v > bounds.max) {
    reasons.push(`Cell voltage ${v.toFixed(3)}V exceeds overvoltage threshold (${bounds.max}V for ${chemistry})`);
    isAbort = true;
  }

  // 4. Overcurrent Protection
  if (currentAbs > SAFETY_LIMITS.CURRENT_LIMIT_MAX) {
    reasons.push(`Pulse current ${currentAbs.toFixed(2)}A exceeds hardware load threshold (${SAFETY_LIMITS.CURRENT_LIMIT_MAX}A)`);
    isAbort = true;
  } else if (currentAbs > SAFETY_LIMITS.CURRENT_WARN_MAX) {
    reasons.push(`Current draw ${currentAbs.toFixed(2)}A approaching load resistor thermal limit`);
    isWarning = true;
  }

  // 5. Gas Off-Gassing Detection (CO / H2 / VOC)
  let gasAlertLevel: 'NORMAL' | 'ELEVATED' | 'HAZARDOUS' = 'NORMAL';
  if (packet.h2_raw > SAFETY_LIMITS.GAS_H2_THRESHOLD || packet.co_raw > SAFETY_LIMITS.GAS_CO_THRESHOLD) {
    gasAlertLevel = 'HAZARDOUS';
    reasons.push(`Gas sensor alert: Hydrogen (${packet.h2_raw.toFixed(3)}) or Carbon Monoxide (${packet.co_raw.toFixed(3)}) venting detected`);
    isQuarantine = true;
  } else if (packet.voc_raw > SAFETY_LIMITS.GAS_VOC_THRESHOLD) {
    gasAlertLevel = 'ELEVATED';
    reasons.push(`Elevated volatile organic compounds (VOC: ${packet.voc_raw.toFixed(3)}) inside test enclosure`);
    isWarning = true;
  }

  let status: SafetyStatus = 'PASS';
  let action: 'CONTINUE' | 'WARN' | 'STOP' | 'EMERGENCY_QUARANTINE' = 'CONTINUE';

  if (isQuarantine) {
    status = 'QUARANTINE';
    action = 'EMERGENCY_QUARANTINE';
  } else if (isAbort) {
    status = 'ABORT';
    action = 'STOP';
  } else if (isWarning) {
    status = 'WARNING';
    action = 'WARN';
  }

  return {
    status,
    action,
    reasons,
    metrics: {
      tempDeltaMax,
      voltageDeltaMax: 0,
      gasAlertLevel,
    },
  };
}

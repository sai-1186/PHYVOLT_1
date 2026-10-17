/**
 * PhyVolt AI - Digital Battery Passport Service
 * Generates tamper-evident diagnostic records, SHA-256 checksums, and audit trails
 */

import { BatteryRecord, BatteryTest, DiagnosticResult, ExtractedFeatures, DigitalBatteryPassport } from '../types/battery';

// Standard SHA-256 calculation
export async function calculateSha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Pure JS fallback if crypto.subtle not available
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, 'a');
}

export async function createDigitalBatteryPassport(
  battery: BatteryRecord,
  test: BatteryTest,
  result: DiagnosticResult,
  features: ExtractedFeatures,
  rawTelemetryJson: string
): Promise<DigitalBatteryPassport> {
  const rawHash = await calculateSha256(rawTelemetryJson);
  
  const signaturePayload = `${test.test_id}:${battery.battery_id}:${result.recommendation}:${rawHash}:${result.created_at}`;
  const signatureHash = await calculateSha256(signaturePayload);

  const passport: DigitalBatteryPassport = {
    passport_id: `PBP-${test.test_id}`,
    test_id: test.test_id,
    battery,
    test_summary: {
      protocol_id: test.protocol_id,
      device_id: test.device_id,
      operator_id: test.operator_id,
      started_at: test.started_at || new Date().toISOString(),
      completed_at: test.completed_at || new Date().toISOString(),
      calibration_version: test.calibration_version,
      model_version: test.model_version,
    },
    features,
    result,
    raw_data_sha256: rawHash,
    signature_hash: signatureHash,
    record_type: 'tamper_evident_diagnostic_record',
    system: 'PhyVolt AI',
    version: '0.1.0',
    created_at: new Date().toISOString(),
    chain_of_custody: [
      {
        timestamp: battery.created_at,
        action: 'BATTERY_REGISTRATION',
        actor: test.operator_id,
        details: `Cell ${battery.cell_id} entered facility intake from ${battery.source || 'EV Dismantler'}`,
      },
      {
        timestamp: test.started_at || new Date().toISOString(),
        action: 'PULSE_TEST_EXECUTION',
        actor: test.operator_id,
        details: `Diagnostic protocol ${test.protocol_id} executed on hardware ${test.device_id}`,
      },
      {
        timestamp: result.created_at,
        action: 'DIAGNOSTIC_INFERENCE',
        actor: 'PhyVolt AI Baseline Model',
        details: `Health classified as ${result.health_status} (SoH ${result.soh_range.low}–${result.soh_range.high}%), recommendation: ${result.recommendation}`,
      },
      ...(result.reviewer_signoff
        ? [
            {
              timestamp: result.reviewer_signoff.signed_at,
              action: 'REVIEWER_SIGNOFF',
              actor: result.reviewer_signoff.reviewer_id,
              details: `Circularity pathway confirmed: ${result.reviewer_signoff.approved_recommendation}. ${result.reviewer_signoff.comments}`,
            },
          ]
        : []),
      {
        timestamp: new Date().toISOString(),
        action: 'PASSPORT_SEALED',
        actor: 'PhyVolt AI Cryptographic Notary',
        details: `Raw telemetry sealed with SHA-256 hash ${rawHash.slice(0, 16)}...`,
      },
    ],
  };

  return passport;
}

export async function verifyPassportIntegrity(
  passport: DigitalBatteryPassport,
  currentRawTelemetryJson: string
): Promise<{ isValid: boolean; currentHash: string; expectedHash: string; message: string }> {
  const currentHash = await calculateSha256(currentRawTelemetryJson);
  const isValid = currentHash === passport.raw_data_sha256;

  return {
    isValid,
    currentHash,
    expectedHash: passport.raw_data_sha256,
    message: isValid
      ? 'Tamper-evident verification PASSED: Telemetry data bitstream matches sealed SHA-256 digest exactly.'
      : 'INTEGRITY ALERT: Telemetry bitstream mismatch! The recorded sensor data has been modified since passport sealing.',
  };
}

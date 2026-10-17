/**
 * PhyVolt AI - Core Type Definitions
 * Retired EV Lithium-Ion Battery Triage, Diagnostics & Passport System
 */

export type BatteryChemistry = 'LFP' | 'NMC' | 'NCA' | 'LTO';
export type CellFormat = 'cylindrical' | 'prismatic' | 'pouch';
export type PhysicalCondition = 'appears_normal' | 'minor_scratches' | 'swollen' | 'corroded_terminals' | 'dented_casing' | 'leakage_suspected';

export type UserRole = 'operator' | 'reviewer' | 'admin';

export type TestStatus =
  | 'CREATED'
  | 'PRECHECK'
  | 'READY'
  | 'BASELINE'
  | 'PULSE_TEST'
  | 'RELAXATION'
  | 'ANALYSIS'
  | 'COMPLETE'
  | 'PASSPORT_GENERATED'
  | 'ABORTED'
  | 'QUARANTINED'
  | 'SENSOR_FAILURE'
  | 'COMMUNICATION_FAILURE';

export type SafetyStatus = 'PASS' | 'WARNING' | 'ABORT' | 'QUARANTINE';

export type UsablePowerClass = 'HIGH' | 'MEDIUM' | 'LOW' | 'RESTRICTED';

export type CircularityRecommendation =
  | 'SECOND_LIFE_SCREENING'
  | 'REFURBISHMENT_REVIEW'
  | 'RECYCLING_REVIEW'
  | 'QUARANTINE'
  | 'EXPERT_REVIEW';

export interface BatteryRecord {
  id?: number;
  battery_id: string;
  cell_id: string;
  chemistry: BatteryChemistry;
  format: CellFormat;
  nominal_voltage: number;
  nominal_capacity_ah: number;
  manufacturer?: string;
  source?: string;
  physical_condition: PhysicalCondition;
  created_at: string;
  notes?: string;
}

export interface PreCheckSafetyChecklist {
  no_swelling: boolean;
  no_electrolyte_leakage: boolean;
  no_casing_deformation: boolean;
  clean_terminals: boolean;
  ambient_temperature_normal: boolean;
  correct_polarity_verified: boolean;
  ocv_within_safe_range: boolean;
  enclosure_door_latched: boolean;
  emergency_stop_armed: boolean;
  sensors_calibrated_baseline: boolean;
  notes?: string;
  checked_by: string;
  checked_at: string;
}

export interface TelemetryPacket {
  id?: number;
  test_id: string;
  device_id: string;
  timestamp_ms: number;
  sequence: number;
  voltage_v: number;
  current_a: number;
  temperature_cell_c: number;
  temperature_box_c: number;
  co_raw: number;
  h2_raw: number;
  voc_raw: number;
  load_state: boolean | number;
  firmware_version?: string;
  calibration_version?: string;
  received_at?: string;
}

export interface ExtractedFeatures {
  v_before: number;
  v_during_min: number;
  v_after: number;
  voltage_drop: number;
  avg_pulse_current: number;
  pulse_resistance: number;
  recovery_voltage_1s: number;
  recovery_voltage_10s: number;
  recovery_voltage_60s: number;
  recovery_ratio: number;
  relaxation_slope: number;
  temp_baseline: number;
  max_temperature: number;
  temperature_rise: number;
  gas_co_delta: number;
  gas_h2_delta: number;
  gas_voc_delta: number;
  sample_count: number;
  data_completeness: number;
  sensor_quality_score: number;
}

export interface DiagnosticResult {
  id?: number;
  test_id: string;
  battery_id: string;
  safety_status: SafetyStatus;
  health_status: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  soh_range: {
    low: number;
    high: number;
  };
  estimated_soh_mid: number;
  usable_power_class: UsablePowerClass;
  anomaly_score: number;
  confidence: number;
  recommendation: CircularityRecommendation;
  explanation: string[];
  model_version: string;
  calibration_version: string;
  physics_residual_rmse: number;
  physics_model_type: 'pybamm_equivalent_ecm' | 'baseline_rule_v0.1';
  created_at: string;
  reviewer_signoff?: {
    reviewer_id: string;
    approved_recommendation: CircularityRecommendation;
    is_overridden: boolean;
    comments: string;
    signed_at: string;
  };
}

export interface BatteryTest {
  id?: number;
  test_id: string;
  battery_id: string;
  device_id: string;
  operator_id: string;
  protocol_id: string;
  status: TestStatus;
  safety_status: SafetyStatus;
  started_at?: string;
  completed_at?: string;
  abort_reason?: string;
  model_version: string;
  calibration_version: string;
  pre_check?: PreCheckSafetyChecklist;
  battery?: BatteryRecord;
  features?: ExtractedFeatures;
  result?: DiagnosticResult;
  telemetry_count?: number;
}

export interface DigitalBatteryPassport {
  passport_id: string;
  test_id: string;
  battery: BatteryRecord;
  test_summary: {
    protocol_id: string;
    device_id: string;
    operator_id: string;
    started_at: string;
    completed_at: string;
    calibration_version: string;
    model_version: string;
  };
  features: ExtractedFeatures;
  result: DiagnosticResult;
  raw_data_sha256: string;
  signature_hash: string;
  record_type: 'tamper_evident_diagnostic_record';
  system: 'PhyVolt AI';
  version: string;
  created_at: string;
  chain_of_custody: Array<{
    timestamp: string;
    action: string;
    actor: string;
    details: string;
  }>;
}

export interface AuditEvent {
  id: string;
  test_id: string;
  event_type: string;
  actor_id: string;
  event_data: Record<string, unknown>;
  created_at: string;
}

export interface DeviceStatus {
  device_id: string;
  name: string;
  status: 'ONLINE' | 'STANDBY' | 'ERROR' | 'OFFLINE';
  ip_address: string;
  last_heartbeat: string;
  firmware_version: string;
  calibration_version: string;
  active_test_id?: string | null;
}

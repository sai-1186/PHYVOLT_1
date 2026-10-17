/**
 * PhyVolt AI - Full-Stack Express Server
 * Implements REST API, ESP32 Telemetry Ingestion, Safety Engine,
 * Diagnostic Inference, Passport Generator, and Vite Dev Middleware
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as archiverModule from 'archiver';
import { evaluateTelemetryPacket } from './src/services/safetyService.ts';
import { extractPulseFeatures } from './src/services/featureService.ts';
import { runDiagnosticInference } from './src/services/inferenceService.ts';
import { evaluateCircularityDecision } from './src/services/decisionService.ts';
import { createDigitalBatteryPassport } from './src/services/passportService.ts';
import { DEMO_DATASETS, generateHealthyPackets, generateDegradedPackets, generateQuarantinePackets } from './src/services/demoData.ts';
import {
  BatteryRecord,
  BatteryTest,
  TelemetryPacket,
  DiagnosticResult,
  DigitalBatteryPassport,
  AuditEvent,
  DeviceStatus,
} from './src/types/battery.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// In-Memory Database Store (Simulating SQLite persistent tables with seed data)
const db = {
  batteries: new Map<string, BatteryRecord>(),
  tests: new Map<string, BatteryTest>(),
  telemetry: new Map<string, TelemetryPacket[]>(),
  results: new Map<string, DiagnosticResult>(),
  passports: new Map<string, DigitalBatteryPassport>(),
  auditLogs: [] as AuditEvent[],
  devices: new Map<string, DeviceStatus>(),
};

function addAuditLog(testId: string, eventType: string, actorId: string, eventData: Record<string, unknown> = {}) {
  const event: AuditEvent = {
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    test_id: testId,
    event_type: eventType,
    actor_id: actorId,
    event_data: eventData,
    created_at: new Date().toISOString(),
  };
  db.auditLogs.unshift(event);
  if (db.auditLogs.length > 200) db.auditLogs.pop();
}

// Seed Initial Hardware Devices
db.devices.set('PV-DEV-001', {
  device_id: 'PV-DEV-001',
  name: 'Rig Alpha - Bench Chamber 1',
  status: 'ONLINE',
  ip_address: '192.168.1.142',
  last_heartbeat: new Date().toISOString(),
  firmware_version: 'phyvolt-esp32-v1.4',
  calibration_version: 'calibration-v0.1',
  active_test_id: null,
});

db.devices.set('PV-DEV-002', {
  device_id: 'PV-DEV-002',
  name: 'Rig Beta - Bench Chamber 2',
  status: 'STANDBY',
  ip_address: '192.168.1.143',
  last_heartbeat: new Date().toISOString(),
  firmware_version: 'phyvolt-esp32-v1.4',
  calibration_version: 'calibration-v0.1',
  active_test_id: null,
});

// Seed Initial Batteries & Completed Tests from Demo Datasets
async function seedInitialData() {
  for (const [key, demo] of Object.entries(DEMO_DATASETS)) {
    const bat = demo.battery;
    db.batteries.set(bat.battery_id, bat);

    const testId = key === 'healthy_cell' ? 'TEST-HLTH-001' : key === 'degraded_cell' ? 'TEST-DGRD-002' : 'TEST-QRTN-003';
    const packets = demo.packets;
    db.telemetry.set(testId, packets);

    const isQuarantine = key === 'quarantine_event';
    const status = isQuarantine ? 'QUARANTINED' : 'COMPLETE';
    const safetyStatus = isQuarantine ? 'QUARANTINE' : 'PASS';

    let features;
    try {
      features = extractPulseFeatures(packets);
    } catch {
      features = {
        v_before: 3.34,
        v_during_min: 3.24,
        v_after: 3.32,
        voltage_drop: 0.10,
        avg_pulse_current: 0.84,
        pulse_resistance: 0.024,
        recovery_voltage_1s: 0.05,
        recovery_voltage_10s: 0.07,
        recovery_voltage_60s: 0.08,
        recovery_ratio: 0.80,
        relaxation_slope: 0.002,
        temp_baseline: 24.8,
        max_temperature: 26.4,
        temperature_rise: 1.6,
        gas_co_delta: 0.001,
        gas_h2_delta: 0.001,
        gas_voc_delta: 0.001,
        sample_count: packets.length,
        data_completeness: 1.0,
        sensor_quality_score: 0.98,
      };
    }

    const result = runDiagnosticInference(features, safetyStatus, testId, bat.battery_id, bat.chemistry);
    db.results.set(testId, result);

    const test: BatteryTest = {
      test_id: testId,
      battery_id: bat.battery_id,
      device_id: 'PV-DEV-001',
      operator_id: 'OP-001',
      protocol_id: 'single_cell_pulse_v1',
      status,
      safety_status: safetyStatus,
      started_at: packets[0]?.received_at || new Date().toISOString(),
      completed_at: packets[packets.length - 1]?.received_at || new Date().toISOString(),
      abort_reason: isQuarantine ? 'Hardware & safety software limit exceeded: Cell temperature 46.2°C & H2 gas venting' : undefined,
      model_version: 'baseline-v0.1',
      calibration_version: 'calibration-v0.1',
      battery: bat,
      features,
      result,
      telemetry_count: packets.length,
    };
    db.tests.set(testId, test);

    // Create Passport
    const passport = await createDigitalBatteryPassport(bat, test, result, features, JSON.stringify(packets));
    db.passports.set(testId, passport);

    addAuditLog(testId, 'TEST_INITIALIZED_SEED', 'SYSTEM', { key, recommendation: result.recommendation });
  }
}

seedInitialData().catch(console.error);

// ==========================================
// REST API ROUTES
// ==========================================

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'PhyVolt AI',
    version: '0.1.0',
    time: new Date().toISOString(),
    database: 'sqlite_in_memory_synced',
    devices_online: Array.from(db.devices.values()).filter((d) => d.status === 'ONLINE').length,
    active_tests: Array.from(db.tests.values()).filter((t) => ['PULSE_TEST', 'BASELINE', 'RELAXATION'].includes(t.status)).length,
  });
});

// List or register batteries
app.get('/api/batteries', (_req: Request, res: Response) => {
  res.json({ success: true, count: db.batteries.size, data: Array.from(db.batteries.values()) });
});

app.post('/api/batteries', (req: Request, res: Response) => {
  const data = req.body;
  const required = ['battery_id', 'cell_id'];
  const missing = required.filter((key) => !data[key]);

  if (missing.length > 0) {
    return res.status(400).json({ success: false, missing, error: `Missing required fields: ${missing.join(', ')}` });
  }

  if (db.batteries.has(data.battery_id)) {
    return res.status(409).json({ success: false, error: `Battery ID '${data.battery_id}' already registered` });
  }

  const record: BatteryRecord = {
    battery_id: data.battery_id,
    cell_id: data.cell_id,
    chemistry: data.chemistry || 'LFP',
    format: data.format || 'cylindrical',
    nominal_voltage: Number(data.nominal_voltage) || 3.2,
    nominal_capacity_ah: Number(data.nominal_capacity_ah) || 10.0,
    manufacturer: data.manufacturer || 'Unknown',
    source: data.source || 'EV Dismantler',
    physical_condition: data.physical_condition || 'appears_normal',
    notes: data.notes || '',
    created_at: new Date().toISOString(),
  };

  db.batteries.set(record.battery_id, record);
  addAuditLog(record.battery_id, 'BATTERY_REGISTERED', data.operator_id || 'OP-001', { cell_id: record.cell_id, chemistry: record.chemistry });

  res.status(201).json({ success: true, battery_id: record.battery_id, data: record });
});

// List and create tests
app.get('/api/tests', (_req: Request, res: Response) => {
  const tests = Array.from(db.tests.values()).map((t) => {
    const battery = db.batteries.get(t.battery_id);
    const result = db.results.get(t.test_id);
    const telemetry = db.telemetry.get(t.test_id) || [];
    return {
      ...t,
      battery,
      result,
      telemetry_count: telemetry.length,
    };
  });
  res.json({ success: true, count: tests.length, data: tests });
});

app.post('/api/tests', (req: Request, res: Response) => {
  const data = req.body;
  if (!data.battery_id) {
    return res.status(400).json({ success: false, error: 'battery_id is required' });
  }

  const battery = db.batteries.get(data.battery_id);
  if (!battery) {
    return res.status(404).json({ success: false, error: `Battery ID '${data.battery_id}' not found. Register battery first.` });
  }

  const testId = data.test_id || `TEST-${Date.now().toString(36).toUpperCase()}`;
  const deviceId = data.device_id || 'PV-DEV-001';
  const operatorId = data.operator_id || 'OP-001';
  const protocolId = data.protocol_id || 'single_cell_pulse_v1';

  const test: BatteryTest = {
    test_id: testId,
    battery_id: data.battery_id,
    device_id: deviceId,
    operator_id: operatorId,
    protocol_id: protocolId,
    status: 'CREATED',
    safety_status: 'PASS',
    model_version: 'baseline-v0.1',
    calibration_version: 'calibration-v0.1',
    battery,
    pre_check: data.pre_check,
  };

  db.tests.set(testId, test);
  db.telemetry.set(testId, []);

  // Update device active test
  const device = db.devices.get(deviceId);
  if (device) {
    device.active_test_id = testId;
    device.status = 'ONLINE';
  }

  addAuditLog(testId, 'TEST_CREATED', operatorId, { battery_id: data.battery_id, protocol_id: protocolId });

  res.status(201).json({ success: true, test_id: testId, data: test });
});

// Single test details
app.get('/api/tests/:testId', (req: Request, res: Response) => {
  const testId = req.params.testId;
  const test = db.tests.get(testId);
  if (!test) {
    return res.status(404).json({ success: false, error: `Test ${testId} not found` });
  }

  const battery = db.batteries.get(test.battery_id);
  const result = db.results.get(testId);
  const telemetry = db.telemetry.get(testId) || [];
  const passport = db.passports.get(testId);

  res.json({
    success: true,
    data: {
      ...test,
      battery,
      result,
      passport,
      telemetry_count: telemetry.length,
    },
  });
});

// Start a test (Transitions to BASELINE / PULSE)
app.post('/api/tests/:testId/start', (req: Request, res: Response) => {
  const testId = req.params.testId;
  const test = db.tests.get(testId);
  if (!test) {
    return res.status(404).json({ success: false, error: `Test ${testId} not found` });
  }

  test.status = 'BASELINE';
  test.started_at = new Date().toISOString();
  addAuditLog(testId, 'TEST_STARTED', req.body.operator_id || test.operator_id);

  res.json({ success: true, test_id: testId, status: test.status });
});

// Stop or Complete a test
app.post('/api/tests/:testId/stop', async (req: Request, res: Response) => {
  const testId = req.params.testId;
  const test = db.tests.get(testId);
  if (!test) {
    return res.status(404).json({ success: false, error: `Test ${testId} not found` });
  }

  test.status = 'COMPLETE';
  test.completed_at = new Date().toISOString();

  // Trigger feature extraction and diagnostic inference
  const telemetry = db.telemetry.get(testId) || [];
  const battery = db.batteries.get(test.battery_id);

  if (telemetry.length >= 5 && battery) {
    try {
      const features = extractPulseFeatures(telemetry);
      test.features = features;
      const result = runDiagnosticInference(features, test.safety_status, testId, test.battery_id, battery.chemistry);
      db.results.set(testId, result);
      test.result = result;

      // Auto-generate passport
      const passport = await createDigitalBatteryPassport(battery, test, result, features, JSON.stringify(telemetry));
      db.passports.set(testId, passport);
    } catch (err: unknown) {
      console.error('Error during inference on test stop:', err);
    }
  }

  addAuditLog(testId, 'TEST_STOPPED_BY_OPERATOR', req.body.operator_id || test.operator_id);

  res.json({ success: true, test_id: testId, status: test.status, result: test.result });
});

// Emergency Abort
app.post('/api/tests/:testId/abort', (req: Request, res: Response) => {
  const testId = req.params.testId;
  const test = db.tests.get(testId);
  if (!test) {
    return res.status(404).json({ success: false, error: `Test ${testId} not found` });
  }

  const reason = req.body.reason || 'Operator manual emergency stop triggered';
  test.status = 'ABORTED';
  test.safety_status = 'ABORT';
  test.abort_reason = reason;
  test.completed_at = new Date().toISOString();

  addAuditLog(testId, 'TEST_EMERGENCY_ABORT', req.body.operator_id || 'OPERATOR', { reason });

  res.json({ success: true, test_id: testId, status: test.status, safety_status: test.safety_status });
});

// Telemetry Ingestion endpoint (matches ESP32 JSON schema)
app.post('/api/telemetry', (req: Request, res: Response) => {
  const data = req.body;
  const required = ['test_id', 'timestamp_ms', 'voltage_v', 'current_a', 'temperature_cell_c'];
  const missing = required.filter((key) => data[key] === undefined || data[key] === null);

  if (missing.length > 0) {
    return res.status(400).json({ success: false, missing, error: `Missing required telemetry fields: ${missing.join(', ')}` });
  }

  const testId = String(data.test_id);
  let test = db.tests.get(testId);

  // If test doesn't exist, create an auto-registered test record for ESP32 bench testing
  if (!test) {
    const defaultBatId = 'BAT-AUTO-BENCH';
    if (!db.batteries.has(defaultBatId)) {
      db.batteries.set(defaultBatId, {
        battery_id: defaultBatId,
        cell_id: 'CELL-BENCH-01',
        chemistry: 'LFP',
        format: 'cylindrical',
        nominal_voltage: 3.2,
        nominal_capacity_ah: 20.0,
        manufacturer: 'AutoBench ESP32',
        source: 'Bench Stream',
        physical_condition: 'appears_normal',
        created_at: new Date().toISOString(),
      });
    }

    test = {
      test_id: testId,
      battery_id: defaultBatId,
      device_id: data.device_id || 'PV-DEV-001',
      operator_id: 'OP-ESP32',
      protocol_id: 'single_cell_pulse_v1',
      status: 'PULSE_TEST',
      safety_status: 'PASS',
      started_at: new Date().toISOString(),
      model_version: 'baseline-v0.1',
      calibration_version: data.calibration_version || 'calibration-v0.1',
    };
    db.tests.set(testId, test);
    db.telemetry.set(testId, []);
  }

  const packetList = db.telemetry.get(testId) || [];
  const prevPacket = packetList.length > 0 ? packetList[packetList.length - 1] : undefined;

  // Check sequence numbers (detect duplicate / missing)
  const currentSeq = Number(data.sequence) || packetList.length + 1;
  const duplicate = packetList.some((p) => p.sequence === currentSeq && p.timestamp_ms === Number(data.timestamp_ms));
  if (duplicate) {
    return res.status(409).json({ success: false, error: `Duplicate telemetry packet sequence #${currentSeq}` });
  }

  // Construct validated packet
  const packet: TelemetryPacket = {
    test_id: testId,
    device_id: data.device_id || test.device_id,
    timestamp_ms: Number(data.timestamp_ms),
    sequence: currentSeq,
    voltage_v: Number(data.voltage_v),
    current_a: Number(data.current_a),
    temperature_cell_c: Number(data.temperature_cell_c),
    temperature_box_c: Number(data.temperature_box_c ?? data.temperature_cell_c - 1.0),
    co_raw: Number(data.co_raw ?? 0.012),
    h2_raw: Number(data.h2_raw ?? 0.008),
    voc_raw: Number(data.voc_raw ?? 0.04),
    load_state: Boolean(data.load_state) || Number(data.load_state) === 1,
    firmware_version: data.firmware_version || 'phyvolt-esp32-v1.4',
    calibration_version: data.calibration_version || test.calibration_version,
    received_at: new Date().toISOString(),
  };

  // Evaluate Safety Engine
  const battery = db.batteries.get(test.battery_id);
  const safetyEval = evaluateTelemetryPacket(packet, battery?.chemistry || 'LFP', prevPacket);

  // Store telemetry packet (Append-only storage, never overwrite)
  packetList.push(packet);
  db.telemetry.set(testId, packetList);

  // Update Test State Machine
  if (safetyEval.status === 'ABORT' || safetyEval.status === 'QUARANTINE') {
    test.status = safetyEval.status === 'QUARANTINE' ? 'QUARANTINED' : 'ABORTED';
    test.safety_status = safetyEval.status;
    test.abort_reason = safetyEval.reasons.join('; ');
    test.completed_at = new Date().toISOString();

    addAuditLog(testId, 'SAFETY_INTERVENTION', 'SAFETY_ENGINE', {
      action: safetyEval.action,
      reasons: safetyEval.reasons,
      packet_seq: packet.sequence,
    });
  } else if (safetyEval.status === 'WARNING') {
    test.safety_status = 'WARNING';
  } else if (test.safety_status !== 'WARNING') {
    test.safety_status = 'PASS';
  }

  // Update dynamic test phase based on packet load_state
  if (test.status !== 'ABORTED' && test.status !== 'QUARANTINED' && test.status !== 'COMPLETE') {
    if (packet.load_state) {
      test.status = 'PULSE_TEST';
    } else if (packetList.some((p) => p.load_state)) {
      test.status = 'RELAXATION';
    } else {
      test.status = 'BASELINE';
    }
  }

  res.json({
    success: true,
    action: safetyEval.action,
    safety_status: safetyEval.status,
    reasons: safetyEval.reasons,
    stored_packets: packetList.length,
    test_status: test.status,
  });
});

// Get test status
app.get('/api/tests/:testId/status', (req: Request, res: Response) => {
  const testId = req.params.testId;
  const test = db.tests.get(testId);
  if (!test) {
    return res.status(404).json({ success: false, error: `Test ${testId} not found` });
  }

  const telemetry = db.telemetry.get(testId) || [];
  const latest = telemetry.length > 0 ? telemetry[telemetry.length - 1] : null;

  res.json({
    success: true,
    test_id: testId,
    status: test.status,
    safety_status: test.safety_status,
    packet_count: telemetry.length,
    latest_reading: latest,
    abort_reason: test.abort_reason,
  });
});

// Get raw telemetry array
app.get('/api/tests/:testId/telemetry', (req: Request, res: Response) => {
  const testId = req.params.testId;
  const telemetry = db.telemetry.get(testId) || [];
  res.json({ success: true, count: telemetry.length, data: telemetry });
});

// Get diagnostic result
app.get('/api/tests/:testId/result', (req: Request, res: Response) => {
  const testId = req.params.testId;
  let result = db.results.get(testId);

  // If not yet evaluated, evaluate now if enough telemetry
  if (!result) {
    const test = db.tests.get(testId);
    const telemetry = db.telemetry.get(testId) || [];
    const battery = test ? db.batteries.get(test.battery_id) : undefined;

    if (test && telemetry.length >= 5 && battery) {
      const features = extractPulseFeatures(telemetry);
      result = runDiagnosticInference(features, test.safety_status, testId, test.battery_id, battery.chemistry);
      db.results.set(testId, result);
    }
  }

  if (!result) {
    return res.status(404).json({ success: false, error: 'Diagnostic result not available yet. Test needs telemetry.' });
  }

  res.json({ success: true, data: result });
});

// Digital Battery Passport generation & retrieval
app.post('/api/tests/:testId/passport', async (req: Request, res: Response) => {
  const testId = req.params.testId;
  const test = db.tests.get(testId);
  if (!test) return res.status(404).json({ success: false, error: 'Test not found' });

  const battery = db.batteries.get(test.battery_id);
  if (!battery) return res.status(404).json({ success: false, error: 'Battery not found' });

  const telemetry = db.telemetry.get(testId) || [];
  const features = test.features || extractPulseFeatures(telemetry);
  let result = db.results.get(testId);
  if (!result) {
    result = runDiagnosticInference(features, test.safety_status, testId, battery.battery_id, battery.chemistry);
    db.results.set(testId, result);
  }

  const passport = await createDigitalBatteryPassport(battery, test, result, features, JSON.stringify(telemetry));
  db.passports.set(testId, passport);

  addAuditLog(testId, 'PASSPORT_GENERATED', req.body.operator_id || 'OP-001', { passport_id: passport.passport_id });

  res.status(201).json({ success: true, data: passport });
});

app.get('/api/tests/:testId/passport', (req: Request, res: Response) => {
  const testId = req.params.testId;
  const passport = db.passports.get(testId);
  if (!passport) {
    return res.status(404).json({ success: false, error: `Passport for test ${testId} not found` });
  }
  res.json({ success: true, data: passport });
});

// Download / inspect report endpoint
app.get('/api/tests/:testId/report', (req: Request, res: Response) => {
  const testId = req.params.testId;
  const test = db.tests.get(testId);
  if (!test) {
    return res.status(404).json({ success: false, error: `Test ${testId} not found` });
  }

  const battery = db.batteries.get(test.battery_id);
  const result = db.results.get(testId);
  const passport = db.passports.get(testId);
  const telemetry = db.telemetry.get(testId) || [];
  const features = test.features || (telemetry.length >= 5 ? extractPulseFeatures(telemetry) : null);

  const report = {
    report_title: 'PhyVolt AI - Battery Diagnostic & Circularity Report',
    test_id: testId,
    battery,
    test,
    features,
    result,
    passport_id: passport?.passport_id || `PBP-${testId}`,
    raw_data_sha256: passport?.raw_data_sha256 || 'not_yet_sealed',
    telemetry_samples: telemetry.length,
    generated_at: new Date().toISOString(),
    regulatory_disclaimer:
      'This report is an operational screening and decision-support record for retired EV cells under defined bench protocol conditions. It is not a universal safety certification or destructive test substitute.',
  };

  res.json({ success: true, data: report });
});

// Download Complete Project Source Code as ZIP
app.get('/api/export/project-zip', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="phyvolt-ai-software-suite.zip"');

  const archive = new archiverModule.ZipArchive({
    zlib: { level: 9 },
  });

  archive.on('error', (err: any) => {
    console.error('Archive error:', err);
    res.status(500).end();
  });

  archive.pipe(res);

  // Files to include in zip package
  const rootFiles = [
    'README.md',
    'ESP32_FIRMWARE.ino',
    'app.py',
    'requirements.txt',
    'server.ts',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
    'metadata.json',
    '.env.example',
  ];

  for (const file of rootFiles) {
    const fullPath = path.resolve(__dirname, file);
    if (fs.existsSync(fullPath)) {
      archive.file(fullPath, { name: file });
    }
  }

  // Include directories
  const dirsToInclude = ['src', 'services', 'dashboard', 'tests'];
  for (const dir of dirsToInclude) {
    const fullDir = path.resolve(__dirname, dir);
    if (fs.existsSync(fullDir)) {
      archive.directory(fullDir, dir);
    }
  }

  archive.finalize();
});

// Reviewer sign-off & decision override endpoint
app.post('/api/decisions/review', (req: Request, res: Response) => {
  const { test_id, reviewer_id, approved_recommendation, comments, is_overridden } = req.body;

  if (!test_id || !reviewer_id || !approved_recommendation) {
    return res.status(400).json({ success: false, error: 'test_id, reviewer_id, and approved_recommendation are required' });
  }

  const result = db.results.get(test_id);
  if (!result) {
    return res.status(404).json({ success: false, error: `Result for test ${test_id} not found` });
  }

  result.reviewer_signoff = {
    reviewer_id,
    approved_recommendation,
    is_overridden: Boolean(is_overridden),
    comments: comments || 'Approved during expert circularity review',
    signed_at: new Date().toISOString(),
  };

  addAuditLog(test_id, 'REVIEWER_SIGNOFF', reviewer_id, {
    approved_recommendation,
    is_overridden,
    comments,
  });

  res.json({ success: true, data: result });
});

// Demo dataset loader endpoint
app.get('/api/demo/datasets', (_req: Request, res: Response) => {
  const list = Object.values(DEMO_DATASETS).map((d) => ({
    id: d.id,
    name: d.name,
    badge: d.badge,
    description: d.description,
    packet_count: d.packets.length,
    battery: d.battery,
  }));
  res.json({ success: true, data: list });
});

app.post('/api/demo/load', async (req: Request, res: Response) => {
  const { dataset_id, target_test_id } = req.body;
  const demo = DEMO_DATASETS[dataset_id as keyof typeof DEMO_DATASETS];

  if (!demo) {
    return res.status(404).json({ success: false, error: `Dataset '${dataset_id}' not found` });
  }

  const testId = target_test_id || `TEST-DEMO-${Date.now().toString(36).toUpperCase()}`;
  const battery = { ...demo.battery, battery_id: `BAT-${Date.now().toString(36).toUpperCase()}` };

  db.batteries.set(battery.battery_id, battery);

  // Clone packets with new test ID
  const packets = demo.packets.map((p, idx) => ({
    ...p,
    test_id: testId,
    sequence: idx + 1,
  }));
  db.telemetry.set(testId, packets);

  const isQuarantine = dataset_id === 'quarantine_event';
  const features = extractPulseFeatures(packets);
  const safetyStatus = isQuarantine ? 'QUARANTINE' : 'PASS';
  const result = runDiagnosticInference(features, safetyStatus, testId, battery.battery_id, battery.chemistry);
  db.results.set(testId, result);

  const test: BatteryTest = {
    test_id: testId,
    battery_id: battery.battery_id,
    device_id: 'PV-DEV-001',
    operator_id: 'OP-DEMO',
    protocol_id: 'single_cell_pulse_v1',
    status: isQuarantine ? 'QUARANTINED' : 'COMPLETE',
    safety_status: safetyStatus,
    started_at: packets[0]?.received_at,
    completed_at: packets[packets.length - 1]?.received_at,
    abort_reason: isQuarantine ? 'Hardware & safety software limit exceeded: Cell temperature 46.2°C & H2 gas venting' : undefined,
    model_version: 'baseline-v0.1',
    calibration_version: 'calibration-v0.1',
    battery,
    features,
    result,
    telemetry_count: packets.length,
  };
  db.tests.set(testId, test);

  const passport = await createDigitalBatteryPassport(battery, test, result, features, JSON.stringify(packets));
  db.passports.set(testId, passport);

  addAuditLog(testId, 'DEMO_DATASET_LOADED', 'OPERATOR', { dataset_id, test_id: testId });

  res.json({
    success: true,
    test_id: testId,
    battery,
    test,
    result,
    passport,
  });
});

// Audit events
app.get('/api/audit-logs', (_req: Request, res: Response) => {
  res.json({ success: true, count: db.auditLogs.length, data: db.auditLogs });
});

// System devices & status
app.get('/api/system/devices', (_req: Request, res: Response) => {
  res.json({ success: true, data: Array.from(db.devices.values()) });
});

// ==========================================
// PyBaMM SIMULATION API
// All endpoints return SYNTHETIC data — NOT live hardware measurements.
// ==========================================

app.get('/api/simulation/supported-chemistries', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data_type: 'SYNTHETIC',
    warning: 'SYNTHETIC DATA — PyBaMM SIMULATION — NOT LIVE HARDWARE MEASUREMENTS',
    supported: {
      NMC: { param_set: 'Chen2020',    model: 'Single Particle Model' },
      NCA: { param_set: 'NCA_Kim2011', model: 'Single Particle Model' },
      LFP: { param_set: 'Prada2013',   model: 'Single Particle Model' },
    },
    unsupported: {
      LTO: 'No validated LTO parameter set in PyBaMM 26.x.',
      LCO: 'No validated LCO parameter set in PyBaMM 26.x.',
      LMO: 'No validated LMO parameter set in PyBaMM 26.x.',
    },
  });
});

app.post('/api/simulation/run', async (req: Request, res: Response) => {
  const {
    chemistry = 'NMC',
    initial_soc = 0.8,
    temperature_c = 25.0,
    pulse_current_a = 1.0,
    pulse_duration_s = 120,
    rest_duration_s = 30,
    relaxation_duration_s = 120,
    capacity_ah = null,
  } = req.body || {};

  const { spawn } = await import('child_process');
  const scriptPath = path.resolve(__dirname, 'scripts', 'run_simulation_api.py');

  const payload = JSON.stringify({
    chemistry, initial_soc, temperature_c, pulse_current_a,
    pulse_duration_s, rest_duration_s, relaxation_duration_s, capacity_ah,
  });

  const py = spawn('python', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  py.stdin.write(payload);
  py.stdin.end();

  let stdout = '';
  let stderr = '';
  py.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  py.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

  py.on('close', (code: number) => {
    if (code !== 0) {
      console.error('[Simulation] Python process error:', stderr);
      return res.status(500).json({
        success: false,
        error: 'Simulation process failed',
        detail: stderr.slice(0, 500),
        data_type: 'SYNTHETIC',
      });
    }
    try {
      const result = JSON.parse(stdout);
      return res.json({ ...result, data_type: 'SYNTHETIC' });
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: 'Could not parse simulation output',
        detail: stdout.slice(0, 500),
        data_type: 'SYNTHETIC',
      });
    }
  });
});

app.get('/api/simulation/supported-chemistries', (_req: Request, res: Response) => {
  res.json({
    supported: [
      { chemistry: 'NMC', param_set: 'Chen2020', model: 'Single Particle Model (SPM)' },
      { chemistry: 'NCA', param_set: 'NCA_Kim2011', model: 'Single Particle Model (SPM)' },
      { chemistry: 'LFP', param_set: 'Prada2013', model: 'Single Particle Model (SPM)' },
    ],
    unsupported: [
      { chemistry: 'LTO', reason: 'No validated parameter set available in PyBaMM 26.x' },
      { chemistry: 'LCO', reason: 'No validated parameter set available in PyBaMM 26.x' },
      { chemistry: 'LMO', reason: 'No validated parameter set available in PyBaMM 26.x' },
    ],
    data_type: 'SYNTHETIC',
  });
});

app.get('/api/simulation/download/:filename', (req: Request, res: Response) => {
  const allowed = ['phyvolt_synthetic_pulse_data.csv', 'phyvolt_synthetic_cell_summary.csv'];
  const { filename } = req.params;
  if (!allowed.includes(filename)) {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }
  const filePath = path.resolve(__dirname, 'data', 'synthetic', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File not yet generated. Run a simulation first.' });
  }
  res.download(filePath);
});

// ==========================================
// VITE DEV MIDDLEWARE / STATIC ASSETS

// ==========================================
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ PhyVolt AI server active on port ${PORT}`);
    console.log(`   API Health: http://localhost:${PORT}/api/health`);
    console.log(`   ESP32 Telemetry: POST http://localhost:${PORT}/api/telemetry`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server boot error:', err);
});

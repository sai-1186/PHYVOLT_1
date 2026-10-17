/**
 * PhyVolt AI - Automated Integration Test Suite
 * Tests the complete end-to-end data flow:
 * ESP32 HTTP POST -> Backend API -> Validation -> Database -> Safety Engine -> Features -> Results -> Passport
 */

const API_BASE = 'http://localhost:3000/api';

interface TestResult {
  step: string;
  expected: string;
  actual: string;
  passed: boolean;
  details?: unknown;
}

async function runTestSuite() {
  console.log('⚡ PhyVolt AI - Starting Automated API Test Suite...\n');
  const results: TestResult[] = [];

  // Helper fetch
  const post = async (endpoint: string, data: unknown) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data: json };
  };

  const get = async (endpoint: string) => {
    const res = await fetch(`${API_BASE}${endpoint}`);
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data: json };
  };

  const testId = `TEST-AUTO-${Date.now()}`;
  const batteryId = `BAT-AUTO-${Date.now()}`;

  // 0. Register Test Battery & Test Record
  const regBat = await post('/batteries', {
    battery_id: batteryId,
    cell_id: 'CELL-TEST-AUTO-01',
    chemistry: 'LFP',
    format: 'cylindrical',
    nominal_voltage: 3.2,
    nominal_capacity_ah: 20.0,
  });
  results.push({
    step: '0. Register Battery',
    expected: 'HTTP 201 Created',
    actual: `HTTP ${regBat.status}`,
    passed: regBat.status === 201,
  });

  const createTest = await post('/tests', {
    test_id: testId,
    battery_id: batteryId,
    device_id: 'PV-DEV-001',
    operator_id: 'OP-TEST',
    protocol_id: 'single_cell_pulse_v1',
  });
  results.push({
    step: '0. Initialize Test',
    expected: 'HTTP 201 Created',
    actual: `HTTP ${createTest.status}`,
    passed: createTest.status === 201,
  });

  // Test 1: Normal Telemetry Packet
  const p1 = await post('/telemetry', {
    test_id: testId,
    device_id: 'PV-DEV-001',
    timestamp_ms: 1000,
    sequence: 1,
    voltage_v: 3.342,
    current_a: 0.0,
    temperature_cell_c: 24.5,
    temperature_box_c: 24.0,
    co_raw: 0.012,
    h2_raw: 0.008,
    voc_raw: 0.04,
    load_state: 0,
  });
  results.push({
    step: '1. Normal Telemetry Packet',
    expected: 'HTTP 200 / Action CONTINUE / Status PASS',
    actual: `HTTP ${p1.status} / Action ${p1.data?.action} / Status ${p1.data?.safety_status}`,
    passed: p1.status === 200 && p1.data?.action === 'CONTINUE' && p1.data?.safety_status === 'PASS',
  });

  // Test 2: Duplicate Sequence Number
  const p2 = await post('/telemetry', {
    test_id: testId,
    device_id: 'PV-DEV-001',
    timestamp_ms: 1000,
    sequence: 1, // Duplicate of sequence #1 at 1000ms
    voltage_v: 3.342,
    current_a: 0.0,
    temperature_cell_c: 24.5,
  });
  results.push({
    step: '2. Duplicate Sequence Number',
    expected: 'HTTP 409 Conflict',
    actual: `HTTP ${p2.status} / ${p2.data?.error}`,
    passed: p2.status === 409,
  });

  // Test 3: Missing Required Field (Voltage)
  const p3 = await post('/telemetry', {
    test_id: testId,
    device_id: 'PV-DEV-001',
    timestamp_ms: 2000,
    sequence: 2,
    // voltage_v omitted!
    current_a: 0.0,
    temperature_cell_c: 24.5,
  });
  results.push({
    step: '3. Missing Required Field (voltage_v)',
    expected: 'HTTP 400 Bad Request with missing list',
    actual: `HTTP ${p3.status} / Missing: ${p3.data?.missing?.join(', ')}`,
    passed: p3.status === 400 && p3.data?.missing?.includes('voltage_v'),
  });

  // Test 4: High Temperature Abort Condition (>45°C)
  const tempTestId = `TEST-TEMP-ABORT-${Date.now()}`;
  await post('/tests', { test_id: tempTestId, battery_id: batteryId });
  const p4 = await post('/telemetry', {
    test_id: tempTestId,
    device_id: 'PV-DEV-001',
    timestamp_ms: 1000,
    sequence: 1,
    voltage_v: 3.30,
    current_a: 0.84,
    temperature_cell_c: 48.5, // Exceeds 45°C threshold!
    temperature_box_c: 25.0,
  });
  results.push({
    step: '4. High Temperature (>45°C) Abort',
    expected: 'Action STOP / Safety ABORT or QUARANTINE',
    actual: `Action ${p4.data?.action} / Status ${p4.data?.safety_status}`,
    passed: p4.data?.action === 'STOP' || p4.data?.action === 'EMERGENCY_QUARANTINE',
  });

  // Test 5: Low Voltage Cutoff (<2.0V)
  const voltTestId = `TEST-VOLT-ABORT-${Date.now()}`;
  await post('/tests', { test_id: voltTestId, battery_id: batteryId });
  const p5 = await post('/telemetry', {
    test_id: voltTestId,
    device_id: 'PV-DEV-001',
    timestamp_ms: 1000,
    sequence: 1,
    voltage_v: 1.65, // Below minimum 2.0V!
    current_a: 0.84,
    temperature_cell_c: 25.0,
  });
  results.push({
    step: '5. Low Voltage (<2.0V) Cutoff',
    expected: 'Action STOP / Safety ABORT',
    actual: `Action ${p5.data?.action} / Status ${p5.data?.safety_status}`,
    passed: p5.data?.action === 'STOP' && (p5.data?.safety_status === 'ABORT' || p5.data?.safety_status === 'QUARANTINE'),
  });

  // Test 6: Excessive Current Abort (>2.2A)
  const currTestId = `TEST-CURR-ABORT-${Date.now()}`;
  await post('/tests', { test_id: currTestId, battery_id: batteryId });
  const p6 = await post('/telemetry', {
    test_id: currTestId,
    device_id: 'PV-DEV-001',
    timestamp_ms: 1000,
    sequence: 1,
    voltage_v: 3.25,
    current_a: 2.85, // Exceeds 2.2A bench limit!
    temperature_cell_c: 25.0,
  });
  results.push({
    step: '6. Excessive Current (>2.2A) Abort',
    expected: 'Action STOP / Safety ABORT',
    actual: `Action ${p6.data?.action} / Status ${p6.data?.safety_status}`,
    passed: p6.data?.action === 'STOP' && p6.data?.safety_status === 'ABORT',
  });

  // Test 7: Valid Completed Pulse Test with Baseline, Pulse, Relaxation
  const completeTestId = `TEST-COMPL-${Date.now()}`;
  await post('/tests', { test_id: completeTestId, battery_id: batteryId });
  await post(`/tests/${completeTestId}/start`, {});

  // Send 10 baseline packets (load = 0)
  for (let s = 1; s <= 10; s++) {
    await post('/telemetry', {
      test_id: completeTestId,
      timestamp_ms: s * 1000,
      sequence: s,
      voltage_v: 3.342,
      current_a: 0.0,
      temperature_cell_c: 24.8,
      load_state: 0,
    });
  }

  // Send 10 pulse packets (load = 1, current 0.84A, voltage drop to 3.245V)
  for (let s = 11; s <= 20; s++) {
    await post('/telemetry', {
      test_id: completeTestId,
      timestamp_ms: s * 1000,
      sequence: s,
      voltage_v: 3.245,
      current_a: 0.84,
      temperature_cell_c: 25.2,
      load_state: 1,
    });
  }

  // Send 10 relaxation packets (load = 0, voltage recovers to 3.325V)
  for (let s = 21; s <= 30; s++) {
    await post('/telemetry', {
      test_id: completeTestId,
      timestamp_ms: s * 1000,
      sequence: s,
      voltage_v: 3.325,
      current_a: 0.0,
      temperature_cell_c: 25.0,
      load_state: 0,
    });
  }

  // Stop test to trigger feature extraction and diagnostic inference
  const stopResp = await post(`/tests/${completeTestId}/stop`, {});
  const resultResp = await get(`/tests/${completeTestId}/result`);

  const hasResult = resultResp.ok && resultResp.data?.data?.soh_range;
  results.push({
    step: '7. Complete Pulse Test Feature Extraction & Inference',
    expected: 'Result with SoH range, Usable Power Class, Recommendation',
    actual: hasResult
      ? `SoH: ${resultResp.data.data.soh_range.low}–${resultResp.data.data.soh_range.high}%, Class: ${resultResp.data.data.usable_power_class}, Rec: ${resultResp.data.data.recommendation}`
      : 'Failed to extract features',
    passed: hasResult,
  });

  // Test 8: Generate and Verify Digital Battery Passport with SHA-256 Hash
  const passportResp = await post(`/tests/${completeTestId}/passport`, { operator_id: 'OP-TEST' });
  const passportData = passportResp.data?.data;
  const hasPassport = passportResp.status === 201 && passportData?.raw_data_sha256;

  results.push({
    step: '8. Digital Battery Passport SHA-256 Generation',
    expected: 'Passport with SHA-256 raw telemetry digest (64 hex chars)',
    actual: hasPassport ? `Passport ID: ${passportData.passport_id}, Hash: ${passportData.raw_data_sha256.slice(0, 16)}...` : 'Failed to generate passport',
    passed: hasPassport && passportData.raw_data_sha256.length === 64,
  });

  // Test 9: Inspect / Download Report Endpoint
  const reportResp = await get(`/tests/${completeTestId}/report`);
  const hasReport = reportResp.ok && reportResp.data?.data?.report_title;

  results.push({
    step: '9. Inspection / Report Endpoint',
    expected: 'Report object with disclaimer and test summary',
    actual: hasReport ? `Title: ${reportResp.data.data.report_title}` : 'Failed to retrieve report',
    passed: hasReport,
  });

  // Print Summary Table
  console.log('='.repeat(75));
  console.log('PHYVOLT AI — INTEGRATION TEST EXECUTION RESULTS');
  console.log('='.repeat(75));

  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✅ PASS' : '❌ FAIL';
    if (!r.passed) allPassed = false;
    console.log(`${icon} | ${r.step}`);
    console.log(`       Expected: ${r.expected}`);
    console.log(`       Actual:   ${r.actual}\n`);
  }

  console.log('='.repeat(75));
  if (allPassed) {
    console.log('🎉 ALL INTEGRATION TESTS PASSED! End-to-end data path is validated.');
  } else {
    console.error('⚠️ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

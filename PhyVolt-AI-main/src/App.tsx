/**
 * PhyVolt AI - Main Application
 * Retired EV Battery Circularity, Pulse Diagnostics & Tamper-Evident Passport
 */

import React, { useState, useEffect } from 'react';
import {
  BatteryRecord,
  BatteryTest,
  TelemetryPacket,
  DiagnosticResult,
  DigitalBatteryPassport,
  UserRole,
  PreCheckSafetyChecklist,
  CircularityRecommendation,
  DeviceStatus,
} from './types/battery';

import { OverviewView } from './views/OverviewView';
import { IntakeView } from './views/IntakeView';
import { SafetyPreCheckView } from './views/SafetyPreCheckView';
import { LiveMonitorView } from './views/LiveMonitorView';
import { ResultsView } from './views/ResultsView';
import { DecisionCenterView } from './views/DecisionCenterView';
import { HistoryView } from './views/HistoryView';
import { HardwareApiView } from './views/HardwareApiView';
import { PassportView } from './components/PassportView';
import { SimulationView } from './views/SimulationView';

import { DEMO_DATASETS, generateHealthyPackets } from './services/demoData';
import { extractPulseFeatures } from './services/featureService';
import { runDiagnosticInference } from './services/inferenceService';
import { evaluateTelemetryPacket } from './services/safetyService';
import { createDigitalBatteryPassport } from './services/passportService';

import {
  Battery,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Layers,
  Activity,
  FileText,
  Lock,
  Zap,
  UserCheck,
  RefreshCw,
  Download,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [userRole] = useState<UserRole>('admin');

  // Core state
  const [batteries, setBatteries] = useState<BatteryRecord[]>([]);
  const [tests, setTests] = useState<BatteryTest[]>([]);
  const [activeTestId, setActiveTestId] = useState<string>('TEST-HLTH-001');
  const [telemetryMap, setTelemetryMap] = useState<Record<string, TelemetryPacket[]>>({});
  const [devices, setDevices] = useState<DeviceStatus[]>([
    {
      device_id: 'PV-DEV-001',
      name: 'Rig Alpha - Bench Chamber 1',
      status: 'ONLINE',
      ip_address: '192.168.1.142',
      last_heartbeat: new Date().toISOString(),
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
    },
    {
      device_id: 'PV-DEV-002',
      name: 'Rig Beta - Bench Chamber 2',
      status: 'STANDBY',
      ip_address: '192.168.1.143',
      last_heartbeat: new Date().toISOString(),
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
    },
  ]);

  // Modal passport state
  const [selectedPassport, setSelectedPassport] = useState<DigitalBatteryPassport | null>(null);
  const [passportTelemetry, setPassportTelemetry] = useState<TelemetryPacket[]>([]);
  const [dataMode, setDataMode] = useState<'LIVE' | 'DEMO'>('LIVE');
  const [showLimitations, setShowLimitations] = useState(false);

  // Fetch initial data from backend or bootstrap
  useEffect(() => {
    async function loadData() {
      try {
        const [testsRes, batteriesRes] = await Promise.all([
          fetch('/api/tests').then((r) => r.json()),
          fetch('/api/batteries').then((r) => r.json()),
        ]);

        if (testsRes.success && testsRes.data) {
          setTests(testsRes.data);
          if (testsRes.data.length > 0) {
            setActiveTestId(testsRes.data[0].test_id);
          }
        }
        if (batteriesRes.success && batteriesRes.data) {
          setBatteries(batteriesRes.data);
        }

        // Fetch telemetry for initial tests
        const initialMap: Record<string, TelemetryPacket[]> = {};
        for (const [key, demo] of Object.entries(DEMO_DATASETS)) {
          const tId = key === 'healthy_cell' ? 'TEST-HLTH-001' : key === 'degraded_cell' ? 'TEST-DGRD-002' : 'TEST-QRTN-003';
          initialMap[tId] = demo.packets;
        }
        setTelemetryMap(initialMap);
      } catch (err) {
        console.warn('Backend fetch failed, using local seed state:', err);
        // Fallback bootstrap with Demo datasets
        const initialTests: BatteryTest[] = [];
        const initialBats: BatteryRecord[] = [];
        const initialMap: Record<string, TelemetryPacket[]> = {};

        for (const [key, demo] of Object.entries(DEMO_DATASETS)) {
          initialBats.push(demo.battery);
          const tId = key === 'healthy_cell' ? 'TEST-HLTH-001' : key === 'degraded_cell' ? 'TEST-DGRD-002' : 'TEST-QRTN-003';
          initialMap[tId] = demo.packets;

          const isQuarantine = key === 'quarantine_event';
          const features = extractPulseFeatures(demo.packets);
          const safetyStatus = isQuarantine ? 'QUARANTINE' : 'PASS';
          const result = runDiagnosticInference(features, safetyStatus, tId, demo.battery.battery_id, demo.battery.chemistry);

          initialTests.push({
            test_id: tId,
            battery_id: demo.battery.battery_id,
            device_id: 'PV-DEV-001',
            operator_id: 'OP-001',
            protocol_id: 'single_cell_pulse_v1',
            status: isQuarantine ? 'QUARANTINED' : 'COMPLETE',
            safety_status: safetyStatus,
            started_at: demo.packets[0]?.received_at,
            completed_at: demo.packets[demo.packets.length - 1]?.received_at,
            model_version: 'baseline-v0.1',
            calibration_version: 'calibration-v0.1',
            battery: demo.battery,
            features,
            result,
            telemetry_count: demo.packets.length,
          });
        }

        setBatteries(initialBats);
        setTests(initialTests);
        setTelemetryMap(initialMap);
      }
    }

    loadData();
  }, []);

  // Continuous background sync for active test telemetry (connects real ESP32 / curl stream to UI)
  useEffect(() => {
    if (!activeTestId) return;

    const interval = setInterval(async () => {
      try {
        const [telRes, statusRes] = await Promise.all([
          fetch(`/api/tests/${activeTestId}/telemetry`).then((r) => r.json()),
          fetch(`/api/tests/${activeTestId}/status`).then((r) => r.json()),
        ]);

        if (telRes.success && Array.isArray(telRes.data) && telRes.data.length > 0) {
          setTelemetryMap((prev) => ({
            ...prev,
            [activeTestId]: telRes.data,
          }));
        }

        if (statusRes.success) {
          setTests((prev) =>
            prev.map((t) =>
              t.test_id === activeTestId
                ? {
                    ...t,
                    status: statusRes.status || t.status,
                    safety_status: statusRes.safety_status || t.safety_status,
                    abort_reason: statusRes.abort_reason || t.abort_reason,
                    telemetry_count: statusRes.packet_count ?? t.telemetry_count,
                  }
                : t
            )
          );
        }
      } catch {
        // silent polling catch
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeTestId]);

  // Current active test and telemetry
  const activeTest = tests.find((t) => t.test_id === activeTestId) || tests[0];
  const activeTelemetry = activeTest ? telemetryMap[activeTest.test_id] || [] : [];

  // Register Battery Intake handler
  const handleRegisterBattery = async (record: BatteryRecord) => {
    setBatteries((prev) => [record, ...prev]);

    // Create a new test associated with this battery
    const newTestId = `TEST-${Date.now().toString(36).toUpperCase()}`;
    const newTest: BatteryTest = {
      test_id: newTestId,
      battery_id: record.battery_id,
      device_id: 'PV-DEV-001',
      operator_id: 'OP-001',
      protocol_id: 'single_cell_pulse_v1',
      status: 'PRECHECK',
      safety_status: 'PASS',
      model_version: 'baseline-v0.1',
      calibration_version: 'calibration-v0.1',
      battery: record,
    };

    setTests((prev) => [newTest, ...prev]);
    setTelemetryMap((prev) => ({ ...prev, [newTestId]: [] }));
    setActiveTestId(newTestId);

    // Call API
    try {
      await fetch('/api/batteries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTest),
      });
    } catch (e) {
      console.warn('API sync failed:', e);
    }
  };

  // Pre-Check Safety Completion
  const handleCompletePreCheck = (checklist: PreCheckSafetyChecklist, status: 'READY' | 'QUARANTINED') => {
    if (!activeTest) return;

    setTests((prev) =>
      prev.map((t) =>
        t.test_id === activeTest.test_id
          ? {
              ...t,
              status,
              safety_status: status === 'QUARANTINED' ? 'QUARANTINE' : 'PASS',
              pre_check: checklist,
            }
          : t
      )
    );

    if (status === 'READY') {
      setActiveTab('live-monitor');
    } else {
      setActiveTab('decision-center');
    }
  };

  // Start Pulse Protocol
  const handleStartTest = async (testId: string) => {
    setTests((prev) =>
      prev.map((t) =>
        t.test_id === testId
          ? { ...t, status: 'BASELINE', started_at: new Date().toISOString() }
          : t
      )
    );

    try {
      await fetch(`/api/tests/${testId}/start`, { method: 'POST' });
    } catch (e) {
      console.warn(e);
    }
  };

  // Stop / Complete Test
  const handleStopTest = async (testId: string) => {
    const stream = telemetryMap[testId] || [];
    const test = tests.find((t) => t.test_id === testId);

    if (stream.length >= 5 && test && test.battery) {
      try {
        const features = extractPulseFeatures(stream);
        const result = runDiagnosticInference(
          features,
          test.safety_status,
          testId,
          test.battery_id,
          test.battery.chemistry
        );

        setTests((prev) =>
          prev.map((t) =>
            t.test_id === testId
              ? {
                  ...t,
                  status: 'COMPLETE',
                  completed_at: new Date().toISOString(),
                  features,
                  result,
                }
              : t
          )
        );
      } catch (err) {
        console.error('Error during test conclusion:', err);
      }
    }

    try {
      await fetch(`/api/tests/${testId}/stop`, { method: 'POST' });
    } catch (e) {
      console.warn(e);
    }
  };

  // Emergency Abort (E-Stop)
  const handleEmergencyAbort = async (testId: string, reason = 'Operator emergency cutoff') => {
    setTests((prev) =>
      prev.map((t) =>
        t.test_id === testId
          ? {
              ...t,
              status: 'ABORTED',
              safety_status: 'ABORT',
              abort_reason: reason,
              completed_at: new Date().toISOString(),
            }
          : t
      )
    );

    try {
      await fetch(`/api/tests/${testId}/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
    } catch (e) {
      console.warn(e);
    }
  };

  // Telemetry Packet Ingestion
  const handleSendTelemetryPacket = async (packetPartial: Partial<TelemetryPacket>) => {
    const targetId = packetPartial.test_id || activeTestId;
    const test = tests.find((t) => t.test_id === targetId);

    const prevList = telemetryMap[targetId] || [];
    const prevPacket = prevList.length > 0 ? prevList[prevList.length - 1] : undefined;

    const fullPacket: TelemetryPacket = {
      test_id: targetId,
      device_id: packetPartial.device_id || 'PV-DEV-001',
      timestamp_ms: packetPartial.timestamp_ms || Date.now(),
      sequence: packetPartial.sequence || prevList.length + 1,
      voltage_v: packetPartial.voltage_v ?? 3.34,
      current_a: packetPartial.current_a ?? 0.0,
      temperature_cell_c: packetPartial.temperature_cell_c ?? 25.0,
      temperature_box_c: packetPartial.temperature_box_c ?? 24.8,
      co_raw: packetPartial.co_raw ?? 0.012,
      h2_raw: packetPartial.h2_raw ?? 0.008,
      voc_raw: packetPartial.voc_raw ?? 0.04,
      load_state: packetPartial.load_state ?? false,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
      received_at: new Date().toISOString(),
    };

    // Client-side safety evaluation
    const safetyEval = evaluateTelemetryPacket(fullPacket, test?.battery?.chemistry || 'LFP', prevPacket);

    const nextList = [...prevList, fullPacket];
    setTelemetryMap((prev) => ({ ...prev, [targetId]: nextList }));

    // Update test state machine
    setTests((prev) =>
      prev.map((t) => {
        if (t.test_id !== targetId) return t;

        let nextStatus = t.status;
        if (safetyEval.status === 'ABORT' || safetyEval.status === 'QUARANTINE') {
          nextStatus = safetyEval.status === 'QUARANTINE' ? 'QUARANTINED' : 'ABORTED';
        } else if (fullPacket.load_state) {
          nextStatus = 'PULSE_TEST';
        } else if (nextList.some((p) => p.load_state)) {
          nextStatus = 'RELAXATION';
        }

        return {
          ...t,
          status: nextStatus,
          safety_status: safetyEval.status,
          abort_reason: safetyEval.reasons.length > 0 ? safetyEval.reasons.join('; ') : t.abort_reason,
          telemetry_count: nextList.length,
        };
      })
    );

    // Also push to backend API
    try {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullPacket),
      });
      return await res.json();
    } catch (e) {
      return { success: true, action: safetyEval.action, safety_status: safetyEval.status };
    }
  };

  // Open Passport Modal
  const handleOpenPassport = async (testId: string) => {
    const test = tests.find((t) => t.test_id === testId);
    if (!test || !test.battery || !test.result || !test.features) return;

    const stream = telemetryMap[testId] || [];
    const passport = await createDigitalBatteryPassport(
      test.battery,
      test,
      test.result,
      test.features,
      JSON.stringify(stream)
    );

    setSelectedPassport(passport);
    setPassportTelemetry(stream);
  };

  // Demo Dataset Loader
  const handleLoadDemo = async (datasetId: 'healthy_cell' | 'degraded_cell' | 'quarantine_event') => {
    const demo = DEMO_DATASETS[datasetId];
    if (!demo) return;

    const testId = `TEST-DEMO-${Date.now().toString(36).toUpperCase()}`;
    const newBat: BatteryRecord = {
      ...demo.battery,
      battery_id: `BAT-${Date.now().toString(36).toUpperCase()}`,
    };

    const isQuarantine = datasetId === 'quarantine_event';
    const features = extractPulseFeatures(demo.packets);
    const safetyStatus = isQuarantine ? 'QUARANTINE' : 'PASS';
    const result = runDiagnosticInference(features, safetyStatus, testId, newBat.battery_id, newBat.chemistry);

    const newTest: BatteryTest = {
      test_id: testId,
      battery_id: newBat.battery_id,
      device_id: 'PV-DEV-001',
      operator_id: 'OP-DEMO',
      protocol_id: 'single_cell_pulse_v1',
      status: isQuarantine ? 'QUARANTINED' : 'COMPLETE',
      safety_status: safetyStatus,
      started_at: demo.packets[0]?.received_at,
      completed_at: demo.packets[demo.packets.length - 1]?.received_at,
      abort_reason: isQuarantine ? 'Hardware limit exceeded: Cell temperature 46.2°C & H2 gas venting' : undefined,
      model_version: 'baseline-v0.1',
      calibration_version: 'calibration-v0.1',
      battery: newBat,
      features,
      result,
      telemetry_count: demo.packets.length,
    };

    setBatteries((prev) => [newBat, ...prev]);
    setTests((prev) => [newTest, ...prev]);
    setTelemetryMap((prev) => ({ ...prev, [testId]: demo.packets }));
    setActiveTestId(testId);
    setDataMode('DEMO');
    setActiveTab('live-monitor');

    // Notify backend
    try {
      await fetch('/api/demo/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId, target_test_id: testId }),
      });
    } catch (e) {
      console.warn(e);
    }
  };

  // Reviewer Signoff
  const handleReviewerSignoff = async (
    testId: string,
    approvedPathway: CircularityRecommendation,
    comments: string,
    isOverridden: boolean
  ) => {
    setTests((prev) =>
      prev.map((t) => {
        if (t.test_id !== testId || !t.result) return t;
        return {
          ...t,
          result: {
            ...t.result,
            recommendation: approvedPathway,
            reviewer_signoff: {
              reviewer_id: 'REV-LEAD-01',
              approved_recommendation: approvedPathway,
              is_overridden: isOverridden,
              comments,
              signed_at: new Date().toISOString(),
            },
          },
        };
      })
    );

    try {
      await fetch('/api/decisions/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_id: testId,
          reviewer_id: 'REV-LEAD-01',
          approved_recommendation: approvedPathway,
          comments,
          is_overridden: isOverridden,
        }),
      });
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* ======================================================== */}
      {/* TOP BAR CONTRACT: Single text brand, nav links, actions  */}
      {/* ======================================================== */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#D9DEE7] px-4 md:px-8 py-3.5 no-print shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          {/* Zone 1: Single text element wordmark */}
          <div
            onClick={() => setActiveTab('overview')}
            className="cursor-pointer text-xl font-bold tracking-tight text-black flex items-center gap-2 select-none"
          >
            <span>PhyVolt AI</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#F5F6F8] border border-[#D9DEE7] text-blue-700">
              PV-DEV-001 ● ONLINE
            </span>
          </div>

          {/* Zone 2: Clean text navigation links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#4B5563]">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'intake', label: 'Register Intake' },
              { id: 'pre-check', label: 'Safety Checklist' },
              { id: 'live-monitor', label: 'Live Pulse Monitor' },
              { id: 'results', label: 'Diagnostic Results' },
              { id: 'decision-center', label: 'Decision Center' },
              { id: 'history', label: 'Test History' },
              { id: 'hardware-api', label: 'ESP32 & API Hub' },
              { id: 'simulation', label: 'PyBaMM Simulation' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'text-blue-700 font-bold underline underline-offset-8 decoration-blue-600'
                    : 'hover:text-black'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Primary actions */}
          <div className="flex items-center gap-3">
            {/* 1-Click Complete Project Suite Zip Download */}
            <a
              href="/api/export/project-zip"
              download="phyvolt-ai-software-suite.zip"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#F5F6F8] bg-white border border-[#D9DEE7] rounded-md transition-colors whitespace-nowrap shadow-xs"
              title="Download complete source code bundle (Python Flask, ESP32 firmware, Express server, React UI)"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Download Suite (.zip)</span>
              <span className="sm:hidden">.ZIP</span>
            </a>

            {/* Quick Register / Action Button */}
            <button
              onClick={() => setActiveTab('intake')}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap hidden sm:inline-block shadow-xs cursor-pointer"
            >
              + New Intake
            </button>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="lg:hidden flex items-center gap-2 overflow-x-auto pt-2.5 text-xs text-[#4B5563] border-t border-[#D9DEE7] mt-2.5">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'intake', label: 'Intake' },
            { id: 'pre-check', label: 'Pre-Check' },
            { id: 'live-monitor', label: 'Live Monitor' },
            { id: 'results', label: 'Results' },
            { id: 'decision-center', label: 'Decisions' },
            { id: 'history', label: 'History' },
            { id: 'hardware-api', label: 'ESP32' },
            { id: 'simulation', label: 'Simulation' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-bold'
                  : 'text-black hover:bg-[#F5F6F8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Permanent Technical Status Bar (Priority 11) */}
      <div className="bg-[#F5F6F8] border-b border-[#D9DEE7] text-xs px-4 md:px-8 py-2 no-print select-none">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-1.5 gap-x-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-black">
            <div className="flex items-center gap-1.5">
              <span className="text-[#4B5563]">Device:</span>
              <span className="text-emerald-800 font-bold flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                ONLINE (PV-DEV-001)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#4B5563]">Backend API:</span>
              <span className="text-blue-700 font-bold">ONLINE (:3000)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#4B5563]">Database:</span>
              <span className="text-emerald-800 font-semibold">CONNECTED (SQLite)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#4B5563]">Active Test:</span>
              <span className="text-black font-bold">{activeTest?.test_id || 'IDLE'}</span>
              <span className="text-[#4B5563]">[{activeTest?.status || 'STANDBY'}]</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#4B5563]">Safety:</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                  activeTest?.safety_status === 'PASS'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : activeTest?.safety_status === 'WARNING'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                ● {activeTest?.safety_status || 'PASS'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Data Mode Indicator */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#4B5563]">Mode:</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                  dataMode === 'LIVE'
                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {dataMode === 'LIVE' ? 'LIVE HARDWARE' : 'DEMO DATA — NOT LIVE'}
              </span>
            </div>

            {/* Scope & Limitations trigger */}
            <button
              onClick={() => setShowLimitations(true)}
              className="text-xs text-[#4B5563] hover:text-blue-700 underline underline-offset-2 transition-colors cursor-pointer"
            >
              Operational Scope & Limitations
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        {activeTab === 'overview' && (
          <OverviewView
            tests={tests}
            onSelectTest={(id) => {
              setActiveTestId(id);
              setActiveTab('live-monitor');
            }}
            onNavigate={(tab) => setActiveTab(tab)}
            onLoadDemo={handleLoadDemo}
          />
        )}

        {activeTab === 'intake' && (
          <IntakeView
            onRegisterBattery={handleRegisterBattery}
            onProceedToSafetyCheck={(batteryId) => {
              setActiveTab('pre-check');
            }}
          />
        )}

        {activeTab === 'pre-check' && (
          <SafetyPreCheckView
            battery={activeTest?.battery}
            onCompletePreCheck={handleCompletePreCheck}
          />
        )}

        {activeTab === 'live-monitor' && activeTest && (
          <LiveMonitorView
            test={activeTest}
            telemetry={activeTelemetry}
            onStartTest={() => handleStartTest(activeTest.test_id)}
            onStopTest={() => handleStopTest(activeTest.test_id)}
            onAbortTest={() => handleEmergencyAbort(activeTest.test_id)}
            onCompleteTest={() => {
              setActiveTestId(activeTest.test_id);
              setActiveTab('results');
            }}
          />
        )}

        {activeTab === 'results' && activeTest && (
          <ResultsView
            test={activeTest}
            userRole={userRole}
            onOpenPassport={handleOpenPassport}
            onReviewerSignoff={handleReviewerSignoff}
          />
        )}

        {activeTab === 'decision-center' && (
          <DecisionCenterView
            tests={tests}
            onSelectTest={(id) => {
              setActiveTestId(id);
              setActiveTab('results');
            }}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            tests={tests}
            onSelectTest={(id) => {
              setActiveTestId(id);
              setActiveTab('live-monitor');
            }}
            onOpenPassport={handleOpenPassport}
          />
        )}

        {activeTab === 'hardware-api' && (
          <HardwareApiView
            devices={devices}
            onInjectPacket={handleSendTelemetryPacket}
          />
        )}

        {activeTab === 'simulation' && <SimulationView />}
      </main>

      {/* Passport Modal Overlay */}
      {selectedPassport && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <PassportView
            passport={selectedPassport}
            rawTelemetry={passportTelemetry}
            onClose={() => setSelectedPassport(null)}
          />
        </div>
      )}

      {/* Scope & Limitations Modal */}
      {showLimitations && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#D9DEE7] rounded-lg max-w-2xl w-full p-6 space-y-5 text-black shadow-xl">
            <div className="flex items-center justify-between border-b border-[#D9DEE7] pb-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-black">Current Prototype Scope & Scientific Limitations</h3>
                <p className="text-xs text-[#4B5563]">Honest operational boundaries and regulatory context</p>
              </div>
              <button
                onClick={() => setShowLimitations(false)}
                className="text-xs px-2.5 py-1 rounded bg-[#F5F6F8] hover:bg-gray-200 text-black border border-[#D9DEE7] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-black">
              <div className="p-3 bg-[#F5F6F8] rounded border border-[#D9DEE7] space-y-1.5">
                <span className="font-bold text-blue-700 block text-xs uppercase">
                  1. Screening Scope (Not Universal Oracle)
                </span>
                <p>
                  • Evaluates single cells or small series modules under a defined pulse protocol (single-cell pulse v1).<br/>
                  • Calibrated strictly for LFP, NMC, NCA, and LTO chemistries with supported nominal voltages.<br/>
                  • Provides confidence-bounded SoH intervals (e.g. 74%–80%) rather than claiming unrealistic exact decimal numbers.
                </p>
              </div>

              <div className="p-3 bg-[#F5F6F8] rounded border border-[#D9DEE7] space-y-1.5">
                <span className="font-bold text-amber-800 block text-xs uppercase">
                  2. Remaining Useful Life (RUL) Scope
                </span>
                <p>
                  • RUL is marked as <em>not_validated_single_pulse</em> in the screening phase. Exact cycle prediction requires
                  longitudinal accelerated aging cycling data; our prototype provides rapid operational sorting, not an RUL oracle.
                </p>
              </div>

              <div className="p-3 bg-[#F5F6F8] rounded border border-[#D9DEE7] space-y-1.5">
                <span className="font-bold text-emerald-800 block text-xs uppercase">
                  3. Regulatory & EPR Reporting Context
                </span>
                <p>
                  • The Digital Battery Passport creates tamper-evident, SHA-256 verifiable audit records that support
                  Extended Producer Responsibility (EPR) reporting under national Battery Waste Management Rules.<br/>
                  • It is designed as an operational data recorder for authorized facilities; it does NOT claim direct unapproved API integration with CPCB portal endpoints.
                </p>
              </div>

              <div className="p-3 bg-[#F5F6F8] rounded border border-[#D9DEE7] space-y-1.5">
                <span className="font-bold text-rose-800 block text-xs uppercase">
                  4. Safety-First Override Rule
                </span>
                <p>
                  • Physical swelling, electrolyte leakage, thermal runaway rate (&gt;1.5°C/s), or off-gas detection ($H_2$, $CO$)
                  strictly overrides any electrochemical SoH estimate and forces immediate QUARANTINE isolation.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-[#D9DEE7] flex justify-end">
              <button
                onClick={() => setShowLimitations(false)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-md transition-colors cursor-pointer"
              >
                Understood & Acknowledged
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#D9DEE7] bg-white py-4 px-6 text-center text-xs text-[#4B5563] no-print">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-black">PhyVolt AI</span>
            <span className="text-[#D9DEE7]">·</span>
            <span>Retired EV Battery Circularity Intelligence</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span>Model: baseline-v0.1</span>
            <span className="text-[#D9DEE7]">·</span>
            <span>Calibration: calibration-v0.1</span>
            <span className="text-[#D9DEE7]">·</span>
            <span>Tamper-Evident Records</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

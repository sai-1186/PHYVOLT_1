/**
 * PhyVolt AI - Hardware & API Hub
 * ESP32 Wi-Fi JSON contract, live packet injector, curl testing, and sensor pinout specs
 */

import React, { useState } from 'react';
import { TelemetryPacket, DeviceStatus } from '../types/battery';
import { Cpu, Wifi, Terminal, Send, CheckCircle2, AlertTriangle, Copy, ShieldCheck, Download } from 'lucide-react';

interface HardwareApiViewProps {
  devices: DeviceStatus[];
  onInjectPacket: (packet: Partial<TelemetryPacket>) => Promise<{ success: boolean; safety_status?: string; action?: string }>;
}

export const HardwareApiView: React.FC<HardwareApiViewProps> = ({ devices, onInjectPacket }) => {
  const [testId, setTestId] = useState('TEST-BENCH-001');
  const [voltage, setVoltage] = useState(3.24);
  const [current, setCurrent] = useState(0.84);
  const [tempCell, setTempCell] = useState(26.2);
  const [loadState, setLoadState] = useState(true);
  const [h2Raw, setH2Raw] = useState(0.009);
  const [coRaw, setCoRaw] = useState(0.012);
  const [seq, setSeq] = useState(1);
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const handleSendPacket = async (e: React.FormEvent) => {
    e.preventDefault();
    const packet: Partial<TelemetryPacket> = {
      test_id: testId,
      device_id: 'PV-DEV-001',
      timestamp_ms: Date.now(),
      sequence: seq,
      voltage_v: Number(voltage),
      current_a: Number(current),
      temperature_cell_c: Number(tempCell),
      temperature_box_c: 24.8,
      co_raw: Number(coRaw),
      h2_raw: Number(h2Raw),
      voc_raw: 0.04,
      load_state: loadState,
      firmware_version: 'phyvolt-esp32-v1.4',
      calibration_version: 'calibration-v0.1',
    };

    setSeq((prev) => prev + 1);
    const resp = await onInjectPacket(packet);
    setApiResponse(JSON.stringify(resp, null, 2));
  };

  const sampleCurl = `curl -X POST http://localhost:3000/api/telemetry \\
  -H "Content-Type: application/json" \\
  -d '{
    "device_id": "PV-DEV-001",
    "test_id": "${testId}",
    "timestamp_ms": ${Date.now()},
    "voltage_v": ${voltage},
    "current_a": ${current},
    "temperature_cell_c": ${tempCell},
    "temperature_box_c": 24.8,
    "co_raw": ${coRaw},
    "h2_raw": ${h2Raw},
    "voc_raw": 0.042,
    "load_state": ${loadState ? 1 : 0},
    "sequence": ${seq}
  }'`;

  const copyCurl = () => {
    navigator.clipboard.writeText(sampleCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-black tracking-tight">ESP32 Hardware & REST API Hub</h2>
          <p className="text-sm text-[#4B5563] mt-1">
            Hardware telemetry protocol, pinout wiring, live JSON injector, and API integration specifications.
          </p>
        </div>

        <a
          href="/api/export/project-zip"
          download="phyvolt-ai-software-suite.zip"
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>Download Complete Software Suite (.zip)</span>
        </a>
      </div>

      {/* Online Hardware Devices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map((dev) => (
          <div key={dev.device_id} className="border border-[#D9DEE7] bg-white rounded-xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#2563EB]" />
                <span className="font-bold text-black text-xs">{dev.name}</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                {dev.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-y-1.5 text-xs">
              <span className="text-[#4B5563]">Device ID:</span>
              <span className="text-black font-semibold">{dev.device_id}</span>
              <span className="text-[#4B5563]">IP Address:</span>
              <span className="text-black">{dev.ip_address}</span>
              <span className="text-[#4B5563]">Firmware:</span>
              <span className="text-black">{dev.firmware_version}</span>
              <span className="text-[#4B5563]">Calibration:</span>
              <span className="text-black">{dev.calibration_version}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 2-Column: Live Packet Injector & Curl Command */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Injector Form */}
        <div className="border border-[#D9DEE7] bg-white rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#D9DEE7] pb-3">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-[#2563EB]" />
              <h3 className="text-sm font-bold text-black">Live ESP32 Telemetry Injector</h3>
            </div>
            <span className="text-[#4B5563] text-[11px] font-semibold">POST /api/telemetry</span>
          </div>

          <form onSubmit={handleSendPacket} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#4B5563] font-medium mb-1">Test ID</label>
                <input
                  type="text"
                  value={testId}
                  onChange={(e) => setTestId(e.target.value)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-black focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-medium mb-1">Sequence #</label>
                <input
                  type="number"
                  value={seq}
                  onChange={(e) => setSeq(parseInt(e.target.value))}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-black focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-medium mb-1">Voltage (V)</label>
                <input
                  type="number"
                  step="0.01"
                  value={voltage}
                  onChange={(e) => setVoltage(parseFloat(e.target.value))}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-[#2563EB] font-bold focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-medium mb-1">Current (A)</label>
                <input
                  type="number"
                  step="0.01"
                  value={current}
                  onChange={(e) => setCurrent(parseFloat(e.target.value))}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-emerald-700 font-bold focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-medium mb-1">Cell Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tempCell}
                  onChange={(e) => setTempCell(parseFloat(e.target.value))}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-amber-700 font-bold focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-medium mb-1">Load Relay State</label>
                <select
                  value={loadState ? '1' : '0'}
                  onChange={(e) => setLoadState(e.target.value === '1')}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-black focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                >
                  <option value="1">1 (Pulse Active - Load Resistor ON)</option>
                  <option value="0">0 (Relaxation - Load Resistor OFF)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#4B5563] font-medium mb-1">H2 Raw Sensor</label>
                <input
                  type="number"
                  step="0.005"
                  value={h2Raw}
                  onChange={(e) => setH2Raw(parseFloat(e.target.value))}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-black focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-medium mb-1">CO Raw Sensor</label>
                <input
                  type="number"
                  step="0.005"
                  value={coRaw}
                  onChange={(e) => setCoRaw(parseFloat(e.target.value))}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-black focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-[#4B5563]">Updates live monitor in real time.</span>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded transition-colors shadow-sm"
              >
                Transmit Packet to Backend
              </button>
            </div>
          </form>

          {apiResponse && (
            <div className="space-y-1 pt-2 border-t border-[#D9DEE7]">
              <span className="text-[11px] font-semibold text-[#4B5563]">Backend Response:</span>
              <pre className="p-2.5 rounded bg-[#F5F6F8] border border-[#D9DEE7] text-[11px] text-emerald-800 overflow-x-auto">
                {apiResponse}
              </pre>
            </div>
          )}
        </div>

        {/* Curl & Wiring Architecture */}
        <div className="border border-[#D9DEE7] bg-white rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#D9DEE7] pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#2563EB]" />
              <h3 className="text-sm font-bold text-black">cURL Command for ESP32 Testing</h3>
            </div>
            <button
              onClick={copyCurl}
              className="text-xs text-[#4B5563] hover:text-black flex items-center gap-1 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedCurl ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          <pre className="p-3 rounded bg-[#F5F6F8] border border-[#D9DEE7] text-[11px] text-black overflow-x-auto select-all leading-relaxed">
            {sampleCurl}
          </pre>

          <div className="space-y-2 pt-2 border-t border-[#D9DEE7] text-xs">
            <span className="font-bold text-black">Hardware Pinout Mapping:</span>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-[#4B5563]">
              <div className="bg-[#F5F6F8] p-2.5 rounded border border-[#D9DEE7]">
                <span className="text-[#2563EB] font-bold">INA219 I2C:</span> SDA (GPIO 21), SCL (GPIO 22)
              </div>
              <div className="bg-[#F5F6F8] p-2.5 rounded border border-[#D9DEE7]">
                <span className="text-amber-700 font-bold">DS18B20 Temp:</span> Data (GPIO 4)
              </div>
              <div className="bg-[#F5F6F8] p-2.5 rounded border border-[#D9DEE7]">
                <span className="text-rose-700 font-bold">MQ-135 / MQ-4 Gas:</span> ADC1 (GPIO 34, 35)
              </div>
              <div className="bg-[#F5F6F8] p-2.5 rounded border border-[#D9DEE7]">
                <span className="text-emerald-700 font-bold">Load Relay MOSFET:</span> Gate (GPIO 18)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

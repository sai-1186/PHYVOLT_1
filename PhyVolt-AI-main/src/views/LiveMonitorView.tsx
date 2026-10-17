/**
 * PhyVolt AI - Live Pulse Monitor View
 * Real-time state machine tracker, multi-channel oscilloscope, safety engine status, and bench controls
 * White Theme with Times New Roman Typography
 */

import React, { useState, useEffect } from 'react';
import { BatteryTest, TelemetryPacket } from '../types/battery';
import { WaveformChart } from '../components/WaveformChart';
import { ThermalGasChart } from '../components/ThermalGasChart';
import { Play, Square, AlertOctagon, Activity, Flame } from 'lucide-react';

interface LiveMonitorViewProps {
  test: BatteryTest;
  telemetry: TelemetryPacket[];
  onStartTest: () => void;
  onStopTest: () => void;
  onAbortTest: () => void;
  onCompleteTest: () => void;
}

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({
  test,
  telemetry,
  onStartTest,
  onStopTest,
  onAbortTest,
  onCompleteTest,
}) => {
  const [isSimulatingLiveStream, setIsSimulatingLiveStream] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(telemetry.length);

  // Live timer simulation generator
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSimulatingLiveStream && test.status !== 'ABORTED' && test.status !== 'QUARANTINED' && test.status !== 'COMPLETE') {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => {
          const nextSec = prev + 1;
          if (nextSec >= 60) {
            setIsSimulatingLiveStream(false);
            onStopTest();
          }
          return nextSec;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSimulatingLiveStream, test.status, onStopTest]);

  const latest = telemetry.length > 0 ? telemetry[telemetry.length - 1] : null;

  // Format stopwatch
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // State phases matching finite-state test workflow
  const phases = ['CREATED', 'PRECHECK', 'READY', 'BASELINE', 'PULSE_TEST', 'RELAXATION', 'ANALYSIS', 'COMPLETE', 'PASSPORT_GENERATED'];
  const currentPhaseIndex = phases.indexOf(test.status);

  return (
    <div className="space-y-6 bg-white text-black">
      {/* Top Test State & Safety Ribbon */}
      <div className="border border-[#D9DEE7] bg-white rounded-xl p-4 md:p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-blue-700 font-bold text-base">{test.test_id}</span>
              <span className="text-[#D9DEE7]">·</span>
              <span className="text-xs text-[#4B5563] font-semibold">Rig: {test.device_id}</span>
              <span className="text-[#D9DEE7]">·</span>
              <span className="text-xs text-[#4B5563]">Operator: {test.operator_id}</span>
            </div>
            <div className="text-xs text-[#4B5563]">
              Cell: <span className="text-black font-bold">{test.battery?.cell_id || test.battery_id}</span> ({test.battery?.chemistry || 'LFP'} {test.battery?.format})
            </div>
          </div>

          {/* Stopwatch & Relay Banner */}
          <div className="flex items-center gap-4">
            <div className="bg-[#F5F6F8] border border-[#D9DEE7] px-3.5 py-1.5 rounded-lg text-right">
              <div className="text-xs text-[#4B5563] uppercase font-bold">Protocol Elapsed</div>
              <div className="text-lg font-bold text-black tabular-nums">
                {formatTime(telemetry.length)} <span className="text-xs text-[#4B5563] font-normal">/ 01:00</span>
              </div>
            </div>

            {/* Safety Indicator Badge */}
            <div
              className={`px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-2 ${
                test.safety_status === 'PASS'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : test.safety_status === 'WARNING'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${test.safety_status === 'PASS' ? 'bg-emerald-600' : 'bg-rose-600 animate-pulse'}`} />
              <span>SAFETY: {test.safety_status}</span>
            </div>
          </div>
        </div>

        {/* State Machine Step Progress Bar */}
        <div className="pt-2 border-t border-[#D9DEE7]">
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1 text-xs">
            {phases.map((phase, idx) => {
              const isActive = test.status === phase;
              const isPast = currentPhaseIndex > idx && currentPhaseIndex !== -1;
              const isAborted = (test.status === 'ABORTED' || test.status === 'QUARANTINED' || test.status === 'SENSOR_FAILURE' || test.status === 'COMMUNICATION_FAILURE') && idx === Math.max(0, currentPhaseIndex);

              return (
                <div
                  key={phase}
                  className={`text-center py-1.5 px-0.5 rounded transition-colors whitespace-nowrap overflow-hidden text-ellipsis ${
                    isAborted
                      ? 'bg-rose-50 text-rose-800 border border-rose-300 font-bold'
                      : isActive
                      ? 'bg-blue-50 text-blue-800 border border-blue-300 font-bold'
                      : isPast
                      ? 'bg-[#F5F6F8] text-[#4B5563] border border-[#D9DEE7] font-semibold'
                      : 'bg-white text-gray-400 border border-gray-200'
                  }`}
                  title={phase}
                >
                  {phase.replace('_', ' ')}
                </div>
              );
            })}
          </div>

          {(test.status === 'ABORTED' || test.status === 'QUARANTINED' || test.status === 'SENSOR_FAILURE' || test.status === 'COMMUNICATION_FAILURE') && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 shrink-0 text-rose-700" />
              <span>
                State Transition Halt [{test.status}]: {test.abort_reason || 'Operating limit or sensor anomaly triggered cutoff.'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Live Oscilloscope Gauges (4 Metric Readouts) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-[#D9DEE7] bg-white rounded-lg p-3.5 shadow-xs">
          <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563] block">Instant Voltage</span>
          <div className="text-2xl font-bold text-blue-700 tabular-nums mt-1">
            {latest ? latest.voltage_v.toFixed(3) : '3.340'}{' '}
            <span className="text-xs text-[#4B5563] font-normal">V</span>
          </div>
          <span className="text-xs text-[#4B5563] block mt-1">
            Resting OCV: {telemetry[0]?.voltage_v.toFixed(3) || '3.342'} V
          </span>
        </div>

        <div className="border border-[#D9DEE7] bg-white rounded-lg p-3.5 shadow-xs">
          <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563] block">Pulse Current</span>
          <div className="text-2xl font-bold text-emerald-800 tabular-nums mt-1">
            {latest ? Math.abs(latest.current_a).toFixed(2) : '0.00'}{' '}
            <span className="text-xs text-[#4B5563] font-normal">A</span>
          </div>
          <span className="text-xs text-[#4B5563] block mt-1">
            Load Contactor: {latest?.load_state ? 'ENGAGED (Pulse)' : 'DISENGAGED'}
          </span>
        </div>

        <div className="border border-[#D9DEE7] bg-white rounded-lg p-3.5 shadow-xs">
          <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563] block">Cell Surface Temp</span>
          <div className="text-2xl font-bold text-rose-800 tabular-nums mt-1">
            {latest ? latest.temperature_cell_c.toFixed(1) : '24.8'}{' '}
            <span className="text-xs text-[#4B5563] font-normal">°C</span>
          </div>
          <span className="text-xs text-[#4B5563] block mt-1">
            Ceiling: 45.0 °C (Abort threshold)
          </span>
        </div>

        <div className="border border-[#D9DEE7] bg-white rounded-lg p-3.5 shadow-xs">
          <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563] block">Gas Sensor Index</span>
          <div className="text-2xl font-bold text-black tabular-nums mt-1">
            {latest?.h2_raw && latest.h2_raw > 0.07 ? 'HAZARD' : 'NOMINAL'}
          </div>
          <span className="text-xs text-[#4B5563] block mt-1">
            H2: {latest ? latest.h2_raw.toFixed(3) : '0.008'} · CO: {latest ? latest.co_raw.toFixed(3) : '0.012'}
          </span>
        </div>
      </div>

      {/* Primary Channel 1 Chart: Voltage & Current Waveform */}
      <div className="space-y-2 border border-[#D9DEE7] bg-white rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-[#D9DEE7]">
          <h3 className="font-bold text-black text-sm">Channel 1: Voltage & Current Pulse Waveform</h3>
          <span className="text-[#4B5563] text-xs">Sampling: 1.0 Hz · Dual Axis</span>
        </div>
        <WaveformChart telemetry={telemetry} showPhysicsModel={true} height={280} />
      </div>

      {/* Channel 2 Chart: Thermal & Gas Waveform */}
      <div className="space-y-2 border border-[#D9DEE7] bg-white rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-[#D9DEE7]">
          <h3 className="font-bold text-black text-sm">Channel 2: Thermal Dynamic & Gas Off-Gassing Delta</h3>
          <span className="text-[#4B5563] text-xs">Thermistor + MQ Gas Array</span>
        </div>
        <ThermalGasChart telemetry={telemetry} height={220} />
      </div>

      {/* Operational Controls Toolbar */}
      <div className="border border-[#D9DEE7] bg-[#F5F6F8] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {test.status === 'READY' || test.status === 'CREATED' ? (
            <button
              onClick={() => {
                onStartTest();
                setIsSimulatingLiveStream(true);
              }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded transition-colors shadow-xs cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Start Pulse Protocol</span>
            </button>
          ) : test.status === 'COMPLETE' || test.status === 'ABORTED' || test.status === 'QUARANTINED' ? (
            <button
              onClick={() => onCompleteTest()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded transition-colors shadow-xs cursor-pointer"
            >
              <span>View Diagnostics & Passport</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setIsSimulatingLiveStream(false);
                onStopTest();
              }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-black bg-white hover:bg-gray-100 rounded transition-colors border border-[#D9DEE7] cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Protocol</span>
            </button>
          )}

          {/* Live Simulator Toggle for Jury Demo */}
          <button
            onClick={() => setIsSimulatingLiveStream(!isSimulatingLiveStream)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded transition-colors border cursor-pointer ${
              isSimulatingLiveStream
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-black border-[#D9DEE7] hover:bg-gray-100'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{isSimulatingLiveStream ? 'Streaming Active (1 Hz)' : 'Simulate 1Hz Stream'}</span>
          </button>

          {/* Inject Safety Abort Test */}
          <button
            onClick={() => {
              setIsSimulatingLiveStream(false);
              onAbortTest();
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded transition-colors cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Simulate Thermal Runaway Cutoff</span>
          </button>
        </div>

        {/* Master Emergency Stop (E-Stop) */}
        <div>
          <button
            onClick={() => {
              setIsSimulatingLiveStream(false);
              onAbortTest();
            }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded transition-colors shadow-xs border border-red-700 uppercase tracking-wide cursor-pointer"
          >
            <AlertOctagon className="w-4 h-4" />
            <span>🚨 Emergency Abort (E-Stop)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

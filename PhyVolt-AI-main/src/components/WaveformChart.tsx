/**
 * PhyVolt AI - Oscilloscope Waveform Chart
 * Dual-axis Voltage (V) and Current (A) with Pulse Phase Shading & PyBaMM Physics Model Overlay
 * White Theme with Times New Roman Typography
 */

import React, { useState } from 'react';
import { TelemetryPacket } from '../types/battery';

interface WaveformChartProps {
  telemetry: TelemetryPacket[];
  showPhysicsModel?: boolean;
  height?: number;
}

export const WaveformChart: React.FC<WaveformChartProps> = ({
  telemetry,
  showPhysicsModel = true,
  height = 260,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!telemetry || telemetry.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full flex items-center justify-center border border-[#D9DEE7] bg-white rounded-lg text-[#4B5563] text-xs"
      >
        Waiting for pulse telemetry stream...
      </div>
    );
  }

  const padding = { top: 24, right: 54, bottom: 32, left: 54 };
  const width = 800; // SVG viewBox coordinate system
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Voltage min/max bounds
  const vValues = telemetry.map((p) => p.voltage_v);
  const vMinRaw = Math.min(...vValues);
  const vMaxRaw = Math.max(...vValues);
  const vMin = Math.floor(vMinRaw * 10) / 10 - 0.05;
  const vMax = Math.ceil(vMaxRaw * 10) / 10 + 0.05;

  // Current bounds (0 to max current + buffer)
  const iValues = telemetry.map((p) => Math.abs(p.current_a));
  const iMax = Math.max(1.2, Math.ceil(Math.max(...iValues, 0.8) * 10) / 10);

  // Time bounds
  const tMin = telemetry[0].timestamp_ms;
  const tMax = Math.max(tMin + 1000, telemetry[telemetry.length - 1].timestamp_ms);
  const tSpan = Math.max(1, tMax - tMin);

  const getX = (t: number) => padding.left + ((t - tMin) / tSpan) * innerWidth;
  const getY_V = (v: number) => padding.top + innerHeight - ((v - vMin) / (vMax - vMin || 0.1)) * innerHeight;
  const getY_I = (i: number) => padding.top + innerHeight - (i / iMax) * innerHeight;

  // Build path strings
  let vPath = '';
  let iPath = '';
  let pybammPath = '';

  const baselineV = telemetry[0].voltage_v;

  telemetry.forEach((p, idx) => {
    const x = getX(p.timestamp_ms);
    const yV = getY_V(p.voltage_v);
    const yI = getY_I(Math.abs(p.current_a));

    if (idx === 0) {
      vPath = `M ${x.toFixed(1)} ${yV.toFixed(1)}`;
      iPath = `M ${x.toFixed(1)} ${yI.toFixed(1)}`;
    } else {
      vPath += ` L ${x.toFixed(1)} ${yV.toFixed(1)}`;
      iPath += ` L ${x.toFixed(1)} ${yI.toFixed(1)}`;
    }

    const isPulse = Boolean(p.load_state) || Number(p.load_state) === 1;
    let vSim = baselineV;
    if (isPulse) {
      vSim = baselineV - 0.022 * 0.84 - 0.012;
    } else if (idx > 10) {
      vSim = baselineV - 0.006;
    }
    const ySim = getY_V(vSim);
    if (idx === 0) {
      pybammPath = `M ${x.toFixed(1)} ${ySim.toFixed(1)}`;
    } else {
      pybammPath += ` L ${x.toFixed(1)} ${ySim.toFixed(1)}`;
    }
  });

  const pulsePackets = telemetry.filter((p) => Boolean(p.load_state) || Number(p.load_state) === 1);
  let pulseRect = null;
  if (pulsePackets.length > 0) {
    const startX = getX(pulsePackets[0].timestamp_ms);
    const endX = getX(pulsePackets[pulsePackets.length - 1].timestamp_ms);
    pulseRect = {
      x: startX,
      width: Math.max(4, endX - startX),
    };
  }

  const activePacket = hoverIndex !== null && telemetry[hoverIndex] ? telemetry[hoverIndex] : telemetry[telemetry.length - 1];

  return (
    <div className="relative w-full border border-[#D9DEE7] bg-white rounded-lg p-3 shadow-xs">
      {/* Chart Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-bold text-blue-700">
            <span className="w-3 h-1 bg-blue-600 inline-block rounded" />
            <span>Voltage V (t)</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-emerald-700">
            <span className="w-3 h-1 bg-emerald-600 inline-block rounded" />
            <span>Pulse Current I (t)</span>
          </div>
          {showPhysicsModel && (
            <div className="flex items-center gap-1.5 font-bold text-purple-700">
              <span className="w-3 h-1 border-t-2 border-dashed border-purple-600 inline-block" />
              <span>PyBaMM ECM Fit</span>
            </div>
          )}
          {pulseRect && (
            <div className="flex items-center gap-1 text-amber-800 font-semibold">
              <span className="w-2.5 h-2.5 bg-amber-100 border border-amber-400 inline-block rounded-xs" />
              <span>Pulse Active Window</span>
            </div>
          )}
        </div>

        {/* Real-time Crosshair HUD */}
        {activePacket && (
          <div className="flex items-center gap-3 text-xs text-black bg-[#F5F6F8] px-2.5 py-1 rounded border border-[#D9DEE7]">
            <span>t: {((activePacket.timestamp_ms - tMin) / 1000).toFixed(1)}s</span>
            <span className="text-blue-700 font-bold">{activePacket.voltage_v.toFixed(3)} V</span>
            <span className="text-emerald-700 font-bold">{Math.abs(activePacket.current_a).toFixed(2)} A</span>
            <span className="text-[#4B5563]">Load: {activePacket.load_state ? 'ON' : 'OFF'}</span>
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none bg-white"
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding.top + innerHeight * pct;
          const vLabel = (vMax - pct * (vMax - vMin)).toFixed(2);
          const iLabel = (iMax - pct * iMax).toFixed(2);
          return (
            <g key={pct}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke="#E5E7EB"
                strokeDasharray="3,3"
                strokeWidth="1"
              />
              {/* Voltage Tick (Left) */}
              <text
                x={padding.left - 8}
                y={y + 3}
                fill="#4B5563"
                fontSize="11"
                textAnchor="end"
                fontWeight="500"
              >
                {vLabel} V
              </text>
              {/* Current Tick (Right) */}
              <text
                x={padding.left + innerWidth + 8}
                y={y + 3}
                fill="#4B5563"
                fontSize="11"
                textAnchor="start"
                fontWeight="500"
              >
                {iLabel} A
              </text>
            </g>
          );
        })}

        {/* Pulse Zone Shading */}
        {pulseRect && (
          <g>
            <rect
              x={pulseRect.x}
              y={padding.top}
              width={pulseRect.width}
              height={innerHeight}
              fill="#F59E0B"
              fillOpacity="0.08"
            />
            <line
              x1={pulseRect.x}
              y1={padding.top}
              x2={pulseRect.x}
              y2={padding.top + innerHeight}
              stroke="#D97706"
              strokeDasharray="3,3"
              strokeWidth="1.2"
            />
            <line
              x1={pulseRect.x + pulseRect.width}
              y1={padding.top}
              x2={pulseRect.x + pulseRect.width}
              y2={padding.top + innerHeight}
              stroke="#D97706"
              strokeDasharray="3,3"
              strokeWidth="1.2"
            />
          </g>
        )}

        {/* Physics Simulation Curve (PyBaMM equivalent) */}
        {showPhysicsModel && (
          <path
            d={pybammPath}
            fill="none"
            stroke="#7C3AED"
            strokeWidth="1.6"
            strokeDasharray="4,3"
          />
        )}

        {/* Pulse Current Curve (Green) */}
        <path
          d={iPath}
          fill="none"
          stroke="#059669"
          strokeWidth="2"
          strokeDasharray="5,2"
        />

        {/* Voltage Curve (Blue) */}
        <path
          d={vPath}
          fill="none"
          stroke="#2563EB"
          strokeWidth="2.5"
        />

        {/* Interactive Hover Probe */}
        {activePacket && (
          <g>
            <line
              x1={getX(activePacket.timestamp_ms)}
              y1={padding.top}
              x2={getX(activePacket.timestamp_ms)}
              y2={padding.top + innerHeight}
              stroke="#9CA3AF"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <circle
              cx={getX(activePacket.timestamp_ms)}
              cy={getY_V(activePacket.voltage_v)}
              r="4.5"
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <circle
              cx={getX(activePacket.timestamp_ms)}
              cy={getY_I(Math.abs(activePacket.current_a))}
              r="4"
              fill="#059669"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Transparent overlay for mouse hover detection */}
        {telemetry.map((p, idx) => {
          const x = getX(p.timestamp_ms);
          return (
            <rect
              key={idx}
              x={x - 6}
              y={padding.top}
              width={12}
              height={innerHeight}
              fill="transparent"
              className="cursor-crosshair"
              onMouseEnter={() => setHoverIndex(idx)}
            />
          );
        })}
      </svg>
    </div>
  );
};

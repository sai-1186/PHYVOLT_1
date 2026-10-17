/**
 * PhyVolt AI - Thermal & Gas Sensor Waveform
 * Multi-channel temperature tracking and off-gas screening with safety threshold lines
 * White Theme with Times New Roman Typography
 */

import React from 'react';
import { TelemetryPacket } from '../types/battery';

interface ThermalGasChartProps {
  telemetry: TelemetryPacket[];
  height?: number;
}

export const ThermalGasChart: React.FC<ThermalGasChartProps> = ({ telemetry, height = 220 }) => {
  if (!telemetry || telemetry.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full flex items-center justify-center border border-[#D9DEE7] bg-white rounded-lg text-[#4B5563] text-xs"
      >
        Waiting for thermal & gas data...
      </div>
    );
  }

  const padding = { top: 20, right: 50, bottom: 28, left: 45 };
  const width = 800;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Temperature scale (20°C to 50°C)
  const tempValues = telemetry.map((p) => p.temperature_cell_c);
  const minTemp = 20.0;
  const maxTemp = Math.max(50.0, Math.ceil(Math.max(...tempValues, 45.0) + 2));

  // Time scale
  const tMin = telemetry[0].timestamp_ms;
  const tMax = Math.max(tMin + 1000, telemetry[telemetry.length - 1].timestamp_ms);
  const tSpan = Math.max(1, tMax - tMin);

  const getX = (t: number) => padding.left + ((t - tMin) / tSpan) * innerWidth;
  const getY_Temp = (temp: number) => padding.top + innerHeight - ((temp - minTemp) / (maxTemp - minTemp)) * innerHeight;

  let cellTempPath = '';
  let boxTempPath = '';
  let h2GasPath = '';

  telemetry.forEach((p, idx) => {
    const x = getX(p.timestamp_ms);
    const yCell = getY_Temp(p.temperature_cell_c);
    const yBox = getY_Temp(p.temperature_box_c ?? p.temperature_cell_c - 1);

    const h2Mapped = minTemp + (p.h2_raw / 0.15) * (maxTemp - minTemp);
    const yH2 = getY_Temp(Math.min(maxTemp, h2Mapped));

    if (idx === 0) {
      cellTempPath = `M ${x.toFixed(1)} ${yCell.toFixed(1)}`;
      boxTempPath = `M ${x.toFixed(1)} ${yBox.toFixed(1)}`;
      h2GasPath = `M ${x.toFixed(1)} ${yH2.toFixed(1)}`;
    } else {
      cellTempPath += ` L ${x.toFixed(1)} ${yCell.toFixed(1)}`;
      boxTempPath += ` L ${x.toFixed(1)} ${yBox.toFixed(1)}`;
      h2GasPath += ` L ${x.toFixed(1)} ${yH2.toFixed(1)}`;
    }
  });

  const abortLineY = getY_Temp(45.0);
  const latest = telemetry[telemetry.length - 1];

  return (
    <div className="relative w-full border border-[#D9DEE7] bg-white rounded-lg p-3 shadow-xs">
      {/* Legend & Current metrics */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-bold text-amber-800">
            <span className="w-3 h-1 bg-amber-600 inline-block rounded" />
            <span>Cell Surface Temp (°C)</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-blue-700">
            <span className="w-3 h-1 bg-blue-600 inline-block rounded" />
            <span>Enclosure Ambient (°C)</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-rose-700">
            <span className="w-3 h-1 border-t-2 border-dashed border-rose-600 inline-block" />
            <span>H2 Off-Gas Delta</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-800 font-bold text-xs">
            <span className="w-3 h-1 border-t-2 border-dashed border-red-600 inline-block" />
            <span>45.0°C Abort Threshold</span>
          </div>
        </div>

        {latest && (
          <div className="flex items-center gap-3 text-xs text-black bg-[#F5F6F8] px-2.5 py-1 rounded border border-[#D9DEE7]">
            <span className="text-amber-800 font-bold">Cell: {latest.temperature_cell_c.toFixed(1)}°C</span>
            <span className="text-blue-700 font-bold">Box: {latest.temperature_box_c.toFixed(1)}°C</span>
            <span className="text-rose-800 font-bold">H2: {latest.h2_raw.toFixed(3)}</span>
            <span className="text-[#4B5563]">CO: {latest.co_raw.toFixed(3)}</span>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none bg-white">
        {/* Horizontal gridlines */}
        {[20, 30, 40, 50].map((tempVal) => {
          if (tempVal > maxTemp) return null;
          const y = getY_Temp(tempVal);
          return (
            <g key={tempVal}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke="#E5E7EB"
                strokeDasharray="3,3"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                fill="#4B5563"
                fontSize="11"
                textAnchor="end"
                fontWeight="500"
              >
                {tempVal}°C
              </text>
            </g>
          );
        })}

        {/* 45°C Safety Ceiling Abort Line */}
        <line
          x1={padding.left}
          y1={abortLineY}
          x2={padding.left + innerWidth}
          y2={abortLineY}
          stroke="#DC2626"
          strokeDasharray="4,3"
          strokeWidth="1.8"
        />
        <text
          x={padding.left + innerWidth + 6}
          y={abortLineY + 3}
          fill="#DC2626"
          fontSize="11"
          fontWeight="bold"
        >
          45°C ABORT
        </text>

        {/* Enclosure Ambient curve (Blue) */}
        <path d={boxTempPath} fill="none" stroke="#2563EB" strokeWidth="1.8" strokeOpacity="0.85" />

        {/* H2 Off-Gas indicator curve (Rose dotted) */}
        <path d={h2GasPath} fill="none" stroke="#DC2626" strokeWidth="1.8" strokeDasharray="4,3" strokeOpacity="0.9" />

        {/* Cell Temperature curve (Amber) */}
        <path d={cellTempPath} fill="none" stroke="#D97706" strokeWidth="2.5" />

        {/* Latest Cell Temp Marker */}
        {latest && (
          <circle
            cx={getX(latest.timestamp_ms)}
            cy={getY_Temp(latest.temperature_cell_c)}
            r="4.5"
            fill="#D97706"
            stroke="#FFFFFF"
            strokeWidth="2"
          />
        )}
      </svg>
    </div>
  );
};

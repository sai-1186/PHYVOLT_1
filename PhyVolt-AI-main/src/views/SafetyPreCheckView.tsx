/**
 * PhyVolt AI - Pre-Test Safety Checklist View
 * 10-point mandatory physical, electrical, and environmental screening prior to pulse discharge
 * White Theme with Times New Roman Typography
 */

import React, { useState } from 'react';
import { PreCheckSafetyChecklist, BatteryRecord } from '../types/battery';
import { ShieldAlert, ArrowRight } from 'lucide-react';

interface SafetyPreCheckViewProps {
  battery?: BatteryRecord;
  onCompletePreCheck: (checklist: PreCheckSafetyChecklist, status: 'READY' | 'QUARANTINED') => void;
}

export const SafetyPreCheckView: React.FC<SafetyPreCheckViewProps> = ({ battery, onCompletePreCheck }) => {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    no_swelling: true,
    no_electrolyte_leakage: true,
    no_casing_deformation: true,
    clean_terminals: true,
    ambient_temperature_normal: true,
    correct_polarity_verified: true,
    ocv_within_safe_range: true,
    enclosure_door_latched: true,
    emergency_stop_armed: true,
    sensors_calibrated_baseline: true,
  });

  const [measuredOcv, setMeasuredOcv] = useState(battery?.chemistry === 'LFP' ? 3.32 : 3.78);
  const [measuredTemp, setMeasuredTemp] = useState(24.5);
  const [notes, setNotes] = useState('');
  const [inspectorId, setInspectorId] = useState('OP-001');

  const toggleItem = (key: string) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const hasPhysicalHazard = !checklist.no_swelling || !checklist.no_electrolyte_leakage || !checklist.no_casing_deformation;
  const allPassed = Object.values(checklist).every(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const resultChecklist: PreCheckSafetyChecklist = {
      no_swelling: checklist.no_swelling,
      no_electrolyte_leakage: checklist.no_electrolyte_leakage,
      no_casing_deformation: checklist.no_casing_deformation,
      clean_terminals: checklist.clean_terminals,
      ambient_temperature_normal: checklist.ambient_temperature_normal,
      correct_polarity_verified: checklist.correct_polarity_verified,
      ocv_within_safe_range: checklist.ocv_within_safe_range,
      enclosure_door_latched: checklist.enclosure_door_latched,
      emergency_stop_armed: checklist.emergency_stop_armed,
      sensors_calibrated_baseline: checklist.sensors_calibrated_baseline,
      notes: notes + ` [Measured OCV: ${measuredOcv}V, Temp: ${measuredTemp}°C]`,
      checked_by: inspectorId,
      checked_at: new Date().toISOString(),
    };

    if (hasPhysicalHazard) {
      onCompletePreCheck(resultChecklist, 'QUARANTINED');
    } else {
      onCompletePreCheck(resultChecklist, allPassed ? 'READY' : 'QUARANTINED');
    }
  };

  const checkItems = [
    { key: 'no_swelling', title: '1. Zero Swelling & Bulge', desc: 'No pouch expansion, prismatic wall bowing, or cylindrical can distension.' },
    { key: 'no_electrolyte_leakage', title: '2. Zero Electrolyte Leakage', desc: 'No seal moisture, crystalline salt deposits, or sweet/solvent odor detected.' },
    { key: 'no_casing_deformation', title: '3. Zero Mechanical Deformation', desc: 'No casing punctures, crushed corners, or severe structural impacts.' },
    { key: 'clean_terminals', title: '4. Clean Terminal Contacts', desc: 'Both positive and negative terminals free of copper oxidation and corrosion.' },
    { key: 'ambient_temperature_normal', title: '5. Ambient Equilibrium (18°C–28°C)', desc: 'Cell thermal mass acclimated to laboratory room temperature.' },
    { key: 'correct_polarity_verified', title: '6. Correct Polarity Confirmed', desc: 'Multimeter polarity check matches bench Kelvin clip orientation.' },
    { key: 'ocv_within_safe_range', title: '7. Resting OCV within Envelope', desc: 'Open Circuit Voltage is >2.2V (avoids copper dissolution) and <4.25V.' },
    { key: 'enclosure_door_latched', title: '8. Enclosure Door Interlock', desc: 'Safety testing chamber cover securely closed and latched.' },
    { key: 'emergency_stop_armed', title: '9. Hardware E-Stop Armed', desc: 'Rig physical emergency stop circuit armed and verified operational.' },
    { key: 'sensors_calibrated_baseline', title: '10. Sensors Baseline Calibrated', desc: 'Zero offset on INA219 current shunt and MQ gas sensor baseline steady.' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 bg-white text-black">
      <div className="border border-[#D9DEE7] bg-white rounded-xl p-6 md:p-8 space-y-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D9DEE7] pb-4">
          <div>
            <h2 className="text-xl font-bold text-black tracking-tight">Pre-Test Safety Checklist</h2>
            <div className="flex items-center gap-2 text-xs text-[#4B5563] mt-1">
              <span>Target Battery:</span>
              <span className="text-blue-700 font-bold">{battery?.battery_id || 'BAT-EV-CURRENT'}</span>
              <span>·</span>
              <span>Cell ID:</span>
              <span className="text-black font-bold">{battery?.cell_id || 'CELL-CURRENT'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded text-xs font-bold ${
                allPassed
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : hasPhysicalHazard
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {allPassed ? '● ALL 10 PRE-CHECKS NOMINAL' : hasPhysicalHazard ? '✖ HAZARD DETECTED' : '▲ PRE-CHECKS PENDING'}
            </span>
          </div>
        </div>

        {/* Quick Readout Measurements */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-[#F5F6F8] border border-[#D9DEE7] rounded p-3">
            <label className="text-[#4B5563] font-bold block text-xs mb-1">Resting OCV Reading</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={measuredOcv}
                onChange={(e) => setMeasuredOcv(parseFloat(e.target.value))}
                className="w-24 bg-white border border-[#D9DEE7] rounded px-2 py-1 text-black font-bold text-sm focus:outline-none focus:border-[#2563EB]"
              />
              <span className="text-[#4B5563] font-medium">Volts</span>
            </div>
          </div>

          <div className="bg-[#F5F6F8] border border-[#D9DEE7] rounded p-3">
            <label className="text-[#4B5563] font-bold block text-xs mb-1">Resting Cell Temp</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={measuredTemp}
                onChange={(e) => setMeasuredTemp(parseFloat(e.target.value))}
                className="w-24 bg-white border border-[#D9DEE7] rounded px-2 py-1 text-black font-bold text-sm focus:outline-none focus:border-[#2563EB]"
              />
              <span className="text-[#4B5563] font-medium">°C</span>
            </div>
          </div>

          <div className="bg-[#F5F6F8] border border-[#D9DEE7] rounded p-3">
            <label className="text-[#4B5563] font-bold block text-xs mb-1">Inspector / Operator</label>
            <input
              type="text"
              value={inspectorId}
              onChange={(e) => setInspectorId(e.target.value)}
              className="w-full bg-white border border-[#D9DEE7] rounded px-2 py-1 text-blue-700 font-bold text-sm focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>

        {/* 10 Checklist Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {checkItems.map((item) => {
            const isChecked = checklist[item.key];
            return (
              <div
                key={item.key}
                onClick={() => toggleItem(item.key)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-start gap-3 select-none ${
                  isChecked
                    ? 'bg-[#F5F6F8] border-[#D9DEE7] hover:border-gray-400'
                    : 'bg-rose-50 border-rose-300'
                }`}
              >
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="w-4 h-4 rounded border-[#D9DEE7] text-[#2563EB] focus:ring-0 cursor-pointer"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className={`font-bold ${isChecked ? 'text-black' : 'text-rose-800'}`}>
                    {item.title}
                  </div>
                  <div className="text-xs text-[#4B5563] leading-relaxed">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hazard Banner if Physical Integrity Failed */}
        {hasPhysicalHazard && (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-700" />
            <div>
              <div className="font-bold text-rose-900">Critical Physical Integrity Failure</div>
              <div>
                Swelling, electrolyte leakage, or mechanical casing deformation detected. Cell testing will be aborted
                and routed directly into safety quarantine isolation.
              </div>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-4 border-t border-[#D9DEE7] flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              const allTrue = Object.fromEntries(Object.keys(checklist).map((k) => [k, true]));
              setChecklist(allTrue);
            }}
            className="text-xs text-[#4B5563] hover:text-black font-semibold transition-colors cursor-pointer"
          >
            Mark All as Verified (Nominal Bench)
          </button>

          <button
            onClick={handleSubmit}
            className={`px-5 py-2.5 text-xs font-bold rounded transition-colors flex items-center gap-2 cursor-pointer shadow-xs ${
              hasPhysicalHazard
                ? 'bg-rose-700 hover:bg-rose-800 text-white'
                : allPassed
                ? 'bg-[#2563EB] hover:bg-blue-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            <span>
              {hasPhysicalHazard
                ? 'Commit & Route to Safety Quarantine'
                : allPassed
                ? 'Verify All & Arm Pulse Rig (Ready)'
                : 'Sign Off Checklist (Warnings Active)'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

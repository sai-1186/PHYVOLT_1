/**
 * PhyVolt AI - Battery Registration & Intake View
 * Enforces standardized cell metadata, nominal parameters, and physical condition screening
 * White Theme with Times New Roman Typography
 */

import React, { useState } from 'react';
import { BatteryChemistry, CellFormat, PhysicalCondition, BatteryRecord } from '../types/battery';
import { ShieldAlert, CheckCircle2, ArrowRight } from 'lucide-react';

interface IntakeViewProps {
  onRegisterBattery: (record: BatteryRecord) => void;
  onProceedToSafetyCheck: (batteryId: string) => void;
}

export const IntakeView: React.FC<IntakeViewProps> = ({ onRegisterBattery, onProceedToSafetyCheck }) => {
  const [batteryId, setBatteryId] = useState(`BAT-EV-${Math.floor(1000 + Math.random() * 9000)}`);
  const [cellId, setCellId] = useState(`CELL-CATL-LFP-${Math.floor(100 + Math.random() * 900)}`);
  const [chemistry, setChemistry] = useState<BatteryChemistry>('LFP');
  const [format, setFormat] = useState<CellFormat>('cylindrical');
  const [nominalVoltage, setNominalVoltage] = useState(3.2);
  const [nominalCapacity, setNominalCapacity] = useState(50.0);
  const [manufacturer, setManufacturer] = useState('CATL');
  const [source, setSource] = useState('EV Dismantling Partner');
  const [physicalCondition, setPhysicalCondition] = useState<PhysicalCondition>('appears_normal');
  const [operatorId, setOperatorId] = useState('OP-001');
  const [notes, setNotes] = useState('');
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleChemistryChange = (chem: BatteryChemistry) => {
    setChemistry(chem);
    if (chem === 'LFP') setNominalVoltage(3.2);
    else if (chem === 'NMC') setNominalVoltage(3.7);
    else if (chem === 'NCA') setNominalVoltage(3.6);
    else if (chem === 'LTO') setNominalVoltage(2.3);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const record: BatteryRecord = {
      battery_id: batteryId.trim(),
      cell_id: cellId.trim(),
      chemistry,
      format,
      nominal_voltage: Number(nominalVoltage),
      nominal_capacity_ah: Number(nominalCapacity),
      manufacturer,
      source,
      physical_condition: physicalCondition,
      notes,
      created_at: new Date().toISOString(),
    };

    onRegisterBattery(record);
    setSuccessId(record.battery_id);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 bg-white text-black">
      <div className="border border-[#D9DEE7] bg-white rounded-xl p-6 md:p-8 space-y-6 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-black tracking-tight">Register Retired EV Battery Cell</h2>
          <p className="text-xs text-[#4B5563] mt-1">
            Standardized intake log for laboratory triage, traceability, and circularity passport provisioning.
          </p>
        </div>

        {successId ? (
          <div className="p-6 border border-emerald-300 bg-emerald-50 rounded-lg text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-700 mx-auto" />
            <div>
              <h3 className="text-base font-bold text-black">Battery Registered Successfully</h3>
              <p className="text-xs text-[#4B5563] font-semibold mt-1">{successId}</p>
            </div>
            <p className="text-xs text-[#4B5563] max-w-md mx-auto">
              Cell intake record has been committed to the local audit database. Proceed to pre-test safety checklist before connecting to pulse load bench.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => onProceedToSafetyCheck(successId)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded transition-colors cursor-pointer"
              >
                <span>Run Pre-Test Safety Check</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setSuccessId(null);
                  setBatteryId(`BAT-EV-${Math.floor(1000 + Math.random() * 9000)}`);
                  setCellId(`CELL-${Math.floor(100 + Math.random() * 900)}`);
                }}
                className="px-4 py-2 text-xs font-semibold text-black hover:bg-[#F5F6F8] bg-white border border-[#D9DEE7] rounded transition-colors cursor-pointer"
              >
                Register Another Cell
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 text-xs">
            {/* Row 1: IDs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Battery Serial / Pack ID *</label>
                <input
                  type="text"
                  required
                  value={batteryId}
                  onChange={(e) => setBatteryId(e.target.value)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black font-semibold focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Cell Internal Barcode ID *</label>
                <input
                  type="text"
                  required
                  value={cellId}
                  onChange={(e) => setCellId(e.target.value)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-blue-700 font-semibold focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Row 2: Chemistry & Format */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Chemistry</label>
                <select
                  value={chemistry}
                  onChange={(e) => handleChemistryChange(e.target.value as BatteryChemistry)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black font-semibold focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="LFP">LFP (Lithium Iron Phosphate)</option>
                  <option value="NMC">NMC (Nickel Manganese Cobalt)</option>
                  <option value="NCA">NCA (Nickel Cobalt Aluminum)</option>
                  <option value="LTO">LTO (Lithium Titanate)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Cell Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as CellFormat)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black font-semibold focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="cylindrical">Cylindrical (18650 / 21700)</option>
                  <option value="prismatic">Prismatic Module</option>
                  <option value="pouch">Pouch Cell</option>
                </select>
              </div>

              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Nominal Voltage (V)</label>
                <input
                  type="number"
                  step="0.05"
                  value={nominalVoltage}
                  onChange={(e) => setNominalVoltage(parseFloat(e.target.value))}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black font-semibold focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Capacity (Ah)</label>
                <input
                  type="number"
                  step="1"
                  value={nominalCapacity}
                  onChange={(e) => setNominalCapacity(parseFloat(e.target.value))}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black font-semibold focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Row 3: Manufacturer & Source */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Manufacturer / OEM</label>
                <input
                  type="text"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Decommissioning Source / Partner</label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Row 4: Physical Intake Condition */}
            <div>
              <label className="block text-[#4B5563] font-bold mb-1.5">Physical Condition on Visual Inspection</label>
              <select
                value={physicalCondition}
                onChange={(e) => setPhysicalCondition(e.target.value as PhysicalCondition)}
                className={`w-full bg-white border rounded p-2.5 font-semibold focus:outline-none ${
                  physicalCondition === 'swollen' || physicalCondition === 'leakage_suspected'
                    ? 'border-rose-400 text-rose-800'
                    : 'border-[#D9DEE7] text-black'
                }`}
              >
                <option value="appears_normal">Appears Normal (No visible deformation or swelling)</option>
                <option value="minor_scratches">Minor Casing Scratches (Acceptable)</option>
                <option value="swollen">Swollen / Bulging Casing (CRITICAL WARNING)</option>
                <option value="corroded_terminals">Corroded / Oxidized Terminals</option>
                <option value="dented_casing">Dented / Impact Marked Casing</option>
                <option value="leakage_suspected">Suspected Electrolyte Leakage / Odor (CRITICAL)</option>
              </select>

              {(physicalCondition === 'swollen' || physicalCondition === 'leakage_suspected') && (
                <div className="mt-2 flex items-center gap-2 p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    Warning: Cells with visible swelling or leakage must NOT be subjected to pulse discharge. They will be flagged for immediate quarantine.
                  </span>
                </div>
              )}
            </div>

            {/* Row 5: Notes & Operator */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[#4B5563] font-bold mb-1.5">Intake Notes / Batch Reference</label>
                <input
                  type="text"
                  placeholder="e.g. Batch #42 from Stage 1 dismantling line"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Operator ID</label>
                <input
                  type="text"
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black font-semibold focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-[#D9DEE7] flex items-center justify-between">
              <span className="text-[#4B5563] text-xs">All registered cells require pre-test safety signoff.</span>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded transition-colors shadow-xs cursor-pointer"
              >
                Save Intake & Create Test Record
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

/**
 * PhyVolt AI - Decision Center View
 * Facility-level circularity routing hub, pathway distribution, and compliance review queues
 * White Theme with Times New Roman Typography
 */

import React from 'react';
import { BatteryTest, CircularityRecommendation } from '../types/battery';
import { Zap, RefreshCw, Recycle, ShieldAlert } from 'lucide-react';

interface DecisionCenterViewProps {
  tests: BatteryTest[];
  onSelectTest: (testId: string) => void;
}

export const DecisionCenterView: React.FC<DecisionCenterViewProps> = ({ tests, onSelectTest }) => {
  const completed = tests.filter((t) => t.result);

  const getTestsInPathway = (pathway: CircularityRecommendation) => {
    return completed.filter((t) => t.result?.recommendation === pathway);
  };

  const secondLifeList = getTestsInPathway('SECOND_LIFE_SCREENING');
  const refurbishList = getTestsInPathway('REFURBISHMENT_REVIEW');
  const recyclingList = getTestsInPathway('RECYCLING_REVIEW');
  const quarantineList = completed.filter(
    (t) => t.safety_status === 'QUARANTINE' || t.result?.recommendation === 'QUARANTINE'
  );

  const calcAvgSoh = (list: BatteryTest[]) => {
    const valid = list.filter((t) => t.result && t.result.estimated_soh_mid > 0);
    if (valid.length === 0) return 'N/A';
    const sum = valid.reduce((acc, t) => acc + (t.result?.estimated_soh_mid || 0), 0);
    return `${(sum / valid.length).toFixed(1)}%`;
  };

  return (
    <div className="space-y-6 bg-white text-black">
      <div>
        <h2 className="text-xl font-bold text-black tracking-tight">Circularity Decision Center</h2>
        <p className="text-xs text-[#4B5563] mt-1">
          Operational triage routing for retired EV cells based on safety-first thresholds and physics-informed pulse impedance.
        </p>
      </div>

      {/* 4 Primary Operational Pathway Stations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Second-Life Candidates */}
        <div className="border border-emerald-300 bg-emerald-50/50 rounded-xl p-5 space-y-4 flex flex-col justify-between shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-emerald-700" />
                <span>Second-Life Tier</span>
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-white text-emerald-900 border border-emerald-300">
                {secondLifeList.length} cells
              </span>
            </div>

            <div>
              <div className="text-2xl font-bold text-black tabular-nums">
                {calcAvgSoh(secondLifeList)}
              </div>
              <span className="text-xs text-[#4B5563]">Mean Estimated SoH</span>
            </div>

            <p className="text-xs text-[#4B5563] leading-relaxed">
              Target destination: <strong>Commercial BESS</strong> (Battery Energy Storage Systems), solar micro-grids, and backup power banks.
            </p>
          </div>

          <div className="pt-3 border-t border-emerald-200 space-y-2">
            <span className="text-xs uppercase font-bold text-[#4B5563] block">Recent Eligible Cells</span>
            {secondLifeList.slice(0, 2).map((t) => (
              <div
                key={t.test_id}
                onClick={() => onSelectTest(t.test_id)}
                className="flex items-center justify-between p-2 rounded bg-white hover:bg-emerald-100/60 cursor-pointer border border-emerald-200 text-xs transition-colors"
              >
                <span className="text-blue-700 font-bold">{t.battery?.cell_id || t.battery_id}</span>
                <span className="text-black font-semibold">{t.result?.estimated_soh_mid}% SoH</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Refurbishment Review */}
        <div className="border border-amber-300 bg-amber-50/50 rounded-xl p-5 space-y-4 flex flex-col justify-between shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-amber-700" />
                <span>Refurbishment</span>
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-white text-amber-900 border border-amber-300">
                {refurbishList.length} cells
              </span>
            </div>

            <div>
              <div className="text-2xl font-bold text-black tabular-nums">
                {calcAvgSoh(refurbishList)}
              </div>
              <span className="text-xs text-[#4B5563]">Mean Estimated SoH</span>
            </div>

            <p className="text-xs text-[#4B5563] leading-relaxed">
              Target destination: <strong>Pack Rebalancing</strong>, cell re-grouping, and intermediate low-speed EV or forklift repacking.
            </p>
          </div>

          <div className="pt-3 border-t border-amber-200 space-y-2">
            <span className="text-xs uppercase font-bold text-[#4B5563] block">Recent Review Items</span>
            {refurbishList.slice(0, 2).map((t) => (
              <div
                key={t.test_id}
                onClick={() => onSelectTest(t.test_id)}
                className="flex items-center justify-between p-2 rounded bg-white hover:bg-amber-100/60 cursor-pointer border border-amber-200 text-xs transition-colors"
              >
                <span className="text-blue-700 font-bold">{t.battery?.cell_id || t.battery_id}</span>
                <span className="text-black font-semibold">{t.result?.estimated_soh_mid}% SoH</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Recycling Review */}
        <div className="border border-blue-300 bg-blue-50/50 rounded-xl p-5 space-y-4 flex flex-col justify-between shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                <Recycle className="w-4 h-4 text-blue-700" />
                <span>Recycling Review</span>
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-white text-blue-900 border border-blue-300">
                {recyclingList.length} cells
              </span>
            </div>

            <div>
              <div className="text-2xl font-bold text-black tabular-nums">
                {calcAvgSoh(recyclingList)}
              </div>
              <span className="text-xs text-[#4B5563]">Mean Estimated SoH</span>
            </div>

            <p className="text-xs text-[#4B5563] leading-relaxed">
              Target destination: <strong>Hydrometallurgical Smelting</strong> for black mass recovery (Nickel, Lithium, Cobalt, Graphite).
            </p>
          </div>

          <div className="pt-3 border-t border-blue-200 space-y-2">
            <span className="text-xs uppercase font-bold text-[#4B5563] block">Recent Direct-to-Recycle</span>
            {recyclingList.slice(0, 2).map((t) => (
              <div
                key={t.test_id}
                onClick={() => onSelectTest(t.test_id)}
                className="flex items-center justify-between p-2 rounded bg-white hover:bg-blue-100/60 cursor-pointer border border-blue-200 text-xs transition-colors"
              >
                <span className="text-blue-700 font-bold">{t.battery?.cell_id || t.battery_id}</span>
                <span className="text-black font-semibold">{t.result?.estimated_soh_mid}% SoH</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4: Quarantine Isolation */}
        <div className="border border-rose-300 bg-rose-50/50 rounded-xl p-5 space-y-4 flex flex-col justify-between shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-700" />
                <span>Quarantine Alert</span>
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-white text-rose-900 border border-rose-300">
                {quarantineList.length} isolated
              </span>
            </div>

            <div>
              <div className="text-2xl font-bold text-rose-800 tabular-nums">
                ISOLATED
              </div>
              <span className="text-xs text-[#4B5563]">Hazardous Containment</span>
            </div>

            <p className="text-xs text-[#4B5563] leading-relaxed">
              Hazard condition: Excessive thermal rise (&gt;45°C), off-gassing venting, or physical swelling. <strong>Zero reuse permitted.</strong>
            </p>
          </div>

          <div className="pt-3 border-t border-rose-200 space-y-2">
            <span className="text-xs uppercase font-bold text-[#4B5563] block">Containment Logs</span>
            {quarantineList.slice(0, 2).map((t) => (
              <div
                key={t.test_id}
                onClick={() => onSelectTest(t.test_id)}
                className="flex items-center justify-between p-2 rounded bg-white hover:bg-rose-100/60 cursor-pointer border border-rose-200 text-xs transition-colors"
              >
                <span className="text-rose-800 font-bold">{t.battery?.cell_id || t.battery_id}</span>
                <span className="text-rose-700 font-bold">HAZARD</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Regulatory Context Box */}
      <div className="border border-[#D9DEE7] bg-[#F5F6F8] rounded-xl p-5 text-xs text-[#4B5563] space-y-2 shadow-xs">
        <div className="font-bold text-black flex items-center gap-2">
          <span>Battery Waste Management Rules & EPR Authorization Compliance</span>
        </div>
        <p className="leading-relaxed">
          The decision engine provides auditable, structured telemetry and tamper-evident Digital Passports to satisfy
          Extended Producer Responsibility (EPR) reporting standards under CPCB / national battery waste guidelines.
          Every classification decision is anchored by an immutable SHA-256 telemetry digest.
        </p>
      </div>
    </div>
  );
};

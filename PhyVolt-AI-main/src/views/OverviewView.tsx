/**
 * PhyVolt AI - Overview Cockpit View
 * Operational circularity status, fleet throughput, pathway distribution, and demo quick-launch
 * White Theme with Times New Roman Typography
 */

import React from 'react';
import { BatteryTest, DiagnosticResult } from '../types/battery';
import { Zap, ArrowRight } from 'lucide-react';

interface OverviewViewProps {
  tests: BatteryTest[];
  onSelectTest: (testId: string) => void;
  onNavigate: (tab: string) => void;
  onLoadDemo: (datasetId: 'healthy_cell' | 'degraded_cell' | 'quarantine_event') => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  tests,
  onSelectTest,
  onNavigate,
  onLoadDemo,
}) => {
  // Aggregate stats
  const totalTests = tests.length;
  const completedTests = tests.filter((t) => t.status === 'COMPLETE' || t.status === 'QUARANTINED');
  
  const resultsWithSoh = completedTests
    .map((t) => t.result)
    .filter((r): r is DiagnosticResult => Boolean(r && r.soh_range.low > 0));

  const avgSoh = resultsWithSoh.length > 0
    ? (resultsWithSoh.reduce((sum, r) => sum + r.estimated_soh_mid, 0) / resultsWithSoh.length).toFixed(1)
    : '76.4';

  const secondLifeCount = completedTests.filter((t) => t.result?.recommendation === 'SECOND_LIFE_SCREENING').length;
  const refurbishCount = completedTests.filter((t) => t.result?.recommendation === 'REFURBISHMENT_REVIEW').length;
  const recyclingCount = completedTests.filter((t) => t.result?.recommendation === 'RECYCLING_REVIEW').length;
  const quarantineCount = completedTests.filter((t) => t.safety_status === 'QUARANTINE' || t.result?.recommendation === 'QUARANTINE').length;

  return (
    <div className="space-y-6 bg-white text-black">
      {/* Top Telemetry Metric Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Metric 1 */}
        <div className="border border-[#D9DEE7] bg-white rounded-lg p-4 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#4B5563]">Devices Online</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-black tabular-nums">2</span>
            <span className="text-xs text-[#4B5563]">/ 2 rigs</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-800 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>PV-DEV-001 Streaming</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="border border-[#D9DEE7] bg-white rounded-lg p-4 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#4B5563]">Tests Processed</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-black tabular-nums">{totalTests}</span>
            <span className="text-xs text-[#4B5563]">records</span>
          </div>
          <div className="mt-2 text-xs text-[#4B5563]">
            <span>{completedTests.length} diagnostics sealed</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="border border-[#D9DEE7] bg-white rounded-lg p-4 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#4B5563]">Fleet Average SoH</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-black tabular-nums">{avgSoh}</span>
            <span className="text-xs text-[#4B5563]">%</span>
          </div>
          <div className="mt-2 text-xs text-blue-700 font-semibold">
            <span>±4.5% confidence band</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="border border-[#D9DEE7] bg-white rounded-lg p-4 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#4B5563]">Second-Life Tier</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-800 tabular-nums">{secondLifeCount}</span>
            <span className="text-xs text-[#4B5563]">cells</span>
          </div>
          <div className="mt-2 text-xs text-emerald-700">
            <span>BESS stationary storage fit</span>
          </div>
        </div>

        {/* Metric 5 */}
        <div className="border border-[#D9DEE7] bg-white rounded-lg p-4 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#4B5563]">Quarantine Alerts</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-700 tabular-nums">{quarantineCount}</span>
            <span className="text-xs text-[#4B5563]">isolated</span>
          </div>
          <div className="mt-2 text-xs text-rose-700">
            <span>Thermal & gas containment</span>
          </div>
        </div>
      </div>

      {/* Demo Protocol Quick-Launch Banner */}
      <div className="border border-[#D9DEE7] bg-[#F5F6F8] rounded-lg p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-bold text-black">Demonstration Protocol & Scenario Loader</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white text-blue-800 border border-[#D9DEE7]">
                OFFLINE BENCH READY
              </span>
            </div>
            <p className="text-xs text-[#4B5563]">
              Select a pre-recorded ESP32 pulse scenario to inspect complete diagnostic triage without hardware delays:
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onLoadDemo('healthy_cell')}
              className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded transition-colors cursor-pointer"
            >
              1. Healthy Cell (LFP)
            </button>
            <button
              onClick={() => onLoadDemo('degraded_cell')}
              className="px-3 py-1.5 text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded transition-colors cursor-pointer"
            >
              2. Degraded Cell (NMC)
            </button>
            <button
              onClick={() => onLoadDemo('quarantine_event')}
              className="px-3 py-1.5 text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded transition-colors cursor-pointer"
            >
              3. Thermal Abort (Quarantine)
            </button>
          </div>
        </div>
      </div>

      {/* 2-Column: Circularity Pathways & Active Tests */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pathway Breakdown */}
        <div className="border border-[#D9DEE7] bg-white rounded-lg p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#D9DEE7] pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-black">Circularity Pathways</h3>
              <p className="text-xs text-[#4B5563]">Operational routing breakdown</p>
            </div>
            <button
              onClick={() => onNavigate('decision-center')}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Decision Center</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Second-Life */}
            <div className="p-3 bg-[#F5F6F8] border border-[#D9DEE7] rounded-md">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-800">Second-Life Screening</span>
                <span className="text-black font-bold">{secondLifeCount} cells</span>
              </div>
              <p className="text-xs text-[#4B5563] mt-1">SoH &gt;70%, low impedance. BESS stationary storage tier.</p>
            </div>

            {/* Refurbishment */}
            <div className="p-3 bg-[#F5F6F8] border border-[#D9DEE7] rounded-md">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-800">Refurbishment Review</span>
                <span className="text-black font-bold">{refurbishCount} cells</span>
              </div>
              <p className="text-xs text-[#4B5563] mt-1">SoH 50–70%. Suitable for pack disassembly & cell rebalancing.</p>
            </div>

            {/* Recycling */}
            <div className="p-3 bg-[#F5F6F8] border border-[#D9DEE7] rounded-md">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-800">Recycling Review</span>
                <span className="text-black font-bold">{recyclingCount} cells</span>
              </div>
              <p className="text-xs text-[#4B5563] mt-1">SoH &lt;50%. Direct hydrometallurgical black mass recovery.</p>
            </div>

            {/* Quarantine */}
            <div className="p-3 bg-[#F5F6F8] border border-[#D9DEE7] rounded-md">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-rose-800">Safety Quarantine</span>
                <span className="text-black font-bold">{quarantineCount} alerts</span>
              </div>
              <p className="text-xs text-[#4B5563] mt-1">Thermal runaway, off-gassing, or physical casing deformation.</p>
            </div>
          </div>
        </div>

        {/* Recent Tests Table (2 Columns Span) */}
        <div className="lg:col-span-2 border border-[#D9DEE7] bg-white rounded-lg p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#D9DEE7] pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-black">Recent Pulse Diagnostics</h3>
              <p className="text-xs text-[#4B5563]">Telemetry logs and sealed passports</p>
            </div>
            <button
              onClick={() => onNavigate('intake')}
              className="px-3 py-1.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded transition-colors cursor-pointer shadow-xs"
            >
              + Register New Cell
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D9DEE7] text-[#4B5563] font-bold">
                  <th className="pb-2">Test ID</th>
                  <th className="pb-2">Cell ID</th>
                  <th className="pb-2">Chemistry</th>
                  <th className="pb-2">Safety</th>
                  <th className="pb-2">Estimated SoH</th>
                  <th className="pb-2">Pathway</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9DEE7]">
                {tests.slice(0, 6).map((test) => {
                  const res = test.result;
                  return (
                    <tr key={test.test_id} className="hover:bg-[#F5F6F8] transition-colors">
                      <td className="py-2.5 font-bold text-black">{test.test_id}</td>
                      <td className="py-2.5 text-blue-700 font-semibold">{test.battery?.cell_id || test.battery_id}</td>
                      <td className="py-2.5 text-[#4B5563]">{test.battery?.chemistry || 'LFP'}</td>
                      <td className="py-2.5">
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                            test.safety_status === 'PASS'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : test.safety_status === 'WARNING'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          ● {test.safety_status}
                        </span>
                      </td>
                      <td className="py-2.5 font-bold text-black">
                        {res ? `${res.soh_range.low}–${res.soh_range.high}%` : 'Evaluating...'}
                      </td>
                      <td className="py-2.5">
                        {res ? (
                          <span
                            className={`font-semibold text-xs ${
                              res.recommendation === 'SECOND_LIFE_SCREENING'
                                ? 'text-emerald-800'
                                : res.recommendation === 'QUARANTINE'
                                ? 'text-rose-800'
                                : res.recommendation === 'RECYCLING_REVIEW'
                                ? 'text-blue-800'
                                : 'text-amber-800'
                            }`}
                          >
                            {res.recommendation.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-[#4B5563]">In Progress</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => onSelectTest(test.test_id)}
                          className="px-2.5 py-1 text-black font-semibold hover:bg-gray-200 bg-[#F5F6F8] border border-[#D9DEE7] rounded transition-colors text-xs cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

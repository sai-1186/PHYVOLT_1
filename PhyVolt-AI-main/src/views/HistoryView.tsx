/**
 * PhyVolt AI - Test History & Audit Trail View
 * Filterable operational history, search, and CSV/JSON export
 */

import React, { useState } from 'react';
import { BatteryTest } from '../types/battery';
import { Download, Search, Filter, Lock, ArrowRight } from 'lucide-react';

interface HistoryViewProps {
  tests: BatteryTest[];
  onSelectTest: (testId: string) => void;
  onOpenPassport: (testId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ tests, onSelectTest, onOpenPassport }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [chemistryFilter, setChemistryFilter] = useState('ALL');
  const [safetyFilter, setSafetyFilter] = useState('ALL');
  const [pathwayFilter, setPathwayFilter] = useState('ALL');

  const filteredTests = tests.filter((t) => {
    const matchesSearch =
      t.test_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.battery_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.battery?.cell_id || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesChem = chemistryFilter === 'ALL' || t.battery?.chemistry === chemistryFilter;
    const matchesSafety = safetyFilter === 'ALL' || t.safety_status === safetyFilter;
    const matchesPathway = pathwayFilter === 'ALL' || t.result?.recommendation === pathwayFilter;

    return matchesSearch && matchesChem && matchesSafety && matchesPathway;
  });

  const exportCsv = () => {
    const headers = [
      'test_id',
      'battery_id',
      'cell_id',
      'chemistry',
      'status',
      'safety_status',
      'apparent_resistance_mohm',
      'soh_low',
      'soh_high',
      'recommendation',
      'confidence',
      'created_at',
    ];

    const rows = filteredTests.map((t) => [
      t.test_id,
      t.battery_id,
      t.battery?.cell_id || '',
      t.battery?.chemistry || 'LFP',
      t.status,
      t.safety_status,
      t.features ? (t.features.pulse_resistance * 1000).toFixed(1) : '',
      t.result ? t.result.soh_range.low : '',
      t.result ? t.result.soh_range.high : '',
      t.result ? t.result.recommendation : '',
      t.result ? (t.result.confidence * 100).toFixed(0) : '',
      t.started_at || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `phyvolt_test_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-black tracking-tight">Test History & Diagnostic Archive</h2>
          <p className="text-sm text-[#4B5563] mt-1">
            Complete database of pulse tests, feature extractions, and sealed passports.
          </p>
        </div>

        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-black bg-white hover:bg-[#F5F6F8] border border-[#D9DEE7] rounded shadow-sm transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Filtered CSV</span>
        </button>
      </div>

      {/* Filter Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-white p-4 rounded-xl border border-[#D9DEE7] shadow-sm">
        <div>
          <label className="block text-[#4B5563] font-medium mb-1">Search ID</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#4B5563] absolute left-2.5 top-3" />
            <input
              type="text"
              placeholder="Search Test or Cell ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-[#D9DEE7] rounded pl-8 pr-3 py-2 text-black placeholder-[#9CA3AF] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[#4B5563] font-medium mb-1">Chemistry</label>
          <select
            value={chemistryFilter}
            onChange={(e) => setChemistryFilter(e.target.value)}
            className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-black focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
          >
            <option value="ALL">All Chemistries</option>
            <option value="LFP">LFP</option>
            <option value="NMC">NMC</option>
            <option value="NCA">NCA</option>
            <option value="LTO">LTO</option>
          </select>
        </div>

        <div>
          <label className="block text-[#4B5563] font-medium mb-1">Safety Status</label>
          <select
            value={safetyFilter}
            onChange={(e) => setSafetyFilter(e.target.value)}
            className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-black focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
          >
            <option value="ALL">All Safety States</option>
            <option value="PASS">PASS</option>
            <option value="WARNING">WARNING</option>
            <option value="ABORT">ABORT</option>
            <option value="QUARANTINE">QUARANTINE</option>
          </select>
        </div>

        <div>
          <label className="block text-[#4B5563] font-medium mb-1">Circularity Pathway</label>
          <select
            value={pathwayFilter}
            onChange={(e) => setPathwayFilter(e.target.value)}
            className="w-full bg-white border border-[#D9DEE7] rounded p-2 text-black focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
          >
            <option value="ALL">All Pathways</option>
            <option value="SECOND_LIFE_SCREENING">Second-Life Screening</option>
            <option value="REFURBISHMENT_REVIEW">Refurbishment Review</option>
            <option value="RECYCLING_REVIEW">Recycling Review</option>
            <option value="QUARANTINE">Quarantine</option>
            <option value="EXPERT_REVIEW">Expert Review</option>
          </select>
        </div>
      </div>

      {/* Tests Table */}
      <div className="border border-[#D9DEE7] bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#D9DEE7] text-[#4B5563] font-semibold bg-[#F5F6F8]">
                <th className="py-3 px-4">Test ID</th>
                <th className="py-3 px-4">Cell ID</th>
                <th className="py-3 px-4">Chemistry</th>
                <th className="py-3 px-4">Safety</th>
                <th className="py-3 px-4">Impedance</th>
                <th className="py-3 px-4">SoH Range</th>
                <th className="py-3 px-4">Recommendation</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9DEE7]">
              {filteredTests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#4B5563]">
                    No matching battery test records found.
                  </td>
                </tr>
              ) : (
                filteredTests.map((t) => {
                  const res = t.result;
                  const feat = t.features;
                  return (
                    <tr key={t.test_id} className="hover:bg-[#F5F6F8] transition-colors">
                      <td className="py-3 px-4 font-semibold text-black">{t.test_id}</td>
                      <td className="py-3 px-4 font-semibold text-[#2563EB]">{t.battery?.cell_id || t.battery_id}</td>
                      <td className="py-3 px-4 text-[#4B5563]">
                        {t.battery?.chemistry || 'LFP'} ({t.battery?.format || 'cylindrical'})
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            t.safety_status === 'PASS'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : t.safety_status === 'WARNING'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          ● {t.safety_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#4B5563]">
                        {feat ? `${(feat.pulse_resistance * 1000).toFixed(1)} mΩ` : '—'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-black">
                        {res ? `${res.soh_range.low}–${res.soh_range.high}%` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {res ? (
                          <span
                            className={`font-semibold ${
                              res.recommendation === 'SECOND_LIFE_SCREENING'
                                ? 'text-emerald-700'
                                : res.recommendation === 'QUARANTINE'
                                ? 'text-rose-700'
                                : res.recommendation === 'RECYCLING_REVIEW'
                                ? 'text-sky-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {res.recommendation.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-[#4B5563]">{t.status}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onSelectTest(t.test_id)}
                            className="px-2.5 py-1 text-black hover:text-[#2563EB] bg-[#F5F6F8] hover:bg-slate-200 border border-[#D9DEE7] rounded transition-colors text-[11px] font-medium"
                          >
                            Monitor
                          </button>
                          {res && (
                            <button
                              onClick={() => onOpenPassport(t.test_id)}
                              className="px-2.5 py-1 text-[#2563EB] hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors text-[11px] font-medium flex items-center gap-1"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Passport</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/**
 * PhyVolt AI - Diagnostic Results View
 * Explainable SoH range estimation, usable power class, anomaly score, and physics residual fit
 * White Theme with Times New Roman Typography
 */

import React, { useState } from 'react';
import { BatteryTest, CircularityRecommendation, UserRole } from '../types/battery';
import { CheckCircle2, Lock, Award } from 'lucide-react';

interface ResultsViewProps {
  test: BatteryTest;
  userRole: UserRole;
  onOpenPassport: (testId: string) => void;
  onReviewerSignoff?: (
    testId: string,
    approvedPathway: CircularityRecommendation,
    comments: string,
    isOverridden: boolean
  ) => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  test,
  userRole,
  onOpenPassport,
  onReviewerSignoff,
}) => {
  const result = test.result;
  const features = test.features;

  const [overridePathway, setOverridePathway] = useState<CircularityRecommendation>(
    result?.recommendation || 'SECOND_LIFE_SCREENING'
  );
  const [reviewerComments, setReviewerComments] = useState(
    result?.reviewer_signoff?.comments || 'Approved during technical screening review.'
  );
  const [signoffSubmitted, setSignoffSubmitted] = useState(Boolean(result?.reviewer_signoff));

  if (!result || !features) {
    return (
      <div className="p-8 text-center border border-[#D9DEE7] bg-white rounded-xl space-y-3 shadow-xs">
        <div className="text-base font-bold text-black">Diagnostics Pending</div>
        <p className="text-xs text-[#4B5563] max-w-md mx-auto">
          Test {test.test_id} has not yet concluded its pulse protocol or does not have enough telemetry. Complete the test on the Live Monitor.
        </p>
      </div>
    );
  }

  const handleSignoffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onReviewerSignoff) {
      const isOverridden = overridePathway !== result.recommendation;
      onReviewerSignoff(test.test_id, overridePathway, reviewerComments, isOverridden);
      setSignoffSubmitted(true);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 bg-white text-black">
      {/* Large Recommendation Header Banner */}
      <div
        className={`border rounded-xl p-6 md:p-8 space-y-4 shadow-xs ${
          result.recommendation === 'SECOND_LIFE_SCREENING'
            ? 'bg-emerald-50 border-emerald-300'
            : result.recommendation === 'QUARANTINE'
            ? 'bg-rose-50 border-rose-300'
            : result.recommendation === 'RECYCLING_REVIEW'
            ? 'bg-blue-50 border-blue-300'
            : 'bg-amber-50 border-amber-300'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563] block">
              Circularity Triage Decision
            </span>
            <h1
              className={`text-2xl md:text-3xl font-bold tracking-tight ${
                result.recommendation === 'SECOND_LIFE_SCREENING'
                  ? 'text-emerald-900'
                  : result.recommendation === 'QUARANTINE'
                  ? 'text-rose-900'
                  : result.recommendation === 'RECYCLING_REVIEW'
                  ? 'text-blue-900'
                  : 'text-amber-900'
              }`}
            >
              {result.recommendation.replace(/_/g, ' ')}
            </h1>
            <p className="text-xs text-[#4B5563] max-w-xl font-medium">
              Target Cell: <span className="text-black font-bold">{test.battery?.cell_id || test.battery_id}</span> ({test.battery?.chemistry || 'LFP'}) · Protocol: {test.protocol_id}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenPassport(test.test_id)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Generate Digital Passport</span>
            </button>
          </div>
        </div>

        {/* 4 Core Quantitative Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-black/10">
          <div className="bg-white p-3 rounded-lg border border-[#D9DEE7] shadow-xs">
            <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563] block">Estimated SoH</span>
            <div className="text-xl font-bold text-black tabular-nums mt-0.5">
              {result.soh_range.low}–{result.soh_range.high}
              <span className="text-xs font-normal text-[#4B5563] ml-0.5">%</span>
            </div>
            <span className="text-xs text-[#4B5563]">Mid: {result.estimated_soh_mid}%</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-[#D9DEE7] shadow-xs">
            <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563] block">Power Class</span>
            <div className="text-xl font-bold text-blue-700 mt-0.5">
              {result.usable_power_class}
            </div>
            <span className="text-xs text-[#4B5563]">R: {(features.pulse_resistance * 1000).toFixed(1)} mΩ</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-[#D9DEE7] shadow-xs">
            <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563] block">Confidence</span>
            <div className="text-xl font-bold text-emerald-800 tabular-nums mt-0.5">
              {(result.confidence * 100).toFixed(0)}
              <span className="text-xs font-normal text-[#4B5563] ml-0.5">%</span>
            </div>
            <span className="text-xs text-[#4B5563]">Threshold: 60%</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-[#D9DEE7] shadow-xs">
            <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563] block">Anomaly Score</span>
            <div className="text-xl font-bold text-amber-800 tabular-nums mt-0.5">
              {result.anomaly_score.toFixed(2)}
            </div>
            <span className="text-xs text-[#4B5563]">
              {result.anomaly_score < 0.25 ? 'Low Anomaly' : 'Elevated'}
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column: Explainability & Physics Residual Layer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Why this result? Transparent Explanation Panel */}
        <div className="border border-[#D9DEE7] bg-white rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-[#D9DEE7] pb-3">
            <CheckCircle2 className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-bold text-black">Why This Result?</h3>
          </div>

          <div className="space-y-2.5 text-xs">
            {result.explanation.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 p-2 rounded bg-[#F5F6F8] border border-[#D9DEE7]">
                <span className="text-blue-700 font-bold">✓</span>
                <span className="text-black leading-relaxed">{item}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 text-xs text-[#4B5563] leading-relaxed">
            Safety rules are strictly prioritized: high apparent SoH will never override thermal instability or gas venting alerts.
          </div>
        </div>

        {/* Physics-Informed ECM Model & Residual Analysis */}
        <div className="border border-[#D9DEE7] bg-white rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#D9DEE7] pb-3">
            <h3 className="text-sm font-bold text-black">Physics-Informed Analytics</h3>
            <span className="text-xs font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              {result.physics_model_type === 'pybamm_equivalent_ecm' ? 'PyBaMM ECM EQUIVALENT' : 'BASELINE MODEL'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#F5F6F8] p-2.5 rounded border border-[#D9DEE7]">
              <span className="text-[#4B5563] block text-xs font-semibold">Model Version</span>
              <span className="text-black font-bold">{result.model_version}</span>
            </div>
            <div className="bg-[#F5F6F8] p-2.5 rounded border border-[#D9DEE7]">
              <span className="text-[#4B5563] block text-xs font-semibold">Calibration Ver</span>
              <span className="text-black font-bold">{result.calibration_version}</span>
            </div>
            <div className="bg-[#F5F6F8] p-2.5 rounded border border-[#D9DEE7]">
              <span className="text-[#4B5563] block text-xs font-semibold">Residual RMSE</span>
              <span className="text-purple-800 font-bold">{result.physics_residual_rmse.toFixed(3)} V</span>
            </div>
            <div className="bg-[#F5F6F8] p-2.5 rounded border border-[#D9DEE7]">
              <span className="text-[#4B5563] block text-xs font-semibold">Recovery Ratio</span>
              <span className="text-blue-700 font-bold">{(features.recovery_ratio * 100).toFixed(1)}%</span>
            </div>
          </div>

          <p className="text-xs text-[#4B5563] leading-relaxed">
            The pulse curve is compared against a parameterized Thevenin Equivalent Circuit Model (ECM) simulating
            charge-transfer overpotential and double-layer capacitance. Low residual variance confirms predictable second-life behavior.
          </p>
        </div>
      </div>

      {/* Reviewer Sign-Off Form */}
      {(userRole === 'reviewer' || userRole === 'admin') && (
        <div className="border border-[#D9DEE7] bg-white rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#D9DEE7] pb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-700" />
              <h3 className="text-sm font-bold text-black">Reviewer Circularity Sign-Off</h3>
            </div>
            {signoffSubmitted && (
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                SIGNED & AUDITED
              </span>
            )}
          </div>

          <form onSubmit={handleSignoffSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Approved Circularity Pathway</label>
                <select
                  value={overridePathway}
                  onChange={(e) => setOverridePathway(e.target.value as CircularityRecommendation)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black font-semibold focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="SECOND_LIFE_SCREENING">SECOND LIFE SCREENING (BESS / Energy Storage)</option>
                  <option value="REFURBISHMENT_REVIEW">REFURBISHMENT REVIEW (Module Rebalancing)</option>
                  <option value="RECYCLING_REVIEW">RECYCLING REVIEW (Direct Hydrometallurgy)</option>
                  <option value="QUARANTINE">QUARANTINE (Hazardous Isolation)</option>
                  <option value="EXPERT_REVIEW">EXPERT REVIEW (Secondary Lab Test)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#4B5563] font-bold mb-1.5">Justification & Engineering Notes</label>
                <input
                  type="text"
                  value={reviewerComments}
                  onChange={(e) => setReviewerComments(e.target.value)}
                  className="w-full bg-white border border-[#D9DEE7] rounded p-2.5 text-black focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded transition-colors shadow-xs cursor-pointer"
              >
                Sign Off & Append Audit Ledger
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

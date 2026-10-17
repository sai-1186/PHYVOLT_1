/**
 * PhyVolt AI - Digital Battery Passport & Printable Audit Report
 * Tamper-evident cryptographic record with SHA-256 verification and chain-of-custody
 */

import React, { useState } from 'react';
import { DigitalBatteryPassport, TelemetryPacket } from '../types/battery';
import { QrCodeSvg } from './QrCodeSvg';
import { calculateSha256 } from '../services/passportService';
import { ShieldCheck, ShieldAlert, CheckCircle2, Copy, Download, Printer, ExternalLink, Lock } from 'lucide-react';

interface PassportViewProps {
  passport: DigitalBatteryPassport;
  rawTelemetry: TelemetryPacket[];
  onClose?: () => void;
}

export const PassportView: React.FC<PassportViewProps> = ({ passport, rawTelemetry, onClose }) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const [verificationState, setVerificationState] = useState<'UNVERIFIED' | 'PASSED' | 'FAILED'>('UNVERIFIED');
  const [simulatedTampering, setSimulatedTampering] = useState(false);
  const [computedHash, setComputedHash] = useState<string | null>(null);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(passport.raw_data_sha256);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const runVerification = async (tamper: boolean) => {
    // Generate bitstream string
    let testData = rawTelemetry;
    if (tamper) {
      // Simulate alteration of a single telemetry reading
      testData = rawTelemetry.map((p, i) => (i === 15 ? { ...p, voltage_v: p.voltage_v + 0.15 } : p));
    }
    const jsonStr = JSON.stringify(testData);
    const hash = await calculateSha256(jsonStr);
    setComputedHash(hash);

    if (hash === passport.raw_data_sha256) {
      setVerificationState('PASSED');
    } else {
      setVerificationState('FAILED');
    }
  };

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(passport, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${passport.passport_id}_digital_passport.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  const bat = passport.battery;
  const res = passport.result;
  const feat = passport.features;

  return (
    <div className="bg-white border border-[#D9DEE7] rounded-xl max-w-4xl w-full mx-auto p-6 md:p-8 text-black shadow-xl space-y-6">
      {/* Top Header Controls (No-Print) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D9DEE7] pb-4 no-print">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-[#2563EB]">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-black tracking-tight">Digital Battery Passport</h2>
            <div className="flex items-center gap-2 text-xs text-[#4B5563]">
              <span className="font-semibold text-[#2563EB]">{passport.passport_id}</span>
              <span>·</span>
              <span>Tamper-Evident Diagnostic Record</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadJson}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-black bg-white hover:bg-[#F5F6F8] rounded-md transition-colors border border-[#D9DEE7] shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download JSON</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-md transition-colors shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-[#4B5563] hover:text-black transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Main Passport Certificate Body */}
      <div className="border border-[#D9DEE7] bg-white rounded-xl p-6 md:p-8 space-y-6 shadow-sm">
        {/* Top Watermark & Authority Lock */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#D9DEE7] pb-6">
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-black flex items-center gap-2">
              <span>PhyVolt AI</span>
              <span className="text-xs font-normal px-2 py-0.5 bg-[#F5F6F8] text-[#2563EB] border border-[#D9DEE7] rounded">
                v0.1.0-SPEC
              </span>
            </div>
            <p className="text-sm text-[#4B5563]">
              Retired EV Lithium-Ion Battery Circularity & Diagnostic Passport
            </p>
            <p className="text-xs text-[#4B5563]">
              Issued: {new Date(passport.created_at).toUTCString()}
            </p>
          </div>

          <div className="text-right">
            <div className="bg-white p-2 rounded border border-[#D9DEE7] inline-block shadow-sm">
              <QrCodeSvg value={`PHYVOLT-PASSPORT:${passport.passport_id}:${passport.raw_data_sha256}`} size={96} />
            </div>
            <span className="text-[11px] text-[#4B5563] block mt-1">Scan for verification</span>
          </div>
        </div>

        {/* 2-Column Battery & Test Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          {/* Battery Identity */}
          <div className="border border-[#D9DEE7] bg-[#F5F6F8] rounded-lg p-4 space-y-3">
            <div className="text-xs uppercase tracking-wider font-bold text-black border-b border-[#D9DEE7] pb-1">
              Battery Identity
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-xs">
              <span className="text-[#4B5563]">Battery ID:</span>
              <span className="text-black font-semibold">{bat.battery_id}</span>
              <span className="text-[#4B5563]">Cell ID:</span>
              <span className="text-[#2563EB] font-bold">{bat.cell_id}</span>
              <span className="text-[#4B5563]">Chemistry:</span>
              <span className="font-bold text-black">{bat.chemistry} ({bat.format})</span>
              <span className="text-[#4B5563]">Nominal Spec:</span>
              <span className="text-black">{bat.nominal_voltage}V · {bat.nominal_capacity_ah} Ah</span>
              <span className="text-[#4B5563]">Manufacturer:</span>
              <span className="text-black">{bat.manufacturer || 'OEM Unspecified'}</span>
              <span className="text-[#4B5563]">Intake Source:</span>
              <span className="text-black">{bat.source || 'EV Dismantler'}</span>
              <span className="text-[#4B5563]">Intake State:</span>
              <span className="capitalize text-black">{bat.physical_condition.replace('_', ' ')}</span>
            </div>
          </div>

          {/* Test & Rig Calibration */}
          <div className="border border-[#D9DEE7] bg-[#F5F6F8] rounded-lg p-4 space-y-3">
            <div className="text-xs uppercase tracking-wider font-bold text-black border-b border-[#D9DEE7] pb-1">
              Test Execution Details
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-xs">
              <span className="text-[#4B5563]">Test ID:</span>
              <span className="text-black font-semibold">{passport.test_id}</span>
              <span className="text-[#4B5563]">Protocol:</span>
              <span className="text-black">{passport.test_summary.protocol_id}</span>
              <span className="text-[#4B5563]">Test Hardware:</span>
              <span className="text-black">{passport.test_summary.device_id}</span>
              <span className="text-[#4B5563]">Operator ID:</span>
              <span className="text-black">{passport.test_summary.operator_id}</span>
              <span className="text-[#4B5563]">Calibration Profile:</span>
              <span className="text-black">{passport.test_summary.calibration_version}</span>
              <span className="text-[#4B5563]">Diagnostic Model:</span>
              <span className="text-[#2563EB] font-semibold">{passport.test_summary.model_version}</span>
              <span className="text-[#4B5563]">Safety Status:</span>
              <span className={`font-bold ${res.safety_status === 'PASS' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {res.safety_status}
              </span>
            </div>
          </div>
        </div>

        {/* Final Circularity Decision Banner */}
        <div className="border border-[#D9DEE7] bg-[#F5F6F8] rounded-lg p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider font-bold text-[#4B5563]">
              Circularity Pathway Recommendation
            </span>
            <div className="text-2xl font-bold tracking-tight text-black flex items-center gap-2">
              <span
                className={
                  res.recommendation === 'SECOND_LIFE_SCREENING'
                    ? 'text-emerald-700'
                    : res.recommendation === 'QUARANTINE'
                    ? 'text-rose-700'
                    : res.recommendation === 'RECYCLING_REVIEW'
                    ? 'text-sky-700'
                    : 'text-amber-700'
                }
              >
                {res.recommendation.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-[#4B5563] max-w-xl">
              {res.explanation[0] || 'Standard pulse response evaluated against baseline screening thresholds.'}
            </p>
          </div>

          <div className="flex items-center gap-6 text-right">
            <div>
              <div className="text-xs text-[#4B5563] uppercase font-bold">Estimated SoH</div>
              <div className="text-3xl font-bold text-black">
                {res.soh_range.low}–{res.soh_range.high}
                <span className="text-sm text-[#4B5563] font-normal ml-1">%</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-[#4B5563] uppercase font-bold">Confidence</div>
              <div className="text-3xl font-bold text-[#2563EB]">
                {(res.confidence * 100).toFixed(0)}
                <span className="text-sm text-[#4B5563] font-normal ml-1">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Extracted Physical & Diagnostic Parameters */}
        <div className="border border-[#D9DEE7] rounded-lg p-4 bg-white shadow-sm">
          <div className="text-xs uppercase tracking-wider font-bold text-black mb-3">
            Diagnostic Features & Physics Residuals
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="bg-[#F5F6F8] p-3 rounded border border-[#D9DEE7]">
              <span className="text-[#4B5563] text-xs block">Apparent Impedance</span>
              <span className="text-black text-base font-bold">{(feat.pulse_resistance * 1000).toFixed(1)} mΩ</span>
            </div>
            <div className="bg-[#F5F6F8] p-3 rounded border border-[#D9DEE7]">
              <span className="text-[#4B5563] text-xs block">Voltage Drop ΔV</span>
              <span className="text-[#2563EB] text-base font-bold">{feat.voltage_drop.toFixed(3)} V</span>
            </div>
            <div className="bg-[#F5F6F8] p-3 rounded border border-[#D9DEE7]">
              <span className="text-[#4B5563] text-xs block">Temperature Rise ΔT</span>
              <span className="text-amber-700 text-base font-bold">+{feat.temperature_rise.toFixed(1)} °C</span>
            </div>
            <div className="bg-[#F5F6F8] p-3 rounded border border-[#D9DEE7]">
              <span className="text-[#4B5563] text-xs block">PyBaMM ECM RMSE</span>
              <span className="text-purple-700 text-base font-bold">{res.physics_residual_rmse.toFixed(3)} V</span>
            </div>
          </div>
        </div>

        {/* Cryptographic SHA-256 Seal Section (Interactive Verification) */}
        <div className="border border-[#D9DEE7] bg-[#F5F6F8] rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#2563EB]" />
              <span className="text-xs font-bold uppercase tracking-wider text-black">
                Tamper-Evident SHA-256 Bitstream Seal
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs no-print">
              <button
                onClick={handleCopyHash}
                className="flex items-center gap-1 text-[#4B5563] hover:text-black transition-colors font-medium"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedHash ? 'Copied' : 'Copy Hash'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#D9DEE7] rounded p-2.5 text-xs text-black break-all select-all shadow-sm">
            {passport.raw_data_sha256}
          </div>

          {/* Interactive Hash Verification Tool for Judges */}
          <div className="pt-2 border-t border-[#D9DEE7] flex flex-wrap items-center justify-between gap-3 text-xs no-print">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSimulatedTampering(false);
                  runVerification(false);
                }}
                className="px-3 py-1.5 bg-white hover:bg-[#F5F6F8] text-black border border-[#D9DEE7] rounded font-medium shadow-sm transition-colors"
              >
                Verify Hash Integrity
              </button>
              <button
                onClick={() => {
                  setSimulatedTampering(true);
                  runVerification(true);
                }}
                className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded font-medium transition-colors"
              >
                Simulate Tamper Test
              </button>
            </div>

            {verificationState === 'PASSED' && (
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Seal Verified · Bitstream Untampered</span>
              </div>
            )}

            {verificationState === 'FAILED' && (
              <div className="flex items-center gap-1.5 text-rose-700 font-bold">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>Integrity Alert: Bitstream Mismatch!</span>
              </div>
            )}
          </div>
        </div>

        {/* Chain of Custody Audit Events */}
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider font-bold text-black">
            Chain of Custody & Event Ledger
          </div>
          <div className="space-y-2">
            {passport.chain_of_custody.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between gap-4 p-2.5 rounded bg-[#F5F6F8] border border-[#D9DEE7] text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-semibold text-black flex items-center gap-2">
                    <span className="text-[#2563EB] font-bold">{item.action}</span>
                    <span className="text-[#4B5563]">·</span>
                    <span className="text-[#4B5563]">by {item.actor}</span>
                  </div>
                  <div className="text-[#4B5563]">{item.details}</div>
                </div>
                <div className="text-[11px] text-[#4B5563] shrink-0 font-medium">
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Regulatory & Circularity Disclaimer */}
        <div className="pt-4 border-t border-[#D9DEE7] text-[11px] text-[#4B5563] space-y-1">
          <p className="font-bold text-black">Regulatory Disclaimer & Operational Scope:</p>
          <p>
            This passport is an operational screening record generated by PhyVolt AI for retired EV cell circularity
            and facility triage. It supports structured records for authorized Extended Producer Responsibility (EPR)
            reporting under national Battery Waste Management Rules. It is not an automated certification or replacement
            for official facility procedures.
          </p>
        </div>
      </div>
    </div>
  );
};

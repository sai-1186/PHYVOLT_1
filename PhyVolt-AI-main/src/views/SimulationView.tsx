/**
 * PhyVolt AI — PyBaMM Simulation View
 *
 * ⚠️  SYNTHETIC DATA — PyBaMM SIMULATION — NOT LIVE HARDWARE MEASUREMENTS
 *
 * This view integrates with /api/simulation/run (Express → Python PyBaMM bridge).
 * All data displayed here is synthetic and must NOT be sent to the live hardware database.
 */

import React, { useState, useRef } from 'react';
import {
  FlaskConical,
  AlertTriangle,
  Download,
  Play,
  CheckCircle2,
  XCircle,
  Info,
  Zap,
  Thermometer,
  Activity,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimulationResult {
  success: boolean;
  status: string;
  simulation_id: string;
  chemistry: string;
  param_set: string;
  model: string;
  pybamm_version: string;
  data_type: 'SYNTHETIC';
  provenance: string;
  features: Record<string, number | null | string | boolean>;
  grade: {
    grade_label: string;
    safety_label: string;
    label_source: string;
    explanation: string[];
  };
  timeseries: Array<Record<string, number | string | null>>;
  metadata: Record<string, string>;
  error: string | null;
}

// ── Grade colour ──────────────────────────────────────────────────────────────

const gradeStyle: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  GRADE_A:          { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-600' },
  GRADE_B:          { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   dot: 'bg-amber-600'   },
  GRADE_C:          { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-800',  dot: 'bg-orange-600'  },
  RECYCLE_REVIEW:   { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-800',    dot: 'bg-rose-600'    },
  SAFETY_QUARANTINE:{ bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     dot: 'bg-red-600'     },
  UNDETERMINED:     { bg: 'bg-gray-50',    border: 'border-[#D9DEE7]',   text: 'text-[#4B5563]',   dot: 'bg-gray-500'   },
  'N/A':            { bg: 'bg-gray-50',    border: 'border-[#D9DEE7]',   text: 'text-[#4B5563]',   dot: 'bg-gray-500'   },
};

function getGradeStyle(label: string) {
  return gradeStyle[label] ?? gradeStyle['UNDETERMINED'];
}

// ── Tiny SVG chart ────────────────────────────────────────────────────────────

function VoltageChart({ data }: { data: SimulationResult['timeseries'] }) {
  if (!data || data.length === 0) return null;

  const vs = data.map((r) => (typeof r.voltage_V === 'number' ? r.voltage_V : NaN)).filter(isFinite);
  const ts = data.map((r) => (typeof r.elapsed_time_s === 'number' ? r.elapsed_time_s : NaN)).filter(isFinite);
  if (vs.length === 0) return null;

  const vmin = Math.min(...vs), vmax = Math.max(...vs);
  const tmin = Math.min(...ts), tmax = Math.max(...ts);
  const W = 600, H = 120;
  const pad = { l: 40, r: 12, t: 8, b: 28 };

  const cx = (t: number) => pad.l + ((t - tmin) / (tmax - tmin || 1)) * (W - pad.l - pad.r);
  const cy = (v: number) => pad.t + (1 - (v - vmin) / (vmax - vmin || 0.001)) * (H - pad.t - pad.b);

  const pts = data
    .filter((r) => typeof r.voltage_V === 'number' && typeof r.elapsed_time_s === 'number')
    .map((r) => `${cx(r.elapsed_time_s as number).toFixed(1)},${cy(r.voltage_V as number).toFixed(1)}`)
    .join(' ');

  // Stage background bands
  const restEnd  = data.findIndex((r) => r.test_stage === 'PULSE');
  const pulseEnd = data.findIndex((r) => r.test_stage === 'RELAX');
  const restT  = restEnd  > 0 ? (data[restEnd  - 1].elapsed_time_s as number) : 0;
  const pulseT = pulseEnd > 0 ? (data[pulseEnd - 1].elapsed_time_s as number) : tmax;

  return (
    <div className="w-full overflow-x-auto bg-white p-2 rounded-lg border border-[#D9DEE7]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-40 text-[9px]">
        {/* Stage bands */}
        <rect x={pad.l} y={pad.t} width={cx(restT) - pad.l} height={H - pad.t - pad.b}
              fill="#eff6ff" />
        <rect x={cx(restT)} y={pad.t} width={cx(pulseT) - cx(restT)} height={H - pad.t - pad.b}
              fill="#ecfdf5" />
        <rect x={cx(pulseT)} y={pad.t} width={W - pad.r - cx(pulseT)} height={H - pad.t - pad.b}
              fill="#fffbeb" />
        {/* Labels */}
        <text x={(pad.l + cx(restT)) / 2} y={H - 8} fill="#4B5563" fontWeight="bold" textAnchor="middle">REST</text>
        <text x={(cx(restT) + cx(pulseT)) / 2} y={H - 8} fill="#4B5563" fontWeight="bold" textAnchor="middle">PULSE</text>
        <text x={(cx(pulseT) + W - pad.r) / 2} y={H - 8} fill="#4B5563" fontWeight="bold" textAnchor="middle">RELAX</text>
        {/* Axes */}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="#D9DEE7" />
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="#D9DEE7" />
        <text x={pad.l - 3} y={pad.t + 4} fill="#4B5563" textAnchor="end">{vmax.toFixed(2)}</text>
        <text x={pad.l - 3} y={H - pad.b} fill="#4B5563" textAnchor="end">{vmin.toFixed(2)}</text>
        {/* Voltage line */}
        <polyline points={pts} fill="none" stroke="#2563EB" strokeWidth="2" />
      </svg>
      <div className="flex gap-4 text-[11px] text-[#4B5563] mt-2 pt-2 border-t border-[#D9DEE7]">
        <span className="text-blue-700 font-semibold">■ REST</span>
        <span className="text-emerald-700 font-semibold">■ PULSE</span>
        <span className="text-amber-700 font-semibold">■ RELAX</span>
        <span className="ml-auto text-[#2563EB] font-bold">── Voltage (V)</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SimulationView() {
  // Form state
  const [chemistry, setChemistry] = useState('NMC');
  const [soc, setSoc] = useState(80);
  const [temperature, setTemperature] = useState(25);
  const [current, setCurrent] = useState(1.0);
  const [pulseDuration, setPulseDuration] = useState(120);
  const [relaxDuration, setRelaxDuration] = useState(120);
  const [restDuration, setRestDuration] = useState(30);
  const [capacityAh, setCapacityAh] = useState(3.0);

  // Simulation state
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SUPPORTED = ['NMC', 'NCA', 'LFP'];
  const PARAM_SETS: Record<string, string> = {
    NMC: 'Chen2020 (Single Particle Model)',
    NCA: 'NCA_Kim2011 (Single Particle Model)',
    LFP: 'Prada2013 (Single Particle Model)',
  };

  async function runSimulation() {
    setIsRunning(true);
    setResult(null);
    setError(null);
    setElapsed(0);

    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    try {
      const resp = await fetch('/api/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chemistry,
          initial_soc: soc / 100,
          temperature_c: temperature,
          pulse_current_a: current,
          pulse_duration_s: pulseDuration,
          rest_duration_s: restDuration,
          relaxation_duration_s: relaxDuration,
          capacity_ah: capacityAh,
        }),
      });
      const data = await resp.json() as SimulationResult;
      setResult(data);
      if (!data.success) setError(data.error ?? 'Simulation returned failure status.');
    } catch (e: unknown) {
      setError(`Network error: ${String(e)}`);
    } finally {
      setIsRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  function fmtVal(val: number | null | undefined | string | boolean): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'number') return isNaN(val) ? '—' : val.toFixed(4);
    return String(val);
  }

  const gs = result ? getGradeStyle(result.grade.grade_label) : null;

  return (
    <div className="space-y-6 pb-10">

      {/* ── SYNTHETIC DATA BANNER ── */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 shadow-sm">
        <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-amber-900 tracking-wide">
            ⚠ SYNTHETIC DATA — PyBaMM SIMULATION — NOT LIVE HARDWARE MEASUREMENTS
          </p>
          <p className="text-xs text-amber-800">
            All results from this panel are generated by PyBaMM physics-based simulation.
            They do NOT represent real cell measurements and must NOT be added to the live hardware database.
            The live ESP32 workflow remains fully separate.
          </p>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
          <FlaskConical className="w-5 h-5 text-[#2563EB]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-black tracking-tight">PyBaMM Simulation Engine</h2>
          <p className="text-sm text-[#4B5563]">
            Single Particle Model (SPM) pulse diagnostic simulation · Synthetic data only
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Configuration Panel ── */}
        <div className="xl:col-span-1 space-y-5">
          <div className="bg-white border border-[#D9DEE7] rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-base font-bold text-black border-b border-[#D9DEE7] pb-2">Simulation Parameters</h3>

            {/* Chemistry */}
            <div>
              <label className="block text-xs font-semibold text-[#4B5563] mb-1">Chemistry</label>
              <select
                value={chemistry}
                onChange={(e) => setChemistry(e.target.value)}
                className="w-full bg-white border border-[#D9DEE7] rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
              >
                {SUPPORTED.map((c) => (
                  <option key={c} value={c}>{c} — {PARAM_SETS[c]}</option>
                ))}
              </select>
              <p className="text-[11px] text-[#4B5563] mt-1">
                LTO / LCO / LMO: no validated parameter set in PyBaMM 26.x
              </p>
            </div>

            {/* SoC */}
            <div>
              <label className="flex justify-between text-xs font-semibold text-[#4B5563] mb-1">
                <span>Initial SoC</span>
                <span className="text-[#2563EB] font-bold">{soc}%</span>
              </label>
              <input type="range" min={10} max={100} value={soc}
                onChange={(e) => setSoc(Number(e.target.value))}
                className="w-full accent-[#2563EB]" />
            </div>

            {/* Temperature */}
            <div>
              <label className="flex justify-between text-xs font-semibold text-[#4B5563] mb-1">
                <span>Ambient Temperature</span>
                <span className="text-amber-700 font-bold">{temperature}°C</span>
              </label>
              <input type="range" min={5} max={45} value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-[#2563EB]" />
            </div>

            {/* Current */}
            <div>
              <label className="flex justify-between text-xs font-semibold text-[#4B5563] mb-1">
                <span>Pulse Current</span>
                <span className="text-emerald-700 font-bold">{current.toFixed(1)} A</span>
              </label>
              <input type="range" min={0.1} max={3.0} step={0.1} value={current}
                onChange={(e) => setCurrent(Number(e.target.value))}
                className="w-full accent-[#2563EB]" />
            </div>

            {/* Capacity */}
            <div>
              <label className="flex justify-between text-xs font-semibold text-[#4B5563] mb-1">
                <span>Rated Capacity</span>
                <span className="text-black font-bold">{capacityAh.toFixed(1)} Ah</span>
              </label>
              <input type="range" min={1} max={10} step={0.5} value={capacityAh}
                onChange={(e) => setCapacityAh(Number(e.target.value))}
                className="w-full accent-[#2563EB]" />
            </div>

            {/* Timings */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { label: 'Pulse (s)', val: pulseDuration, set: setPulseDuration, min: 10, max: 300 },
                { label: 'Relax (s)', val: relaxDuration, set: setRelaxDuration, min: 10, max: 300 },
                { label: 'Rest (s)',  val: restDuration,  set: setRestDuration,  min: 5,  max: 120 },
              ].map(({ label, val, set, min, max }) => (
                <div key={label}>
                  <label className="text-[#4B5563] font-semibold">{label}</label>
                  <input type="number" value={val} min={min} max={max}
                    onChange={(e) => set(Number(e.target.value))}
                    className="w-full mt-1 bg-white border border-[#D9DEE7] rounded px-2 py-1 text-black text-xs focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]" />
                </div>
              ))}
            </div>

            {/* Run button */}
            <button
              onClick={runSimulation}
              disabled={isRunning}
              id="sim-run-button"
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold text-sm transition-all ${
                isRunning
                  ? 'bg-slate-200 text-[#4B5563] cursor-not-allowed'
                  : 'bg-[#2563EB] hover:bg-blue-700 text-white shadow-sm'
              }`}
            >
              {isRunning ? (
                <>
                  <span className="w-4 h-4 border-2 border-[#4B5563] border-t-blue-600 rounded-full animate-spin" />
                  Simulating… ({elapsed}s)
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run PyBaMM Simulation
                </>
              )}
            </button>
          </div>

          {/* Supported chemistries info */}
          <div className="bg-[#F5F6F8] border border-[#D9DEE7] rounded-xl p-4 space-y-2 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-black">
              <Info className="w-3.5 h-3.5 text-[#2563EB]" />
              Supported Parameter Sets
            </div>
            {Object.entries(PARAM_SETS).map(([chem, ps]) => (
              <div key={chem} className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0" />
                <span className="text-emerald-800 font-bold">{chem}</span>
                <span className="text-[#4B5563] truncate">→ {ps}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-[#D9DEE7] space-y-1">
              {['LTO', 'LCO', 'LMO'].map((c) => (
                <div key={c} className="flex items-center gap-2 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                  <span className="text-rose-700 font-semibold">{c}</span>
                  <span className="text-[#4B5563]">unsupported in PyBaMM 26.x</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Results Panel ── */}
        <div className="xl:col-span-2 space-y-5">

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-rose-300 bg-rose-50">
              <XCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-rose-800">Simulation Failed</p>
                <p className="text-xs text-rose-700 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Idle state */}
          {!result && !isRunning && !error && (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-[#D9DEE7] bg-white rounded-xl text-[#4B5563] shadow-sm">
              <FlaskConical className="w-10 h-10 mb-3 text-[#D9DEE7]" />
              <p className="text-base font-semibold text-black">Configure parameters and run a simulation</p>
              <p className="text-xs text-[#4B5563] mt-1">Physics-based diagnostic results will appear here</p>
            </div>
          )}

          {/* Running state */}
          {isRunning && (
            <div className="h-64 flex flex-col items-center justify-center border border-blue-200 bg-blue-50/50 rounded-xl gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-blue-200" />
                <div className="absolute inset-0 rounded-full border-4 border-t-[#2563EB] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                <FlaskConical className="absolute inset-0 m-auto w-7 h-7 text-[#2563EB]" />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-black">PyBaMM Simulation Running…</p>
                <p className="text-xs text-[#4B5563] mt-0.5">SPM solver · {chemistry} · {elapsed}s elapsed</p>
              </div>
            </div>
          )}

          {/* Success result */}
          {result && result.success && gs && (
            <div className="space-y-4">

              {/* Simulation metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Simulation ID',  val: result.simulation_id, icon: <Zap className="w-3 h-3 text-[#2563EB]" /> },
                  { label: 'Model',          val: result.model,         icon: <Activity className="w-3 h-3 text-[#2563EB]" /> },
                  { label: 'Parameter Set',  val: result.param_set,     icon: <Info className="w-3 h-3 text-[#2563EB]" /> },
                  { label: 'PyBaMM',         val: `v${result.pybamm_version}`, icon: <FlaskConical className="w-3 h-3 text-[#2563EB]" /> },
                ].map(({ label, val, icon }) => (
                  <div key={label} className="bg-white border border-[#D9DEE7] rounded-lg px-3 py-2 shadow-sm">
                    <div className="flex items-center gap-1 text-[11px] text-[#4B5563] font-medium mb-1">{icon}{label}</div>
                    <div className="text-xs font-bold text-black truncate">{val}</div>
                  </div>
                ))}
              </div>

              {/* Grade badge */}
              <div className={`rounded-xl border px-5 py-4 shadow-sm ${gs.bg} ${gs.border}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${gs.dot}`} />
                    <div>
                      <p className={`text-xl font-bold ${gs.text}`}>{result.grade.grade_label}</p>
                      <p className="text-[11px] text-[#4B5563] mt-0.5">label_source: {result.grade.label_source}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.grade.safety_label === 'PASS'
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      : <AlertTriangle className="w-4 h-4 text-rose-600" />}
                    <span className="text-xs font-semibold text-black">Safety: {result.grade.safety_label}</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {result.grade.explanation.map((e, i) => (
                    <p key={i} className="text-xs text-[#4B5563]">· {e}</p>
                  ))}
                </div>
              </div>

              {/* Voltage chart */}
              <div className="bg-white border border-[#D9DEE7] rounded-xl p-4 space-y-3 shadow-sm">
                <h4 className="text-sm font-bold text-black">Voltage vs Elapsed Time</h4>
                <VoltageChart data={result.timeseries} />
              </div>

              {/* Features grid */}
              <div className="bg-white border border-[#D9DEE7] rounded-xl p-4 space-y-3 shadow-sm">
                <h4 className="text-sm font-bold text-black flex items-center gap-2">
                  <Thermometer className="w-3.5 h-3.5 text-[#2563EB]" />
                  Extracted Pulse Features
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { k: 'v_before_pulse_V',       label: 'V before pulse (V)' },
                    { k: 'v_pulse_min_V',           label: 'V min during pulse (V)' },
                    { k: 'voltage_drop_V',          label: 'Voltage drop (V)' },
                    { k: 'pulse_resistance_mohm',   label: 'Pulse resistance (mΩ)' },
                    { k: 'avg_pulse_current_A',     label: 'Avg pulse current (A)' },
                    { k: 'recovery_ratio',          label: 'Recovery ratio' },
                    { k: 'v_relaxation_1s_V',       label: 'V relax @1s (V)' },
                    { k: 'v_relaxation_10s_V',      label: 'V relax @10s (V)' },
                    { k: 'v_relaxation_60s_V',      label: 'V relax @60s (V)' },
                    { k: 'initial_soc_pct',         label: 'Initial SoC (%)' },
                    { k: 'pulse_sample_count',      label: 'Pulse samples' },
                    { k: 'total_sample_count',      label: 'Total samples' },
                  ].map(({ k, label }) => (
                    <div key={k} className="bg-[#F5F6F8] border border-[#D9DEE7] rounded-lg px-3 py-2">
                      <p className="text-[10px] text-[#4B5563] truncate">{label}</p>
                      <p className="text-sm font-bold text-black mt-0.5">
                        {fmtVal(result.features[k] as number | null)}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[#4B5563] italic">
                  {String(result.features._note_pulse_samples ?? '')}
                </p>
              </div>

              {/* Download buttons */}
              <div className="flex flex-wrap gap-3">
                <a
                  href="/api/simulation/download/phyvolt_synthetic_pulse_data.csv"
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-black bg-white hover:bg-[#F5F6F8] border border-[#D9DEE7] rounded-lg shadow-sm transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[#2563EB]" />
                  Download Pulse Data CSV
                </a>
                <a
                  href="/api/simulation/download/phyvolt_synthetic_cell_summary.csv"
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-black bg-white hover:bg-[#F5F6F8] border border-[#D9DEE7] rounded-lg shadow-sm transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[#2563EB]" />
                  Download Cell Summary CSV
                </a>
              </div>

              {/* Provenance footer */}
              <div className="flex items-center gap-2 text-[11px] text-[#4B5563] border border-[#D9DEE7] bg-[#F5F6F8] rounded-lg px-3 py-2">
                <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />
                {result.provenance}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

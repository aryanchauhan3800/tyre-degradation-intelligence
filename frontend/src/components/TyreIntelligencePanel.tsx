/**
 * TYRETRACE — Selected Tyre Intelligence Panel
 *
 * SCIENTIFIC INTEGRITY:
 * When in REAL_REPLAY mode, wheel-level degradation is strictly displayed as UNAVAILABLE with
 * full provenance reasons.
 * When in DEMO_SIMULATION mode, synthetic four-wheel data is shown with prominent SIMULATED badges.
 */

import React from 'react';
import type { DataMode, FourWheelTyres, TyreCorner } from '../types/telemetry';
import { getCornerLabel } from '../services/demoSimulation';
import { Disc, ShieldAlert, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';

interface TyreIntelligencePanelProps {
  selectedTyre: TyreCorner | null;
  dataMode: DataMode;
  fourWheelStates?: FourWheelTyres | null;
  canonicalTyreAge?: number | null;
  canonicalCompound?: string | null;
  onResetSelection: () => void;
  onToggleDemoMode: () => void;
}

export const TyreIntelligencePanel: React.FC<TyreIntelligencePanelProps> = ({
  selectedTyre,
  dataMode,
  fourWheelStates,
  canonicalTyreAge,
  canonicalCompound,
  onResetSelection,
  onToggleDemoMode,
}) => {
  const corner = selectedTyre ?? 'FR';
  const cornerLabel = getCornerLabel(corner);
  const tyreState = fourWheelStates ? fourWheelStates[corner] : null;

  const isSimulatedMode = dataMode === 'DEMO_SIMULATION';
  const isAvailable = isSimulatedMode && tyreState?.available === true && tyreState.tdi !== null;

  const tdi = isAvailable && tyreState ? tyreState.tdi : null;
  const trend = tyreState?.trend ?? 'STABLE';
  const confidencePct = tyreState?.confidence ? Math.round(tyreState.confidence * 100) : 76;
  const effectiveAge = typeof canonicalTyreAge === 'number' ? canonicalTyreAge : (tyreState?.age_laps ?? null);
  const effectiveCompound = canonicalCompound ?? tyreState?.compound ?? 'SOFT';
  const evidence = tyreState?.evidence ?? [
    'Persistent acceleration residual in traction phases (Simulated)',
    'Accumulated thermal tyre age (Simulated)',
  ];
  const counterEvidence = tyreState?.counter_evidence ?? ['Aero drag active at peak velocity'];

  return (
    <div className="bg-[#0e1118] border border-[#202738] rounded-lg p-3.5 flex flex-col justify-between shadow-md h-full">
      {/* Header with Tyre Corner Identifier */}
      <div>
        <div className="flex items-center justify-between border-b border-[#1b2233] pb-2 mb-3">
          <div className="flex items-center space-x-2">
            <Disc className="w-4 h-4 text-cyan-400" />
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase block leading-none">
                Corner Telemetry
              </span>
              <span className="text-xs font-mono font-bold tracking-wider text-slate-100 uppercase">
                {cornerLabel} ({corner})
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {isSimulatedMode ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300 font-bold">
                DEMO SIMULATION
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161d2b] border border-[#27344c] text-slate-400 font-medium">
                REAL REPLAY
              </span>
            )}
            {selectedTyre && (
              <button
                onClick={onResetSelection}
                className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer"
                title="Deselect tyre"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* State Display: Either UNAVAILABLE (Replay) or SIMULATED (Demo) */}
        {!isAvailable ? (
          /* REAL REPLAY — STRICT UNAVAILABLE STATE */
          <div className="bg-[#12151f] border border-[#1f2738] rounded-lg p-3 my-2 font-mono">
            <div className="flex items-center space-x-2 mb-2 text-slate-300">
              <ShieldAlert className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold uppercase">STATUS: UNAVAILABLE</span>
            </div>

            <div className="text-center py-3 bg-[#0a0c12] rounded border border-[#192030] my-2">
              <span className="text-4xl font-mono font-black text-slate-600 block">—</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                NO DIRECT WHEEL TELEMETRY
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              Wheel-level degradation telemetry is not available in the current FastF1 source.
              FastF1 captures chassis-level speed, throttle, brake, and DRS, but lacks per-corner
              tread temperature, surface wear, and individual wheel speeds.
            </p>

            {/* Canonical Tyre Set Info from Telemetry */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="bg-[#161c29] p-2 rounded border border-[#253147]">
                <span className="text-[10px] text-slate-500 block uppercase">TYRE SET AGE</span>
                <span className="font-bold text-slate-200">
                  {effectiveAge !== null ? `${effectiveAge} laps` : '—'}
                </span>
              </div>
              <div className="bg-[#161c29] p-2 rounded border border-[#253147]">
                <span className="text-[10px] text-slate-500 block uppercase">COMPOUND</span>
                <span className="font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">
                  {effectiveCompound}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded bg-[#161c29] border border-[#253147] flex items-center justify-between">
              <span className="text-[10px] text-slate-300">
                Want to preview 4-wheel interaction?
              </span>
              <button
                onClick={onToggleDemoMode}
                className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[10px] font-bold text-amber-300 transition-colors cursor-pointer"
              >
                Switch to Demo
              </button>
            </div>
          </div>
        ) : (
          /* DEMO SIMULATION — CLEARLY LABELLED CORNER METRICS */
          <div className="space-y-3 font-mono">
            {/* TDI Score & Trend */}
            <div className="flex items-baseline justify-between bg-[#121622] p-3 rounded border border-[#1e2639]">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">
                  CORNER TDI (SIMULATED)
                </span>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-4xl font-black text-amber-300 tabular-nums">
                    {tdi !== null ? tdi.toFixed(1) : '—'}
                  </span>
                  <span className="text-xs text-slate-500">/ 100</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-500 block uppercase">TREND</span>
                <span className="text-xs font-bold text-rose-400">{trend}</span>
                <span className="text-[10px] text-slate-500 block mt-1 uppercase">SIMULATION CONFIDENCE</span>
                <span className="text-xs font-bold text-cyan-400">{confidencePct}%</span>
              </div>
            </div>

            {/* Tyre Specs */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#121622] p-2 rounded border border-[#1e2639]">
                <span className="text-[10px] text-slate-500 block uppercase">TYRE SET AGE</span>
                <span className="font-bold text-slate-200">
                  {effectiveAge !== null ? `${effectiveAge} laps` : '—'}
                </span>
              </div>
              <div className="bg-[#121622] p-2 rounded border border-[#1e2639]">
                <span className="text-[10px] text-slate-500 block uppercase">COMPOUND</span>
                <span className="font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">
                  {effectiveCompound}
                </span>
              </div>
            </div>

            {/* Corner Evidence */}
            <div className="bg-[#121622] p-2.5 rounded border border-[#1e2639] space-y-2 text-xs">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold block uppercase mb-1">
                  Evidence (Simulated)
                </span>
                <ul className="space-y-1">
                  {evidence.map((item, idx) => (
                    <li key={idx} className="flex items-start space-x-1 text-slate-300 text-[11px]">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {counterEvidence.length > 0 && (
                <div className="pt-1.5 border-t border-[#1a2130]">
                  <span className="text-[10px] text-amber-400 font-bold block uppercase mb-1">
                    Counter Evidence
                  </span>
                  <ul className="space-y-1">
                    {counterEvidence.map((item, idx) => (
                      <li key={idx} className="flex items-start space-x-1 text-slate-300 text-[11px]">
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Provenance Note */}
      <div className="mt-2 pt-2 border-t border-[#171c28] text-[9px] font-mono text-slate-500 flex justify-between">
        <span>DATA PROVENANCE: {isSimulatedMode ? 'SIMULATED' : 'FASTF1 / REPLAY'}</span>
        <span>CORNER: {corner}</span>
      </div>
    </div>
  );
};

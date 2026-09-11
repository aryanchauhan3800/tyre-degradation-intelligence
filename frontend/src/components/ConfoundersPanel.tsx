/**
 * TYRETRACE — Confounder Analysis Panel
 * Monitors non-tyre vehicle dynamics that corrupt actual vs expected acceleration residuals.
 */

import React from 'react';
import type { ConfounderFrame } from '../types/telemetry';
import { Filter, Wind, Disc, Zap, AlertCircle } from 'lucide-react';

interface ConfoundersPanelProps {
  confounders: ConfounderFrame | null;
}

export const ConfoundersPanel: React.FC<ConfoundersPanelProps> = ({ confounders }) => {
  const rawFlags = confounders?.active_flags;
  const flags = Array.isArray(rawFlags) ? rawFlags : [];
  const flagsObj = (rawFlags && typeof rawFlags === 'object' && !Array.isArray(rawFlags))
    ? (rawFlags as Record<string, any>)
    : null;
  const evalDetails = confounders?.confounders;

  const drsActive = Boolean(
    evalDetails?.drs?.active ??
      confounders?.drs_active ??
      flagsObj?.drs_active ??
      flags.includes('DRS_ACTIVE')
  );
  const brakingActive = Boolean(
    evalDetails?.braking?.active ??
      confounders?.braking_active ??
      flagsObj?.braking_active ??
      (flags.includes('HEAVY_BRAKING') || flags.includes('BRAKING_ACTIVE'))
  );
  const highSpeedActive = Boolean(
    evalDetails?.high_speed?.active ??
      confounders?.high_speed_active ??
      flagsObj?.high_speed_active ??
      flags.includes('HIGH_SPEED')
  );
  const transientActive = Boolean(
    evalDetails?.transient?.active ??
      confounders?.transient_active ??
      flagsObj?.transient_active ??
      (flags.includes('TRANSIENT_EVENT') || flags.includes('TRANSIENT_DYNAMICS'))
  );

  const drsClassification = evalDetails?.drs?.classification ?? (drsActive ? 'EXPLANATORY' : 'NONE');
  const brakingClassification = evalDetails?.braking?.classification ?? (brakingActive ? 'EXPLANATORY' : 'NONE');
  const highSpeedClassification = evalDetails?.high_speed?.classification ?? (highSpeedActive ? 'EXPLANATORY' : 'NONE');
  const transientClassification = evalDetails?.transient?.classification ?? (transientActive ? 'POSSIBLE' : 'NONE');

  const nonTyreScore = confounders ? Math.round(confounders.non_tyre_explanation_score * 100) / 100 : 0;
  const tyreEvidenceQuality = confounders ? Math.round(confounders.tyre_evidence_quality * 100) / 100 : 1;

  const flagItems = [
    {
      label: 'DRS',
      active: drsActive,
      classification: drsClassification,
      icon: Wind,
      desc: drsActive ? 'Aerodynamic drag reduction active' : 'Rear wing flap closed',
    },
    {
      label: 'BRAKING',
      active: brakingActive,
      classification: brakingClassification,
      icon: Disc,
      desc: brakingActive ? 'Threshold braking demand active' : 'Below active braking threshold (25%)',
    },
    {
      label: 'HIGH SPEED',
      active: highSpeedActive,
      classification: highSpeedClassification,
      icon: Zap,
      desc: highSpeedActive ? 'Aerodynamic dominance (>250 km/h)' : 'Below aero-dominant speed threshold',
    },
    {
      label: 'TRANSIENT',
      active: transientActive,
      classification: transientClassification,
      icon: AlertCircle,
      desc: transientActive ? 'Rapid gear/throttle/brake rate transition' : 'Quasi-steady-state kinematics',
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between shadow-sm text-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2.5">
        <div className="flex items-center space-x-1.5">
          <Filter className="w-4 h-4 text-red-600" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-900 uppercase">
            Confounder Engine
          </span>
        </div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-semibold">
          DETERMINISTIC
        </span>
      </div>

      {/* 4 Active / Inactive Confounder Indicators */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {flagItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`p-2 rounded border font-mono transition-all ${
                item.active
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-900 flex items-center space-x-1">
                  <Icon className={`w-3 h-3 ${item.active ? 'text-amber-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                    item.active
                      ? 'bg-amber-500 text-white font-bold'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {item.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[9px]">
                <span className="text-slate-500 truncate max-w-[130px] font-medium">{item.desc}</span>
                {item.active && (
                  <span className="text-[8px] font-bold text-amber-700 uppercase tracking-tighter shrink-0 ml-1">
                    {item.classification}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dual Evidence Scores: Non-Tyre Explanation vs Tyre Evidence Quality */}
      <div className="space-y-2.5 pt-2 border-t border-slate-200 font-mono text-xs">
        {/* Non-Tyre Explanation Score */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">
              NON-TYRE EXPLANATION (S_conf)
            </span>
            <span
              className={`font-bold tabular-nums ${
                nonTyreScore > 0.4 ? 'text-amber-600' : 'text-slate-700'
              }`}
            >
              {(typeof nonTyreScore === 'number' && !isNaN(nonTyreScore) ? nonTyreScore : 0).toFixed(2)}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                nonTyreScore > 0.4 ? 'bg-amber-500' : 'bg-slate-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, (nonTyreScore || 0) * 100))}%` }}
            />
          </div>
        </div>

        {/* Tyre Evidence Quality */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">
              TYRE EVIDENCE QUALITY (Q_tyre)
            </span>
            <span
              className={`font-bold tabular-nums ${
                tyreEvidenceQuality >= 0.7 ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {(typeof tyreEvidenceQuality === 'number' && !isNaN(tyreEvidenceQuality) ? tyreEvidenceQuality : 1).toFixed(2)}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                tyreEvidenceQuality >= 0.7 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, (tyreEvidenceQuality || 0) * 100))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

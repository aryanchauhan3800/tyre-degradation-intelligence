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
  const flags = confounders?.active_flags;
  const drsActive = flags?.drs_active ?? false;
  const brakingActive = flags?.braking_active ?? false;
  const highSpeedActive = flags?.high_speed_active ?? false;
  const transientActive = flags?.transient_active ?? false;

  const nonTyreScore = confounders ? Math.round(confounders.non_tyre_explanation_score * 100) / 100 : 0;
  const tyreEvidenceQuality = confounders ? Math.round(confounders.tyre_evidence_quality * 100) / 100 : 1;

  const flagItems = [
    { label: 'DRS', active: drsActive, icon: Wind, desc: 'Aerodynamic drag reduction' },
    { label: 'BRAKING', active: brakingActive, icon: Disc, desc: 'High brake line pressure' },
    { label: 'HIGH SPEED', active: highSpeedActive, icon: Zap, desc: 'v > 280 km/h aerodynamic dominance' },
    { label: 'TRANSIENT', active: transientActive, icon: AlertCircle, desc: 'Rapid gear/throttle transition' },
  ];

  return (
    <div className="bg-[#0e1118] border border-[#202738] rounded-lg p-3.5 flex flex-col justify-between shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1b2233] pb-2 mb-2.5">
        <div className="flex items-center space-x-1.5">
          <Filter className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            Confounder Engine
          </span>
        </div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161d2b] border border-[#28354d] text-slate-400">
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
                  ? 'bg-amber-950/40 border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
                  : 'bg-[#121622] border-[#1e2639]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-200 flex items-center space-x-1">
                  <Icon className={`w-3 h-3 ${item.active ? 'text-amber-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                    item.active
                      ? 'bg-amber-500 text-black'
                      : 'bg-[#192030] text-slate-500'
                  }`}
                >
                  {item.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <span className="text-[9px] text-slate-500 block mt-1 truncate">
                {item.desc}
              </span>
            </div>
          );
        })}
      </div>

      {/* Dual Evidence Scores: Non-Tyre Explanation vs Tyre Evidence Quality */}
      <div className="space-y-2.5 pt-2 border-t border-[#1b2233] font-mono text-xs">
        {/* Non-Tyre Explanation Score */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10px] text-slate-400 uppercase">
              NON-TYRE EXPLANATION (S_conf)
            </span>
            <span
              className={`font-bold tabular-nums ${
                nonTyreScore > 0.4 ? 'text-amber-400' : 'text-slate-300'
              }`}
            >
              {nonTyreScore.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-2 bg-[#171d2b] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                nonTyreScore > 0.4 ? 'bg-amber-400' : 'bg-slate-500'
              }`}
              style={{ width: `${Math.min(100, nonTyreScore * 100)}%` }}
            />
          </div>
        </div>

        {/* Tyre Evidence Quality */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10px] text-slate-400 uppercase">
              TYRE EVIDENCE QUALITY (Q_tyre)
            </span>
            <span
              className={`font-bold tabular-nums ${
                tyreEvidenceQuality >= 0.7 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {tyreEvidenceQuality.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-2 bg-[#171d2b] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                tyreEvidenceQuality >= 0.7 ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              style={{ width: `${Math.min(100, tyreEvidenceQuality * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

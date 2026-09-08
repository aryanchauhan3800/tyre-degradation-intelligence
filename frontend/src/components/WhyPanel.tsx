/**
 * TYRETRACE — Dynamic Explainability "Why" Panel
 * Surfaces real-time evidence and counter-evidence directly from backend TDI scoring rules.
 */

import React from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import type { TDITrend } from '../types/telemetry';

interface WhyPanelProps {
  evidence: string[];
  counterEvidence: string[];
  trend: TDITrend;
  finalTdi: number;
}

export const WhyPanel: React.FC<WhyPanelProps> = ({
  evidence,
  counterEvidence,
  trend,
  finalTdi,
}) => {
  const getHeading = () => {
    if (trend === 'RISING') return 'WHY IS TDI RISING?';
    if (trend === 'FALLING') return 'WHY IS TDI DECREASING?';
    if (trend === 'SPIKE') return 'WHY IS ANOMALY DETECTED?';
    return 'WHY IS TDI AT THIS LEVEL?';
  };

  const hasEvidence = evidence && evidence.length > 0;
  const hasCounter = counterEvidence && counterEvidence.length > 0;

  return (
    <div className="bg-[#0e1118] border border-[#202738] rounded-lg p-3.5 flex flex-col justify-between shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1b2233] pb-2 mb-2.5">
        <div className="flex items-center space-x-1.5">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            {getHeading()}
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          TDI: <strong className="text-cyan-300">{(typeof finalTdi === 'number' && !isNaN(finalTdi) ? finalTdi : 0).toFixed(1)}</strong>
        </span>
      </div>

      <div className="space-y-3 font-mono text-xs">
        {/* Supporting Evidence List */}
        <div>
          <span className="text-[10px] uppercase text-emerald-400 font-semibold tracking-wider block mb-1.5">
            PRIMARY SUPPORTING EVIDENCE
          </span>
          {hasEvidence ? (
            <ul className="space-y-1">
              {evidence.map((item, idx) => (
                <li key={idx} className="flex items-start space-x-1.5 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-tight">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 text-[11px] italic">
              Awaiting persistent degradation signal window...
            </p>
          )}
        </div>

        {/* Counter Evidence List */}
        {hasCounter && (
          <div className="pt-2 border-t border-[#1a2130]">
            <span className="text-[10px] uppercase text-amber-400 font-semibold tracking-wider block mb-1.5">
              COUNTER EVIDENCE / ATTENUATION
            </span>
            <ul className="space-y-1">
              {counterEvidence.map((item, idx) => (
                <li key={idx} className="flex items-start space-x-1.5 text-slate-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span className="leading-tight">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Attribution footer */}
      <div className="mt-2.5 pt-1.5 border-t border-[#171c28] text-[9px] font-mono text-slate-500 flex justify-between">
        <span>ENGINE: DETERMINISTIC TDI + ML RESIDUALS</span>
        <span>NO PSEUDO-WEAR HARDCODING</span>
      </div>
    </div>
  );
};

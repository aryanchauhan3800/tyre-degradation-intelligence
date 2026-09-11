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
    <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between shadow-sm text-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2.5">
        <div className="flex items-center space-x-1.5">
          <HelpCircle className="w-4 h-4 text-red-600" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-900 uppercase">
            {getHeading()}
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 font-medium">
          TDI: <strong className="text-red-600 font-bold">{(typeof finalTdi === 'number' && !isNaN(finalTdi) ? finalTdi : 0).toFixed(1)}</strong>
        </span>
      </div>

      <div className="space-y-3 font-mono text-xs">
        {/* Supporting Evidence List / Assessment */}
        <div>
          <span className="text-[10px] uppercase text-emerald-600 font-bold tracking-wider block mb-1.5">
            {hasEvidence ? 'PRIMARY SUPPORTING EVIDENCE' : 'ASSESSMENT'}
          </span>
          {hasEvidence ? (
            <ul className="space-y-1">
              {evidence.map((item, idx) => (
                <li key={idx} className="flex items-start space-x-1.5 text-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-tight">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center space-x-1.5 text-slate-500 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>No significant degradation evidence detected.</span>
            </div>
          )}
        </div>

        {/* Counter Evidence List */}
        {hasCounter && (
          <div className="pt-2 border-t border-slate-200">
            <span className="text-[10px] uppercase text-amber-600 font-bold tracking-wider block mb-1.5">
              COUNTER EVIDENCE / ATTENUATION
            </span>
            <ul className="space-y-1">
              {counterEvidence.map((item, idx) => (
                <li key={idx} className="flex items-start space-x-1.5 text-slate-700">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span className="leading-tight">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Attribution footer */}
      <div className="mt-2.5 pt-1.5 border-t border-slate-200 text-[9px] font-mono text-slate-400 flex justify-between font-medium">
        <span>ENGINE: DETERMINISTIC TDI + ML RESIDUALS</span>
        <span>NO PSEUDO-WEAR HARDCODING</span>
      </div>
    </div>
  );
};

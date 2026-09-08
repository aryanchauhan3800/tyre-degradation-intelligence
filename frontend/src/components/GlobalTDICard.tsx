/**
 * TYRETRACE — Global TDI Intelligence Card
 * Displays the primary fused Tyre Degradation Index with three-way physics vs AI breakdown.
 */

import React from 'react';
import type { TDIStateResponse, TDIState, TDITrend } from '../types/telemetry';
import { TrendingUp, TrendingDown, Minus, ShieldCheck, Activity, Brain, Atom } from 'lucide-react';

interface GlobalTDICardProps {
  tdiData: TDIStateResponse | null;
}

export const GlobalTDICard: React.FC<GlobalTDICardProps> = ({ tdiData }) => {
  const finalTdi = tdiData ? Math.round(tdiData.final_tdi * 10) / 10 : 0;
  const physicsTdi = tdiData ? Math.round(tdiData.physics_tdi * 10) / 10 : 0;
  const aiTdi = tdiData ? Math.round(tdiData.ai_tdi * 10) / 10 : 0;
  const confidencePct = tdiData ? Math.round(tdiData.confidence * 100) : 0;
  const reliabilityPct = tdiData ? Math.round(tdiData.model_reliability * 100) : 0;
  const state = tdiData?.state ?? 'NOMINAL';
  const trend = tdiData?.trend ?? 'STABLE';

  const getStateBadge = (st: TDIState) => {
    switch (st) {
      case 'NOMINAL':
        return {
          label: 'NOMINAL GRIP',
          color: 'text-emerald-400 bg-emerald-950/50 border-emerald-500/40',
        };
      case 'MILD_DEGRADATION':
        return {
          label: 'MILD DEGRADATION',
          color: 'text-lime-400 bg-lime-950/50 border-lime-500/40',
        };
      case 'MODERATE_DEGRADATION':
        return {
          label: 'MODERATE DEGRADATION',
          color: 'text-amber-400 bg-amber-950/50 border-amber-500/40',
        };
      case 'HIGH_DEGRADATION':
        return {
          label: 'HIGH DEGRADATION',
          color: 'text-orange-400 bg-orange-950/50 border-orange-500/40',
        };
      case 'SEVERE_DEGRADATION':
        return {
          label: 'CRITICAL WEAR CLIFF',
          color: 'text-rose-400 bg-rose-950/50 border-rose-500/40',
        };
      default:
        return {
          label: 'NOMINAL',
          color: 'text-slate-400 bg-slate-900 border-slate-700',
        };
    }
  };

  const getTrendIcon = (tr: TDITrend) => {
    switch (tr) {
      case 'RISING':
        return <TrendingUp className="w-4 h-4 text-rose-400 inline ml-1" />;
      case 'FALLING':
        return <TrendingDown className="w-4 h-4 text-emerald-400 inline ml-1" />;
      default:
        return <Minus className="w-4 h-4 text-slate-400 inline ml-1" />;
    }
  };

  const badge = getStateBadge(state);

  return (
    <div className="bg-[#0e1118] border border-[#202738] rounded-lg p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
      {/* Background Subtle Accent Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-[#1b2233] pb-2">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            Global TDI Intelligence
          </span>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider font-semibold ${badge.color}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Central Large TDI Hero Display */}
      <div className="my-3 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono text-slate-500 tracking-wider block">
            FUSED DEGRADATION INDEX
          </span>
          <div className="flex items-baseline space-x-2">
            <span className="text-5xl font-black font-mono text-slate-100 tracking-tight tabular-nums">
              {(typeof finalTdi === 'number' && !isNaN(finalTdi) ? finalTdi : 0).toFixed(1)}
            </span>
            <span className="text-xs font-mono text-slate-400">/ 100</span>
          </div>

          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs font-mono font-bold text-slate-300">
              {trend}
            </span>
            {getTrendIcon(trend)}
          </div>
        </div>

        {/* Confidence & Reliability Stats */}
        <div className="text-right space-y-2">
          <div>
            <span className="text-[10px] font-mono text-slate-500 block uppercase">
              CONFIDENCE
            </span>
            <span className="text-lg font-bold font-mono text-cyan-400 tabular-nums">
              {confidencePct}%
            </span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-500 block uppercase">
              MODEL RELIABILITY
            </span>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {reliabilityPct}%
            </span>
          </div>
        </div>
      </div>

      {/* Tri-Split Provenance Cards */}
      <div className="grid grid-cols-3 gap-2 text-center font-mono pt-2 border-t border-[#1b2233]">
        {/* Physics Twin */}
        <div className="bg-[#121622] p-2 rounded border border-[#1e2639]">
          <div className="flex items-center justify-center space-x-1 text-slate-400 mb-0.5">
            <Atom className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] uppercase">Physics</span>
          </div>
          <span className="text-base font-bold text-cyan-300 tabular-nums">
            {(typeof physicsTdi === 'number' && !isNaN(physicsTdi) ? physicsTdi : 0).toFixed(1)}
          </span>
          <span className="text-[9px] text-slate-500 block mt-0.5">Deterministic</span>
        </div>

        {/* AI Temporal Baseline */}
        <div className="bg-[#121622] p-2 rounded border border-[#1e2639]">
          <div className="flex items-center justify-center space-x-1 text-slate-400 mb-0.5">
            <Brain className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] uppercase">AI Model</span>
          </div>
          <span className="text-base font-bold text-amber-300 tabular-nums">
            {(typeof aiTdi === 'number' && !isNaN(aiTdi) ? aiTdi : 0).toFixed(1)}
          </span>
          <span className="text-[9px] text-slate-500 block mt-0.5">Random Forest</span>
        </div>

        {/* Fused Intelligence */}
        <div className="bg-[#151a29] p-2 rounded border border-cyan-500/30 shadow-[0_0_8px_rgba(0,240,255,0.1)]">
          <div className="flex items-center justify-center space-x-1 text-cyan-300 mb-0.5">
            <ShieldCheck className="w-3 h-3 text-purple-400" />
            <span className="text-[10px] uppercase font-semibold">Fusion</span>
          </div>
          <span className="text-base font-black text-white tabular-nums">
            {(typeof finalTdi === 'number' && !isNaN(finalTdi) ? finalTdi : 0).toFixed(1)}
          </span>
          <span className="text-[9px] text-purple-300 block mt-0.5">α=0.60 Phys</span>
        </div>
      </div>
    </div>
  );
};

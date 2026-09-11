/**
 * TYRETRACE — Visualization Mode Selector Panel (Left Column)
 *
 * Implements buttons:
 * [ NORMAL ]
 * [ THERMAL ] ← ACTIVE by default
 * [ WEAR ]
 * [ LOAD ]
 * [ GRIP ]
 * [ PREDICTION ]
 */

import React from 'react';
import type { TyreVisMode } from '../../types/telemetry';
import { Eye, Flame, Activity, ArrowDownCircle, Gauge, Sparkles, ChevronDown } from 'lucide-react';

interface VisualizationModesPanelProps {
  activeMode: TyreVisMode;
  onSelectMode: (mode: TyreVisMode) => void;
}

export const VisualizationModesPanel: React.FC<VisualizationModesPanelProps> = ({
  activeMode,
  onSelectMode,
}) => {
  const modes: { id: TyreVisMode; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'NORMAL',
      label: 'NORMAL',
      desc: 'Realistic black racing slick tyre',
      icon: <Eye className="w-4 h-4 text-slate-700" />,
    },
    {
      id: 'THERMAL',
      label: 'THERMAL',
      desc: 'Live 8-step CFD thermal heatmap on tread',
      icon: <Flame className="w-4 h-4 text-red-500" />,
    },
    {
      id: 'WEAR',
      label: 'WEAR',
      desc: 'Tread depth wear & degradation',
      icon: <Activity className="w-4 h-4 text-rose-500" />,
    },
    {
      id: 'LOAD',
      label: 'LOAD',
      desc: 'Contact patch & vertical force',
      icon: <ArrowDownCircle className="w-4 h-4 text-sky-500" />,
    },
    {
      id: 'GRIP',
      label: 'GRIP',
      desc: 'Available grip & slip ratio dynamics',
      icon: <Gauge className="w-4 h-4 text-emerald-500" />,
    },
    {
      id: 'PREDICTION',
      label: 'PREDICTION',
      desc: 'Future degradation & optimal pit window',
      icon: <Sparkles className="w-4 h-4 text-purple-500" />,
    },
  ];

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex flex-col gap-1.5 shadow-xs font-sans">
      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
        <span className="text-[11px] text-slate-800 uppercase font-bold tracking-wider">
          VISUALIZATION MODE
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </div>

      <div className="flex flex-col gap-1">
        {modes.map((m) => {
          const isActive = activeMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onSelectMode(m.id)}
              className={`flex items-center justify-between px-2 py-1 rounded-lg border text-[11px] transition-all cursor-pointer text-left ${
                isActive
                  ? 'bg-red-50/40 border-red-500 text-red-600 shadow-2xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200/70 text-slate-700'
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="flex-shrink-0">{m.icon}</div>
                <div>
                  <div className={`font-semibold tracking-wide text-[11px] ${isActive ? 'text-red-600 font-bold' : 'text-slate-800'}`}>
                    {m.label}
                  </div>
                  <div className="text-[9px] text-slate-500 leading-tight">{m.desc}</div>
                </div>
              </div>
              {isActive && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-600 text-white font-bold tracking-wider shadow-2xs">
                  ACTIVE
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

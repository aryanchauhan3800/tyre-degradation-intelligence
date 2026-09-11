import React from 'react';
import type { TyreWearState } from '../../types/telemetry';
import { Activity } from 'lucide-react';

interface DegradationPanelProps {
  wear: TyreWearState;
}

export const DegradationPanel: React.FC<DegradationPanelProps> = ({ wear }) => {
  const healthPct = wear.health_pct !== undefined ? wear.health_pct : 57.5;
  const wearRate = wear.wear_rate_mm_lap !== undefined ? wear.wear_rate_mm_lap : 0.012;
  const remainingLaps = wear.remaining_laps !== undefined ? wear.remaining_laps : 18;

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex flex-col justify-between shadow-xs font-sans h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900 tracking-wider">
          <Activity className="w-3.5 h-3.5 text-red-600" />
          <span>DEGRADATION</span>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-50/60 border border-red-200/80 text-red-600 font-semibold">
          PHYSICS-INFORMED
        </span>
      </div>

      {/* 3 Metric Columns */}
      <div className="grid grid-cols-3 gap-1.5 my-0.5">
        {/* WEAR RATE */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">WEAR RATE</span>
          <div className="flex flex-col mt-0.5">
            <span className="text-sm font-bold text-slate-900 leading-tight">
              {wearRate} mm/lap
            </span>
            <span className="text-[10px] font-medium text-red-600 mt-0.5">↑ +6%</span>
          </div>
        </div>

        {/* PREDICTED LIFE */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">PREDICTED LIFE</span>
          <div className="flex flex-col mt-0.5">
            <span className="text-sm font-bold text-slate-900 leading-tight">
              {remainingLaps} LAPS
            </span>
            {/* Segmented blue battery status bars matching reference */}
            <div className="flex items-center space-x-1 mt-1.5">
              <span className="w-3.5 h-1.5 rounded-full bg-blue-600" />
              <span className="w-3.5 h-1.5 rounded-full bg-blue-600" />
              <span className="w-3.5 h-1.5 rounded-full bg-blue-600" />
              <span className="w-3.5 h-1.5 rounded-full bg-blue-300" />
            </div>
            <span className="text-[9px] text-slate-400 mt-1">({healthPct}%)</span>
          </div>
        </div>

        {/* OPTIMAL PIT WINDOW */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">OPTIMAL PIT WINDOW</span>
          <div className="flex flex-col mt-0.5">
            <span className="text-sm font-bold text-slate-900 leading-tight">
              LAP 24 – 28
            </span>
            {/* Graphic Slider Track matching screenshot */}
            <div className="relative w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-2 border border-slate-300/80 flex items-center">
              {/* Highlighted Pit Zone in red */}
              <div
                className="absolute h-full bg-red-600"
                style={{ left: '38%', width: '24%' }}
              />
            </div>
            {/* Red slider marker dot */}
            <div className="relative w-full h-3 -mt-2.5 flex items-center">
              <div
                className="absolute w-2 h-2 bg-red-600 border border-white rounded-full shadow-xs"
                style={{ left: '48%' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import type { TyreThermalState } from '../../types/telemetry';
import { Flame } from 'lucide-react';

interface ThermalPanelProps {
  thermal: TyreThermalState;
}

export const ThermalPanel: React.FC<ThermalPanelProps> = ({ thermal }) => {
  const innerC = typeof thermal.inner_c === 'number' ? thermal.inner_c : 0;
  const centerC = typeof thermal.center_c === 'number' ? thermal.center_c : 0;
  const outerC = typeof thermal.outer_c === 'number' ? thermal.outer_c : 0;
  const isLive = innerC > 0 || centerC > 0 || outerC > 0;

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex flex-col justify-between shadow-xs font-sans h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900 tracking-wider">
          <Flame className="w-3.5 h-3.5 text-red-600" />
          <span>THERMAL DISTRIBUTION</span>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-50/60 border border-red-200/80 text-red-600 font-semibold">
          3-ZONE TREAD
        </span>
      </div>

      {/* 3 Zones Grid matching screenshot */}
      <div className="grid grid-cols-3 gap-1.5 my-0.5">
        {/* INNER */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-semibold tracking-wider">INNER</span>
          
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-sm font-bold text-slate-900">{innerC}°C</span>
            <span className="text-[10px] font-medium text-red-600">{isLive ? '↑ +1.8°C' : '+0.0°C'}</span>
          </div>

          {/* 3D Ribbed Red Tyre Tread Section */}
          <div className="mt-1.5 h-6 w-full flex items-center justify-center">
            <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id="innerRedGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="60%" stopColor="#b91c1c" />
                  <stop offset="100%" stopColor="#7f1d1d" />
                </linearGradient>
              </defs>
              {/* Arched base */}
              <path
                d="M 5,22 Q 50,4 95,22 L 95,26 Q 50,10 5,26 Z"
                fill="url(#innerRedGrad)"
              />
              {/* Longitudinal Tread Ribs */}
              <line x1="20" y1="18" x2="20" y2="24" stroke="#450a0a" strokeWidth="1.5" />
              <line x1="35" y1="13" x2="35" y2="21" stroke="#450a0a" strokeWidth="1.5" />
              <line x1="50" y1="10" x2="50" y2="19" stroke="#450a0a" strokeWidth="1.5" />
              <line x1="65" y1="13" x2="65" y2="21" stroke="#450a0a" strokeWidth="1.5" />
              <line x1="80" y1="18" x2="80" y2="24" stroke="#450a0a" strokeWidth="1.5" />
              {/* Subtle top highlight sheen */}
              <path d="M 10,20 Q 50,6 90,20" stroke="#fca5a5" strokeWidth="1.2" fill="none" opacity="0.75" />
            </svg>
          </div>
        </div>

        {/* CENTER */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-semibold tracking-wider">CENTER</span>
          
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-sm font-bold text-slate-900">{centerC}°C</span>
            <span className="text-[10px] font-medium text-red-600">{isLive ? '↑ +1.9°C' : '+0.0°C'}</span>
          </div>

          {/* 3D Ribbed Green Tyre Tread Section */}
          <div className="mt-1.5 h-6 w-full flex items-center justify-center">
            <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id="centerGreenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="60%" stopColor="#15803d" />
                  <stop offset="100%" stopColor="#14532d" />
                </linearGradient>
              </defs>
              {/* Arched base */}
              <path
                d="M 5,22 Q 50,4 95,22 L 95,26 Q 50,10 5,26 Z"
                fill="url(#centerGreenGrad)"
              />
              {/* Longitudinal Tread Ribs */}
              <line x1="20" y1="18" x2="20" y2="24" stroke="#052e16" strokeWidth="1.5" />
              <line x1="35" y1="13" x2="35" y2="21" stroke="#052e16" strokeWidth="1.5" />
              <line x1="50" y1="10" x2="50" y2="19" stroke="#052e16" strokeWidth="1.5" />
              <line x1="65" y1="13" x2="65" y2="21" stroke="#052e16" strokeWidth="1.5" />
              <line x1="80" y1="18" x2="80" y2="24" stroke="#052e16" strokeWidth="1.5" />
              {/* Subtle top highlight sheen */}
              <path d="M 10,20 Q 50,6 90,20" stroke="#86efac" strokeWidth="1.2" fill="none" opacity="0.75" />
            </svg>
          </div>
        </div>

        {/* OUTER */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-semibold tracking-wider">OUTER</span>
          
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-sm font-bold text-slate-900">{outerC}°C</span>
            <span className="text-[10px] font-medium text-red-600">{isLive ? '↑ +1.5°C' : '+0.0°C'}</span>
          </div>

          {/* 3D Ribbed Blue Tyre Tread Section */}
          <div className="mt-1.5 h-6 w-full flex items-center justify-center">
            <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id="outerBlueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="60%" stopColor="#1d4ed8" />
                  <stop offset="100%" stopColor="#1e3a8a" />
                </linearGradient>
              </defs>
              {/* Arched base */}
              <path
                d="M 5,22 Q 50,4 95,22 L 95,26 Q 50,10 5,26 Z"
                fill="url(#outerBlueGrad)"
              />
              {/* Longitudinal Tread Ribs */}
              <line x1="20" y1="18" x2="20" y2="24" stroke="#0f172a" strokeWidth="1.5" />
              <line x1="35" y1="13" x2="35" y2="21" stroke="#0f172a" strokeWidth="1.5" />
              <line x1="50" y1="10" x2="50" y2="19" stroke="#0f172a" strokeWidth="1.5" />
              <line x1="65" y1="13" x2="65" y2="21" stroke="#0f172a" strokeWidth="1.5" />
              <line x1="80" y1="18" x2="80" y2="24" stroke="#0f172a" strokeWidth="1.5" />
              {/* Subtle top highlight sheen */}
              <path d="M 10,20 Q 50,6 90,20" stroke="#93c5fd" strokeWidth="1.2" fill="none" opacity="0.75" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

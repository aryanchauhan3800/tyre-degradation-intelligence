/**
 * TYRETRACE — F1 Tyre Position Selector
 *
 * Visual layout:
 * TYRE POSITION
 *         FRONT
 *       FL     FR
 *       RL     RR
 * Selected tyre: FRONT RIGHT
 */

import React from 'react';
import type { TyreCorner } from '../../types/telemetry';

import { ChevronDown } from 'lucide-react';

interface TyrePositionSelectorProps {
  selectedCorner: TyreCorner;
  onSelectCorner: (corner: TyreCorner) => void;
  temperatures?: Record<TyreCorner, number>;
  healths?: Record<TyreCorner, number>;
}

export const TyrePositionSelector: React.FC<TyrePositionSelectorProps> = ({
  selectedCorner,
  onSelectCorner,
  temperatures,
  healths,
}) => {
  const corners: { id: TyreCorner; label: string; x: string; y: string }[] = [
    { id: 'FL', label: 'FL', x: 'left-3', y: 'top-3' },
    { id: 'FR', label: 'FR', x: 'right-3', y: 'top-3' },
    { id: 'RL', label: 'RL', x: 'left-3', y: 'bottom-3' },
    { id: 'RR', label: 'RR', x: 'right-3', y: 'bottom-3' },
  ];

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex flex-col items-center shadow-xs font-sans">
      <div className="text-[10px] font-bold tracking-wider uppercase mb-0.5 flex items-center justify-between w-full border-b border-slate-100 pb-1.5">
        <div className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
          <span className="text-slate-900 tracking-wider">TYRE POSITION</span>
        </div>
        <span className="text-[9px] font-semibold text-red-600 border border-red-200/80 bg-red-50/50 px-2 py-0.5 rounded-full">
          CHASSIS 2D
        </span>
      </div>

      <div className="relative w-40 h-44 my-0.5 flex items-center justify-center">
        {/* SVG F1 Wireframe Chassis Silhouette matching screenshot */}
        <svg
          viewBox="0 0 160 180"
          className="absolute inset-0 w-full h-full pointer-events-none stroke-slate-300 fill-none"
        >
          {/* Top FRONT Label */}
          <text x="80" y="14" textAnchor="middle" className="fill-slate-400 font-sans text-[8px] font-bold tracking-widest">
            - FRONT -
          </text>

          {/* Front wing line */}
          <line x1="38" y1="22" x2="122" y2="22" strokeWidth="1.5" stroke="#cbd5e1" />

          {/* Aerodynamic Nosecone */}
          <path d="M 80,22 L 72,56 L 88,56 Z" strokeWidth="1.2" stroke="#94a3b8" fill="#f8fafc" />

          {/* Cockpit & Sidepods */}
          <path
            d="M 72,56 L 62,75 L 62,118 L 74,136 L 86,136 L 98,118 L 98,75 L 88,56 Z"
            strokeWidth="1.2"
            stroke="#94a3b8"
            fill="#ffffff"
          />

          {/* Driver Helmet circle */}
          <circle cx="80" cy="88" r="5" strokeWidth="1" stroke="#ef4444" fill="#fee2e2" />

          {/* Front Wishbone Suspension */}
          <line x1="36" y1="40" x2="68" y2="60" strokeWidth="1.2" stroke="#cbd5e1" />
          <line x1="124" y1="40" x2="92" y2="60" strokeWidth="1.2" stroke="#cbd5e1" />

          {/* Rear Wishbone Suspension */}
          <line x1="36" y1="140" x2="66" y2="120" strokeWidth="1.2" stroke="#cbd5e1" />
          <line x1="124" y1="140" x2="94" y2="120" strokeWidth="1.2" stroke="#cbd5e1" />

          {/* Rear wing */}
          <line x1="34" y1="156" x2="126" y2="156" strokeWidth="2" stroke="#94a3b8" />

          {/* Bottom REAR Label */}
          <text x="80" y="172" textAnchor="middle" className="fill-slate-400 font-sans text-[8px] font-bold tracking-widest">
            - REAR -
          </text>
        </svg>

        {/* 4 Interactive Corner Buttons */}
        {corners.map((c) => {
          const isSelected = selectedCorner === c.id;
          const temp = temperatures && temperatures[c.id] !== undefined ? temperatures[c.id] : 0;
          const health = healths && healths[c.id] !== undefined ? healths[c.id] : 0;

          return (
            <button
              key={c.id}
              onClick={() => onSelectCorner(c.id)}
              className={`absolute ${c.x} ${c.y} w-12 py-1 rounded-lg border text-center transition-all cursor-pointer z-10 flex flex-col items-center justify-center ${
                isSelected
                  ? 'bg-red-50/40 border-red-500 border-2 shadow-2xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-2xs'
              }`}
            >
              <span className={`text-xs font-bold ${isSelected ? 'text-red-600' : 'text-slate-800'}`}>
                {c.label}
              </span>
              <span className="text-[9px] text-slate-500 leading-none mt-0.5 font-medium">{temp}°C</span>
              <span className={`text-[9px] font-semibold leading-none mt-0.5 ${health > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{health}%</span>
            </button>
          );
        })}
      </div>

      {/* Dropdown Selector matching mockup */}
      <div className="relative w-full mt-1">
        <select
          value={selectedCorner}
          onChange={(e) => onSelectCorner(e.target.value as TyreCorner)}
          aria-label="Select tyre corner"
          className="w-full appearance-none bg-white border border-slate-200/90 rounded-lg px-2.5 py-1 pr-8 text-[10px] text-slate-700 font-medium cursor-pointer shadow-2xs focus:outline-none focus:border-red-500"
        >
          <option value="FL">Selected tyre: FRONT LEFT</option>
          <option value="FR">Selected tyre: FRONT RIGHT</option>
          <option value="RL">Selected tyre: REAR LEFT</option>
          <option value="RR">Selected tyre: REAR RIGHT</option>
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
};

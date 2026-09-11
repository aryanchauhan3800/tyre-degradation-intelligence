/**
 * TYRETRACE — Top-Down F1 Tyre Position Selector Diagram
 *
 * Provides a crisp, technical SVG/HTML chassis wireframe diagram:
 *              FRONT
 *           [FL]    [FR]
 *             \     /
 *                X
 *             /     \
 *           [RL]    [RR]
 *              REAR
 *
 * Highlights the actively selected corner (FL, FR, RL, RR) with real-time temperature & health badges.
 */

import React from 'react';
import type { TyreCorner } from '../types/telemetry';

interface TyrePositionDiagramProps {
  selectedCorner: TyreCorner;
  onSelectCorner: (corner: TyreCorner) => void;
  temperatures?: Record<TyreCorner, number>;
  healths?: Record<TyreCorner, number>;
}

export const TyrePositionDiagram: React.FC<TyrePositionDiagramProps> = ({
  selectedCorner,
  onSelectCorner,
  temperatures,
  healths,
}) => {
  const corners: { id: TyreCorner; label: string; x: string; y: string }[] = [
    { id: 'FL', label: 'FL', x: 'left-2', y: 'top-2' },
    { id: 'FR', label: 'FR', x: 'right-2', y: 'top-2' },
    { id: 'RL', label: 'RL', x: 'left-2', y: 'bottom-2' },
    { id: 'RR', label: 'RR', x: 'right-2', y: 'bottom-2' },
  ];

  return (
    <div className="bg-[#0b0e14]/90 border border-[#1e2638] rounded-xl p-3 flex flex-col items-center shadow-lg backdrop-blur-md">
      <div className="text-[10px] font-mono text-slate-400 font-semibold tracking-widest uppercase mb-1 flex items-center space-x-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
        <span>TYRE POSITION SELECTOR</span>
      </div>

      <div className="relative w-44 h-48 my-1 flex items-center justify-center">
        {/* SVG F1 Wireframe Chassis Silhouette */}
        <svg
          viewBox="0 0 160 180"
          className="absolute inset-0 w-full h-full pointer-events-none stroke-[#1e283d] fill-none"
        >
          {/* Front wing line */}
          <line x1="32" y1="20" x2="128" y2="20" strokeWidth="1.5" strokeDasharray="3 3" />
          <text x="80" y="14" textAnchor="middle" className="fill-slate-500 font-mono text-[8px] tracking-wider">FRONT ▲</text>

          {/* Nosecone */}
          <path d="M 80,22 L 68,55 L 92,55 Z" strokeWidth="1.2" stroke="#25324a" fill="#121722" />

          {/* Central Monocoque Cockpit */}
          <rect x="62" y="55" width="36" height="60" rx="4" strokeWidth="1.2" stroke="#25324a" fill="#0e131d" />
          {/* Driver Helmet circle */}
          <circle cx="80" cy="80" r="6" strokeWidth="1" stroke="#38bdf8" fill="#162032" />

          {/* Suspension Wishbone X-Truss (connecting to the 4 corners) */}
          {/* FL to center */}
          <line x1="38" y1="38" x2="65" y2="60" strokeWidth="1.5" stroke="#26344d" />
          {/* FR to center */}
          <line x1="122" y1="38" x2="95" y2="60" strokeWidth="1.5" stroke="#26344d" />
          {/* RL to center */}
          <line x1="38" y1="142" x2="65" y2="110" strokeWidth="1.5" stroke="#26344d" />
          {/* RR to center */}
          <line x1="122" y1="142" x2="95" y2="110" strokeWidth="1.5" stroke="#26344d" />

          {/* Rear wing & diffuser */}
          <line x1="28" y1="162" x2="132" y2="162" strokeWidth="2" stroke="#2b3a54" />
          <text x="80" y="174" textAnchor="middle" className="fill-slate-600 font-mono text-[7px] tracking-wider">▼ REAR</text>
        </svg>

        {/* 4 Interactive Corner Buttons */}
        {corners.map((c) => {
          const isSelected = selectedCorner === c.id;
          const temp = temperatures ? temperatures[c.id] : null;
          const health = healths ? healths[c.id] : null;

          return (
            <button
              key={c.id}
              onClick={() => onSelectCorner(c.id)}
              className={`absolute ${c.x} ${c.y} w-14 py-1.5 rounded-lg border font-mono text-center transition-all cursor-pointer z-10 flex flex-col items-center justify-center ${
                isSelected
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-[0_0_14px_rgba(0,240,255,0.4)] scale-105'
                  : 'bg-[#121622] hover:bg-[#1b2336] border-[#222e44] text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-1">
                <span className="font-bold text-xs">{c.label}</span>
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
              </div>
              {temp !== null && temp !== undefined && (
                <span className="text-[9px] text-slate-400 leading-none mt-0.5">{temp}°C</span>
              )}
              {health !== null && health !== undefined && (
                <span className="text-[8px] text-emerald-400 leading-none">{health}%</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="text-[10px] font-mono text-cyan-300 font-semibold mt-1">
        INSPECTING: {selectedCorner === 'FL' ? 'FRONT LEFT' : selectedCorner === 'FR' ? 'FRONT RIGHT' : selectedCorner === 'RL' ? 'REAR LEFT' : 'REAR RIGHT'}
      </div>
    </div>
  );
};

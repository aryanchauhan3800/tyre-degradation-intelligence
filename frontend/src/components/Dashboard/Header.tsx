/**
 * TYRETRACE — Header Component
 *
 * Visual layout:
 * TYRETRACE
 * PHYSICS-INFORMED TYRE DEGRADATION INTELLIGENCE
 * LIVE • LAP XX • RACE MODE
 */

import React from 'react';
import type { ConnectionStatus, DataMode } from '../../types/telemetry';
import { Activity, Radio, RefreshCw } from 'lucide-react';

interface HeaderProps {
  lap: number;
  dataMode: DataMode;
  connectionStatus: ConnectionStatus;
  onToggleDataMode?: (mode: DataMode) => void;
  onReconnect?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  lap,
  dataMode,
  connectionStatus,
  onToggleDataMode,
  onReconnect,
}) => {
  return (
    <header className="w-full bg-[#07090e]/95 border-b border-[#1b2333] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md backdrop-blur-md">
      {/* Title Branding */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.3)]">
            <Activity className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-sm font-black font-mono tracking-widest text-white uppercase flex items-center space-x-2">
              <span>TYRETRACE</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#131926] border border-[#243048] font-bold text-cyan-400">
                F1 TWIN
              </span>
            </h1>
            <p className="text-[10px] font-mono text-slate-400 tracking-wider">
              PHYSICS-INFORMED TYRE DEGRADATION INTELLIGENCE
            </p>
          </div>
        </div>
      </div>

      {/* Live Badge, Lap, Race Mode Indicators */}
      <div className="flex items-center space-x-2 font-mono">
        {/* LIVE indicator */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#0b1018] border border-emerald-500/40 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold tracking-wider">LIVE</span>
        </div>

        {/* LAP XX */}
        <div className="px-3 py-1 rounded bg-[#0d121c] border border-[#202c42] text-xs text-slate-200">
          <span className="text-slate-500 font-bold mr-1">LAP</span>
          <strong className="text-white font-bold text-sm">{lap || 27}</strong>
        </div>

        {/* RACE MODE badge / toggle */}
        <button
          onClick={() =>
            onToggleDataMode?.(dataMode === 'REPLAY' ? 'DEMO_SIMULATION' : 'REPLAY')
          }
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 text-xs font-bold tracking-wider cursor-pointer hover:bg-cyan-900/40 transition-colors shadow-[0_0_8px_rgba(0,240,255,0.2)]"
          title="Toggle between Telemetry Replay and Live Simulation"
        >
          <Radio className="w-3.5 h-3.5" />
          <span>{dataMode === 'DEMO_SIMULATION' ? 'SIMULATION MODE' : 'RACE MODE'}</span>
        </button>

        {/* Connection status */}
        {connectionStatus !== 'CONNECTED' && (
          <button
            onClick={onReconnect}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-amber-950/50 border border-amber-500/40 text-amber-300 text-[10px] cursor-pointer hover:bg-amber-900/50"
            title="Reconnect WebSocket"
          >
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>RECONNECT</span>
          </button>
        )}
      </div>
    </header>
  );
};

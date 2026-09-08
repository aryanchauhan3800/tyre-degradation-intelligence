/**
 * TYRETRACE — Top Bar Component
 * Motorsport telemetry header displaying live session context, telemetry indicators, and mode controls.
 */

import React from 'react';
import type { ConnectionStatus, DataMode, SessionResponse, VehicleState } from '../types/telemetry';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface TopBarProps {
  session: SessionResponse | null;
  vehicleState: VehicleState | null;
  connectionStatus: ConnectionStatus;
  dataMode: DataMode;
  onToggleDataMode: (mode: DataMode) => void;
  onReconnect: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  session,
  vehicleState,
  connectionStatus,
  dataMode,
  onToggleDataMode,
  onReconnect,
}) => {
  const speedKph = vehicleState ? Math.round(vehicleState.speed_kph) : 0;
  const gear = vehicleState?.gear !== undefined && vehicleState?.gear !== null ? (vehicleState.gear === 0 ? 'N' : vehicleState.gear) : 'N';
  const throttle = vehicleState ? Math.round(vehicleState.throttle_pct ?? vehicleState.throttle ?? 0) : 0;
  const brake = vehicleState ? Math.round(vehicleState.brake_pct ?? vehicleState.brake ?? 0) : 0;


  const currentLap = session?.current_lap ?? (vehicleState ? 1 : 0);
  const totalLaps = session?.total_laps ?? 35;
  const driver = session?.driver ?? 'VER';
  const eventName = session?.event ? `${session.event}` : '2023 Italian GP';
  const sessionType = session?.session === 'R' ? 'Race' : session?.session ?? 'Race';

  return (
    <header className="w-full bg-[#0a0c10] border-b border-[#1f2637] px-4 py-2.5 flex flex-wrap items-center justify-between select-none">
      {/* Brand & Mission Identifier */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center font-black text-black font-mono text-sm tracking-tighter shadow-[0_0_12px_rgba(0,240,255,0.4)]">
            TT
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-base font-bold tracking-wider text-slate-100">
                TYRETRACE
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                PHASE 9
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 tracking-tight leading-none">
              PHYSICS-INFORMED TYRE INTELLIGENCE
            </p>
          </div>
        </div>

        {/* Vertical Divider */}
        <div className="h-7 w-px bg-[#1f2637]" />

        {/* Session Metadata */}
        <div className="flex items-center space-x-4 text-xs font-mono">
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Session</span>
            <span className="text-slate-200 font-medium">
              {session?.year ?? 2023} {eventName} — {sessionType}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Driver</span>
            <span className="text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-500/30">
              {driver}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Lap</span>
            <span className="text-slate-200 font-bold">
              {currentLap} <span className="text-slate-500">/ {totalLaps}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Center Live Telemetry Strip */}
      <div className="flex items-center space-x-4 text-xs font-mono bg-[#11141c] px-3 py-1.5 rounded border border-[#1f2738]">
        {/* Speed */}
        <div className="flex items-baseline space-x-1">
          <span className="text-2xl font-black text-cyan-400 tabular-nums">
            {speedKph}
          </span>
          <span className="text-[10px] text-slate-400">km/h</span>
        </div>

        {/* Gear */}
        <div className="flex items-baseline space-x-1 pl-2 border-l border-[#222a3d]">
          <span className="text-[10px] text-slate-500">GEAR</span>
          <span className="text-lg font-bold text-slate-100 tabular-nums">
            {gear}
          </span>
        </div>

        {/* Throttle / Brake Gauges */}
        <div className="flex items-center space-x-2 pl-2 border-l border-[#222a3d]">
          <div>
            <div className="flex justify-between text-[9px] text-emerald-400">
              <span>THR</span>
              <span>{throttle}%</span>
            </div>
            <div className="w-16 h-1.5 bg-[#1b2230] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, throttle))}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[9px] text-rose-400">
              <span>BRK</span>
              <span>{brake}%</span>
            </div>
            <div className="w-14 h-1.5 bg-[#1b2230] rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, brake))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Controls: Mode Toggle & Live Connection */}
      <div className="flex items-center space-x-3">
        {/* Data Mode Switcher */}
        <div className="flex items-center bg-[#10131a] rounded p-0.5 border border-[#202738] text-xs font-mono">
          <button
            onClick={() => onToggleDataMode('REPLAY')}
            className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
              dataMode === 'REPLAY'
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            REAL REPLAY
          </button>
          <button
            onClick={() => onToggleDataMode('DEMO_SIMULATION')}
            className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
              dataMode === 'DEMO_SIMULATION'
                ? 'bg-amber-950 text-amber-300 font-bold border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            DEMO SIMULATION
          </button>
        </div>

        {/* Live WebSocket Status */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#11141c] border border-[#1f2738] text-xs font-mono">
          {connectionStatus === 'CONNECTED' ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-400 font-bold">LIVE</span>
            </>
          ) : connectionStatus === 'CONNECTING' ? (
            <>
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-400">CONNECTING</span>
            </>
          ) : (
            <button
              onClick={onReconnect}
              className="flex items-center space-x-1 text-rose-400 hover:text-rose-300 cursor-pointer"
              title="Click to reconnect"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>DISCONNECTED</span>
              <RefreshCw className="w-3 h-3 ml-1" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

/**
 * TYRETRACE — Live Race Telemetry HUD Strip
 *
 * Visualizes high-frequency vehicle dynamics:
 * - Speed (km/h) with analog/digital styling
 * - RPM Tachometer Bar & Current Gear
 * - Dual Throttle / Brake Force Split Meters
 * - Lap, Sector, and Session Timing
 * - DRS Status & Track/Air Ambient Environment
 */

import React from 'react';
import type { TelemetryFrame, VehicleState } from '../types/telemetry';
import { Gauge, Zap, Wind, Thermometer } from 'lucide-react';

interface RaceTelemetryHUDProps {
  telemetry: TelemetryFrame | null;
  drsActive: boolean;
  lap: number;
}

export const RaceTelemetryHUD: React.FC<RaceTelemetryHUDProps> = ({
  telemetry,
  drsActive,
  lap,
}) => {
  const veh: VehicleState | null = telemetry?.vehicle || telemetry?.vehicle_state || null;

  const speedKph = Math.round(veh?.speed_kph ?? 0);
  const rpm = Math.round(veh?.rpm ?? 0);
  const gear = veh?.gear !== null && veh?.gear !== undefined ? (veh.gear === 0 ? 'N' : veh.gear) : 8;
  const throttlePct = Math.round(veh?.throttle_pct ?? (veh?.throttle ? veh.throttle * 100 : 0));
  const brakePct = Math.round(veh?.brake_pct ?? (veh?.brake ? veh.brake * 100 : 0));
  const steer = Math.round(veh?.steer ?? 0);

  const trackTemp = Math.round(telemetry?.environment?.track_temp_c ?? 38);
  const airTemp = Math.round(telemetry?.environment?.air_temp_c ?? 26);

  // Tachometer max 12500 RPM for hybrid turbo V6 F1 engine
  const rpmPct = Math.min(100, Math.round((rpm / 12500) * 100));
  const isRedline = rpm > 11800;

  return (
    <div className="bg-[#0a0d13]/95 border border-[#1b2333] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-slate-200 shadow-xl backdrop-blur-md">
      {/* 1. SPEED & GEAR */}
      <div className="flex items-center space-x-4">
        {/* Gear Box */}
        <div className="flex flex-col items-center justify-center w-12 h-12 bg-[#121722] border border-[#243047] rounded-lg shadow-inner">
          <span className="text-[9px] font-mono text-slate-400 uppercase">GEAR</span>
          <span className="text-2xl font-black font-mono text-white leading-none">{gear}</span>
        </div>

        {/* Speedometer */}
        <div className="flex flex-col">
          <div className="flex items-baseline space-x-1.5">
            <span className="text-3xl font-black font-mono tracking-tight text-white">{speedKph}</span>
            <span className="text-xs font-mono text-slate-400 font-semibold">KM/H</span>
          </div>
          <span className="text-[10px] font-mono text-cyan-400">
            {Math.round(speedKph / 3.6)} M/S
          </span>
        </div>
      </div>

      {/* 2. RPM TACHOMETER */}
      <div className="flex-1 min-w-[200px] max-w-[340px] flex flex-col justify-center">
        <div className="flex justify-between items-center text-[10px] font-mono mb-1">
          <div className="flex items-center space-x-1.5">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">ENGINE RPM</span>
          </div>
          <span className={`font-bold ${isRedline ? 'text-rose-400 animate-pulse' : 'text-slate-300'}`}>
            {rpm > 0 ? rpm.toLocaleString() : '10,850'} RPM
          </span>
        </div>

        {/* Tachometer Bar */}
        <div className="w-full h-2.5 rounded-full bg-[#141924] border border-[#222d40] overflow-hidden flex">
          <div
            className={`h-full transition-all duration-100 ${
              isRedline
                ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]'
                : rpmPct > 80
                ? 'bg-amber-400'
                : 'bg-gradient-to-r from-cyan-500 to-emerald-400'
            }`}
            style={{ width: `${rpm > 0 ? rpmPct : 82}%` }}
          />
        </div>
      </div>

      {/* 3. THROTTLE & BRAKE METERS */}
      <div className="flex items-center space-x-4 min-w-[170px]">
        {/* Throttle */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between text-[10px] font-mono mb-1">
            <span className="text-slate-400">THR</span>
            <span className="text-emerald-400 font-bold">{throttlePct}%</span>
          </div>
          <div className="w-full h-2 rounded bg-[#141924] border border-[#222d40] overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-75"
              style={{ width: `${throttlePct}%` }}
            />
          </div>
        </div>

        {/* Brake */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between text-[10px] font-mono mb-1">
            <span className="text-slate-400">BRK</span>
            <span className="text-rose-400 font-bold">{brakePct}%</span>
          </div>
          <div className="w-full h-2 rounded bg-[#141924] border border-[#222d40] overflow-hidden">
            <div
              className="h-full bg-rose-500 transition-all duration-75"
              style={{ width: `${brakePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4. DRS & STEERING */}
      <div className="flex items-center space-x-3">
        {/* DRS Badge */}
        <div
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold tracking-wider ${
            drsActive
              ? 'bg-emerald-950/70 border-emerald-500/70 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse'
              : 'bg-[#121622] border-[#222c3f] text-slate-500'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{drsActive ? 'DRS OPEN' : 'DRS AVAIL'}</span>
        </div>

        {/* Steer & Lap */}
        <div className="flex flex-col text-right">
          <span className="text-xs font-mono font-bold text-white">LAP {lap}</span>
          <span className="text-[10px] font-mono text-cyan-400">STEER {steer > 0 ? `+${steer}°` : `${steer}°`}</span>
        </div>
      </div>

      {/* 5. AMBIENT ENVIRONMENT */}
      <div className="hidden xl:flex items-center space-x-3 border-l border-[#1d2638] pl-4 text-[11px] font-mono text-slate-400">
        <div className="flex items-center space-x-1">
          <Thermometer className="w-3.5 h-3.5 text-amber-400" />
          <span>TRACK: {trackTemp}°C</span>
        </div>
        <div className="flex items-center space-x-1">
          <Wind className="w-3.5 h-3.5 text-cyan-400" />
          <span>AIR: {airTemp}°C</span>
        </div>
      </div>
    </div>
  );
};

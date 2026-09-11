/**
 * TYRETRACE — Comprehensive Tyre Engineering Status & Analytics Inspector
 *
 * Implements:
 * 1. TYRE STATUS (Temperature, Pressure, Vertical Load, Slip Angle, Slip Ratio, Grip, Wear, Health)
 * 2. THERMAL DISTRIBUTION (INNER, CENTER, OUTER + Live thermal bar)
 * 3. DEGRADATION (Health Bar, Wear Rate mm/lap, Remaining competitive laps)
 * 4. PREDICTION (Predicted degradation trajectory, Remaining competitive laps, Recommended Pit Window)
 */

import React from 'react';
import type {
  CalculatedTyreCornerState,
  DataMode,
  TyreCorner,
  TyreVisMode,
} from '../types/telemetry';
import { getThermalColorCss } from '../utils/tyreCalculations';
import {
  Flame,
  Activity,
  Sparkles,
} from 'lucide-react';

interface SelectedTyreInspectorProps {
  state: CalculatedTyreCornerState;
  visMode: TyreVisMode;
  onSelectVisMode: (mode: TyreVisMode) => void;
  dataMode: DataMode;
  onSelectTyre: (corner: TyreCorner) => void;
}

export const SelectedTyreInspector: React.FC<SelectedTyreInspectorProps> = ({
  state,
  visMode,
  onSelectVisMode,
  dataMode,
}) => {
  const { corner, label, compound, age_laps, pressure_psi, thermal, wear, load, grip, prediction } = state;

  return (
    <div className="bg-[#0a0d13]/95 border border-[#1c2436] rounded-xl p-4 flex flex-col gap-4 text-slate-200 shadow-xl backdrop-blur-md">
      {/* 1. Header with Active Corner & Compound */}
      <div className="flex items-center justify-between border-b border-[#1a2335] pb-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 font-mono font-bold text-base shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            {corner}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold font-mono tracking-wider text-white">{label}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#161c28] border border-[#27344c] font-mono text-cyan-300">
                {compound}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 flex items-center space-x-2 mt-0.5">
              <span>AGE: {age_laps} LAPS</span>
              <span>•</span>
              <span className="text-slate-300 font-semibold">MODE: {dataMode}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-[#121622] border border-[#222c3f] text-slate-400">
            F1 TELEMETRY
          </span>
        </div>
      </div>

      {/* 2. Primary Telemetry Matrix: TYRE STATUS */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-mono text-slate-400 tracking-wider uppercase font-semibold">
          TYRE STATUS
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Temperature */}
          <div className="bg-[#10141d] border border-[#1e273a] rounded-lg p-2.5 flex flex-col">
            <span className="text-[10px] font-mono text-slate-400">TEMPERATURE</span>
            <span
              className="text-lg font-bold font-mono mt-0.5"
              style={{ color: getThermalColorCss(thermal.surface_c) }}
            >
              {thermal.surface_c}°C
            </span>
          </div>

          {/* Pressure */}
          <div className="bg-[#10141d] border border-[#1e273a] rounded-lg p-2.5 flex flex-col">
            <span className="text-[10px] font-mono text-slate-400">PRESSURE</span>
            <span className="text-lg font-bold font-mono text-white mt-0.5">
              {pressure_psi} PSI
            </span>
          </div>

          {/* Vertical Load */}
          <div className="bg-[#10141d] border border-[#1e273a] rounded-lg p-2.5 flex flex-col">
            <span className="text-[10px] font-mono text-slate-400">VERTICAL LOAD</span>
            <span className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
              {load.vertical_load_kn} kN
            </span>
          </div>

          {/* Slip Angle */}
          <div className="bg-[#10141d] border border-[#1e273a] rounded-lg p-2.5 flex flex-col">
            <span className="text-[10px] font-mono text-slate-400">SLIP ANGLE</span>
            <span className="text-lg font-bold font-mono text-yellow-400 mt-0.5">
              {grip.slip_angle_deg}°
            </span>
          </div>

          {/* Slip Ratio */}
          <div className="bg-[#10141d] border border-[#1e273a] rounded-lg p-2.5 flex flex-col">
            <span className="text-[10px] font-mono text-slate-400">SLIP RATIO</span>
            <span className="text-lg font-bold font-mono text-yellow-400 mt-0.5">
              {grip.slip_ratio_pct}%
            </span>
          </div>

          {/* Grip */}
          <div className="bg-[#10141d] border border-[#1e273a] rounded-lg p-2.5 flex flex-col">
            <span className="text-[10px] font-mono text-slate-400">GRIP</span>
            <span className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {grip.available_grip_pct}%
            </span>
          </div>

          {/* Wear */}
          <div className="bg-[#10141d] border border-[#1e273a] rounded-lg p-2.5 flex flex-col">
            <span className="text-[10px] font-mono text-slate-400">WEAR</span>
            <span className="text-lg font-bold font-mono text-rose-400 mt-0.5">
              {wear.wear_pct}%
            </span>
          </div>

          {/* Health */}
          <div className="bg-[#10141d] border border-[#1e273a] rounded-lg p-2.5 flex flex-col">
            <span className="text-[10px] font-mono text-slate-400">HEALTH</span>
            <span className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {wear.health_pct}%
            </span>
          </div>
        </div>
      </div>

      {/* 3. THERMAL DISTRIBUTION */}
      <div className="bg-[#0e121a] border border-[#1e273a] rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs font-mono font-semibold text-slate-200">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>THERMAL DISTRIBUTION</span>
          </div>
          <button
            onClick={() => onSelectVisMode('THERMAL')}
            className={`text-[9px] font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ${
              visMode === 'THERMAL' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            VIEW 3D
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center mt-0.5">
          <div className="bg-[#141924] p-2 rounded border border-[#222c40]">
            <span className="text-[10px] font-mono text-slate-400 block">INNER</span>
            <span
              className="text-base font-bold font-mono"
              style={{ color: getThermalColorCss(thermal.inner_c) }}
            >
              {thermal.inner_c}°C
            </span>
          </div>
          <div className="bg-[#141924] p-2 rounded border border-[#222c40]">
            <span className="text-[10px] font-mono text-slate-400 block">CENTER</span>
            <span
              className="text-base font-bold font-mono"
              style={{ color: getThermalColorCss(thermal.center_c) }}
            >
              {thermal.center_c}°C
            </span>
          </div>
          <div className="bg-[#141924] p-2 rounded border border-[#222c40]">
            <span className="text-[10px] font-mono text-slate-400 block">OUTER</span>
            <span
              className="text-base font-bold font-mono"
              style={{ color: getThermalColorCss(thermal.outer_c) }}
            >
              {thermal.outer_c}°C
            </span>
          </div>
        </div>

        {/* Live Thermal Gradient Bar */}
        <div className="w-full h-2 rounded-full overflow-hidden bg-gradient-to-r from-blue-600 via-cyan-400 via-emerald-400 via-yellow-400 via-orange-500 to-rose-600 shadow-inner mt-1" />
        <div className="flex justify-between text-[9px] font-mono text-slate-500">
          <span>60°C COLD</span>
          <span>85-100°C OPTIMAL</span>
          <span>125°C BLISTER</span>
        </div>
      </div>

      {/* 4. DEGRADATION */}
      <div className="bg-[#0e121a] border border-[#1e273a] rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs font-mono font-semibold text-slate-200">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>DEGRADATION</span>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400">
            {wear.health_pct}% HEALTH
          </span>
        </div>

        {/* Health Gauge Bar */}
        <div className="w-full h-3 rounded-full bg-[#141924] border border-[#222d40] overflow-hidden flex">
          <div
            className={`h-full transition-all duration-300 ${
              wear.health_pct > 70
                ? 'bg-emerald-500'
                : wear.health_pct > 40
                ? 'bg-amber-500'
                : 'bg-rose-500'
            }`}
            style={{ width: `${wear.health_pct}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-1">
          <div className="bg-[#141924] p-2 rounded border border-[#222c40]">
            <span className="text-[10px] text-slate-400 block">WEAR RATE:</span>
            <span className="text-sm font-bold text-white">{wear.wear_rate_mm_lap} mm/lap</span>
          </div>
          <div className="bg-[#141924] p-2 rounded border border-[#222c40]">
            <span className="text-[10px] text-slate-400 block">REMAINING:</span>
            <span className="text-sm font-bold text-cyan-300">{wear.remaining_laps} laps</span>
          </div>
        </div>
      </div>

      {/* 5. PREDICTION */}
      <div className="bg-[#0e121a] border border-[#1e273a] rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs font-mono font-semibold text-slate-200">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>PREDICTION</span>
          </div>
          <span className="text-[10px] font-mono text-purple-300 bg-purple-950/40 border border-purple-500/30 px-2 py-0.5 rounded">
            PIT WINDOW: LAP {prediction.pit_window_lap_start}–{prediction.pit_window_lap_end}
          </span>
        </div>

        {/* Predicted Degradation Bar */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>PREDICTED DEGRADATION:</span>
            <span className="text-purple-300 font-bold">{prediction.predicted_degradation_pct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#141924] border border-[#222d40] overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${prediction.predicted_degradation_pct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-1">
          <div className="bg-[#141924] p-2 rounded border border-[#222c40]">
            <span className="text-[10px] text-slate-400 block">COMPETITIVE LAPS:</span>
            <span className="text-sm font-bold text-emerald-400">{prediction.remaining_competitive_laps}</span>
          </div>
          <div className="bg-[#141924] p-2 rounded border border-[#222c40]">
            <span className="text-[10px] text-slate-400 block">ESTIMATED PIT:</span>
            <span className="text-sm font-bold text-white">Lap {prediction.pit_window_lap_start}</span>
          </div>
        </div>
      </div>

      {/* 6. Philosophy Statement */}
      <div className="bg-[#07090e] border border-[#182030] p-2.5 rounded-lg text-center">
        <p className="text-[11px] font-mono text-slate-400 italic">
          "Don't just monitor the tyre. Understand why it is degrading and predict what happens next."
        </p>
      </div>
    </div>
  );
};

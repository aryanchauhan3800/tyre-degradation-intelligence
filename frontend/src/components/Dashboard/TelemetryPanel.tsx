/**
 * TYRETRACE — Tyre Telemetry Panel (Right Column)
 *
 * Sleek, elegant recreation matching the reference screenshot:
 * - Refined sans-serif typography (no heavy clunky mono fonts)
 * - Delicate, fine-lined SVG icons (stroke ~1.7px)
 * - Compact, sleek metric cards with balanced padding
 * - Slim progress bar in Tyre Health (8px height)
 * - Ultra-sleek thermal map with fine sipes, thin spectrum ribbon, and clean tick labels
 */

import React, { useState } from 'react';
import type { CalculatedTyreCornerState } from '../../types/telemetry';
import { Gauge, Layers, Flame } from 'lucide-react';

interface TelemetryPanelProps {
  state: CalculatedTyreCornerState;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ state }) => {
  const { corner, label, compound, pressure_psi, thermal, wear, load, grip } = state;
  const [activeTab, setActiveTab] = useState<'TREAD' | 'SECTION'>('TREAD');

  const surfaceTemp = typeof thermal.surface_c === 'number' ? thermal.surface_c : 0;
  const innerTemp = typeof thermal.inner_c === 'number' ? thermal.inner_c : 0;
  const centerTemp = typeof thermal.center_c === 'number' ? thermal.center_c : 0;
  const outerTemp = typeof thermal.outer_c === 'number' ? thermal.outer_c : 0;
  const vertLoad = typeof load.vertical_load_kn === 'number' ? load.vertical_load_kn : 0;
  const slipAngle = typeof grip.slip_angle_deg === 'number' ? grip.slip_angle_deg : 0;
  const slipRatio = typeof grip.slip_ratio_pct === 'number' ? grip.slip_ratio_pct : 0;
  const gripPct = typeof grip.available_grip_pct === 'number' ? grip.available_grip_pct : 0;
  const wearPct = typeof wear.wear_pct === 'number' ? wear.wear_pct : 0;
  const healthPct = typeof wear.health_pct === 'number' ? wear.health_pct : 0;
  const pressurePsi = typeof pressure_psi === 'number' ? pressure_psi : 0;

  const isLive = surfaceTemp > 0 || healthPct > 0 || vertLoad > 0;

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-2.5 shadow-sm flex flex-col justify-between gap-2 text-slate-800 select-none font-sans h-full">
      {/* HEADER */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#F1F5F9]">
        <div className="flex items-center space-x-2">
          {/* Solid Red FR Badge */}
          <div className="w-7 h-7 rounded-lg bg-[#E10600] flex items-center justify-center text-white font-bold text-[12px] shadow-2xs tracking-wide">
            {corner || 'FR'}
          </div>

          <div>
            <h2 className="text-[11px] font-bold tracking-wide text-[#0F172A] leading-tight">
              TYRE TELEMETRY
            </h2>
            <div className="text-[10px] flex items-center space-x-1 mt-0.5 text-slate-500">
              <span className="text-[#E10600] font-semibold uppercase">{label || 'FRONT RIGHT'}</span>
              <span className="text-slate-300 font-bold">•</span>
              <span className="text-slate-600 font-medium underline decoration-slate-300 underline-offset-2">
                {compound || 'C3 (MEDIUM)'}
              </span>
            </div>
          </div>
        </div>

        {/* Live F1 Sensors Pill */}
        <div className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold shadow-2xs ${
          isLive ? 'bg-[#F0FDF4] border-[#DCFCE7] text-slate-700' : 'bg-slate-100 border-slate-200 text-slate-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-[#22C55E] animate-pulse' : 'bg-slate-400'}`} />
          <span className="tracking-wide">{isLive ? 'LIVE F1 SENSORS' : 'OFFLINE'}</span>
        </div>
      </div>

      {/* 10-ITEM METRIC TILES GRID (2 Columns x 5 Rows) */}
      <div className="grid grid-cols-2 gap-1.5">
        {/* 1. SURFACE TEMP */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#EF4444] shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-[#EF4444] fill-none stroke-[1.7] stroke-linecap-round stroke-linejoin-round">
              <path d="M12 2v9" />
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              SURFACE TEMP
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#10B981] leading-tight">
                {surfaceTemp}°C
              </span>
              <span className="text-[10px] font-medium text-[#EF4444]">
                {isLive ? '↑ +2.1°C' : '+0.0°C'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. PRESSURE */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#1E293B] shrink-0">
            <Gauge className="w-4 h-4 stroke-[1.7]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              PRESSURE
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#0F172A] leading-tight">
                {pressurePsi} PSI
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                - 0.0°
              </span>
            </div>
          </div>
        </div>

        {/* 3. INNER TEMP */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#F97316] shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-[#F97316] fill-none stroke-[1.7] stroke-linecap-round stroke-linejoin-round">
              <path d="M12 2v9" />
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              INNER TEMP
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#EA580C] leading-tight">
                {innerTemp}°C
              </span>
              <span className="text-[10px] font-medium text-[#EF4444]">
                {isLive ? '↑ +1.8°C' : '+0.0°C'}
              </span>
            </div>
          </div>
        </div>

        {/* 4. CENTER TEMP */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#10B981] shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-[#10B981] fill-none stroke-[1.7] stroke-linecap-round stroke-linejoin-round">
              <circle cx="12" cy="7" r="2.8" />
              <circle cx="6" cy="17" r="2.3" />
              <circle cx="18" cy="17" r="2.3" />
              <path d="M10 9.5 L7.5 15 M14 9.5 L16.5 15" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              CENTER TEMP
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#10B981] leading-tight">
                {centerTemp}°C
              </span>
              <span className="text-[10px] font-medium text-[#EF4444]">
                {isLive ? '↑ +1.9°C' : '+0.0°C'}
              </span>
            </div>
          </div>
        </div>

        {/* 5. OUTER TEMP */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#2563EB] shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-[#2563EB] fill-none stroke-[1.7] stroke-linecap-round stroke-linejoin-round">
              <path d="M12 2v9" />
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              OUTER TEMP
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#10B981] leading-tight">
                {outerTemp}°C
              </span>
              <span className="text-[10px] font-medium text-[#EF4444]">
                {isLive ? '↑ +1.5°C' : '+0.0°C'}
              </span>
            </div>
          </div>
        </div>

        {/* 6. VERTICAL LOAD */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#2563EB] shrink-0">
            <Layers className="w-4 h-4 stroke-[1.7]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              VERTICAL LOAD
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#2563EB] leading-tight">
                {vertLoad} kN
              </span>
              <span className="text-[10px] font-medium text-[#2563EB]">
                {isLive ? '↓ -0.2' : '0.0'}
              </span>
            </div>
          </div>
        </div>

        {/* 7. SLIP ANGLE */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#334155] shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-[#334155] fill-none stroke-[1.7] stroke-linecap-round stroke-linejoin-round">
              <path d="M5 19L12 4l7 15" />
              <path d="M8.5 13a5 5 0 0 0 7 0" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              SLIP ANGLE
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#EA580C] leading-tight">
                {slipAngle}°
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                - 0.0°
              </span>
            </div>
          </div>
        </div>

        {/* 8. SLIP RATIO */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#334155] shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-[#334155] fill-none stroke-[1.7] stroke-linecap-round stroke-linejoin-round">
              <circle cx="12" cy="12" r="7" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              SLIP RATIO
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#EA580C] leading-tight">
                {slipRatio}%
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                - 0.0%
              </span>
            </div>
          </div>
        </div>

        {/* 9. GRIP */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#334155] shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-[#334155] fill-none stroke-[1.7] stroke-linecap-round stroke-linejoin-round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 3v5.8M12 15.2v5.8M3 12h5.8M15.2 12h5.8" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              GRIP
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#10B981] leading-tight">
                {gripPct}%
              </span>
              <span className="text-[10px] font-medium text-[#10B981]">
                {isLive ? '↑ +2%' : '0%'}
              </span>
            </div>
          </div>
        </div>

        {/* 10. WEAR */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-1.5 flex items-center space-x-2 shadow-2xs">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#334155] shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-[#334155] fill-none stroke-[1.7] stroke-linecap-round stroke-linejoin-round">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 3.8v16.4M12 3v18M15 3.8v16.4" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              WEAR
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[15px] font-bold text-[#DC2626] leading-tight">
                {wearPct}%
              </span>
              <span className="text-[10px] font-medium text-[#EF4444]">
                {isLive ? '↑ +0.8%' : '0%'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* TYRE HEALTH TILE (Sleek, matching screenshot) */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-2 flex flex-col gap-1 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            TYRE HEALTH
          </span>
          <div className="flex flex-col items-end leading-none">
            <span className={`text-[18px] font-bold ${isLive ? 'text-[#10B981]' : 'text-slate-400'}`}>
              {healthPct}%
            </span>
            <span className={`text-[10px] font-bold tracking-wider mt-0.5 ${isLive ? 'text-[#10B981]' : 'text-slate-400'}`}>
              {isLive ? 'STABLE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* Slim Horizontal Progress Bar: Sleek 8px height */}
        <div className="w-full h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] via-[#EAB308] to-[#FBBF24] transition-all duration-300"
            style={{ width: `${healthPct}%` }}
          />
        </div>
      </div>

      {/* THERMAL MAP — Clean Premium Horizontal Thermal Spectrum */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[#F1F5F9]">
        {/* Header: Flame Icon + Modern Condensed Title + Segmented Control */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Flame className="w-4 h-4 shrink-0 text-[#E10600] stroke-[1.8]" />
            <span className="text-[11px] font-bold text-[#0F172A] tracking-wider uppercase font-sans">
              THERMAL MAP
            </span>
          </div>

          <div className="flex items-center bg-[#F1F5F9] p-[2px] rounded-lg border border-[#E2E8F0]">
            <button
              onClick={() => setActiveTab('TREAD')}
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide transition-all cursor-pointer ${
                activeTab === 'TREAD'
                  ? 'bg-[#E10600] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-transparent'
              }`}
            >
              TREAD SURFACE
            </button>
            <button
              onClick={() => setActiveTab('SECTION')}
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide transition-all cursor-pointer ${
                activeTab === 'SECTION'
                  ? 'bg-[#E10600] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-transparent'
              }`}
            >
              SECTION
            </button>
          </div>
        </div>

        {/* Large Horizontal Rectangular Thermal Spectrum (48-58px height) */}
        <div className="relative w-full h-[52px] rounded-[11px] border border-[#0F172A]/85 overflow-hidden shadow-2xs">
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to right, #0012e0 0%, #0048ff 9%, #0090ff 18%, #00c8e0 28%, #00d68f 38%, #4ade80 48%, #eab308 58%, #f97316 70%, #ef4444 82%, #dc2626 92%, #b91c1c 100%)',
            }}
          />
          {/* Subtle Vertical Divisions / Engineering Scale Ticks */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 600 52">
            {Array.from({ length: 14 }).map((_, i) => (
              <line
                key={i}
                x1={((i + 1) * 600) / 15}
                y1={0}
                x2={((i + 1) * 600) / 15}
                y2={52}
                stroke="rgba(255, 255, 255, 0.14)"
                strokeWidth="0.75"
              />
            ))}
          </svg>
        </div>

        {/* Thin Horizontal Reference Gradient Scale */}
        <div
          className="w-full h-[3.5px] rounded-full overflow-hidden"
          style={{
            background: 'linear-gradient(to right, #0012e0 0%, #0048ff 9%, #0090ff 18%, #00c8e0 28%, #00d68f 38%, #4ade80 48%, #eab308 58%, #f97316 70%, #ef4444 82%, #dc2626 92%, #b91c1c 100%)',
          }}
        />

        {/* Evenly Distributed Temperature Labels */}
        <div className="flex justify-between text-[11px] font-medium text-[#475569] -mt-1 select-none font-sans px-0.5">
          <span>60°C</span>
          <span>70°C</span>
          <span>80°C</span>
          <span>90°C</span>
          <span>100°C</span>
          <span>110°C</span>
          <span>120°C</span>
        </div>
      </div>
    </div>
  );
};

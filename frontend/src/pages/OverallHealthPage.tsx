import React, { useState } from 'react';
import { 
  Activity, 
  Clock, 
  Layers, 
  Compass, 
  Cpu
} from 'lucide-react';
import type { FourWheelTyres, TelemetryFrame, TyreCorner } from '../types/telemetry';
import type { ActiveNavTab } from '../components/Navbar';
import { calculateTyreCornerState } from '../utils/tyreCalculations';

interface OverallHealthPageProps {
  telemetry: TelemetryFrame | null;
  fourWheelStates: FourWheelTyres | null;
  selectedTyre: TyreCorner;
  onSelectTyre: (corner: TyreCorner) => void;
  onNavigate: (tab: ActiveNavTab, subTab?: '3d' | 'image') => void;
  lap: number;
}

export const OverallHealthPage: React.FC<OverallHealthPageProps> = ({
  telemetry,
  fourWheelStates,
  selectedTyre,
  onSelectTyre,
  onNavigate,
  lap,
}) => {
  const [selectedCompound, setSelectedCompound] = useState<'C1' | 'C3' | 'C5'>('C3');

  const corners: Array<{ corner: TyreCorner; name: string; position: string }> = [
    { corner: 'FL', name: 'Front Left', position: 'Chassis Leading Edge' },
    { corner: 'FR', name: 'Front Right', position: 'Critical Cornering Load' },
    { corner: 'RL', name: 'Rear Left', position: 'Traction Drive Axle' },
    { corner: 'RR', name: 'Rear Right', position: 'Traction & Lateral Scrub' },
  ];

  const getTyreData = (corner: TyreCorner) => {
    const s = calculateTyreCornerState(corner, telemetry, null, null, fourWheelStates, 'REPLAY');
    const surface = Math.round(s.thermal.surface_c);
    const inner = Math.round(s.thermal.inner_c);
    const outer = Math.round(s.thermal.outer_c);
    const wear = s.wear.wear_pct;
    const health = s.wear.health_pct;
    const grip = Math.round(s.grip.available_grip_pct);
    const remainingLaps = Math.max(1, Math.round((75 - wear) / 1.8));

    return { surface, inner, outer, wear, health, grip, remainingLaps };
  };

  const frData = getTyreData('FR');
  const flData = getTyreData('FL');
  const rrData = getTyreData('RR');
  const rlData = getTyreData('RL');

  const frontAvgWear = (frData.wear + flData.wear) / 2;
  const rearAvgWear = (rrData.wear + rlData.wear) / 2;
  const wearDifferential = (frontAvgWear - rearAvgWear).toFixed(1);
  const isFrontBiased = frontAvgWear > rearAvgWear;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-slate-50 text-slate-900 pb-16">
      {/* Top Banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-black font-mono tracking-wider text-slate-900 uppercase">
                  OVERALL FLEET HEALTH & DEGRADATION INTELLIGENCE
                </h1>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  4 CORNERS SYNCHRONIZED
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Multi-corner compound cliff modeling, front-to-rear chassis balance, and pit window optimizer
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
              <span className="text-slate-500 font-bold mr-1">ESTIMATED CLIFF:</span>
              <strong className="text-red-600 font-bold">LAP {lap + frData.remainingLaps}</strong>
            </div>
            <button
              onClick={() => onNavigate('phyengine', '3d')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer transition-colors shadow-2xs"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Open 3D Twin</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* 4-Corner Live Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black font-mono tracking-wider text-slate-900 uppercase">
              CHASSIS CORNERS TELEMETRY MATRIX
            </h2>
            <span className="text-xs font-mono text-slate-500">
              CLICK ANY CORNER TO SELECT AS HERO TYRE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {corners.map(({ corner, name, position }) => {
              const data = getTyreData(corner);
              const isSelected = selectedTyre === corner;

              return (
                <div
                  key={corner}
                  onClick={() => onSelectTyre(corner)}
                  className={`bg-white rounded-2xl p-5 border cursor-pointer transition-all duration-200 shadow-xs relative ${
                    isSelected
                      ? 'border-2 border-red-500 ring-2 ring-red-100 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-mono font-bold tracking-wider">
                      SELECTED
                    </span>
                  )}

                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded font-mono text-xs font-black ${
                        isSelected ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {corner}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-900">{name}</span>
                    </div>
                    <span className={`text-xs font-mono font-bold ${
                      data.health > 60 ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {data.health.toFixed(1)}%
                    </span>
                  </div>

                  <p className="text-[10px] font-mono text-slate-400 mb-3">{position}</p>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-baseline">
                      <span className="text-slate-500">Surface Temp:</span>
                      <strong className="text-base font-black text-slate-900">{data.surface}°C</strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Inner / Outer:</span>
                      <span className="text-slate-700 font-bold">{data.inner}°C / {data.outer}°C</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Wear Level:</span>
                      <strong className="text-red-600 font-bold">{data.wear.toFixed(1)}%</strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Available Grip:</span>
                      <strong className="text-slate-900 font-bold">{data.grip}%</strong>
                    </div>

                    <div className="flex justify-between pt-1 border-t border-slate-100">
                      <span className="text-slate-500">Cliff Horizon:</span>
                      <strong className="text-amber-600 font-bold">~{data.remainingLaps} Laps</strong>
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mt-3">
                    <div 
                      className={`h-2 rounded-full ${
                        data.wear > 50 ? 'bg-red-500' : data.wear > 35 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${data.health}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chassis Balance & Wear Differential */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card 1: Balance Differential */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 mb-4">
              <Compass className="w-5 h-5 text-red-600" />
              <h3 className="font-mono font-black text-sm text-slate-900 uppercase">
                TYRE WEAR BALANCE & HANDLING BIAS
              </h3>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-4 text-center font-mono">
              <span className="text-xs text-slate-500 block mb-1">AXLE WEAR DIFFERENTIAL</span>
              <div className="text-3xl font-black text-slate-900">
                {wearDifferential}% <span className="text-xs font-normal text-slate-500">DELTA</span>
              </div>
              <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isFrontBiased ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {isFrontBiased ? 'FRONT-LIMITED (UNDERSTEER TENDENCY)' : 'REAR-LIMITED (OVERSTEER TENDENCY)'}
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Front Axle Mean Wear:</span>
                <strong className="text-slate-900 font-bold">{frontAvgWear.toFixed(1)}%</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Rear Axle Mean Wear:</span>
                <strong className="text-slate-900 font-bold">{rearAvgWear.toFixed(1)}%</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Right-Side Lateral Load:</span>
                <strong className="text-red-600 font-bold">+5.4% (Suzuka Clockwise Bias)</strong>
              </div>
            </div>
          </div>

          {/* Card 2: Pit Stop Strategy Calculator */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 mb-4">
              <Clock className="w-5 h-5 text-emerald-600" />
              <h3 className="font-mono font-black text-sm text-slate-900 uppercase">
                PIT STOP WINDOW CALCULATOR
              </h3>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-600 font-bold">RECOMMENDED PIT WINDOW:</span>
                  <span className="text-emerald-700 font-black text-sm">LAPS 31 – 34</span>
                </div>
                <p className="text-[11px] text-emerald-800 font-sans">
                  Optimal crossover to C1 Hard tyre before front-right graining cliff induces +1.4s/lap delta.
                </p>
              </div>

              <div className="flex justify-between pt-1">
                <span className="text-slate-500">Pit Lane Loss Delta:</span>
                <strong className="text-slate-900 font-bold">21.4 Seconds</strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Undercut Advantage:</span>
                <strong className="text-emerald-600 font-bold">-1.8s per lap</strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Target Out-Lap Position:</span>
                <strong className="text-slate-900 font-bold">P3 Clean Air Window</strong>
              </div>
            </div>
          </div>

          {/* Card 3: Compound Crossover Matrix */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 mb-4">
              <Layers className="w-5 h-5 text-blue-600" />
              <h3 className="font-mono font-black text-sm text-slate-900 uppercase">
                COMPOUND LIFETIME CROSSOVER
              </h3>
            </div>

            <div className="flex items-center space-x-2 mb-4">
              {(['C1', 'C3', 'C5'] as const).map((comp) => (
                <button
                  key={comp}
                  onClick={() => setSelectedCompound(comp)}
                  className={`flex-1 py-1.5 text-xs font-mono font-bold rounded-lg border cursor-pointer transition-all ${
                    selectedCompound === comp
                      ? 'bg-red-600 text-white border-red-600 shadow-xs'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {comp === 'C1' ? 'C1 HARD' : comp === 'C3' ? 'C3 MED' : 'C5 SOFT'}
                </button>
              ))}
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Compound Rating:</span>
                <strong className="text-slate-900 font-bold">
                  {selectedCompound === 'C1' ? 'Pirelli White Hard' : selectedCompound === 'C3' ? 'Pirelli Yellow Medium' : 'Pirelli Red Soft'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Operating Temperature:</span>
                <strong className="text-slate-900 font-bold">
                  {selectedCompound === 'C1' ? '110°C – 130°C' : selectedCompound === 'C3' ? '95°C – 115°C' : '85°C – 105°C'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Max Sustainable Stint:</span>
                <strong className="text-slate-900 font-bold">
                  {selectedCompound === 'C1' ? '38 Laps' : selectedCompound === 'C3' ? '28 Laps' : '16 Laps'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pace Delta vs C3:</span>
                <strong className="text-slate-900 font-bold">
                  {selectedCompound === 'C1' ? '+0.65s / lap' : selectedCompound === 'C3' ? 'Baseline (0.00s)' : '-0.78s / lap'}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

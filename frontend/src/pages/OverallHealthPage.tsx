import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Activity,
  Compass,
  Clock,
  Layers,
  Thermometer,
  Gauge,
  Wind,
  Video,
  RotateCcw,
  Zap,
  TrendingDown,
} from 'lucide-react';
import type {
  ConfounderFrame,
  DataMode,
  FourWheelTyres,
  PhysicsTwinOutput,
  SessionResponse,
  TDIStateResponse,
  TelemetryFrame,
  TyreCorner,
  TyreVisMode
} from '../types/telemetry';
import type { ActiveNavTab } from '../components/Navbar';
import { calculateTyreCornerState } from '../utils/tyreCalculations';
import { HealthCarScene, type TyreThermalValues } from '../three/HealthCarScene';

interface OverallHealthPageProps {
  telemetry: TelemetryFrame | null;
  fourWheelStates: FourWheelTyres | null;
  selectedTyre: TyreCorner;
  onSelectTyre: (corner: TyreCorner) => void;
  onNavigate: (tab: ActiveNavTab, subTab?: '3d' | 'image') => void;
  lap: number;
  physics?: PhysicsTwinOutput | null;
  confounders?: ConfounderFrame | null;
  tdi?: TDIStateResponse | null;
  dataMode?: DataMode;
  session?: SessionResponse | null;
}

export const OverallHealthPage: React.FC<OverallHealthPageProps> = ({
  telemetry,
  fourWheelStates,
  selectedTyre,
  onSelectTyre,
  onNavigate: _onNavigate,
  lap,
  physics = null,
  confounders: _confounders = null,
  tdi = null,
  dataMode = 'REPLAY',
  session: _session = null,
}) => {
  // 3D Scene ref & visualization mode
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HealthCarScene | null>(null);
  const [visMode, setVisMode] = useState<TyreVisMode>('NORMAL');
  const [is3DLoaded, setIs3DLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Screen positions of 3D tyres for leader lines
  const [screenPos, setScreenPos] = useState<Record<TyreCorner, { x: number; y: number; visible: boolean }>>({
    FL: { x: 0, y: 0, visible: false },
    FR: { x: 0, y: 0, visible: false },
    RL: { x: 0, y: 0, visible: false },
    RR: { x: 0, y: 0, visible: false },
  });

  // Selected compound tab for comparison
  const [selectedCompound, setSelectedCompound] = useState<'C1' | 'C3' | 'C5'>('C3');

  // Live real-time tick for graph micro-animations
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => (t + 1) % 100), 120);
    return () => clearInterval(timer);
  }, []);

  // Compute live physics states for each corner
  const corners: TyreCorner[] = useMemo(() => ['FL', 'FR', 'RL', 'RR'], []);

  const tyreStates = useMemo(() => {
    const map: Record<TyreCorner, ReturnType<typeof calculateTyreCornerState>> = {} as any;
    corners.forEach((c) => {
      map[c] = calculateTyreCornerState(c, telemetry, physics, tdi, fourWheelStates, dataMode);
    });
    return map;
  }, [corners, telemetry, physics, tdi, fourWheelStates, dataMode]);

  // Derived telemetry metrics
  const activeTyre = tyreStates[selectedTyre] || tyreStates.FR;
  const currentSpeed = telemetry?.vehicle?.speed_kph ?? 287;
  const currentRpm = telemetry?.vehicle?.rpm ?? 8420;
  const brakePct = telemetry?.vehicle?.brake_pct ?? 18;
  const throttlePct = telemetry?.vehicle?.throttle_pct ?? 82;
  const sessionLap = telemetry?.lap ?? lap ?? 16;
  const totalLaps = 67;

  // Axle wear calculation
  const frontAvgWear = (tyreStates.FL.wear.wear_pct + tyreStates.FR.wear.wear_pct) / 2;
  const rearAvgWear = (tyreStates.RL.wear.wear_pct + tyreStates.RR.wear.wear_pct) / 2;
  const wearDifferential = (frontAvgWear - rearAvgWear).toFixed(1);
  const isFrontBiased = frontAvgWear > rearAvgWear;

  // Initialize and bind 3D Scene
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new HealthCarScene(mountRef.current, {
      onTyreSelect: (c) => onSelectTyre(c),
      onScreenPositionsUpdate: (positions) => setScreenPos(positions),
      onLoaded: () => setIs3DLoaded(true),
      onError: (msg) => setLoadError(msg),
    });
    sceneRef.current = scene;

    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, [onSelectTyre]);

  // User interaction tracking for camera zoom (starts in full car overview)
  const [hasUserFocused, setHasUserFocused] = useState(false);

  const handleSelectCorner = (c: TyreCorner) => {
    setHasUserFocused(true);
    onSelectTyre(c);
  };

  // Update scene selection when selectedTyre changes
  useEffect(() => {
    sceneRef.current?.selectTyre(selectedTyre, hasUserFocused);
  }, [selectedTyre, hasUserFocused]);

  // Update scene mode when visMode changes
  useEffect(() => {
    sceneRef.current?.setVisualizationMode(visMode);
  }, [visMode]);

  // Pass live thermal/wear/load/grip data into 3D scene
  useEffect(() => {
    if (!sceneRef.current) return;

    const thermalData: Record<TyreCorner, TyreThermalValues> = {
      FL: {
        inner: tyreStates.FL.thermal.inner_c,
        center: tyreStates.FL.thermal.center_c,
        outer: tyreStates.FL.thermal.outer_c,
        surface: tyreStates.FL.thermal.surface_c,
      },
      FR: {
        inner: tyreStates.FR.thermal.inner_c,
        center: tyreStates.FR.thermal.center_c,
        outer: tyreStates.FR.thermal.outer_c,
        surface: tyreStates.FR.thermal.surface_c,
      },
      RL: {
        inner: tyreStates.RL.thermal.inner_c,
        center: tyreStates.RL.thermal.center_c,
        outer: tyreStates.RL.thermal.outer_c,
        surface: tyreStates.RL.thermal.surface_c,
      },
      RR: {
        inner: tyreStates.RR.thermal.inner_c,
        center: tyreStates.RR.thermal.center_c,
        outer: tyreStates.RR.thermal.outer_c,
        surface: tyreStates.RR.thermal.surface_c,
      },
    };

    const wearData: Record<TyreCorner, number> = {
      FL: tyreStates.FL.wear.wear_pct,
      FR: tyreStates.FR.wear.wear_pct,
      RL: tyreStates.RL.wear.wear_pct,
      RR: tyreStates.RR.wear.wear_pct,
    };

    const loadData: Record<TyreCorner, number> = {
      FL: tyreStates.FL.load.vertical_load_kn,
      FR: tyreStates.FR.load.vertical_load_kn,
      RL: tyreStates.RL.load.vertical_load_kn,
      RR: tyreStates.RR.load.vertical_load_kn,
    };

    const gripData: Record<TyreCorner, number> = {
      FL: tyreStates.FL.grip.available_grip_pct,
      FR: tyreStates.FR.grip.available_grip_pct,
      RL: tyreStates.RL.grip.available_grip_pct,
      RR: tyreStates.RR.grip.available_grip_pct,
    };

    sceneRef.current.setTelemetryData({
      thermal: thermalData,
      wear: wearData,
      load: loadData,
      grip: gripData,
    });
  }, [tyreStates]);

  const getHealthBarColor = (wear: number) => {
    if (wear < 30) return 'bg-emerald-500';
    if (wear < 55) return 'bg-amber-500';
    if (wear < 75) return 'bg-orange-500';
    return 'bg-red-600';
  };

  return (
    <div className="min-h-[calc(100vh-82px)] bg-slate-50 text-slate-900 font-sans pb-16 selection:bg-red-600 selection:text-white">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* TOP RACE STATUS STRIP (Directly below Global Navbar)        */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 shadow-2xs sticky top-[82px] z-30">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
          {/* Left: Command Center Title & Live Beacon */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping inline-block" />
              <span className="text-[11px] font-mono font-black tracking-widest text-red-600 uppercase">
                ● LIVE TELEMETRY
              </span>
            </div>
            <div className="h-4 w-[1px] bg-slate-200" />
            <h1 className="text-xs sm:text-sm font-black font-mono tracking-wider text-slate-900 uppercase">
              SYSTEM HEALTH COMMAND CENTER
            </h1>
          </div>

          {/* Center: Live Race Telemetry Metadata */}
          <div className="hidden lg:flex items-center space-x-6 font-mono text-xs">
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-bold text-[10px]">SESSION</span>
              <strong className="text-slate-800 font-black">PRACTICE 2</strong>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-bold text-[10px]">LAP</span>
              <strong className="text-slate-900 font-black">
                {sessionLap} <span className="text-slate-400 font-normal">/ {totalLaps}</span>
              </strong>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-bold text-[10px]">POSITION</span>
              <span className="px-2 py-0.5 rounded bg-red-600 text-white font-black text-[11px]">
                P1
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-bold text-[10px]">TRACK</span>
              <strong className="text-slate-800 font-black">SUZUKA</strong>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-bold text-[10px]">COMPOUND</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px]">
                <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
                C3 MEDIUM
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-bold text-[10px]">TYRE AGE</span>
              <strong className="text-slate-900 font-black">{activeTyre.age_laps || 16} LAPS</strong>
            </div>
          </div>

          {/* Right: 3D Visualization Mode Switcher */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(['NORMAL', 'THERMAL', 'WEAR', 'LOAD', 'GRIP', 'PREDICTION'] as TyreVisMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setVisMode(mode)}
                className={`px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider rounded-lg transition-all cursor-pointer ${
                  visMode === mode
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MAIN COMMAND CENTER THREE-PANEL STAGE                        */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 pt-5 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* ════════════════════════════════════════════════════════ */}
          {/* LEFT COLUMN: RACE STATUS + TRACK CAM + WEATHER (3 Cols)  */}
          {/* ════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-3 space-y-4">
            {/* 1. Race Status & Live Track Map */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-3">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-red-600" />
                  <h2 className="font-mono font-black text-xs text-slate-900 uppercase tracking-wider">
                    RACE STATUS
                  </h2>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  SECTOR 2 ACTIVE
                </span>
              </div>

              {/* Position & Top Lap Speed */}
              <div className="grid grid-cols-2 gap-2 mb-3 font-mono">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-bold">GRID POSITION</span>
                  <div className="text-2xl font-black text-red-600">P1</div>
                  <span className="text-[10px] text-emerald-600 font-bold">+1.24s Delta</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-bold">TOP LAP SPEED</span>
                  <div className="text-2xl font-black text-slate-900">
                    {Math.round(currentSpeed)} <span className="text-[10px] font-normal text-slate-400">KM/H</span>
                  </div>
                  <span className="text-[10px] text-slate-500">T1 Trap: 312 km/h</span>
                </div>
              </div>

              {/* Lap Times */}
              <div className="space-y-1.5 text-xs font-mono mb-3">
                <div className="flex justify-between items-center py-1 px-2 rounded bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-bold">CURRENT LAP:</span>
                  <strong className="text-slate-900 font-black">1:21.52</strong>
                </div>
                <div className="flex justify-between items-center py-1 px-2 rounded bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-bold">BEST LAP:</span>
                  <strong className="text-purple-600 font-black">1:20.89 (PURPLE)</strong>
                </div>
                <div className="flex justify-between items-center py-1 px-2 rounded bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 font-bold">THEORETICAL:</span>
                  <strong className="text-slate-700 font-bold">1:20.44</strong>
                </div>
              </div>

              {/* Animated Suzuka Circuit Map */}
              <div className="relative p-2.5 bg-slate-900 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                  <span>SUZUKA CIRCUIT</span>
                  <span className="text-emerald-400 font-bold">● S1 28.4 | S2 39.1 | S3 15.5</span>
                </div>
                <svg viewBox="0 0 300 130" className="w-full h-24 stroke-slate-600 fill-none">
                  {/* Track Layout Path */}
                  <path
                    d="M 40,75 C 60,30 90,20 120,40 C 140,55 160,70 190,50 C 220,30 260,30 270,60 C 280,90 250,110 210,105 C 170,100 130,115 100,105 C 70,95 40,105 35,85 Z"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Active Sector Highlighting */}
                  <path
                    d="M 120,40 C 140,55 160,70 190,50 C 220,30 260,30 270,60"
                    stroke="#E10600"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeDasharray="6 2"
                  />
                  {/* Moving Car Position Beacon */}
                  <circle cx={(130 + tick * 1.3) % 270} cy="55" r="4.5" fill="#ffffff" stroke="#E10600" strokeWidth="2.5">
                    <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />
                  </circle>
                </svg>
              </div>
            </div>

            {/* 2. Driver / Live Track Camera */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <div className="flex items-center space-x-2">
                  <Video className="w-4 h-4 text-red-600" />
                  <h3 className="font-mono font-black text-xs text-slate-900 uppercase tracking-wider">
                    LIVE TRACK FEED
                  </h3>
                </div>
                <span className="flex items-center space-x-1 text-[9px] font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                  <span>REC ON-BOARD</span>
                </span>
              </div>

              {/* Video Panel with CRT Scanlines & Telemetry Overlay */}
              <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden border border-slate-800">
                {/* Simulated Track Video / Image */}
                <img
                  src="/assets/tgr_f1_racing_hero.jpg"
                  alt="Live On-Board Feed"
                  className="w-full h-full object-cover opacity-80 filter brightness-95 contrast-110"
                />

                {/* CRT Scanline Overlay */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-20"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #000 3px, #000 3px)',
                  }}
                />

                {/* Camera HUD Telemetry Overlays */}
                <div className="absolute top-2 left-2 font-mono text-[9px] text-white bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded border border-white/10">
                  CAM 01 — T1 APEX SPEED: {Math.round(currentSpeed)} KM/H
                </div>
                <div className="absolute bottom-2 left-2 font-mono text-[9px] text-emerald-400 bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded border border-white/10">
                  THR: {Math.round(throttlePct)}% | BRK: {Math.round(brakePct)}% | G-LAT: +3.8G
                </div>
                <div className="absolute bottom-2 right-2 font-mono text-[9px] text-white/70">
                  12:44:18.04 JST
                </div>
              </div>
            </div>

            {/* 3. Ambient Weather Telemetry */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center space-x-2 pb-2.5 border-b border-slate-100 mb-3">
                <Wind className="w-4 h-4 text-sky-600" />
                <h3 className="font-mono font-black text-xs text-slate-900 uppercase tracking-wider">
                  WEATHER TELEMETRY
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-400 font-bold">AIR TEMP</span>
                  <strong className="text-slate-900 font-black">23.4°C</strong>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-400 font-bold">TRACK TEMP</span>
                  <strong className="text-red-600 font-black">34.0°C</strong>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-400 font-bold">HUMIDITY</span>
                  <strong className="text-slate-900 font-black">75%</strong>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-400 font-bold">PRESSURE</span>
                  <strong className="text-slate-900 font-black">1013 mb</strong>
                </div>
              </div>

              <div className="mt-2.5 p-2 rounded-xl bg-sky-50/60 border border-sky-200 text-sky-900 flex items-center justify-between font-mono text-xs">
                <span className="font-bold flex items-center space-x-1">
                  <span>WIND SPEED & VECTOR:</span>
                </span>
                <strong className="font-black text-sky-700">7.2 km/h ↗ (Tailwind T1)</strong>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════ */}
          {/* CENTER COLUMN: 3D F1 CAR + 4 TYRE TELEMETRY ZONES (6 Cols) */}
          {/* ════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-6 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col">
              {/* Header inside 3D stage */}
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white z-20">
                <div className="flex items-center space-x-2 font-mono">
                  <span className="text-xs font-black text-slate-900 uppercase">
                    3D DIGITAL TWIN & TYRE MATRIX
                  </span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">
                    REAL 1:1 F1 CAR MODEL
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                    CLICK ANY TYRE IN 3D OR UI TO FOCUS
                  </span>
                  <button
                    onClick={() => {
                      setHasUserFocused(false);
                      sceneRef.current?.resetCamera();
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                    title="Reset Camera to Full View"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 3D Viewport Container */}
              <div className="relative w-full h-[540px] sm:h-[620px] bg-slate-50 select-none">
                {/* Three.js Canvas Mount */}
                <div ref={mountRef} className="absolute inset-0 w-full h-full z-0" />

                {/* Loading / Error Overlay */}
                {!is3DLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/85 backdrop-blur-xs z-30 font-mono">
                    <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mb-2" />
                    <span className="text-xs font-black tracking-widest text-slate-800">
                      INITIALIZING 3D DIGITAL TWIN...
                    </span>
                    {loadError && <span className="text-[10px] text-red-600 mt-1">{loadError}</span>}
                  </div>
                )}

                {/* SVG Leader Lines from 3D tyre contact points to UI Cards */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                  {/* Dynamic leader line to currently selected tyre */}
                  {screenPos[selectedTyre]?.visible && (
                    <circle
                      cx={screenPos[selectedTyre].x}
                      cy={screenPos[selectedTyre].y}
                      r="9"
                      fill="none"
                      stroke="#E10600"
                      strokeWidth="2.5"
                      className="animate-ping"
                    />
                  )}
                </svg>

                {/* ── Floating Tyre Telemetry Zone 1: TOP-LEFT (FL) ── */}
                <div
                  onClick={() => handleSelectCorner('FL')}
                  className={`absolute top-4 left-4 z-20 w-[200px] sm:w-[220px] p-3 rounded-xl bg-white/95 backdrop-blur-md border transition-all cursor-pointer shadow-xs ${
                    selectedTyre === 'FL'
                      ? 'border-2 border-red-600 ring-2 ring-red-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 font-mono">
                    <div className="flex items-center space-x-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-900 font-black text-xs">
                        FL
                      </span>
                      <span className="text-[11px] font-bold text-slate-700">FRONT LEFT</span>
                    </div>
                    {selectedTyre === 'FL' && (
                      <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[8px] font-black tracking-wider">
                        SELECTED
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">SURFACE TEMP:</span>
                      <strong className="text-slate-900 font-black">{Math.round(tyreStates.FL.thermal.surface_c)}°C</strong>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">IN / CTR / OUT:</span>
                      <span className="text-slate-600 font-bold">
                        {Math.round(tyreStates.FL.thermal.inner_c)} / {Math.round(tyreStates.FL.thermal.center_c)} / {Math.round(tyreStates.FL.thermal.outer_c)}°C
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">PRESSURE:</span>
                      <strong className="text-slate-800 font-bold">{tyreStates.FL.pressure_psi.toFixed(1)} PSI</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">WEAR / GRIP:</span>
                      <span>
                        <strong className="text-red-600 font-bold">{tyreStates.FL.wear.wear_pct.toFixed(0)}%</strong>
                        {' / '}
                        <strong className="text-emerald-600 font-bold">{Math.round(tyreStates.FL.grip.available_grip_pct)}%</strong>
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">LOAD / SLIP:</span>
                      <span className="text-slate-600">
                        {tyreStates.FL.load.vertical_load_kn.toFixed(1)} kN | {tyreStates.FL.grip.slip_angle_deg.toFixed(1)}°
                      </span>
                    </div>
                  </div>

                  {/* Health Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-2">
                    <div
                      className={`h-full ${getHealthBarColor(tyreStates.FL.wear.wear_pct)}`}
                      style={{ width: `${tyreStates.FL.wear.health_pct}%` }}
                    />
                  </div>
                </div>

                {/* ── Floating Tyre Telemetry Zone 2: TOP-RIGHT (FR) ── */}
                <div
                  onClick={() => handleSelectCorner('FR')}
                  className={`absolute top-4 right-4 z-20 w-[200px] sm:w-[220px] p-3 rounded-xl bg-white/95 backdrop-blur-md border transition-all cursor-pointer shadow-xs ${
                    selectedTyre === 'FR'
                      ? 'border-2 border-red-600 ring-2 ring-red-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 font-mono">
                    <div className="flex items-center space-x-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-900 font-black text-xs">
                        FR
                      </span>
                      <span className="text-[11px] font-bold text-slate-700">FRONT RIGHT</span>
                    </div>
                    {selectedTyre === 'FR' && (
                      <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[8px] font-black tracking-wider">
                        SELECTED
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">SURFACE TEMP:</span>
                      <strong className="text-red-600 font-black">{Math.round(tyreStates.FR.thermal.surface_c)}°C</strong>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">IN / CTR / OUT:</span>
                      <span className="text-slate-600 font-bold">
                        {Math.round(tyreStates.FR.thermal.inner_c)} / {Math.round(tyreStates.FR.thermal.center_c)} / {Math.round(tyreStates.FR.thermal.outer_c)}°C
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">PRESSURE:</span>
                      <strong className="text-slate-800 font-bold">{tyreStates.FR.pressure_psi.toFixed(1)} PSI</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">WEAR / GRIP:</span>
                      <span>
                        <strong className="text-red-600 font-bold">{tyreStates.FR.wear.wear_pct.toFixed(0)}%</strong>
                        {' / '}
                        <strong className="text-emerald-600 font-bold">{Math.round(tyreStates.FR.grip.available_grip_pct)}%</strong>
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">LOAD / SLIP:</span>
                      <span className="text-slate-600">
                        {tyreStates.FR.load.vertical_load_kn.toFixed(1)} kN | {tyreStates.FR.grip.slip_angle_deg.toFixed(1)}°
                      </span>
                    </div>
                  </div>

                  {/* Health Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-2">
                    <div
                      className={`h-full ${getHealthBarColor(tyreStates.FR.wear.wear_pct)}`}
                      style={{ width: `${tyreStates.FR.wear.health_pct}%` }}
                    />
                  </div>
                </div>

                {/* ── Floating Tyre Telemetry Zone 3: BOTTOM-LEFT (RL) ── */}
                <div
                  onClick={() => handleSelectCorner('RL')}
                  className={`absolute bottom-4 left-4 z-20 w-[200px] sm:w-[220px] p-3 rounded-xl bg-white/95 backdrop-blur-md border transition-all cursor-pointer shadow-xs ${
                    selectedTyre === 'RL'
                      ? 'border-2 border-red-600 ring-2 ring-red-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 font-mono">
                    <div className="flex items-center space-x-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-900 font-black text-xs">
                        RL
                      </span>
                      <span className="text-[11px] font-bold text-slate-700">REAR LEFT</span>
                    </div>
                    {selectedTyre === 'RL' && (
                      <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[8px] font-black tracking-wider">
                        SELECTED
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">SURFACE TEMP:</span>
                      <strong className="text-slate-900 font-black">{Math.round(tyreStates.RL.thermal.surface_c)}°C</strong>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">IN / CTR / OUT:</span>
                      <span className="text-slate-600 font-bold">
                        {Math.round(tyreStates.RL.thermal.inner_c)} / {Math.round(tyreStates.RL.thermal.center_c)} / {Math.round(tyreStates.RL.thermal.outer_c)}°C
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">PRESSURE:</span>
                      <strong className="text-slate-800 font-bold">{tyreStates.RL.pressure_psi.toFixed(1)} PSI</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">WEAR / GRIP:</span>
                      <span>
                        <strong className="text-red-600 font-bold">{tyreStates.RL.wear.wear_pct.toFixed(0)}%</strong>
                        {' / '}
                        <strong className="text-emerald-600 font-bold">{Math.round(tyreStates.RL.grip.available_grip_pct)}%</strong>
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">LOAD / SLIP:</span>
                      <span className="text-slate-600">
                        {tyreStates.RL.load.vertical_load_kn.toFixed(1)} kN | {tyreStates.RL.grip.slip_angle_deg.toFixed(1)}°
                      </span>
                    </div>
                  </div>

                  {/* Health Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-2">
                    <div
                      className={`h-full ${getHealthBarColor(tyreStates.RL.wear.wear_pct)}`}
                      style={{ width: `${tyreStates.RL.wear.health_pct}%` }}
                    />
                  </div>
                </div>

                {/* ── Floating Tyre Telemetry Zone 4: BOTTOM-RIGHT (RR) ── */}
                <div
                  onClick={() => handleSelectCorner('RR')}
                  className={`absolute bottom-4 right-4 z-20 w-[200px] sm:w-[220px] p-3 rounded-xl bg-white/95 backdrop-blur-md border transition-all cursor-pointer shadow-xs ${
                    selectedTyre === 'RR'
                      ? 'border-2 border-red-600 ring-2 ring-red-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 font-mono">
                    <div className="flex items-center space-x-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-900 font-black text-xs">
                        RR
                      </span>
                      <span className="text-[11px] font-bold text-slate-700">REAR RIGHT</span>
                    </div>
                    {selectedTyre === 'RR' && (
                      <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[8px] font-black tracking-wider">
                        SELECTED
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">SURFACE TEMP:</span>
                      <strong className="text-slate-900 font-black">{Math.round(tyreStates.RR.thermal.surface_c)}°C</strong>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">IN / CTR / OUT:</span>
                      <span className="text-slate-600 font-bold">
                        {Math.round(tyreStates.RR.thermal.inner_c)} / {Math.round(tyreStates.RR.thermal.center_c)} / {Math.round(tyreStates.RR.thermal.outer_c)}°C
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">PRESSURE:</span>
                      <strong className="text-slate-800 font-bold">{tyreStates.RR.pressure_psi.toFixed(1)} PSI</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">WEAR / GRIP:</span>
                      <span>
                        <strong className="text-red-600 font-bold">{tyreStates.RR.wear.wear_pct.toFixed(0)}%</strong>
                        {' / '}
                        <strong className="text-emerald-600 font-bold">{Math.round(tyreStates.RR.grip.available_grip_pct)}%</strong>
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">LOAD / SLIP:</span>
                      <span className="text-slate-600">
                        {tyreStates.RR.load.vertical_load_kn.toFixed(1)} kN | {tyreStates.RR.grip.slip_angle_deg.toFixed(1)}°
                      </span>
                    </div>
                  </div>

                  {/* Health Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-2">
                    <div
                      className={`h-full ${getHealthBarColor(tyreStates.RR.wear.wear_pct)}`}
                      style={{ width: `${tyreStates.RR.wear.health_pct}%` }}
                    />
                  </div>
                </div>

                {/* Bottom Center Mode Badge */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-white/90 backdrop-blur-xs border border-slate-200 font-mono text-[10px] text-slate-700 shadow-xs flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>MODE: <strong className="text-red-600 font-bold">{visMode}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span>ORIENTATION: FRONT ↑ REAR ↓</span>
                </div>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════ */}
          {/* RIGHT COLUMN: REAL-TIME TELEMETRY GRAPHS (3 Cols)        */}
          {/* ════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-3 space-y-4">
            {/* Chart 1: Engine RPM & Speed Trace */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <div className="flex items-center space-x-2">
                  <Gauge className="w-4 h-4 text-red-600" />
                  <h3 className="font-mono font-black text-xs text-slate-900 uppercase tracking-wider">
                    RPM & SPEED TRACE
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-500 font-bold">
                  {currentRpm.toLocaleString()} RPM
                </span>
              </div>

              {/* Live SVG Graph */}
              <div className="h-28 w-full bg-slate-900 rounded-xl p-2.5 relative overflow-hidden">
                <svg viewBox="0 0 200 80" className="w-full h-full stroke-red-500 fill-none">
                  <defs>
                    <linearGradient id="rpmGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E10600" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#E10600" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Grid Lines */}
                  <line x1="0" y1="20" x2="200" y2="20" stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" />
                  <line x1="0" y1="40" x2="200" y2="40" stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" />
                  <line x1="0" y1="60" x2="200" y2="60" stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" />

                  {/* Area Fill */}
                  <path
                    d={`M 0,70 Q 30,${45 + Math.sin(tick * 0.1) * 8} 60,${30 + Math.cos(tick * 0.12) * 10} T 120,${25 + Math.sin(tick * 0.08) * 8} T 170,${35 + Math.cos(tick * 0.1) * 6} L 200,${40} L 200,80 L 0,80 Z`}
                    fill="url(#rpmGrad)"
                  />
                  {/* Trace Line */}
                  <path
                    d={`M 0,70 Q 30,${45 + Math.sin(tick * 0.1) * 8} 60,${30 + Math.cos(tick * 0.12) * 10} T 120,${25 + Math.sin(tick * 0.08) * 8} T 170,${35 + Math.cos(tick * 0.1) * 6} L 200,${40}`}
                    strokeWidth="2.2"
                    stroke="#E10600"
                  />
                  {/* Realtime Lead Dot */}
                  <circle cx="200" cy="40" r="3" fill="#ffffff" stroke="#E10600" strokeWidth="2" />
                </svg>

                <div className="absolute bottom-1.5 left-2.5 right-2.5 flex justify-between font-mono text-[9px] text-slate-400">
                  <span>-10s</span>
                  <span className="text-red-400 font-bold">CURRENT: {Math.round(currentSpeed)} KM/H</span>
                  <span>NOW</span>
                </div>
              </div>
            </div>

            {/* Chart 2: Engine & Brake Temperature */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <div className="flex items-center space-x-2">
                  <Thermometer className="w-4 h-4 text-amber-500" />
                  <h3 className="font-mono font-black text-xs text-slate-900 uppercase tracking-wider">
                    THERMAL PROFILES
                  </h3>
                </div>
                <div className="flex items-center space-x-2 text-[9px] font-mono font-bold">
                  <span className="text-amber-500">ENG 104°C</span>
                  <span className="text-red-500">BRK 612°C</span>
                </div>
              </div>

              {/* Thermal Live SVG Graph */}
              <div className="h-28 w-full bg-slate-900 rounded-xl p-2.5 relative overflow-hidden">
                <svg viewBox="0 0 200 80" className="w-full h-full fill-none">
                  {/* Brake Temp Curve (Red) */}
                  <path
                    d={`M 0,65 Q 40,${20 + Math.sin(tick * 0.15) * 12} 80,${55} T 140,${15 + Math.cos(tick * 0.1) * 8} T 200,${45}`}
                    strokeWidth="2"
                    stroke="#ef4444"
                  />
                  {/* Engine Temp Baseline (Amber) */}
                  <path
                    d={`M 0,35 Q 50,${34 + Math.sin(tick * 0.05) * 3} 100,${35} T 150,${33} T 200,${36}`}
                    strokeWidth="1.8"
                    stroke="#f59e0b"
                    strokeDasharray="4 2"
                  />
                </svg>

                <div className="absolute bottom-1.5 left-2.5 right-2.5 flex justify-between font-mono text-[9px] text-slate-400">
                  <span className="text-amber-400">● Engine Coolant</span>
                  <span className="text-red-400">● Carbon Disc Friction</span>
                </div>
              </div>
            </div>

            {/* Chart 3: Tyre / System Load Forces */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-sky-600" />
                  <h3 className="font-mono font-black text-xs text-slate-900 uppercase tracking-wider">
                    TYRE & AERO LOAD
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-500 font-bold">
                  {activeTyre.load.vertical_load_kn.toFixed(1)} kN Fz
                </span>
              </div>

              {/* Load Live SVG Graph */}
              <div className="h-28 w-full bg-slate-900 rounded-xl p-2.5 relative overflow-hidden">
                <svg viewBox="0 0 200 80" className="w-full h-full fill-none">
                  <path
                    d={`M 0,50 C 40,${30 + Math.sin(tick * 0.08) * 15} 80,${65} 120,${25 + Math.cos(tick * 0.12) * 12} S 160,${40} 200,${30}`}
                    strokeWidth="2.2"
                    stroke="#0284c7"
                  />
                  <path
                    d={`M 0,40 C 50,${50 + Math.sin(tick * 0.1) * 8} 100,${35} 150,${45} 200,${38}`}
                    strokeWidth="1.5"
                    stroke="#38bdf8"
                    strokeDasharray="3 3"
                  />
                </svg>

                <div className="absolute bottom-1.5 left-2.5 right-2.5 flex justify-between font-mono text-[9px] text-slate-400">
                  <span className="text-sky-400">● Vertical Load (Fz)</span>
                  <span className="text-cyan-300">● Aero Downforce</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* COMPACT ENGINE / VEHICLE POWERTRAIN TELEMETRY STRIP          */}
        {/* ──────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="flex items-center space-x-2 pb-2.5 border-b border-slate-100 mb-3">
            <Gauge className="w-4 h-4 text-red-600" />
            <h3 className="font-mono font-black text-xs text-slate-900 uppercase tracking-wider">
              POWERTRAIN & CHASSIS TELEMETRY GAUGES
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
            {/* RPM */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] text-slate-400 font-bold">ENGINE RPM</span>
                <span className="text-xs font-black text-slate-900">{currentRpm.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-red-600 h-full rounded-full" style={{ width: `${Math.min(100, (currentRpm / 12500) * 100)}%` }} />
              </div>
              <span className="text-[9px] text-slate-400 mt-1 block text-right">Max 12,500</span>
            </div>

            {/* Engine Temp */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] text-slate-400 font-bold">ENGINE TEMP</span>
                <span className="text-xs font-black text-amber-600">104°C</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: '68%' }} />
              </div>
              <span className="text-[9px] text-emerald-600 mt-1 block text-right">Nominal</span>
            </div>

            {/* Fuel */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] text-slate-400 font-bold">FUEL LEVEL</span>
                <span className="text-xs font-black text-slate-900">47%</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full rounded-full" style={{ width: '47%' }} />
              </div>
              <span className="text-[9px] text-slate-400 mt-1 block text-right">~24 Laps Fuel</span>
            </div>

            {/* Brake Temp */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] text-slate-400 font-bold">BRAKE TEMP</span>
                <span className="text-xs font-black text-red-600">612°C</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-red-600 h-full rounded-full" style={{ width: '74%' }} />
              </div>
              <span className="text-[9px] text-slate-400 mt-1 block text-right">Peak 980°C</span>
            </div>

            {/* Aero Load */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] text-slate-400 font-bold">AERO LOAD</span>
                <span className="text-xs font-black text-slate-900">12.4 kN</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-slate-700 h-full rounded-full" style={{ width: '82%' }} />
              </div>
              <span className="text-[9px] text-slate-400 mt-1 block text-right">High Downforce</span>
            </div>

            {/* Vertical Load */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] text-slate-400 font-bold">VERTICAL LOAD</span>
                <span className="text-xs font-black text-slate-900">8.8 kN</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-slate-700 h-full rounded-full" style={{ width: '65%' }} />
              </div>
              <span className="text-[9px] text-slate-400 mt-1 block text-right">Dynamic Ride</span>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* MAIN 4-CORNER TYRE HEALTH SUMMARY MATRIX                     */}
        {/* ──────────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-black font-mono tracking-wider text-slate-900 uppercase">
                TYRE HEALTH & CORNER SYNCHRONIZATION
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500">
              CLICK ANY CORNER TO FOCUS 3D CAMERA & ACTIVATE HERO TELEMETRY
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {corners.map((corner) => {
              const data = tyreStates[corner];
              const isSelected = selectedTyre === corner;

              return (
                <div
                  key={corner}
                  onClick={() => handleSelectCorner(corner)}
                  className={`bg-white rounded-2xl p-5 border cursor-pointer transition-all duration-200 shadow-2xs relative ${
                    isSelected
                      ? 'border-2 border-red-600 ring-2 ring-red-100 shadow-sm'
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
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-xs font-black ${
                          isSelected ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {corner}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-900">
                        {corner === 'FL' ? 'FRONT LEFT' : corner === 'FR' ? 'FRONT RIGHT' : corner === 'RL' ? 'REAR LEFT' : 'REAR RIGHT'}
                      </span>
                    </div>
                    <span className={`text-xs font-mono font-bold ${data.wear.health_pct > 60 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {data.wear.health_pct.toFixed(1)}% HEALTH
                    </span>
                  </div>

                  <p className="text-[10px] font-mono text-slate-400 mb-3">
                    {corner === 'FL'
                      ? 'Chassis Leading Edge'
                      : corner === 'FR'
                      ? 'Critical Cornering Load'
                      : corner === 'RL'
                      ? 'Traction Drive Axle'
                      : 'Traction & Lateral Scrub'}
                  </p>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-baseline">
                      <span className="text-slate-500">Surface Temp:</span>
                      <strong className="text-base font-black text-slate-900">
                        {Math.round(data.thermal.surface_c)}°C
                      </strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Inner / Outer:</span>
                      <span className="text-slate-700 font-bold">
                        {Math.round(data.thermal.inner_c)}°C / {Math.round(data.thermal.outer_c)}°C
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Wear Level:</span>
                      <strong className="text-red-600 font-bold">{data.wear.wear_pct.toFixed(1)}%</strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Available Grip:</span>
                      <strong className="text-slate-900 font-bold">{Math.round(data.grip.available_grip_pct)}%</strong>
                    </div>

                    <div className="flex justify-between pt-1 border-t border-slate-100">
                      <span className="text-slate-500">Cliff Horizon:</span>
                      <strong className="text-amber-600 font-bold">~{data.wear.remaining_laps} Laps</strong>
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mt-3">
                    <div
                      className={`h-2 rounded-full ${getHealthBarColor(data.wear.wear_pct)}`}
                      style={{ width: `${data.wear.health_pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* DEGRADATION INTELLIGENCE & CLIFF CURVE SECTION               */}
        {/* ──────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-100 mb-5 gap-3">
            <div className="flex items-center space-x-2">
              <TrendingDown className="w-5 h-5 text-red-600" />
              <div>
                <h3 className="font-mono font-black text-sm text-slate-900 uppercase tracking-wider">
                  DEGRADATION INTELLIGENCE & compound CLIFF HORIZON
                </h3>
                <p className="text-xs font-mono text-slate-500">
                  Physics Residuals + Multi-Corner AI Prediction Curve
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 font-mono text-xs">
              <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700">
                <span className="text-slate-500 font-bold mr-1.5">ESTIMATED CLIFF:</span>
                <strong className="font-black text-red-600">LAP {sessionLap + activeTyre.wear.remaining_laps}</strong>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 mb-5">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono">
              <span className="text-xs text-slate-500 block mb-1">CURRENT DEGRADATION</span>
              <div className="text-2xl font-black text-slate-900">2.8 ms/lap</div>
              <span className="text-[10px] text-slate-400">Tyre Pace Delta</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono">
              <span className="text-xs text-slate-500 block mb-1">DEGRADATION RATE</span>
              <div className="text-2xl font-black text-red-600">+0.18 ms/lap²</div>
              <span className="text-[10px] text-amber-600 font-bold">Accelerating</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono">
              <span className="text-xs text-slate-500 block mb-1">ESTIMATED TYRE LIFE</span>
              <div className="text-2xl font-black text-slate-900">~{activeTyre.wear.remaining_laps} LAPS</div>
              <span className="text-[10px] text-slate-400">Until Thermal Cliff</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono">
              <span className="text-xs text-slate-500 block mb-1">CLIFF HORIZON</span>
              <div className="text-2xl font-black text-red-600">LAP 42</div>
              <span className="text-[10px] text-red-500 font-bold">Hard Loss (+1.4s/lap)</span>
            </div>
          </div>

          {/* Degradation Curve (Historical -> Current -> Predicted) */}
          <div className="p-4 bg-slate-900 rounded-xl overflow-hidden relative">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400 mb-2">
              <span>LAP TIME DELTA (Y) vs LAP NUMBER (X)</span>
              <div className="flex items-center space-x-3 text-[10px]">
                <span className="text-slate-300">─── Historical</span>
                <span className="text-red-500">● Current (Lap {sessionLap})</span>
                <span className="text-amber-400">┈┈┈ Predicted Cliff</span>
              </div>
            </div>

            <div className="h-44 w-full relative">
              <svg viewBox="0 0 600 160" className="w-full h-full fill-none">
                {/* Horizontal Grid lines */}
                <line x1="0" y1="40" x2="600" y2="40" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="600" y2="80" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
                <line x1="0" y1="120" x2="600" y2="120" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />

                {/* Historical Curve (Solid white/silver) */}
                <path
                  d="M 20,135 Q 80,130 140,125 T 260,110 T 320,95"
                  stroke="#cbd5e1"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Predicted Curve (Dashed amber/red extending to future cliff) */}
                <path
                  d="M 320,95 Q 400,75 480,45 T 580,15"
                  stroke="#f59e0b"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                />

                {/* Current Lap Point (Lap 16) */}
                <circle cx="320" cy="95" r="6" fill="#E10600" stroke="#ffffff" strokeWidth="2">
                  <animate attributeName="r" values="6;8;6" dur="1.5s" repeatCount="indefinite" />
                </circle>

                {/* Cliff Horizon Marker (Lap 42) */}
                <line x1="480" y1="10" x2="480" y2="150" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" />
                <text x="485" y="30" fill="#ef4444" fontSize="10" fontFamily="monospace" fontWeight="bold">
                  CLIFF LAP 42
                </text>
              </svg>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* PIT STOP STRATEGY & CHASSIS BALANCE ROW                      */}
        {/* ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Card 1: Tyre Wear Balance & Handling Bias */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs">
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
              <span
                className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  isFrontBiased ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                }`}
              >
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
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs">
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

          {/* Card 3: Compound Lifetime Crossover */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs">
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
                  {selectedCompound === 'C1'
                    ? 'Pirelli White Hard'
                    : selectedCompound === 'C3'
                    ? 'Pirelli Yellow Medium'
                    : 'Pirelli Red Soft'}
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

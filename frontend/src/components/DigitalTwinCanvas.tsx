/**
 * TYRETRACE — Hero 3D Tyre Digital Twin Viewport Component
 *
 * Hosts the single interactive F1 wheel asset ('F1 Front wheel.obj.glb') as the central hero.
 * Features:
 * - Direct Live Thermal Heatmap on tyre tread
 * - Vertical Surface Temperature Scale HUD (matching the engineering reference style)
 * - Overheating Warning Banner (> 115°C)
 * - 6 Dynamic Visualization Modes (NORMAL, THERMAL, WEAR, LOAD, GRIP, PREDICTION)
 * - Camera Presets (HERO, TREAD, RIM, TOP, FOCUS)
 * - Auto-rotation drift toggle & smooth reset controls
 * - Corner status indicator
 */

import React, { useEffect, useRef, useState } from 'react';
import type {
  CameraPreset,
  DataMode,
  FourWheelTyres,
  PhysicsTwinOutput,
  TDIStateResponse,
  TelemetryFrame,
  TyreCorner,
  TyreVisMode,
} from '../types/telemetry';
import { HeroTyreScene, type ThermalCalloutPoint } from '../three/HeroTyreScene';
import { calculateTyreCornerState } from '../utils/tyreCalculations';
import {
  RotateCcw,
  Video,
  Layers,
  Flame,
  Activity,
  Compass,
  Gauge,
  Sparkles,
  Zap,
  Search,
  Snowflake,
} from 'lucide-react';

interface DigitalTwinCanvasProps {
  speedKph: number;
  drs: number;
  dataMode: DataMode;
  fourWheelStates?: FourWheelTyres | null;
  telemetryFrame?: TelemetryFrame | null;
  physicsOutput?: PhysicsTwinOutput | null;
  tdiResponse?: TDIStateResponse | null;
  selectedTyre: TyreCorner;
  visMode: TyreVisMode;
  onSelectVisMode: (mode: TyreVisMode) => void;
}

export const DigitalTwinCanvas: React.FC<DigitalTwinCanvasProps> = ({
  speedKph,
  drs,
  dataMode,
  fourWheelStates,
  telemetryFrame,
  physicsOutput,
  tdiResponse,
  selectedTyre,
  visMode,
  onSelectVisMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HeroTyreScene | null>(null);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [speedMode, setSpeedMode] = useState<'REAL' | 'SLOWMO' | 'FREEZE'>('REAL');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [paceMultiplier, setPaceMultiplier] = useState<number>(1.0);
  const [activeCameraPreset, setActiveCameraPreset] = useState<CameraPreset>(() => {
    const p = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('cam') as CameraPreset) : null;
    return p || 'HERO';
  });

  // Compute live temperature for HUD displays
  const currentCornerState = calculateTyreCornerState(
    selectedTyre,
    telemetryFrame ?? null,
    physicsOutput ?? null,
    tdiResponse ?? null,
    fourWheelStates ?? null,
    dataMode
  );

  const surfaceC = currentCornerState.thermal.surface_c || 97;
  const innerC = currentCornerState.thermal.inner_c || 110;
  const centerC = currentCornerState.thermal.center_c || 96;
  const outerC = currentCornerState.thermal.outer_c || 84;

  // Persistent refs for 60 FPS zero-overhead 3D annotation tracking
  const calloutRefs = useRef<{
    svg: SVGSVGElement | null;
    paths: Record<string, SVGPathElement | null>;
    dots: Record<string, HTMLDivElement | null>;
    badges: Record<string, HTMLDivElement | null>;
  }>({
    svg: null,
    paths: {},
    dots: {},
    badges: {},
  });

  const handleCalloutsUpdate = (callouts: Record<string, ThermalCalloutPoint>) => {
    const refs = calloutRefs.current;
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth || 1000;
    const h = containerRef.current.clientHeight || 600;

    const configs: Record<string, { dx: number; dy: number; side: 'left' | 'right' }> = {
      hotSpot: { dx: -135, dy: -55, side: 'right' },
      innerShoulder: { dx: 125, dy: -65, side: 'left' },
      surfaceTemp: { dx: -145, dy: -15, side: 'right' },
      treadCenter: { dx: 135, dy: -10, side: 'left' },
      contactPatch: { dx: -145, dy: 30, side: 'right' },
      outerShoulder: { dx: 130, dy: 45, side: 'left' },
    };

    for (const [id, pt] of Object.entries(callouts)) {
      const cfg = configs[id];
      if (!cfg) continue;

      const pathEl = refs.paths[id];
      const dotEl = refs.dots[id];
      const badgeEl = refs.badges[id];

      const anchorX = pt.screenX;
      const anchorY = pt.screenY;
      const op = Math.max(0.95, pt.opacity ?? 1.0);

      let badgeEdgeX = anchorX + cfg.dx;
      let badgeEdgeY = anchorY + cfg.dy;

      if (cfg.side === 'right') {
        badgeEdgeX = Math.max(90, Math.min(anchorX - 35, badgeEdgeX));
        badgeEdgeY = Math.max(35, Math.min(h - 45, badgeEdgeY));
      } else {
        badgeEdgeX = Math.min(w - 90, Math.max(anchorX + 35, badgeEdgeX));
        badgeEdgeY = Math.max(35, Math.min(h - 45, badgeEdgeY));
      }

      if (pathEl) {
        const midX = (badgeEdgeX + anchorX) * 0.5;
        pathEl.setAttribute(
          'd',
          `M ${badgeEdgeX},${badgeEdgeY} C ${midX},${badgeEdgeY} ${midX},${anchorY} ${anchorX},${anchorY}`
        );
        pathEl.style.opacity = String(op);
      }

      if (dotEl) {
        dotEl.style.transform = `translate(${anchorX}px, ${anchorY}px) translate(-50%, -50%)`;
        dotEl.style.opacity = String(op);
      }

      if (badgeEl) {
        const translateShift = cfg.side === 'right' ? 'translate(-100%, -50%)' : 'translate(0%, -50%)';
        badgeEl.style.transform = `translate(${badgeEdgeX}px, ${badgeEdgeY}px) ${translateShift}`;
        badgeEl.style.opacity = String(op);
      }
    }
  };

  // Initialize HeroTyreScene
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new HeroTyreScene(containerRef.current, {
      onCalloutsUpdate: (callouts) => {
        handleCalloutsUpdate(callouts);
      },
    });
    sceneRef.current = scene;
    if (activeCameraPreset !== 'HERO') {
      setTimeout(() => scene.setCameraPreset(activeCameraPreset), 150);
    }

    const handleResize = () => {
      scene.handleResize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  // Sync selected tyre
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.selectTyre(selectedTyre);
    }
  }, [selectedTyre]);

  // Sync visualization mode
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setVisualizationMode(visMode);
    }
  }, [visMode]);

  // Sync auto-rotation
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setAutoRotate(autoRotate);
    }
  }, [autoRotate]);

  // Sync speed mode and multiplier
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setSpeedMode(speedMode);
      sceneRef.current.setSpeedMultiplier(speedMultiplier);
    }
  }, [speedMode, speedMultiplier]);

  // Sync incoming telemetry
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.updateTelemetry(
        speedKph,
        drs,
        dataMode,
        fourWheelStates,
        telemetryFrame,
        physicsOutput,
        tdiResponse
      );
    }
  }, [speedKph, drs, dataMode, fourWheelStates, telemetryFrame, physicsOutput, tdiResponse]);

  const handleSelectCamera = (preset: CameraPreset) => {
    setActiveCameraPreset(preset);
    if (sceneRef.current) {
      sceneRef.current.setCameraPreset(preset);
    }
  };

  const visModes: { id: TyreVisMode; label: string; icon: React.ReactNode }[] = [
    { id: 'NORMAL', label: 'NORMAL', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'THERMAL', label: 'THERMAL', icon: <Flame className="w-3.5 h-3.5" /> },
    { id: 'WEAR', label: 'WEAR', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'LOAD', label: 'LOAD', icon: <Compass className="w-3.5 h-3.5" /> },
    { id: 'GRIP', label: 'GRIP', icon: <Gauge className="w-3.5 h-3.5" /> },
    { id: 'PREDICTION', label: 'PREDICT', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  const camPresets: { id: CameraPreset; label: string }[] = [
    { id: 'HERO', label: '3/4 HERO' },
    { id: 'FRONT', label: 'TREAD' },
    { id: 'LEFT', label: 'RIM FACE' },
    { id: 'TOP', label: 'TOP' },
    { id: 'TYRE_FOCUS', label: 'CLOSE-UP' },
  ];

  const cornerLabels: Record<TyreCorner, string> = {
    FL: 'FRONT LEFT',
    FR: 'FRONT RIGHT',
    RL: 'REAR LEFT',
    RR: 'REAR RIGHT',
  };

  const [twinViewMode, setTwinViewMode] = useState<'3D' | '2D'>('3D');

  return (
    <div className="relative w-full h-full min-h-[480px] rounded-2xl border border-slate-200/90 overflow-hidden flex flex-col shadow-xs select-none bg-[#f8fafc]">
      {/* Photorealistic Pitlane & Suzuka Racetrack Backdrop */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Soft daylight sky & blurred Suzuka grandstand / pitwall background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#e2e8f0] via-[#f1f5f9] to-[#cbd5e1] opacity-90" />
        
        {/* Distant Suzuka Pit Building & Grandstand Silhouette */}
        <div className="absolute top-0 left-0 right-0 h-44 opacity-25 filter blur-[1px]">
          <svg viewBox="0 0 1000 120" preserveAspectRatio="none" className="w-full h-full fill-slate-500">
            {/* Grandstand canopy */}
            <polygon points="0,60 120,40 250,42 400,35 600,38 750,32 900,36 1000,40 1000,120 0,120" />
            {/* Pit gantry and floodlight masts */}
            <rect x="180" y="15" width="4" height="60" />
            <rect x="420" y="10" width="4" height="65" />
            <rect x="680" y="12" width="4" height="63" />
            <rect x="880" y="14" width="4" height="60" />
            {/* Pit wall barrier */}
            <rect x="0" y="80" width="1000" height="15" fill="#94a3b8" />
          </svg>
        </div>

        {/* Realistic Red & White Racing Kerbs in the midground */}
        <div className="absolute top-36 left-0 right-0 h-10 overflow-hidden opacity-35 filter blur-[0.5px]">
          <svg viewBox="0 0 1200 40" preserveAspectRatio="none" className="w-full h-full">
            {Array.from({ length: 30 }).map((_, i) => (
              <polygon
                key={i}
                points={`${i * 40},40 ${i * 40 + 20},0 ${i * 40 + 40},0 ${i * 40 + 20},40`}
                fill={i % 2 === 0 ? '#E10600' : '#FFFFFF'}
              />
            ))}
          </svg>
        </div>

        {/* Concrete Pitlane Tarmac Flooring */}
        <div className="absolute bottom-0 left-0 right-0 h-[60%] bg-gradient-to-t from-[#94a3b8]/40 via-[#cbd5e1]/30 to-transparent" />
        {/* Subtle pit box grid marking line */}
        <div className="absolute bottom-16 left-0 right-0 h-[1.5px] bg-white/40 shadow-xs" />
      </div>

      {/* Top Header & Visual Mode Switcher Overlay */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        {/* Title Badge */}
        <div className="flex items-center space-x-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
          <span className="flex h-2 w-2 relative">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
          </span>
          <span className="text-xs font-mono font-bold text-slate-900 tracking-wider">
            3D TYRE DIGITAL TWIN
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono font-bold">
            60 FPS
          </span>
        </div>

        {/* 6 Visual Mode Switcher Buttons */}
        <div className="flex items-center space-x-1 bg-white/95 backdrop-blur-md p-1 rounded-lg border border-slate-200 shadow-2xs">
          {visModes.map((m) => {
            const isActive = visMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSelectVisMode(m.id)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-red-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {m.icon}
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="w-full h-full flex-1 relative z-10" />

      {/* 6 FLOATING SPATIALLY ANCHORED CALLOUT PINS ON THE 3D TYRE (Direct 3D World Space Projection) */}
      {visMode === 'THERMAL' && (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          {/* Unified SVG Leader Lines Layer in CSS Pixel Coordinates */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* 1. HOT SPOT */}
            <path
              ref={(el) => { calloutRefs.current.paths['hotSpot'] = el; }}
              fill="none"
              stroke="#ef4444"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* 2. INNER SHOULDER */}
            <path
              ref={(el) => { calloutRefs.current.paths['innerShoulder'] = el; }}
              fill="none"
              stroke="#f97316"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* 3. SURFACE TEMP */}
            <path
              ref={(el) => { calloutRefs.current.paths['surfaceTemp'] = el; }}
              fill="none"
              stroke="#facc15"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* 4. CONTACT PATCH */}
            <path
              ref={(el) => { calloutRefs.current.paths['contactPatch'] = el; }}
              fill="none"
              stroke="#10b981"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* 5. TREAD CENTER */}
            <path
              ref={(el) => { calloutRefs.current.paths['treadCenter'] = el; }}
              fill="none"
              stroke="#22c55e"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* 6. OUTER SHOULDER */}
            <path
              ref={(el) => { calloutRefs.current.paths['outerShoulder'] = el; }}
              fill="none"
              stroke="#0284c7"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>

          {/* 6 Responsive Dual-Ring Anchor Nodes On the 3D Tyre Rubber (Tracked via 3D world projection) */}
          {/* Node 1: Hot Spot (Crimson Red) */}
          <div
            ref={(el) => { calloutRefs.current.dots['hotSpot'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform flex items-center justify-center w-4 h-4 rounded-full border border-red-500 bg-red-500/25 shadow-sm shadow-red-950/40"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
          </div>

          {/* Node 2: Inner Shoulder (Fiery Orange) */}
          <div
            ref={(el) => { calloutRefs.current.dots['innerShoulder'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform flex items-center justify-center w-4 h-4 rounded-full border border-orange-500 bg-orange-500/25 shadow-sm shadow-orange-950/40"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
          </div>

          {/* Node 3: Surface Temp (Lemon Yellow) */}
          <div
            ref={(el) => { calloutRefs.current.dots['surfaceTemp'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform flex items-center justify-center w-4 h-4 rounded-full border border-amber-400 bg-amber-400/25 shadow-sm shadow-amber-950/40"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
          </div>

          {/* Node 4: Contact Patch (Emerald Green) */}
          <div
            ref={(el) => { calloutRefs.current.dots['contactPatch'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform flex items-center justify-center w-4 h-4 rounded-full border border-emerald-500 bg-emerald-500/25 shadow-sm shadow-emerald-950/40"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
          </div>

          {/* Node 5: Tread Center (Pure Green) */}
          <div
            ref={(el) => { calloutRefs.current.dots['treadCenter'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform flex items-center justify-center w-4 h-4 rounded-full border border-green-500 bg-green-500/25 shadow-sm shadow-green-950/40"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
          </div>

          {/* Node 6: Outer Shoulder (Cobalt / Sky Blue) */}
          <div
            ref={(el) => { calloutRefs.current.dots['outerShoulder'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform flex items-center justify-center w-4 h-4 rounded-full border border-sky-500 bg-sky-500/25 shadow-sm shadow-sky-950/40"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
          </div>

          {/* 6 Responsive Engineering Callout Badges (Always upright, dynamic 3D anchored) */}
          {/* BADGE 1: HOT SPOT 118°C */}
          <div
            ref={(el) => { calloutRefs.current.badges['hotSpot'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-red-500/90 shadow-lg shadow-red-950/40 text-center min-w-[78px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">HOT SPOT</div>
            <div className="text-[17px] font-extrabold font-mono text-[#ef4444] leading-tight">118°C</div>
          </div>

          {/* BADGE 2: INNER SHOULDER 110°C */}
          <div
            ref={(el) => { calloutRefs.current.badges['innerShoulder'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-orange-500/90 shadow-lg shadow-orange-950/40 text-center min-w-[86px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">INNER SHOULDER</div>
            <div className="text-[17px] font-extrabold font-mono text-[#f97316] leading-tight">{innerC}°C</div>
          </div>

          {/* BADGE 3: SURFACE TEMP 97°C */}
          <div
            ref={(el) => { calloutRefs.current.badges['surfaceTemp'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-400/90 shadow-lg shadow-amber-950/40 text-center min-w-[86px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">SURFACE TEMP</div>
            <div className="text-[17px] font-extrabold font-mono text-[#facc15] leading-tight">{surfaceC}°C</div>
          </div>

          {/* BADGE 4: CONTACT PATCH 84°C */}
          <div
            ref={(el) => { calloutRefs.current.badges['contactPatch'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-emerald-500/90 shadow-lg shadow-emerald-950/40 text-center min-w-[86px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">CONTACT PATCH</div>
            <div className="text-[17px] font-extrabold font-mono text-[#10b981] leading-tight">{outerC}°C</div>
          </div>

          {/* BADGE 5: TREAD CENTER 96°C */}
          <div
            ref={(el) => { calloutRefs.current.badges['treadCenter'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-emerald-500/90 shadow-lg shadow-emerald-950/40 text-center min-w-[86px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">TREAD CENTER</div>
            <div className="text-[17px] font-extrabold font-mono text-[#22c55e] leading-tight">{centerC}°C</div>
          </div>

          {/* BADGE 6: OUTER SHOULDER 84°C */}
          <div
            ref={(el) => { calloutRefs.current.badges['outerShoulder'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-sky-500/90 shadow-lg shadow-sky-950/40 text-center min-w-[86px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">OUTER SHOULDER</div>
            <div className="text-[17px] font-extrabold font-mono text-[#0284c7] leading-tight">{outerC}°C</div>
          </div>
        </div>
      )}

      {/* Top Left Floating Active Tyre Corner Title & Live Velocity */}
      <div className="absolute top-14 left-4 pointer-events-none flex flex-col gap-1 z-20">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block font-bold">
          ACTIVE CORNER
        </span>
        <span className="text-sm font-bold font-mono text-slate-900 tracking-wider">
          {cornerLabels[selectedTyre]} ({selectedTyre})
        </span>

        {/* Velocity / Omega / Frozen Badges (Compact width to preserve clean negative space) */}
        <div className="text-[9.5px] font-mono text-slate-600 flex items-center space-x-1.5 mt-0.5 bg-white/95 backdrop-blur-md px-2 py-0.5 rounded-lg border border-slate-200 w-fit shadow-2xs max-w-[260px]">
          <span>
            VELOCITY: <strong className="text-slate-900 font-bold">{Math.round(speedKph !== undefined && speedKph !== null ? Math.max(0, speedKph) : 287)} KM/H</strong>
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-emerald-700 font-bold">
            ω = {speedMultiplier === 0 || (speedKph !== undefined && speedKph <= 0) ? 0 : Math.round(((speedKph > 0 ? speedKph : 287) / 3.6 / 0.36) * speedMultiplier)} RAD/S
          </span>
          <span className="text-slate-400">•</span>
          <span className={`px-1.5 py-0.2 rounded border text-[8.5px] font-bold tracking-wider ${
            speedMultiplier === 0
              ? 'bg-sky-50 border-sky-300 text-sky-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            {speedMultiplier === 0 ? '❄ FROZEN' : speedMultiplier === 1.0 ? '🏎 REAL' : `${speedMultiplier}x`}
          </span>
        </div>

        {/* Suzuka Circuit Track Map & Session Telemetry */}
        <div className="mt-3 flex flex-col pointer-events-none bg-white/90 backdrop-blur-sm p-2.5 rounded-xl border border-slate-200/80 shadow-2xs w-fit">
          <div className="flex flex-col">
            <span className="text-xs font-bold font-mono text-slate-800 tracking-wider">SUZUKA</span>
            <span className="text-[9px] font-mono text-slate-400 -mt-0.5 tracking-wider">JAPAN</span>
          </div>

          {/* Detailed Figure-8 Suzuka Circuit Line Drawing */}
          <div className="my-1.5">
            <svg viewBox="0 0 160 90" className="w-36 h-20 stroke-slate-500 fill-none stroke-[2] stroke-linecap-round stroke-linejoin-round">
              <path d="M 28,62 C 14,58 14,40 26,34 C 40,28 52,22 68,16 C 82,12 104,14 122,24 C 138,34 144,48 136,60 C 126,74 108,78 94,72 C 80,66 74,54 64,44 C 54,34 44,46 36,60 C 32,66 22,64 28,62 Z" />
              {/* Start/Finish Line */}
              <line x1="24" y1="32" x2="32" y2="36" stroke="#E10600" strokeWidth="2.5" />
            </svg>
          </div>

          {/* Session Data Table */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px] font-mono">
            <span className="text-slate-500 font-medium">TRACK TEMP</span>
            <span className="text-slate-800 font-bold text-right">32°C</span>

            <span className="text-slate-500 font-medium">AIR TEMP</span>
            <span className="text-slate-800 font-bold text-right">28°C</span>

            <span className="text-slate-500 font-medium">HUMIDITY</span>
            <span className="text-slate-800 font-bold text-right">54%</span>

            <span className="text-slate-500 font-medium">SESSION</span>
            <span className="text-slate-800 font-bold text-right">FP2</span>

            <span className="text-slate-500 font-medium">LAP</span>
            <span className="text-slate-800 font-bold text-right">12/56</span>
          </div>
        </div>
      </div>

      {/* Top Right Floating HUD: Surface Temperature Scale */}
      {visMode === 'THERMAL' && (
        <div className="absolute top-12 right-4 z-20 pointer-events-none bg-white/95 backdrop-blur-md px-3 py-2.5 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col gap-1">
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-600 font-bold leading-tight">
            <span>SURFACE TEMP (°C)</span>
          </div>

          <div className="flex items-stretch space-x-2.5 mt-1">
            {/* Continuous Vertical Gradient Bar */}
            <div className="w-2.5 rounded-full overflow-hidden bg-gradient-to-b from-[#f50505] via-[#ff1a00] via-[#ff7700] via-[#faeb0a] via-[#1ee038] via-[#00e5f5] to-[#0526e6] shadow-2xs" />

            {/* Scale Ticks & Values */}
            <div className="flex flex-col justify-between text-[10px] font-mono leading-none h-36">
              <span className="text-red-600 font-bold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>&gt; 120°C</span>
              </span>
              <span className="text-orange-600 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>110°C</span>
              </span>
              <span className="text-yellow-600 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>100°C</span>
              </span>
              <span className="text-emerald-600 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>90°C</span>
              </span>
              <span className="text-teal-600 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>80°C</span>
              </span>
              <span className="text-sky-600 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>70°C</span>
              </span>
              <span className="text-blue-700 font-bold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>60°C</span>
              </span>
              <span className="text-blue-900 font-bold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>&lt; 60°C</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Inset 2D/3D Toggle Widget & Miniature Tyre (Matching Reference Middle-Right) */}
      <div className="absolute top-[48%] right-4 z-20 flex flex-col items-center bg-white/95 backdrop-blur-md p-2 rounded-2xl border border-slate-200/90 shadow-sm pointer-events-auto">
        {/* 3D / 2D Toggle Pills */}
        <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 mb-1.5">
          <button
            onClick={() => setTwinViewMode('3D')}
            className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
              twinViewMode === '3D'
                ? 'bg-[#E10600] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3D
          </button>
          <button
            onClick={() => setTwinViewMode('2D')}
            className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
              twinViewMode === '2D'
                ? 'bg-[#E10600] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2D
          </button>
        </div>

        {/* Miniature Tyre Graphic */}
        <div className="w-14 h-12 relative flex items-center justify-center">
          <svg viewBox="0 0 60 60" className="w-full h-full">
            {/* Tyre Outer Silhouette */}
            <circle cx="30" cy="30" r="26" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5" />
            {/* Tyre Yellow Pirelli Sidewall Line */}
            <circle cx="30" cy="30" r="21" fill="none" stroke="#eab308" strokeWidth="1.2" strokeDasharray="18 4 6 4" />
            {/* BBS Rim & Wheel Nut */}
            <circle cx="30" cy="30" r="14" fill="#27272a" stroke="#71717a" strokeWidth="1.5" />
            <circle cx="30" cy="30" r="6" fill="#0284c7" stroke="#38bdf8" strokeWidth="1" />
          </svg>
        </div>

        {/* TGR-01 TYRE DIGITAL TWIN Label */}
        <div className="text-center mt-0.5">
          <div className="text-[10px] font-mono font-bold text-slate-900 tracking-wider">TGR-01</div>
          <div className="text-[7.5px] font-mono text-slate-500 uppercase tracking-wider">TYRE DIGITAL TWIN</div>
        </div>
      </div>

      {/* Bottom Controls Bar: Stepped floating pill layout matching reference image exactly */}
      <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-auto w-fit max-w-[calc(100%-24px)]">
        {/* Row 1: Camera Presets Floating Pill Card */}
        <div className="flex items-center space-x-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-200/90 shadow-sm w-fit">
          <Video className="w-3.5 h-3.5 text-slate-700 shrink-0" />
          <span className="text-[11px] font-mono font-bold text-slate-800 tracking-wider">VIEW:</span>
          <div className="flex items-center space-x-0.5">
            {camPresets.map((p) => {
              const isCurrent = activeCameraPreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectCamera(p.id)}
                  className={`px-3 py-1 rounded-xl text-[11px] font-mono font-bold transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-[#E10600] text-white shadow-[0_2px_10px_rgba(225,6,0,0.45)]'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Pace & Simulation Controls in 2 Adjacent Floating Cards */}
        <div className="flex items-center space-x-2 flex-wrap">
          {/* Card A: PACE Multipliers */}
          <div className="flex items-center space-x-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-200/90 shadow-sm">
            <span className="text-[11px] font-mono font-bold text-slate-800 tracking-wider">PACE:</span>
            <div className="flex items-center space-x-1 bg-slate-100/70 p-0.5 rounded-xl border border-slate-200/60">
              {[0.1, 0.5, 1.0, 1.5, 2.0].map((m) => {
                const isPaceActive = paceMultiplier === m;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      setPaceMultiplier(m);
                      setSpeedMultiplier(m);
                      setSpeedMode(m === 0.1 ? 'SLOWMO' : 'REAL');
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer ${
                      isPaceActive
                        ? 'border border-red-500/90 bg-white text-[#E10600] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m}x
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card B: Speed Modes & Drift/Reset Actions */}
          <div className="flex items-center space-x-1.5 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-2xl border border-slate-200/90 shadow-sm">
            {/* REAL SPEED */}
            <button
              onClick={() => {
                setSpeedMultiplier(1.0);
                setSpeedMode('REAL');
              }}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-[11px] font-mono font-bold transition-all cursor-pointer ${
                speedMultiplier === 1.0 && speedMode === 'REAL'
                  ? 'bg-[#E10600] text-white shadow-[0_2px_10px_rgba(225,6,0,0.45)]'
                  : 'text-slate-700 hover:bg-slate-100/80'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 11.5 C2.5 8 4.5 5 8 5 C11.5 5 13.5 8 13.5 11.5 Z" />
              </svg>
              <span>REAL SPEED</span>
            </button>

            {/* TURBO */}
            <button
              onClick={() => {
                setSpeedMultiplier(1.8);
                setSpeedMode('REAL');
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold transition-all cursor-pointer ${
                speedMultiplier === 1.8 && speedMode === 'REAL'
                  ? 'bg-[#E10600] text-white shadow-[0_2px_10px_rgba(225,6,0,0.45)]'
                  : 'text-slate-700 hover:bg-slate-100/80'
              }`}
            >
              <Zap className="w-3 h-3 shrink-0" />
              <span>TURBO</span>
            </button>

            {/* SLOW-MO */}
            <button
              onClick={() => {
                setSpeedMultiplier(0.08);
                setSpeedMode('SLOWMO');
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold transition-all cursor-pointer ${
                speedMode === 'SLOWMO'
                  ? 'bg-[#E10600] text-white shadow-[0_2px_10px_rgba(225,6,0,0.45)]'
                  : 'text-slate-700 hover:bg-slate-100/80'
              }`}
            >
              <Search className="w-3 h-3 shrink-0" />
              <span>SLOW-MO</span>
            </button>

            {/* FREEZE */}
            <button
              onClick={() => {
                setSpeedMultiplier(0.0);
                setSpeedMode('FREEZE');
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold transition-all cursor-pointer ${
                speedMode === 'FREEZE'
                  ? 'bg-[#E10600] text-white shadow-[0_2px_10px_rgba(225,6,0,0.45)]'
                  : 'text-slate-700 hover:bg-slate-100/80'
              }`}
            >
              <Snowflake className="w-3 h-3 shrink-0" />
              <span>FREEZE</span>
            </button>

            {/* DRIFT in bordered individual capsule */}
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`flex items-center space-x-1 px-3 py-1 rounded-xl text-[11px] font-mono font-bold border transition-all cursor-pointer shadow-2xs ml-1 ${
                autoRotate
                  ? 'bg-red-50 border-[#E10600] text-[#E10600]'
                  : 'border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>DRIFT</span>
            </button>

            {/* RESET in bordered individual capsule */}
            <button
              onClick={() => {
                if (sceneRef.current) sceneRef.current.resetCamera();
                setActiveCameraPreset('HERO');
              }}
              className="px-3 py-1 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-mono font-bold transition-colors cursor-pointer shadow-2xs"
            >
              <span>RESET</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

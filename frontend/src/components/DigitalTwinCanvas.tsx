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
  isPaused?: boolean;
  isConnected?: boolean;
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
  isPaused = false,
  isConnected,
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

  const isConnectedEffective = isConnected ?? Boolean(telemetryFrame || physicsOutput || tdiResponse);
  const isPausedEffective = Boolean(isPaused);

  // Compute live temperature for HUD displays
  const currentCornerState = calculateTyreCornerState(
    selectedTyre,
    telemetryFrame ?? null,
    physicsOutput ?? null,
    tdiResponse ?? null,
    fourWheelStates ?? null,
    dataMode
  );

  const surfaceC = isConnectedEffective ? (currentCornerState.thermal.surface_c ?? 0) : 0;
  const innerC = isConnectedEffective ? (currentCornerState.thermal.inner_c ?? 0) : 0;
  const centerC = isConnectedEffective ? (currentCornerState.thermal.center_c ?? 0) : 0;
  const outerC = isConnectedEffective ? (currentCornerState.thermal.outer_c ?? 0) : 0;
  const hotSpotC = isConnectedEffective && surfaceC > 0 ? Math.max(innerC, centerC, outerC, surfaceC) : 0;
  const contactPatchC = isConnectedEffective && surfaceC > 0 ? Math.round((innerC + centerC) / 2) : 0;

  // Live Telemetry Car Marker state along Suzuka Track Map
  const [carCoords, setCarCoords] = useState<{ x: number; y: number }>({ x: 182, y: 130 });
  const trackPathRef = useRef<SVGPathElement>(null);
  const trackProgressRef = useRef<number>(0.08);

  useEffect(() => {
    if (!isConnectedEffective || isPausedEffective || speedKph <= 0) return;
    let animId: number;
    let lastTime = performance.now();

    const animateCar = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      // Suzuka circuit length = 5807m
      const lapDurationSec = 5807 / (Math.max(60, speedKph) / 3.6);
      trackProgressRef.current = (trackProgressRef.current + (dt / lapDurationSec) * (speedMultiplier || 1.0)) % 1.0;

      if (trackPathRef.current) {
        try {
          const totalLen = trackPathRef.current.getTotalLength();
          const pt = trackPathRef.current.getPointAtLength(trackProgressRef.current * totalLen);
          setCarCoords({ x: Math.round(pt.x), y: Math.round(pt.y) });
        } catch {
          // ignore
        }
      }
      animId = requestAnimationFrame(animateCar);
    };

    animId = requestAnimationFrame(animateCar);
    return () => cancelAnimationFrame(animId);
  }, [isConnectedEffective, isPausedEffective, speedKph, speedMultiplier]);

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
      const shouldRoll = isConnectedEffective && !isPausedEffective && speedKph > 0 && speedMode !== 'FREEZE';
      sceneRef.current.setRolling(shouldRoll);
      sceneRef.current.setSpeedMode(speedMode);
      sceneRef.current.setSpeedMultiplier(shouldRoll ? speedMultiplier : 0.0);
    }
  }, [speedMode, speedMultiplier, isConnectedEffective, isPausedEffective, speedKph]);

  // Sync incoming telemetry
  useEffect(() => {
    if (sceneRef.current) {
      const effectiveSpeed = (isConnectedEffective && !isPausedEffective) ? Math.max(0, speedKph) : 0;
      sceneRef.current.updateTelemetry(
        effectiveSpeed,
        drs,
        dataMode,
        fourWheelStates,
        telemetryFrame,
        physicsOutput,
        tdiResponse
      );
    }
  }, [speedKph, drs, dataMode, fourWheelStates, telemetryFrame, physicsOutput, tdiResponse, isConnectedEffective, isPausedEffective]);

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
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        {/* Soft daylight sky with clean open horizon */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#e2e8f0] via-[#edf2f7] to-[#cbd5e1] opacity-95" />

        {/* Concrete Pitlane Tarmac Flooring with perspective depth */}
        <div className="absolute bottom-0 left-0 right-0 h-[60%] bg-gradient-to-t from-[#64748b]/35 via-[#94a3b8]/20 to-transparent" />
        {/* Subtle pit box grid marking line */}
        <div className="absolute bottom-16 left-0 right-0 h-[1.5px] bg-white/50 shadow-xs" />
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
          {/* BADGE 1: HOT SPOT */}
          <div
            ref={(el) => { calloutRefs.current.badges['hotSpot'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-red-500/90 shadow-lg shadow-red-950/40 text-center min-w-[78px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">HOT SPOT</div>
            <div className="text-[17px] font-extrabold font-mono text-[#ef4444] leading-tight">{hotSpotC}°C</div>
          </div>

          {/* BADGE 2: INNER SHOULDER */}
          <div
            ref={(el) => { calloutRefs.current.badges['innerShoulder'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-orange-500/90 shadow-lg shadow-orange-950/40 text-center min-w-[86px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">INNER SHOULDER</div>
            <div className="text-[17px] font-extrabold font-mono text-[#f97316] leading-tight">{innerC}°C</div>
          </div>

          {/* BADGE 3: SURFACE TEMP */}
          <div
            ref={(el) => { calloutRefs.current.badges['surfaceTemp'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-400/90 shadow-lg shadow-amber-950/40 text-center min-w-[86px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">SURFACE TEMP</div>
            <div className="text-[17px] font-extrabold font-mono text-[#facc15] leading-tight">{surfaceC}°C</div>
          </div>

          {/* BADGE 4: CONTACT PATCH */}
          <div
            ref={(el) => { calloutRefs.current.badges['contactPatch'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-emerald-500/90 shadow-lg shadow-emerald-950/40 text-center min-w-[86px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">CONTACT PATCH</div>
            <div className="text-[17px] font-extrabold font-mono text-[#10b981] leading-tight">{contactPatchC}°C</div>
          </div>

          {/* BADGE 5: TREAD CENTER */}
          <div
            ref={(el) => { calloutRefs.current.badges['treadCenter'] = el; }}
            className="absolute top-0 left-0 pointer-events-none will-change-transform bg-[#13161f]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-emerald-500/90 shadow-lg shadow-emerald-950/40 text-center min-w-[86px]"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="text-[8px] font-mono font-bold tracking-wider text-white/90 uppercase leading-tight">TREAD CENTER</div>
            <div className="text-[17px] font-extrabold font-mono text-[#22c55e] leading-tight">{centerC}°C</div>
          </div>

          {/* BADGE 6: OUTER SHOULDER */}
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
            VELOCITY: <strong className="text-slate-900 font-bold">{Math.round(isConnectedEffective && !isPausedEffective && speedKph ? Math.max(0, speedKph) : 0)} KM/H</strong>
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-emerald-700 font-bold">
            ω = {speedMultiplier === 0 || isPausedEffective || !isConnectedEffective || speedKph <= 0 ? 0 : Math.round(((speedKph > 0 ? speedKph : 0) / 3.6 / 0.36) * speedMultiplier)} RAD/S
          </span>
          <span className="text-slate-400">•</span>
          <span className={`px-1.5 py-0.2 rounded border text-[8.5px] font-bold tracking-wider ${
            speedMultiplier === 0 || isPausedEffective || !isConnectedEffective || speedKph <= 0
              ? 'bg-sky-50 border-sky-300 text-sky-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            {!isConnectedEffective ? '⚡ OFFLINE' : isPausedEffective ? '⏸ PAUSED' : speedMultiplier === 0 ? '❄ FROZEN' : speedMultiplier === 1.0 ? '🏎 REAL' : `${speedMultiplier}x`}
          </span>
        </div>

        {/* Realistic Suzuka Circuit Track Map & Session Telemetry (near-invisible glass over the moving road) */}
        <div className="mt-2.5 flex flex-col pointer-events-auto bg-white/10 backdrop-blur-[3px] p-2.5 rounded-2xl border border-white/25 shadow-lg shadow-slate-900/10 w-fit max-w-[275px]">
          {/* Track Header */}
          <div className="flex items-center justify-between border-b border-white/20 pb-1 mb-1">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs">🇯🇵</span>
              <div className="flex flex-col">
                <span className="text-[11px] font-black font-mono text-slate-900 tracking-wider leading-none">SUZUKA</span>
                <span className="text-[7.5px] font-mono text-slate-400 tracking-tight leading-none mt-0.5">INTERNATIONAL CIRCUIT</span>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <span className="px-1.5 py-0.5 rounded bg-red-50 text-[#E10600] border border-red-200 text-[8.5px] font-mono font-bold">
                5.807 KM
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[8.5px] font-mono font-bold">
                18 TURNS
              </span>
            </div>
          </div>

          {/* Detailed Figure-8 Suzuka Circuit Drawing (near-invisible glass, road shows through) */}
          <div className="relative my-0.5 bg-white/10 rounded-xl p-1 border border-white/20 shadow-inner overflow-hidden">
            {/* Sector Legend Pills */}
            <div className="absolute top-1 left-1.5 flex items-center space-x-1.5 text-[7.5px] font-mono font-bold select-none z-10">
              <span className="flex items-center space-x-0.5 text-cyan-700">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 inline-block"></span>
                <span>S1</span>
              </span>
              <span className="flex items-center space-x-0.5 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
                <span>S2</span>
              </span>
              <span className="flex items-center space-x-0.5 text-pink-700">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 inline-block"></span>
                <span>S3</span>
              </span>
            </div>

            {/* Circuit SVG */}
            <svg viewBox="0 0 260 170" className="w-[245px] h-[135px] select-none overflow-visible">
              <defs>
                <filter id="bridgeShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="1" dy="1.5" stdDeviation="1.5" floodColor="#0f172a" floodOpacity="0.45" />
                </filter>
                <linearGradient id="tarmacRibbon" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
              </defs>

              {/* 1. Track Runoff / Gravel halo */}
              <path
                d="M 182,130 L 196,86 C 200,74 212,65 226,72 C 238,78 240,94 232,106 C 224,116 214,122 218,132 C 222,142 232,146 226,154 C 220,160 208,158 202,148 C 196,138 188,132 178,134 C 166,136 154,142 146,152 C 140,160 148,166 156,162 C 162,158 164,148 158,140 C 152,130 136,118 122,108 C 106,96 86,90 84,106 C 82,118 96,126 108,122 C 120,118 128,102 118,84 C 110,70 92,52 74,40 C 58,28 36,24 24,38 C 12,52 18,72 38,82 C 54,90 72,86 88,74 C 106,62 134,92 152,112 C 164,124 176,132 188,118 C 196,108 194,88 178,78 C 168,72 160,76 164,86 C 168,96 174,108 182,130 Z"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.6"
              />

              {/* 2. Main Track Tarmac Ribbon */}
              <path
                ref={trackPathRef}
                d="M 182,130 L 196,86 C 200,74 212,65 226,72 C 238,78 240,94 232,106 C 224,116 214,122 218,132 C 222,142 232,146 226,154 C 220,160 208,158 202,148 C 196,138 188,132 178,134 C 166,136 154,142 146,152 C 140,160 148,166 156,162 C 162,158 164,148 158,140 C 152,130 136,118 122,108 C 106,96 86,90 84,106 C 82,118 96,126 108,122 C 120,118 128,102 118,84 C 110,70 92,52 74,40 C 58,28 36,24 24,38 C 12,52 18,72 38,82 C 54,90 72,86 88,74 C 106,62 134,92 152,112 C 164,124 176,132 188,118 C 196,108 194,88 178,78 C 168,72 160,76 164,86 C 168,96 174,108 182,130 Z"
                fill="none"
                stroke="url(#tarmacRibbon)"
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* 3. Underpass lower segment dark shadow indicator */}
              <path
                d="M 158,140 C 152,130 136,118 122,108"
                fill="none"
                stroke="#0f172a"
                strokeWidth="6"
                strokeLinecap="round"
              />

              {/* 4. The Crossover Flyover Bridge structure (crossing over at x:138, y:98) */}
              <g filter="url(#bridgeShadow)">
                {/* Bridge Deck Base */}
                <path
                  d="M 126,84 L 148,108"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="8"
                  strokeLinecap="butt"
                />
                {/* Bridge Tarmac Surface */}
                <path
                  d="M 126,84 L 148,108"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="5.5"
                  strokeLinecap="butt"
                />
                {/* Bridge White Concrete Parapet Guardrails */}
                <line x1="123" y1="87" x2="145" y2="111" stroke="#f8fafc" strokeWidth="1.2" />
                <line x1="129" y1="81" x2="151" y2="105" stroke="#f8fafc" strokeWidth="1.2" />
              </g>

              {/* 5. Sector Overlays */}
              {/* Sector 1 (Pit Straight through Dunlop) */}
              <path
                d="M 182,130 L 196,86 C 200,74 212,65 226,72 C 238,78 240,94 232,106 C 224,116 214,122 218,132 C 222,142 232,146 226,154 C 220,160 208,158 202,148 C 196,138 188,132 178,134 C 166,136 154,142 146,152"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeOpacity="0.9"
              />
              {/* Sector 2 (Degners through Spoon) */}
              <path
                d="M 146,152 C 140,160 148,166 156,162 C 162,158 164,148 158,140 C 152,130 136,118 122,108 C 106,96 86,90 84,106 C 82,118 96,126 108,122 C 120,118 128,102 118,84 C 110,70 92,52 74,40 C 58,28 36,24 24,38 C 12,52 18,72 38,82 C 54,90 72,86 88,74"
                fill="none"
                stroke="#eab308"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeOpacity="0.9"
              />
              {/* Sector 3 (Back Straight through 130R, Casio, Finish) */}
              <path
                d="M 88,74 C 106,62 134,92 152,112 C 164,124 176,132 188,118 C 196,108 194,88 178,78 C 168,72 160,76 164,86 C 168,96 174,108 182,130"
                fill="none"
                stroke="#ec4899"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeOpacity="0.9"
              />

              {/* 6. DRS Zone 1 (Main Straight) & DRS Zone 2 (Back Straight) */}
              <line x1="184" y1="125" x2="194" y2="92" stroke="#22c55e" strokeWidth="2.5" strokeDasharray="3,2" />
              <line x1="102" y1="66" x2="128" y2="88" stroke="#22c55e" strokeWidth="2.5" strokeDasharray="3,2" />

              {/* 7. Start/Finish Line with Checkered Gantry Line */}
              <line x1="180" y1="124" x2="188" y2="126" stroke="#ffffff" strokeWidth="3" />
              <line x1="180" y1="124" x2="188" y2="126" stroke="#E10600" strokeWidth="1.5" strokeDasharray="2,2" />

              {/* 8. Apex Kerbs at iconic corners */}
              {/* T1 Apex Kerb */}
              <path d="M 230,73 C 236,78 238,88 234,96" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
              {/* S-Curves Apex Kerb */}
              <path d="M 216,130 C 219,136 224,140 220,146" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
              {/* Hairpin Apex Kerb */}
              <path d="M 82,102 C 80,110 86,116 94,114" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
              {/* Spoon Apex Kerb */}
              <path d="M 22,46 C 16,56 18,68 30,76" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
              {/* 130R Apex Kerb */}
              <path d="M 194,102 C 192,90 186,84 176,78" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
              {/* Casio Chicane Apex Kerb */}
              <path d="M 162,75 C 158,78 160,84 165,88" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />

              {/* 9. Iconic Corner Label Badges */}
              <g className="text-[7px] font-mono font-bold select-none">
                <text x="198" y="102" fill="#0f172a" className="font-extrabold">130R</text>
                <text x="12" y="32" fill="#0f172a">SPOON</text>
                <text x="56" y="118" fill="#0f172a">HAIRPIN</text>
                <text x="226" y="140" fill="#0f172a">S-CURVES</text>
                <text x="144" y="174" fill="#0f172a">DEGNER</text>
                <text x="142" y="70" fill="#0f172a">CASIO</text>
                <text x="190" y="136" fill="#e10600" className="text-[6.5px]">S/F</text>
              </g>

              {/* 10. Live Telemetry Car Marker */}
              <g transform={`translate(${carCoords.x}, ${carCoords.y})`}>
                {/* Radar pulse ring when connected and running */}
                {isConnectedEffective && !isPausedEffective && speedKph > 0 && (
                  <circle r="6" fill="none" stroke="#ef4444" strokeWidth="1.2" className="animate-ping opacity-75" />
                )}
                {/* Outer halo */}
                <circle r="3.8" fill="#ffffff" stroke="#e10600" strokeWidth="1.2" />
                {/* Core vehicle dot */}
                <circle r="2" fill="#e10600" />
              </g>
            </svg>
          </div>

          {/* Session Data Table */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8.5px] font-mono border-t border-white/20 pt-1 mt-0.5">
            <span className="text-slate-500 font-medium">TRACK TEMP</span>
            <span className="text-slate-800 font-bold text-right">{isConnectedEffective && telemetryFrame?.environment?.track_temp_c !== undefined ? `${telemetryFrame.environment.track_temp_c}°C` : '0°C'}</span>

            <span className="text-slate-500 font-medium">AIR TEMP</span>
            <span className="text-slate-800 font-bold text-right">{isConnectedEffective && telemetryFrame?.environment?.air_temp_c !== undefined ? `${telemetryFrame.environment.air_temp_c}°C` : '0°C'}</span>

            <span className="text-slate-500 font-medium">HUMIDITY</span>
            <span className="text-slate-800 font-bold text-right">{isConnectedEffective && telemetryFrame?.environment?.humidity_pct !== undefined ? `${telemetryFrame.environment.humidity_pct}%` : '0%'}</span>

            <span className="text-slate-500 font-medium">SESSION</span>
            <span className="text-slate-800 font-bold text-right">{isConnectedEffective ? 'FP2' : 'OFFLINE'}</span>

            <span className="text-slate-500 font-medium">LAP</span>
            <span className="text-slate-800 font-bold text-right">{isConnectedEffective && telemetryFrame?.lap ? `${telemetryFrame.lap}/56` : '0/56'}</span>
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
                <span>&gt; 115°C</span>
              </span>
              <span className="text-red-500 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>100°C</span>
              </span>
              <span className="text-orange-600 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>85°C</span>
              </span>
              <span className="text-yellow-600 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>70°C</span>
              </span>
              <span className="text-emerald-600 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>55°C</span>
              </span>
              <span className="text-cyan-600 font-semibold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>35°C</span>
              </span>
              <span className="text-blue-700 font-bold flex items-center space-x-1">
                <span className="text-slate-400">-</span>
                <span>&lt; 25°C</span>
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

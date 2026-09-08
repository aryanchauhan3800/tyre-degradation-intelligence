/**
 * TYRETRACE — Digital Twin 3D Canvas Component
 * Hosts Three.js RaceCarScene with motorsport HUD overlays and camera controls.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { DataMode, FourWheelTyres, TyreCorner } from '../types/telemetry';
import { RaceCarScene } from '../three/RaceCarScene';
import { getCornerLabel } from '../services/demoSimulation';
import { RotateCcw, Eye, ShieldAlert, Zap } from 'lucide-react';

interface DigitalTwinCanvasProps {
  speedKph: number;
  drs: number;
  dataMode: DataMode;
  fourWheelStates?: FourWheelTyres | null;
  selectedTyre: TyreCorner | null;
  onSelectTyre: (corner: TyreCorner | null) => void;
}

export const DigitalTwinCanvas: React.FC<DigitalTwinCanvasProps> = ({
  speedKph,
  drs,
  dataMode,
  fourWheelStates,
  selectedTyre,
  onSelectTyre,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<RaceCarScene | null>(null);
  const [hoveredCorner, setHoveredCorner] = useState<TyreCorner | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new RaceCarScene(containerRef.current, {
      onSelectTyre: (corner) => {
        onSelectTyre(corner);
      },
      onHoverTyre: (corner) => {
        setHoveredCorner(corner);
      },
    });
    sceneRef.current = scene;

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

  // Sync selected tyre from outside props to 3D scene
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.selectTyre(selectedTyre);
    }
  }, [selectedTyre]);

  // Sync telemetry updates to 3D scene
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.updateTelemetry(speedKph, drs, dataMode, fourWheelStates);
    }
  }, [speedKph, drs, dataMode, fourWheelStates]);

  const corners: TyreCorner[] = ['FL', 'FR', 'RL', 'RR'];

  return (
    <div className="relative w-full h-full min-h-[380px] bg-[#0c0e14] rounded-lg border border-[#232938] overflow-hidden flex flex-col">
      {/* 3D Viewport Header */}
      <div className="absolute top-3 left-3 z-10 flex items-center space-x-2 pointer-events-none">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
        </span>
        <span className="text-xs font-mono tracking-wider text-slate-300 font-semibold uppercase">
          3D Digital Twin
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#161d2b] border border-[#28354d] text-cyan-400 font-mono">
          BLENDER F2 DIGITAL TWIN
        </span>
      </div>

      {/* Mode Visual Guidance Badge */}
      <div className="absolute top-3 right-3 z-10 flex items-center space-x-2">
        {dataMode === 'DEMO_SIMULATION' ? (
          <div className="flex items-center space-x-1.5 px-2 py-1 rounded bg-amber-950/60 border border-amber-600/40 text-[11px] font-mono text-amber-300">
            <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>THERMAL HEATMAP ACTIVE (SIMULATED)</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 px-2 py-1 rounded bg-[#141923]/80 border border-[#263147] text-[11px] font-mono text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
            <span>NEUTRAL SLICK (FASTF1 SOURCED)</span>
          </div>
        )}

        {selectedTyre && (
          <button
            onClick={() => onSelectTyre(null)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#1e2536] hover:bg-[#28324a] border border-[#374463] text-xs font-mono text-cyan-300 transition-colors cursor-pointer"
            title="Reset to overview camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET CAM</span>
          </button>
        )}
      </div>

      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="w-full h-full flex-1" />

      {/* Bottom Wheel Selection & Inspection HUD */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between pointer-events-auto bg-[#0a0c12]/80 backdrop-blur-sm px-3 py-2 rounded border border-[#1f2637]">
        <div className="flex items-center space-x-2">
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-mono text-slate-400 uppercase">Focus Tyre:</span>
          <div className="flex items-center space-x-1.5">
            {corners.map((corner) => {
              const isSelected = selectedTyre === corner;
              const isHovered = hoveredCorner === corner;
              return (
                <button
                  key={corner}
                  onClick={() => onSelectTyre(isSelected ? null : corner)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                      : isHovered
                      ? 'bg-[#1e2538] border border-[#3b4b6e] text-slate-200'
                      : 'bg-[#141824] border border-[#232a3d] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {corner}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hover / Selected Status Indicator */}
        <div className="text-xs font-mono text-slate-300 flex items-center space-x-3">
          {selectedTyre ? (
            <span className="text-cyan-400 font-semibold">
              INSPECTING {getCornerLabel(selectedTyre)} ({selectedTyre})
            </span>
          ) : (
            <span className="text-slate-500">CLICK ANY WHEEL TO INSPECT INTELLIGENCE</span>
          )}
          {drs > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/50 text-[10px] font-mono text-emerald-300 font-bold tracking-wider">
              DRS OPEN
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

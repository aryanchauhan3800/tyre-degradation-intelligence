/**
 * TYRETRACE — Dedicated TyreScene Component
 *
 * Wraps the Three.js Hero Tyre Scene with React lifecycle:
 * - Centered, large interactive 3D F1 wheel
 * - OrbitControls, zoom, rotate
 * - Shaders & materials for 8-stop thermal heatmap
 * - Ambient, directional, and studio lighting
 */

import React, { useEffect, useRef } from 'react';
import { HeroTyreScene } from '../../three/HeroTyreScene';
import type {
  CameraPreset,
  DataMode,
  FourWheelTyres,
  PhysicsTwinOutput,
  TDIStateResponse,
  TelemetryFrame,
  TyreCorner,
  TyreVisMode,
} from '../../types/telemetry';

export interface TyreSceneProps {
  speedKph: number;
  drs: number;
  dataMode: DataMode;
  fourWheelStates?: FourWheelTyres | null;
  telemetryFrame?: TelemetryFrame | null;
  physicsOutput?: PhysicsTwinOutput | null;
  tdiResponse?: TDIStateResponse | null;
  selectedTyre: TyreCorner;
  visMode: TyreVisMode;
  speedMultiplier?: number;
  autoRotate?: boolean;
  cameraPreset?: CameraPreset;
  onSceneReady?: (scene: HeroTyreScene) => void;
}

export const TyreScene: React.FC<TyreSceneProps> = ({
  speedKph,
  drs,
  dataMode,
  fourWheelStates,
  telemetryFrame,
  physicsOutput,
  tdiResponse,
  selectedTyre,
  visMode,
  speedMultiplier = 1.0,
  autoRotate = false,
  cameraPreset = 'HERO',
  onSceneReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HeroTyreScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new HeroTyreScene(containerRef.current);
    sceneRef.current = scene;
    onSceneReady?.(scene);

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

  // Sync active tyre corner
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

  // Sync speed multiplier
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setSpeedMultiplier(speedMultiplier);
    }
  }, [speedMultiplier]);

  // Sync camera preset
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setCameraPreset(cameraPreset);
    }
  }, [cameraPreset]);

  // Sync live telemetry
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

  return <div ref={containerRef} className="w-full h-full" />;
};

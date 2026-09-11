/**
 * TYRETRACE — Main F1 Tyre Digital-Twin Command Center Dashboard Page
 *
 * Implements the user's reference visual layout:
 * - TOP HEADER: TYRETRACE, PHYSICS-INFORMED TYRE DEGRADATION INTELLIGENCE, LIVE, LAP XX, RACE MODE
 * - LEFT PANEL: VISUALIZATION MODE (NORMAL, THERMAL [active], WEAR, LOAD, GRIP, PREDICTION) & TYRE POSITION SELECTOR
 * - CENTER VIEWPORT (55–65%): HERO 3D F1 Wheel with OrbitControls, moving track conveyor, live thermal shader on tread,
 *   vertical surface temperature scale HUD, and overheating warning banner.
 * - RIGHT PANEL: TYRE TELEMETRY matrix (Surface, Inner, Center, Outer Temp, Pressure, Load, Slip, Grip, Wear, Health) + THERMAL MAP
 * - BOTTOM PANELS: 3 Cards (Thermal Distribution, Degradation, Race Telemetry)
 * - TDI Diagnostics & Replay Control Bar
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DataMode,
  FourWheelTyres,
  PhysicsTwinOutput,
  ResidualHistoryPoint,
  SessionResponse,
  TDIHistoryPoint,
  TDIStateResponse,
  TelemetryFrame,
  TyreCorner,
  TyreVisMode,
  VehicleState,
  WebSocketTelemetryMessage,
  ReplayStatusResponse,
  ConfounderFrame,
} from '../types/telemetry';
import { api } from '../services/api';
import { useTelemetryWebSocket } from '../hooks/useTelemetryWebSocket';
import { computeDemoWheelStates } from '../services/demoSimulation';
import { calculateTyreCornerState } from '../utils/tyreCalculations';

// Redesigned Components
import { Header } from '../components/Dashboard/Header';
import { VisualizationModesPanel } from '../components/Dashboard/VisualizationModesPanel';
import { TyrePositionSelector } from '../components/TyreSelector/TyrePositionSelector';
import { DigitalTwinCanvas } from '../components/DigitalTwinCanvas';
import { TelemetryPanel } from '../components/Dashboard/TelemetryPanel';
import { ThermalPanel } from '../components/Dashboard/ThermalPanel';
import { DegradationPanel } from '../components/Dashboard/DegradationPanel';
import { RaceTelemetry } from '../components/Dashboard/RaceTelemetry';

// Analysis & Replay
import { GlobalTDICard } from '../components/GlobalTDICard';
import { WhyPanel } from '../components/WhyPanel';
import { ConfoundersPanel } from '../components/ConfoundersPanel';
import { TDITrajectoryChart } from '../components/TDITrajectoryChart';
import { ResidualChart } from '../components/ResidualChart';
import { ReplayControlBar } from '../components/ReplayControlBar';
import { Activity, BarChart2, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';

interface DashboardFrameState {
  sequence: number;
  timestamp: string;
  telemetry: TelemetryFrame | null;
  physics: PhysicsTwinOutput | null;
  confounders: ConfounderFrame | null;
  tdi: TDIStateResponse | null;
  fourWheelStates: FourWheelTyres | null;
  canonicalDrsActive: boolean;
  canonicalBrakingActive: boolean;
  canonicalHighSpeedActive: boolean;
  canonicalTransientActive: boolean;
  canonicalTyreAge: number | null;
  canonicalCompound: string;
}

function buildUnifiedFrameState(
  seq: number,
  ts: string,
  tel: TelemetryFrame | null,
  phys: PhysicsTwinOutput | null,
  conf: ConfounderFrame | null,
  tdiRes: TDIStateResponse | null,
  mode: DataMode
): DashboardFrameState {
  const veh = (tel?.vehicle || tel?.vehicle_state) ?? null;
  const speed = veh?.speed_kph ?? 0;
  const rawBrk = veh?.brake_pct ?? (veh as any)?.brake ?? 0;
  const brakePct = typeof rawBrk === 'number' && !isNaN(rawBrk) ? rawBrk : 0;
  const rawDrs = veh?.drs ?? 0;

  const activeFlags = Array.isArray(conf?.active_flags) ? conf.active_flags : [];

  const drsActive =
    conf?.drs_active !== undefined
      ? Boolean(conf.drs_active)
      : activeFlags.includes('DRS_ACTIVE') ||
        (typeof rawDrs === 'number' &&
          (rawDrs === 8 || rawDrs === 10 || rawDrs === 12 || rawDrs === 14 || rawDrs >= 8));

  const brakingActive =
    conf?.braking_active !== undefined
      ? Boolean(conf.braking_active)
      : activeFlags.includes('HEAVY_BRAKING') || brakePct > 0;

  const highSpeedActive =
    conf?.high_speed_active !== undefined
      ? Boolean(conf.high_speed_active)
      : activeFlags.includes('HIGH_SPEED') || speed > 250;

  const transientActive =
    conf?.transient_active !== undefined
      ? Boolean(conf.transient_active)
      : activeFlags.includes('TRANSIENT_EVENT') || activeFlags.includes('TRANSIENT_DYNAMICS');

  const canonicalTyreAge =
    typeof conf?.tyre_age_laps === 'number'
      ? conf.tyre_age_laps
      : typeof tel?.tyres?.fl?.tyre_life_laps === 'number'
      ? tel.tyres.fl.tyre_life_laps
      : 12;

  const canonicalCompound = conf?.compound || tel?.tyres?.fl?.compound || 'C3 (MEDIUM)';

  let resolvedFourWheel: FourWheelTyres | null = null;
  if (mode === 'DEMO_SIMULATION') {
    const currentFinalTdi = tdiRes?.final_tdi ?? 48.0;
    const lap = tel?.lap ?? 1;
    resolvedFourWheel = computeDemoWheelStates(
      currentFinalTdi,
      seq,
      lap,
      speed,
      canonicalTyreAge ?? undefined,
      canonicalCompound
    );
  } else {
    resolvedFourWheel = (tel?.four_wheel_states as FourWheelTyres) || {
      FL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
      FR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
      RL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
      RR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
    };
  }

  return {
    sequence: seq,
    timestamp: ts,
    telemetry: tel,
    physics: phys,
    confounders: conf,
    tdi: tdiRes,
    fourWheelStates: resolvedFourWheel,
    canonicalDrsActive: drsActive,
    canonicalBrakingActive: brakingActive,
    canonicalHighSpeedActive: highSpeedActive,
    canonicalTransientActive: transientActive,
    canonicalTyreAge,
    canonicalCompound,
  };
}

export const DashboardPage: React.FC = () => {
  // Session & Replay State
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [replayStatus, setReplayStatus] = useState<ReplayStatusResponse | null>(null);
  const [dataMode, setDataMode] = useState<DataMode>('REPLAY');
  // Selected tyre is FR by default as specified in prompt
  const [selectedTyre, setSelectedTyre] = useState<TyreCorner>('FR');
  // THERMAL visualization mode is active by default as specified in prompt
  const [visMode, setVisMode] = useState<TyreVisMode>('THERMAL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'DIAGNOSTICS'>('ANALYTICS');

  // Normalized Current Frame State
  const [frameState, setFrameState] = useState<DashboardFrameState>(() =>
    buildUnifiedFrameState(0, new Date().toISOString(), null, null, null, null, 'REPLAY')
  );

  // Rolling Histories
  const [tdiHistory, setTdiHistory] = useState<TDIHistoryPoint[]>([]);
  const [residualHistory, setResidualHistory] = useState<ResidualHistoryPoint[]>([]);

  // Throttling for chart updates
  const lastChartUpdateRef = useRef<number>(0);

  // 1. Initial REST warmup
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      setApiError(null);

      const [sessRes, repRes, tdiHistRes, resHistRes] = await Promise.all([
        api.getSession().catch(() => null),
        api.getReplayStatus().catch(() => null),
        api.getTDIHistory(200).catch(() => []),
        api.getResidualHistory(200).catch(() => []),
      ]);

      if (sessRes) setSession(sessRes);
      if (repRes) setReplayStatus(repRes);
      if (tdiHistRes) setTdiHistory(tdiHistRes);
      if (resHistRes) setResidualHistory(resHistRes);

      // Fetch initial frame telemetry & physics
      const [tel, phys, conf, tdiRes] = await Promise.all([
        api.getTelemetry().catch(() => null),
        api.getPhysics().catch(() => null),
        api.getConfounders().catch(() => null),
        api.getTDI().catch(() => null),
      ]);

      const initialUnified = buildUnifiedFrameState(
        0,
        new Date().toISOString(),
        tel,
        phys,
        conf,
        tdiRes,
        dataMode
      );
      setFrameState(initialUnified);
    } catch (err) {
      console.error('Failed to load initial API state:', err);
      setApiError('Unable to connect to TYRETRACE API backend.');
    } finally {
      setIsLoading(false);
    }
  }, [dataMode]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 2. WebSocket Live Stream Handler (Atomic Frame Commit)
  const handleWebSocketMessage = useCallback(
    (msg: WebSocketTelemetryMessage) => {
      const frameIdx = msg.sequence;
      const lap = msg.telemetry?.lap ?? 1;
      const ts = msg.timestamp || new Date().toISOString();

      // Commit single unified frame to state
      const nextUnified = buildUnifiedFrameState(
        frameIdx,
        ts,
        msg.telemetry,
        msg.physics,
        msg.confounders,
        msg.tdi,
        dataMode
      );
      setFrameState(nextUnified);

      // Update Replay status frame
      setReplayStatus((prev) =>
        prev
          ? {
              ...prev,
              current_frame: frameIdx,
              current_lap: lap,
            }
          : {
              running: true,
              paused: false,
              current_frame: frameIdx,
              total_frames: 1000,
              current_lap: lap,
              playback_speed: 1.0,
            }
      );

      // Throttle history array appending to ~10 Hz
      const now = performance.now();
      if (now - lastChartUpdateRef.current > 80) {
        lastChartUpdateRef.current = now;

        const newTdiPoint: TDIHistoryPoint = {
          timestamp: ts,
          lap: lap,
          physics_tdi:
            typeof msg.tdi?.physics_tdi === 'number' && !isNaN(msg.tdi.physics_tdi)
              ? msg.tdi.physics_tdi
              : 0,
          ai_tdi:
            typeof msg.tdi?.ai_tdi === 'number' && !isNaN(msg.tdi.ai_tdi)
              ? msg.tdi.ai_tdi
              : 0,
          final_tdi:
            typeof msg.tdi?.final_tdi === 'number' && !isNaN(msg.tdi.final_tdi)
              ? msg.tdi.final_tdi
              : 0,
        };
        setTdiHistory((prev) => [...prev.slice(-299), newTdiPoint]);

        const rawRes =
          (msg.residual as any)?.acceleration_residual_mps2 ??
          msg.residual?.raw_residual_mps2 ??
          0;
        const normRes = msg.residual?.normalized_residual ?? 0;
        const qScore = msg.confounders?.tyre_evidence_quality ?? 1.0;
        const cScore = msg.confounders?.non_tyre_explanation_score ?? 0.0;

        const newResidualPoint: ResidualHistoryPoint = {
          timestamp: ts,
          lap: lap,
          raw_residual: typeof rawRes === 'number' && !isNaN(rawRes) ? rawRes : 0,
          normalized_residual: typeof normRes === 'number' && !isNaN(normRes) ? normRes : 0,
          tyre_evidence_quality: typeof qScore === 'number' && !isNaN(qScore) ? qScore : 1.0,
          confounder_score: typeof cScore === 'number' && !isNaN(cScore) ? cScore : 0.0,
        };
        setResidualHistory((prev) => [...prev.slice(-299), newResidualPoint]);
      }
    },
    [dataMode]
  );

  const { status: wsStatus, reconnect } = useTelemetryWebSocket({
    onMessage: handleWebSocketMessage,
  });

  // Replay Control Actions
  const handleStart = async () => {
    try {
      const res = await api.startReplay();
      setReplayStatus(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePause = async () => {
    try {
      const res = await api.pauseReplay();
      setReplayStatus(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResume = async () => {
    try {
      const res = await api.resumeReplay();
      setReplayStatus(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReset = async () => {
    try {
      const res = await api.resetReplay();
      setReplayStatus(res);
      setTdiHistory([]);
      setResidualHistory([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSeek = async (frameIndex: number) => {
    try {
      const res = await api.seekReplay(frameIndex);
      setReplayStatus(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetSpeed = async (speed: number) => {
    try {
      const res = await api.setPlaybackSpeed(speed);
      setReplayStatus(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectTyre = (corner: TyreCorner) => {
    setSelectedTyre(corner);
    api.selectTyre(corner).catch(() => {});
  };

  const toggleDataMode = (mode: DataMode) => {
    setDataMode(mode);
    api.setDataMode(mode).catch(() => {});
    setFrameState((prev) =>
      buildUnifiedFrameState(
        prev.sequence,
        prev.timestamp,
        prev.telemetry,
        prev.physics,
        prev.confounders,
        prev.tdi,
        mode
      )
    );
  };

  const currentVehicle: VehicleState | null =
    (frameState.telemetry?.vehicle || frameState.telemetry?.vehicle_state) ?? null;
  const isConnected = Boolean(frameState.telemetry || frameState.physics || frameState.tdi);
  const isPaused = Boolean(replayStatus?.paused || !replayStatus?.running);
  const effectiveSpeedKph = (isConnected && !isPaused && currentVehicle?.speed_kph) ? currentVehicle.speed_kph : 0;

  // Active tyre state computed from backend telemetry & physics
  const activeTyreState = calculateTyreCornerState(
    selectedTyre,
    frameState.telemetry,
    frameState.physics,
    frameState.tdi,
    frameState.fourWheelStates,
    dataMode,
    frameState.canonicalTyreAge ?? 12,
    frameState.canonicalCompound
  );

  // Compute temperatures & healths for all 4 corners for the chassis diagram
  const cornersList: TyreCorner[] = ['FL', 'FR', 'RL', 'RR'];
  const cornerTemps = cornersList.reduce((acc, c) => {
    const s = calculateTyreCornerState(
      c,
      frameState.telemetry,
      frameState.physics,
      frameState.tdi,
      frameState.fourWheelStates,
      dataMode
    );
    acc[c] = s.thermal.surface_c;
    return acc;
  }, {} as Record<TyreCorner, number>);

  const cornerHealths = cornersList.reduce((acc, c) => {
    const s = calculateTyreCornerState(
      c,
      frameState.telemetry,
      frameState.physics,
      frameState.tdi,
      frameState.fourWheelStates,
      dataMode
    );
    acc[c] = s.wear.health_pct;
    return acc;
  }, {} as Record<TyreCorner, number>);

  return (
    <div className="w-full min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans select-none">
      {/* 1. TOP HEADER */}
      <Header
        lap={frameState.telemetry?.lap ?? 27}
        dataMode={dataMode}
        connectionStatus={wsStatus}
        onToggleDataMode={toggleDataMode}
        onReconnect={reconnect}
      />

      {/* Connection / Loading Warning Banner */}
      {apiError && (
        <div className="bg-rose-950/80 border-b border-rose-500/40 px-4 py-1.5 text-xs font-mono text-rose-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>API WARNING: {apiError} (Ensure FastAPI backend is running on port 8000)</span>
          </div>
          <button
            onClick={loadInitialData}
            className="underline hover:text-white cursor-pointer ml-3 font-mono"
          >
            Retry Connection
          </button>
        </div>
      )}
      {isLoading && !session && (
        <div className="bg-[#0f141f] border-b border-[#1f293d] px-4 py-1.5 text-xs font-mono text-cyan-400 flex items-center justify-between">
          <span>CONNECTING TO FASTAPI BACKEND & INITIALIZING TYRE TELEMETRY...</span>
        </div>
      )}

      {/* 2. MAIN 3-COLUMN HERO WORKSPACE */}
      <main className="flex-1 p-3 grid grid-cols-12 gap-3 max-w-[1920px] w-full mx-auto items-start">
        {/* LEFT PANEL: VISUALIZATION MODES + TYRE POSITION SELECTOR */}
        <section className="col-span-12 md:col-span-4 lg:col-span-3 xl:col-span-2 flex flex-col gap-3">
          <VisualizationModesPanel
            activeMode={visMode}
            onSelectMode={setVisMode}
          />
          <TyrePositionSelector
            selectedCorner={selectedTyre}
            onSelectCorner={handleSelectTyre}
            temperatures={cornerTemps}
            healths={cornerHealths}
          />
        </section>

        {/* CENTER VIEWPORT: HERO 3D F1 TYRE (55–65% Width) */}
        <section className="col-span-12 md:col-span-8 lg:col-span-6 xl:col-span-7 flex flex-col gap-3">
          <div className="h-[520px] lg:h-[580px] xl:h-[630px] w-full">
            <DigitalTwinCanvas
              speedKph={effectiveSpeedKph}
              drs={frameState.canonicalDrsActive ? 8 : 0}
              dataMode={dataMode}
              fourWheelStates={frameState.fourWheelStates}
              telemetryFrame={frameState.telemetry}
              physicsOutput={frameState.physics}
              tdiResponse={frameState.tdi}
              selectedTyre={selectedTyre}
              visMode={visMode}
              onSelectVisMode={setVisMode}
              isPaused={isPaused}
              isConnected={isConnected}
            />
          </div>
        </section>

        {/* RIGHT PANEL: TYRE TELEMETRY MATRIX & THERMAL MAP */}
        <section className="col-span-12 lg:col-span-3 xl:col-span-3 flex flex-col gap-3">
          <TelemetryPanel state={activeTyreState} />
        </section>

        {/* 3. BOTTOM PANELS (3 EQUAL CARDS) */}
        <section className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card 1: Thermal Distribution */}
          <ThermalPanel thermal={activeTyreState.thermal} />

          {/* Card 2: Degradation Status */}
          <DegradationPanel wear={activeTyreState.wear} />

          {/* Card 3: Race Telemetry */}
          <RaceTelemetry
            telemetry={frameState.telemetry}
            lap={frameState.telemetry?.lap ?? 27}
          />
        </section>

        {/* 4. COLLAPSIBLE PHYSICS-INFORMED TDI REASONING & DIAGNOSTICS */}
        <section className="col-span-12 flex flex-col gap-2 mt-1">
          <div className="flex items-center justify-between border-b border-[#1b2333] pb-2">
            <button
              onClick={() => setShowAdvancedAnalytics(!showAdvancedAnalytics)}
              className="flex items-center space-x-2 text-xs font-mono font-bold text-cyan-300 hover:text-white cursor-pointer transition-colors"
            >
              <span>PHYSICS-INFORMED TDI REASONING & TIME-SERIES TELEMETRY</span>
              {showAdvancedAnalytics ? (
                <ChevronUp className="w-4 h-4 text-cyan-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            <div className="text-[11px] font-mono text-slate-500 hidden sm:block">
              20 HZ WEBSOCKET TELEMETRY GATEWAY
            </div>
          </div>

          {showAdvancedAnalytics && (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('ANALYTICS')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                    activeTab === 'ANALYTICS'
                      ? 'bg-[#151c2a] text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>PHYSICS-INFORMED TDI REASONING & EVIDENCE</span>
                </button>

                <button
                  onClick={() => setActiveTab('DIAGNOSTICS')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                    activeTab === 'DIAGNOSTICS'
                      ? 'bg-[#151c2a] text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>TIME-SERIES TELEMETRY RESIDUAL DYNAMICS</span>
                </button>
              </div>

              {/* Tab 1: Physics-vs-AI TDI & Confounders Reasoning */}
              {activeTab === 'ANALYTICS' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <GlobalTDICard tdiData={frameState.tdi} />
                  <WhyPanel
                    evidence={frameState.tdi?.evidence ?? []}
                    counterEvidence={frameState.tdi?.counter_evidence ?? []}
                    trend={frameState.tdi?.trend ?? 'STABLE'}
                    finalTdi={frameState.tdi?.final_tdi ?? 0}
                  />
                  <ConfoundersPanel confounders={frameState.confounders} />
                </div>
              )}

              {/* Tab 2: High-Precision Time-Series Charts */}
              {activeTab === 'DIAGNOSTICS' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <TDITrajectoryChart
                    history={tdiHistory}
                    currentFinalTdi={frameState.tdi?.final_tdi}
                  />
                  <ResidualChart history={residualHistory} />
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* 5. REPLAY CONTROL BAR */}
      <ReplayControlBar
        status={replayStatus}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onReset={handleReset}
        onSeek={handleSeek}
        onSetSpeed={handleSetSpeed}
      />
    </div>
  );
};

/**
 * TYRETRACE — Main Engineering Command Center Dashboard Page
 * Integrates 3D Digital Twin, Global Intelligence, Corner Telemetry, Time-Series Analytics, and Replay Controls.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DataMode,
  FourWheelTyres,
  ResidualHistoryPoint,
  SessionResponse,
  TDIHistoryPoint,
  TDIStateResponse,
  TelemetryFrame,
  TyreCorner,
  VehicleState,
  WebSocketTelemetryMessage,
  ReplayStatusResponse,
  ConfounderFrame,
} from '../types/telemetry';
import { api } from '../services/api';
import { useTelemetryWebSocket } from '../hooks/useTelemetryWebSocket';
import { computeDemoWheelStates } from '../services/demoSimulation';

// Components
import { TopBar } from '../components/TopBar';
import { DigitalTwinCanvas } from '../components/DigitalTwinCanvas';
import { GlobalTDICard } from '../components/GlobalTDICard';
import { WhyPanel } from '../components/WhyPanel';
import { ConfoundersPanel } from '../components/ConfoundersPanel';
import { TyreIntelligencePanel } from '../components/TyreIntelligencePanel';
import { TDITrajectoryChart } from '../components/TDITrajectoryChart';
import { ResidualChart } from '../components/ResidualChart';
import { ReplayControlBar } from '../components/ReplayControlBar';

interface DashboardFrameState {
  sequence: number;
  timestamp: string;
  telemetry: TelemetryFrame | null;
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

  const drsActive = conf?.drs_active !== undefined
    ? Boolean(conf.drs_active)
    : activeFlags.includes('DRS_ACTIVE') || (typeof rawDrs === 'number' && (rawDrs === 8 || rawDrs === 10 || rawDrs === 12 || rawDrs === 14 || rawDrs >= 8));

  const brakingActive = conf?.braking_active !== undefined
    ? Boolean(conf.braking_active)
    : activeFlags.includes('HEAVY_BRAKING') || brakePct > 0;

  const highSpeedActive = conf?.high_speed_active !== undefined
    ? Boolean(conf.high_speed_active)
    : activeFlags.includes('HIGH_SPEED') || speed > 250;

  const transientActive = conf?.transient_active !== undefined
    ? Boolean(conf.transient_active)
    : activeFlags.includes('TRANSIENT_EVENT') || activeFlags.includes('TRANSIENT_DYNAMICS');

  const canonicalTyreAge = typeof conf?.tyre_age_laps === 'number'
    ? conf.tyre_age_laps
    : typeof tel?.tyres?.fl?.tyre_life_laps === 'number'
      ? tel.tyres.fl.tyre_life_laps
      : null;

  const canonicalCompound = conf?.compound || tel?.tyres?.fl?.compound || 'SOFT';

  let resolvedFourWheel: FourWheelTyres | null = null;
  if (mode === 'DEMO_SIMULATION') {
    const currentFinalTdi = tdiRes?.final_tdi ?? 50.0;
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
  const [selectedTyre, setSelectedTyre] = useState<TyreCorner | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // SINGLE SOURCE OF TRUTH: Normalized Current Frame State
  const [frameState, setFrameState] = useState<DashboardFrameState>(() =>
    buildUnifiedFrameState(0, new Date().toISOString(), null, null, null, 'REPLAY')
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

      // Attempt to fetch current frame state
      const [tel, conf, tdiRes] = await Promise.all([
        api.getTelemetry().catch(() => null),
        api.getConfounders().catch(() => null),
        api.getTDI().catch(() => null),
      ]);

      const initialUnified = buildUnifiedFrameState(
        0,
        new Date().toISOString(),
        tel,
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

      // Throttle history array appending to ~10 Hz to prevent DOM churn
      const now = performance.now();
      if (now - lastChartUpdateRef.current > 80) {
        lastChartUpdateRef.current = now;

        const newTdiPoint: TDIHistoryPoint = {
          timestamp: ts,
          lap: lap,
          physics_tdi: typeof msg.tdi?.physics_tdi === 'number' && !isNaN(msg.tdi.physics_tdi) ? msg.tdi.physics_tdi : 0,
          ai_tdi: typeof msg.tdi?.ai_tdi === 'number' && !isNaN(msg.tdi.ai_tdi) ? msg.tdi.ai_tdi : 0,
          final_tdi: typeof msg.tdi?.final_tdi === 'number' && !isNaN(msg.tdi.final_tdi) ? msg.tdi.final_tdi : 0,
        };
        setTdiHistory((prev) => [...prev.slice(-299), newTdiPoint]);

        const rawRes = (msg.residual as any)?.acceleration_residual_mps2 ?? msg.residual?.raw_residual_mps2 ?? 0;
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

  // 3. Replay Control Actions
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

  const handleSelectTyre = (corner: TyreCorner | null) => {
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
        prev.confounders,
        prev.tdi,
        mode
      )
    );
  };

  const currentVehicle: VehicleState | null = (frameState.telemetry?.vehicle || frameState.telemetry?.vehicle_state) ?? null;

  return (
    <div className="w-full min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans">
      {/* 1. TOP BAR */}
      <TopBar
        session={session}
        vehicleState={currentVehicle}
        drsActive={frameState.canonicalDrsActive}
        connectionStatus={wsStatus}
        dataMode={dataMode}
        onToggleDataMode={toggleDataMode}
        onReconnect={reconnect}
      />

      {/* Connection / API Warning Banner */}
      {apiError && (
        <div className="bg-rose-950/80 border-b border-rose-500/40 px-4 py-1.5 text-xs font-mono text-rose-300 flex items-center justify-between">
          <span>API WARNING: {apiError} (Ensure FastAPI backend is running on port 8000)</span>
          <button onClick={loadInitialData} className="underline hover:text-white cursor-pointer ml-3">Retry</button>
        </div>
      )}
      {isLoading && !session && (
        <div className="bg-[#111622] border-b border-[#1f283d] px-4 py-1 text-[11px] font-mono text-cyan-400">
          LOADING CANONICAL TELEMETRY SESSION METADATA...
        </div>
      )}

      {/* 2. MAIN ENGINEERING WORKSPACE */}
      <main className="flex-1 p-3 grid grid-cols-12 gap-3 max-w-[1920px] w-full mx-auto">
        {/* LEFT COLUMN: 3D DIGITAL TWIN (5 of 12 columns) */}
        <section className="col-span-12 lg:col-span-5 flex flex-col h-[480px] lg:h-auto min-h-[440px]">
          <DigitalTwinCanvas
            speedKph={currentVehicle?.speed_kph ?? 0}
            drs={frameState.canonicalDrsActive ? 8 : 0}
            dataMode={dataMode}
            fourWheelStates={frameState.fourWheelStates}
            selectedTyre={selectedTyre}
            onSelectTyre={handleSelectTyre}
          />
        </section>

        {/* CENTER COLUMN: GLOBAL INTELLIGENCE & REASONING (4 of 12 columns) */}
        <section className="col-span-12 md:col-span-7 lg:col-span-4 flex flex-col gap-3">
          {/* Primary Global TDI Intelligence Card */}
          <GlobalTDICard tdiData={frameState.tdi} />

          {/* Dynamic Evidence / Counter Evidence "Why" Panel */}
          <WhyPanel
            evidence={frameState.tdi?.evidence ?? []}
            counterEvidence={frameState.tdi?.counter_evidence ?? []}
            trend={frameState.tdi?.trend ?? 'STABLE'}
            finalTdi={frameState.tdi?.final_tdi ?? 0}
          />

          {/* Confounder Filter Engine */}
          <ConfoundersPanel confounders={frameState.confounders} />
        </section>

        {/* RIGHT COLUMN: CORNER INTELLIGENCE / TYRE INSPECTION (3 of 12 columns) */}
        <section className="col-span-12 md:col-span-5 lg:col-span-3 flex flex-col">
          <TyreIntelligencePanel
            selectedTyre={selectedTyre}
            dataMode={dataMode}
            fourWheelStates={frameState.fourWheelStates}
            canonicalTyreAge={frameState.canonicalTyreAge}
            canonicalCompound={frameState.canonicalCompound}
            onResetSelection={() => handleSelectTyre(null)}
            onToggleDemoMode={() => toggleDataMode('DEMO_SIMULATION')}
          />
        </section>

        {/* BOTTOM ROW: DUAL TIME-SERIES ANALYTICS (Full 12 columns) */}
        <section className="col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-3 mt-1">
          {/* TDI Trajectory (Physics vs AI vs Fusion) */}
          <TDITrajectoryChart
            history={tdiHistory}
            currentFinalTdi={frameState.tdi?.final_tdi}
          />

          {/* Residual & Evidence Dynamics */}
          <ResidualChart history={residualHistory} />
        </section>
      </main>

      {/* 3. BOTTOM REPLAY CONTROL BAR */}
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

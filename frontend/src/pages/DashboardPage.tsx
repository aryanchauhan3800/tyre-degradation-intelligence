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

export const DashboardPage: React.FC = () => {
  // Session & Replay State
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [replayStatus, setReplayStatus] = useState<ReplayStatusResponse | null>(null);
  const [dataMode, setDataMode] = useState<DataMode>('REPLAY');
  const [selectedTyre, setSelectedTyre] = useState<TyreCorner | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Live Telemetry & Model States
  const [telemetry, setTelemetry] = useState<TelemetryFrame | null>(null);
  const [confounders, setConfounders] = useState<ConfounderFrame | null>(null);
  const [tdi, setTdi] = useState<TDIStateResponse | null>(null);

  // Four Wheel Corner State
  const [fourWheelStates, setFourWheelStates] = useState<FourWheelTyres | null>(null);

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
      const [tel, conf, tdiRes, tyresRes] = await Promise.all([
        api.getTelemetry().catch(() => null),
        api.getConfounders().catch(() => null),
        api.getTDI().catch(() => null),
        api.getTyres().catch(() => null),
      ]);

      if (tel) setTelemetry(tel);
      if (conf) setConfounders(conf);
      if (tdiRes) setTdi(tdiRes);
      if (tyresRes) setFourWheelStates(tyresRes);
    } catch (err) {
      console.error('Failed to load initial API state:', err);
      setApiError('Unable to connect to TYRETRACE API backend.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 2. WebSocket Live Stream Handler
  const handleWebSocketMessage = useCallback(
    (msg: WebSocketTelemetryMessage) => {
      setTelemetry(msg.telemetry);
      setConfounders(msg.confounders);
      setTdi(msg.tdi);

      const frameIdx = msg.sequence;
      const lap = msg.telemetry?.lap ?? 1;
      const veh = msg.telemetry?.vehicle || msg.telemetry?.vehicle_state;
      const speed = veh?.speed_kph ?? 0;

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

      // Mode-aware corner state resolution
      if (dataMode === 'DEMO_SIMULATION') {
        const simWheels = computeDemoWheelStates(msg.tdi.final_tdi, frameIdx, lap, speed);
        setFourWheelStates(simWheels);
      } else {
        // REAL_REPLAY: Preserve canonical unavailability
        setFourWheelStates(
          (msg.telemetry.four_wheel_states as FourWheelTyres) || {
            FL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
            FR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
            RL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
            RR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
          }
        );
      }

      // Throttle history array appending to ~10 Hz to prevent DOM churn
      const now = performance.now();
      if (now - lastChartUpdateRef.current > 80) {
        lastChartUpdateRef.current = now;

        const ts = msg.timestamp;
        const newTdiPoint: TDIHistoryPoint = {
          timestamp: ts,
          lap: lap,
          physics_tdi: msg.tdi.physics_tdi,
          ai_tdi: msg.tdi.ai_tdi,
          final_tdi: msg.tdi.final_tdi,
        };
        setTdiHistory((prev) => [...prev.slice(-299), newTdiPoint]);

        const newResidualPoint: ResidualHistoryPoint = {
          timestamp: ts,
          lap: lap,
          raw_residual: msg.residual.raw_residual_mps2,
          normalized_residual: msg.residual.normalized_residual,
          tyre_evidence_quality: msg.confounders.tyre_evidence_quality,
          confounder_score: msg.confounders.non_tyre_explanation_score,
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
    if (mode === 'DEMO_SIMULATION') {
      const currentFinalTdi = tdi?.final_tdi ?? 50.0;
      const frameIdx = replayStatus?.current_frame ?? 0;
      const lap = session?.current_lap ?? 1;
      const veh = telemetry?.vehicle || telemetry?.vehicle_state;
      const speed = veh?.speed_kph ?? 280;
      setFourWheelStates(computeDemoWheelStates(currentFinalTdi, frameIdx, lap, speed));
    } else {
      setFourWheelStates({
        FL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
        FR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
        RL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
        RR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
      });
    }
  };

  const currentVehicle: VehicleState | null = (telemetry?.vehicle || telemetry?.vehicle_state) ?? null;

  return (
    <div className="w-full min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans">
      {/* 1. TOP BAR */}
      <TopBar
        session={session}
        vehicleState={currentVehicle}
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
            drs={currentVehicle?.drs ?? 0}
            dataMode={dataMode}
            fourWheelStates={fourWheelStates}
            selectedTyre={selectedTyre}
            onSelectTyre={handleSelectTyre}
          />
        </section>

        {/* CENTER COLUMN: GLOBAL INTELLIGENCE & REASONING (4 of 12 columns) */}
        <section className="col-span-12 md:col-span-7 lg:col-span-4 flex flex-col gap-3">
          {/* Primary Global TDI Intelligence Card */}
          <GlobalTDICard tdiData={tdi} />

          {/* Dynamic Evidence / Counter Evidence "Why" Panel */}
          <WhyPanel
            evidence={tdi?.evidence ?? []}
            counterEvidence={tdi?.counter_evidence ?? []}
            trend={tdi?.trend ?? 'STABLE'}
            finalTdi={tdi?.final_tdi ?? 0}
          />

          {/* Confounder Filter Engine */}
          <ConfoundersPanel confounders={confounders} />
        </section>

        {/* RIGHT COLUMN: CORNER INTELLIGENCE / TYRE INSPECTION (3 of 12 columns) */}
        <section className="col-span-12 md:col-span-5 lg:col-span-3 flex flex-col">
          <TyreIntelligencePanel
            selectedTyre={selectedTyre}
            dataMode={dataMode}
            fourWheelStates={fourWheelStates}
            onResetSelection={() => handleSelectTyre(null)}
            onToggleDemoMode={() => toggleDataMode('DEMO_SIMULATION')}
          />
        </section>

        {/* BOTTOM ROW: DUAL TIME-SERIES ANALYTICS (Full 12 columns) */}
        <section className="col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-3 mt-1">
          {/* TDI Trajectory (Physics vs AI vs Fusion) */}
          <TDITrajectoryChart
            history={tdiHistory}
            currentFinalTdi={tdi?.final_tdi}
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

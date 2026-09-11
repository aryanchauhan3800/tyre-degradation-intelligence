import { useState, useEffect, useCallback, useRef } from 'react';
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
  WebSocketTelemetryMessage,
  ReplayStatusResponse,
  ConfounderFrame,
} from './types/telemetry';
import { api } from './services/api';
import { useTelemetryWebSocket } from './hooks/useTelemetryWebSocket';
import { computeDemoWheelStates } from './services/demoSimulation';
import { calculateTyreCornerState } from './utils/tyreCalculations';

// Navigation & Pages
import { Navbar, type ActiveNavTab } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { PhyEnginePage } from './pages/PhyEnginePage';
import { OverallHealthPage } from './pages/OverallHealthPage';
import { OtherInfoPage } from './pages/OtherInfoPage';
import { ErrorBoundary } from './components/ErrorBoundary';

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
        : 0;

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

export function App() {
  // Navigation State - defaults to 'home' for cinematic landing page
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('home');
  const [phyEngineSubTab, setPhyEngineSubTab] = useState<'3d' | 'image'>('3d');

  // Session & Replay State
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [replayStatus, setReplayStatus] = useState<ReplayStatusResponse | null>(null);
  const [dataMode, setDataMode] = useState<DataMode>('REPLAY');
  const [selectedTyre, setSelectedTyre] = useState<TyreCorner>('FR');
  const [visMode, setVisMode] = useState<TyreVisMode>('THERMAL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState<boolean>(false);
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<'ANALYTICS' | 'DIAGNOSTICS'>('ANALYTICS');

  // Normalized Current Frame State
  const [frameState, setFrameState] = useState<DashboardFrameState>(() =>
    buildUnifiedFrameState(0, new Date().toISOString(), null, null, null, null, 'REPLAY')
  );

  // Rolling Histories
  const [tdiHistory, setTdiHistory] = useState<TDIHistoryPoint[]>([]);
  const [residualHistory, setResidualHistory] = useState<ResidualHistoryPoint[]>([]);
  const lastChartUpdateRef = useRef<number>(0);

  // Initial REST warmup
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

  // WebSocket Live Stream Handler
  const handleWebSocketMessage = useCallback(
    (msg: WebSocketTelemetryMessage) => {
      const frameIdx = msg.sequence;
      const lap = msg.telemetry?.lap ?? 1;
      const ts = msg.timestamp || new Date().toISOString();

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
            playback_speed: 1.0,
            current_lap: lap,
            total_laps: 53,
            progress_pct: (frameIdx / 1000) * 100,
          }
      );

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
    } catch (err) {
      console.error(err);
    }
  };

  const handleSeek = async (frame: number) => {
    try {
      const res = await api.seekReplay(frame);
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
    api.selectTyre(corner).catch(() => { });
  };

  const toggleDataMode = (mode: DataMode) => {
    setDataMode(mode);
    api.setDataMode(mode).catch(() => { });
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

  // Compute temperatures & healths for all 4 corners
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

  const handleNavigate = (tab: ActiveNavTab, subTab?: '3d' | 'image') => {
    setActiveTab(tab);
    if (subTab) {
      setPhyEngineSubTab(subTab);
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-red-500 selection:text-white">
        {/* Global White Theme Navbar with TGR x F1 Logo */}
        <Navbar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          lap={frameState.telemetry?.lap ?? 0}
          dataMode={dataMode}
          connectionStatus={wsStatus}
          onToggleDataMode={toggleDataMode}
          onReconnect={reconnect}
          phyEngineSubTab={phyEngineSubTab}
          onSelectPhyEngineSubTab={setPhyEngineSubTab}
        />

        {/* Dynamic Multi-Page Router */}
        <div className="flex-1 flex flex-col">
          {activeTab === 'home' && (
            <HomePage
              onNavigate={handleNavigate}
              telemetry={frameState.telemetry}
              fourWheelStates={frameState.fourWheelStates}
              selectedTyre={selectedTyre}
              lap={frameState.telemetry?.lap ?? 0}
            />
          )}

          {activeTab === 'phyengine' && (
            <PhyEnginePage
              subTab={phyEngineSubTab}
              onSelectSubTab={setPhyEngineSubTab}
              dataMode={dataMode}
              selectedTyre={selectedTyre}
              onSelectTyre={handleSelectTyre}
              visMode={visMode}
              onSelectVisMode={setVisMode}
              frameState={frameState}
              activeTyreState={activeTyreState}
              cornerTemps={cornerTemps}
              cornerHealths={cornerHealths}
              apiError={apiError}
              isLoading={isLoading}
              session={session}
              loadInitialData={loadInitialData}
              showAdvancedAnalytics={showAdvancedAnalytics}
              setShowAdvancedAnalytics={setShowAdvancedAnalytics}
              activeAnalyticsTab={activeAnalyticsTab}
              setActiveAnalyticsTab={setActiveAnalyticsTab}
              tdiHistory={tdiHistory}
              residualHistory={residualHistory}
              replayStatus={replayStatus}
              onStart={handleStart}
              onPause={handlePause}
              onResume={handleResume}
              onReset={handleReset}
              onSeek={handleSeek}
              onSetSpeed={handleSetSpeed}
            />
          )}

          {activeTab === 'health' && (
            <OverallHealthPage
              telemetry={frameState.telemetry}
              fourWheelStates={frameState.fourWheelStates}
              selectedTyre={selectedTyre}
              onSelectTyre={handleSelectTyre}
              onNavigate={handleNavigate}
              lap={frameState.telemetry?.lap ?? 27}
            />
          )}

          {activeTab === 'info' && (
            <OtherInfoPage onNavigate={handleNavigate} />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;

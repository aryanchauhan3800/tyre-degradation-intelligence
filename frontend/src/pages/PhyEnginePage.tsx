import React from 'react';
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
  ReplayStatusResponse,
} from '../types/telemetry';

// Components
import { VisualizationModesPanel } from '../components/Dashboard/VisualizationModesPanel';
import { TyrePositionSelector } from '../components/TyreSelector/TyrePositionSelector';
import { DigitalTwinCanvas } from '../components/DigitalTwinCanvas';
import { TelemetryPanel } from '../components/Dashboard/TelemetryPanel';
import { ThermalPanel } from '../components/Dashboard/ThermalPanel';
import { DegradationPanel } from '../components/Dashboard/DegradationPanel';
import { RaceTelemetry } from '../components/Dashboard/RaceTelemetry';
import { TyreImagePage } from '../components/PhyEngine/TyreImagePage';

// Analysis & Replay
import { GlobalTDICard } from '../components/GlobalTDICard';
import { WhyPanel } from '../components/WhyPanel';
import { ConfoundersPanel } from '../components/ConfoundersPanel';
import { TDITrajectoryChart } from '../components/TDITrajectoryChart';
import { ResidualChart } from '../components/ResidualChart';
import { ReplayControlBar } from '../components/ReplayControlBar';
import { 
  Activity, 
  BarChart2, 
  ShieldAlert, 
  ChevronDown, 
  ChevronUp, 
  Camera, 
  Box,
  Wind
} from 'lucide-react';

interface DashboardFrameState {
  sequence: number;
  timestamp: string;
  telemetry: TelemetryFrame | null;
  physics: PhysicsTwinOutput | null;
  confounders: any | null;
  tdi: TDIStateResponse | null;
  fourWheelStates: FourWheelTyres | null;
  canonicalDrsActive: boolean;
  canonicalBrakingActive: boolean;
  canonicalHighSpeedActive: boolean;
  canonicalTransientActive: boolean;
  canonicalTyreAge: number | null;
  canonicalCompound: string;
}

interface PhyEnginePageProps {
  subTab: '3d' | 'image';
  onSelectSubTab: (subTab: '3d' | 'image') => void;
  dataMode: DataMode;
  selectedTyre: TyreCorner;
  onSelectTyre: (corner: TyreCorner) => void;
  visMode: TyreVisMode;
  onSelectVisMode: (mode: TyreVisMode) => void;
  frameState: DashboardFrameState;
  activeTyreState: any;
  cornerTemps: Record<TyreCorner, number>;
  cornerHealths: Record<TyreCorner, number>;
  apiError: string | null;
  isLoading: boolean;
  session: SessionResponse | null;
  loadInitialData: () => void;
  showAdvancedAnalytics: boolean;
  setShowAdvancedAnalytics: (show: boolean) => void;
  activeAnalyticsTab: 'ANALYTICS' | 'DIAGNOSTICS';
  setActiveAnalyticsTab: (tab: 'ANALYTICS' | 'DIAGNOSTICS') => void;
  tdiHistory: TDIHistoryPoint[];
  residualHistory: ResidualHistoryPoint[];
  replayStatus: ReplayStatusResponse | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSeek: (frame: number) => void;
  onSetSpeed: (speed: number) => void;
}

export const PhyEnginePage: React.FC<PhyEnginePageProps> = ({
  subTab,
  onSelectSubTab,
  dataMode,
  selectedTyre,
  onSelectTyre,
  visMode,
  onSelectVisMode,
  frameState,
  activeTyreState,
  cornerTemps,
  cornerHealths,
  apiError,
  isLoading,
  session,
  loadInitialData,
  showAdvancedAnalytics,
  setShowAdvancedAnalytics,
  activeAnalyticsTab,
  setActiveAnalyticsTab,
  tdiHistory,
  residualHistory,
  replayStatus,
  onStart,
  onPause,
  onResume,
  onReset,
  onSeek,
  onSetSpeed,
}) => {
  const currentVehicle: VehicleState | null =
    (frameState.telemetry?.vehicle || frameState.telemetry?.vehicle_state) ?? null;

  return (
    <div className="w-full flex-1 flex flex-col justify-between overflow-x-hidden font-sans select-none">
      {/* Sub-navigation bar inside PhyEngine */}
      <div className="bg-white border-b border-slate-200/90 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs z-30 font-sans">
        {/* LEFT: Sub-tab Switcher Pills */}
        <div className="flex items-center space-x-1.5">
          <span className="text-xs font-semibold text-slate-500 mr-1.5 hidden sm:inline tracking-wide">
            PHYENGINE VIEW:
          </span>

          <button
            onClick={() => onSelectSubTab('3d')}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
              subTab === '3d'
                ? 'bg-[#E10600] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
            }`}
          >
            <Box className="w-3 h-3" />
            <span>3D Digital Twin</span>
          </button>

          <button
            onClick={() => onSelectSubTab('image')}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
              subTab === 'image'
                ? 'bg-[#E10600] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
            }`}
          >
            <Camera className="w-3 h-3" />
            <span>Image Page (Optical & FLIR)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
              SCANNER
            </span>
          </button>
        </div>

        {/* CENTER: Track & Environment Conditions matching reference */}
        <div className="hidden lg:flex items-center space-x-4 text-xs text-slate-700">
          <div className="flex items-center space-x-1.5 font-semibold">
            <span className="text-slate-500 font-normal">Track:</span>
            <span className="text-slate-900 uppercase tracking-wide font-bold">SUZUKA</span>
            <span className="inline-flex items-center justify-center w-4 h-3 bg-white border border-slate-300 rounded-[2px] overflow-hidden shadow-2xs">
              <span className="w-1.5 h-1.5 bg-red-600 rounded-full" />
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-slate-500 font-normal">Ambient</span>
            <strong className="text-slate-900 font-semibold">28°C</strong>
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-slate-500 font-normal">Track</span>
            <strong className="text-slate-900 font-semibold">32°C</strong>
          </div>
          <div className="flex items-center space-x-1">
            <Wind className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-normal">Wind</span>
            <strong className="text-slate-900 font-semibold">3.2 m/s</strong>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <span className="text-slate-600 font-normal">
            ACTIVE CORNER: <strong className="text-[#E10600] font-bold">{selectedTyre}</strong>
          </span>
          <span className="text-slate-300">|</span>
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-600 font-normal">MODE:</span>
            <div className="relative inline-block">
              <select
                value={visMode}
                onChange={(e) => onSelectVisMode(e.target.value as TyreVisMode)}
                aria-label="Select Visualization Mode"
                className="appearance-none bg-white border border-slate-200/90 rounded-xl px-2.5 py-1 pr-6 text-xs font-semibold text-slate-900 cursor-pointer shadow-2xs focus:outline-none focus:border-red-500"
              >
                <option value="NORMAL">NORMAL</option>
                <option value="THERMAL">THERMAL</option>
                <option value="WEAR">WEAR</option>
                <option value="LOAD">LOAD</option>
                <option value="GRIP">GRIP</option>
                <option value="PREDICTION">PREDICTION</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Connection / Loading Warning Banner */}
      {apiError && (
        <div className="bg-rose-900 text-white px-4 py-1.5 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-rose-300" />
            <span>API WARNING: {apiError} (Ensure FastAPI backend is running on port 8000)</span>
          </div>
          <button
            onClick={loadInitialData}
            className="underline hover:text-rose-200 cursor-pointer ml-3 font-mono"
          >
            Retry Connection
          </button>
        </div>
      )}
      {isLoading && !session && (
        <div className="bg-slate-800 text-cyan-300 border-b border-slate-700 px-4 py-1.5 text-xs font-mono flex items-center justify-between">
          <span>CONNECTING TO FASTAPI BACKEND & INITIALIZING TYRE TELEMETRY...</span>
        </div>
      )}

      {/* Sub-tab 1: Image Page View */}
      {subTab === 'image' ? (
        <div className="p-4 bg-slate-50 flex-1 min-h-[calc(100vh-125px)]">
          <TyreImagePage
            selectedTyre={selectedTyre}
            onSelectTyre={onSelectTyre}
            surfaceTemp={activeTyreState.thermal.surface_c}
            wearPercentage={activeTyreState.wear.wear_pct}
          />
        </div>
      ) : (
        /* Sub-tab 2: 3D Live Digital Twin View (Light Theme) */
        <div className="bg-slate-100 text-slate-900 flex-1 flex flex-col justify-between min-h-[calc(100vh-125px)]">
          <main className="p-2 grid grid-cols-12 gap-2 max-w-[1920px] w-full mx-auto items-start flex-1">
            {/* TOP 3-PANEL HERO ROW (Strictly aligned baseline) */}
            <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 lg:grid-cols-[220px_1fr_325px] xl:grid-cols-[230px_1fr_340px] 2xl:grid-cols-[245px_1fr_360px] gap-2 items-stretch">
              {/* LEFT PANEL: VISUALIZATION MODES + TYRE POSITION SELECTOR */}
              <section className="col-span-1 md:col-span-4 lg:col-span-1 flex flex-col justify-between gap-2 h-full">
                <VisualizationModesPanel
                  activeMode={visMode}
                  onSelectMode={onSelectVisMode}
                />
                <TyrePositionSelector
                  selectedCorner={selectedTyre}
                  onSelectCorner={onSelectTyre}
                  temperatures={cornerTemps}
                  healths={cornerHealths}
                />
              </section>

              {/* CENTER VIEWPORT: HERO 3D F1 TYRE */}
              <section className="col-span-1 md:col-span-8 lg:col-span-1 flex flex-col min-w-0 h-full">
                <div className="w-full h-full min-h-[460px] flex flex-col">
                  <DigitalTwinCanvas
                    speedKph={currentVehicle?.speed_kph ?? 287}
                    drs={frameState.canonicalDrsActive ? 8 : 0}
                    dataMode={dataMode}
                    fourWheelStates={frameState.fourWheelStates}
                    telemetryFrame={frameState.telemetry}
                    physicsOutput={frameState.physics}
                    tdiResponse={frameState.tdi}
                    selectedTyre={selectedTyre}
                    visMode={visMode}
                    onSelectVisMode={onSelectVisMode}
                  />
                </div>
              </section>

              {/* RIGHT PANEL: TYRE TELEMETRY MATRIX & THERMAL MAP */}
              <section className="col-span-1 md:col-span-12 lg:col-span-1 flex flex-col h-full">
                <TelemetryPanel state={activeTyreState} />
              </section>
            </div>

            {/* BOTTOM PANELS (3 EQUAL CARDS) */}
            <section className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-2 items-stretch">
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

            {/* COLLAPSIBLE PHYSICS-INFORMED TDI REASONING & DIAGNOSTICS */}
            <section className="col-span-12 flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <button
                  onClick={() => setShowAdvancedAnalytics(!showAdvancedAnalytics)}
                  className="flex items-center space-x-2 text-xs font-mono font-bold text-slate-800 hover:text-red-600 cursor-pointer transition-colors"
                >
                  <span>PHYSICS-INFORMED TDI REASONING & TIME-SERIES TELEMETRY</span>
                  {showAdvancedAnalytics ? (
                    <ChevronUp className="w-4 h-4 text-red-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                <div className="text-[11px] font-mono text-slate-500 hidden sm:block">
                  20 HZ WEBSOCKET TELEMETRY GATEWAY
                </div>
              </div>

              {showAdvancedAnalytics && (
                <div className="flex flex-col gap-3 animate-in fade-in duration-200">
                  {/* Tab Selector */}
                  <div className="flex items-center space-x-2 border-b border-slate-200 pb-1">
                    <button
                      onClick={() => setActiveAnalyticsTab('ANALYTICS')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        activeAnalyticsTab === 'ANALYTICS'
                          ? 'bg-white text-red-600 border border-red-500/40 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 bg-slate-200/60'
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>PHYSICS-INFORMED TDI REASONING & EVIDENCE</span>
                    </button>
                    <button
                      onClick={() => setActiveAnalyticsTab('DIAGNOSTICS')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        activeAnalyticsTab === 'DIAGNOSTICS'
                          ? 'bg-white text-red-600 border border-red-500/40 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 bg-slate-200/60'
                      }`}
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      <span>TIME-SERIES TELEMETRY RESIDUAL DYNAMICS</span>
                    </button>
                  </div>

                  {activeAnalyticsTab === 'ANALYTICS' && (
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

                  {activeAnalyticsTab === 'DIAGNOSTICS' && (
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

          {/* Sticky Replay Control Bar */}
          <div className="sticky bottom-0 z-40 w-full mt-auto">
            <ReplayControlBar
              status={replayStatus}
              onStart={onStart}
              onPause={onPause}
              onResume={onResume}
              onReset={onReset}
              onSeek={onSeek}
              onSetSpeed={onSetSpeed}
            />
          </div>
        </div>
      )}
    </div>
  );
};

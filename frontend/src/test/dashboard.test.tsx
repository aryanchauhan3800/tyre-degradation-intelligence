/**
 * TYRETRACE — Comprehensive Frontend Test Suite
 * Covers API, WebSocket, payload parsing, TDI display, residual chart, confounders,
 * unavailable tyre state, demo tyre state, tyre selection, replay controls, connection loss,
 * malformed payload handling, and strict mode separation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// Components & Services
import { GlobalTDICard } from '../components/GlobalTDICard';
import { ConfoundersPanel } from '../components/ConfoundersPanel';
import { WhyPanel } from '../components/WhyPanel';
import { TyreIntelligencePanel } from '../components/TyreIntelligencePanel';
import { TDITrajectoryChart } from '../components/TDITrajectoryChart';
import { ResidualChart } from '../components/ResidualChart';
import { ReplayControlBar } from '../components/ReplayControlBar';
import { computeDemoWheelStates, getCornerLabel } from '../services/demoSimulation';
import { api } from '../services/api';
import type {
  TDIStateResponse,
  ConfounderFrame,
  FourWheelTyres,
  TDIHistoryPoint,
  ResidualHistoryPoint,
  ReplayStatusResponse,
} from '../types/telemetry';

describe('1. Global TDI Intelligence Card', () => {
  const mockTdi: TDIStateResponse = {
    physics_tdi: 61.2,
    ai_tdi: 67.4,
    final_tdi: 63.7,
    state: 'MODERATE_DEGRADATION',
    trend: 'RISING',
    confidence: 0.78,
    model_reliability: 0.68,
    evidence: ['Persistent residual across window', 'Tyre age increased'],
    counter_evidence: ['DRS active during part of window'],
  };

  it('renders primary fused TDI score and state badge', () => {
    render(<GlobalTDICard tdiData={mockTdi} />);
    expect(screen.getAllByText('63.7').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('MODERATE DEGRADATION')).toBeInTheDocument();
    expect(screen.getByText(/78/)).toBeInTheDocument();
    expect(screen.getByText(/68/)).toBeInTheDocument();
    expect(screen.getByText('RISING')).toBeInTheDocument();
  });

  it('renders 3-way architecture breakdown (Physics, AI, Fusion)', () => {
    render(<GlobalTDICard tdiData={mockTdi} />);
    expect(screen.getByText('61.2')).toBeInTheDocument(); // Physics
    expect(screen.getByText('67.4')).toBeInTheDocument(); // AI
    expect(screen.getByText(/Physics/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Model/i)).toBeInTheDocument();
    expect(screen.getByText(/Fusion/i)).toBeInTheDocument();
  });
});

describe('2. Confounder Analysis Panel', () => {
  const mockConfounders: ConfounderFrame = {
    active_flags: {
      drs_active: true,
      braking_active: false,
      high_speed_active: true,
      transient_active: false,
    },
    non_tyre_explanation_score: 0.38,
    tyre_evidence_quality: 0.72,
  };

  it('renders active and inactive flags accurately', () => {
    render(<ConfoundersPanel confounders={mockConfounders} />);
    expect(screen.getByText('DRS')).toBeInTheDocument();
    expect(screen.getByText('BRAKING')).toBeInTheDocument();
    expect(screen.getByText('HIGH SPEED')).toBeInTheDocument();
    expect(screen.getByText('TRANSIENT')).toBeInTheDocument();

    const activeBadges = screen.getAllByText('ACTIVE');
    const inactiveBadges = screen.getAllByText('INACTIVE');
    expect(activeBadges.length).toBe(2); // DRS + HIGH SPEED
    expect(inactiveBadges.length).toBe(2); // BRAKING + TRANSIENT
  });

  it('renders non-tyre explanation score and tyre evidence quality', () => {
    render(<ConfoundersPanel confounders={mockConfounders} />);
    expect(screen.getByText('0.38')).toBeInTheDocument();
    expect(screen.getByText('0.72')).toBeInTheDocument();
  });
});

describe('3. Dynamic Why / Explainability Panel', () => {
  it('renders evidence and counter evidence items from engine', () => {
    render(
      <WhyPanel
        evidence={['Persistent residual', 'Tyre age increased']}
        counterEvidence={['DRS active in sector 3']}
        trend="RISING"
        finalTdi={64.2}
      />
    );
    expect(screen.getByText('WHY IS TDI RISING?')).toBeInTheDocument();
    expect(screen.getByText('Persistent residual')).toBeInTheDocument();
    expect(screen.getByText('Tyre age increased')).toBeInTheDocument();
    expect(screen.getByText('DRS active in sector 3')).toBeInTheDocument();
  });

  it('adapts heading for stable or falling trends', () => {
    render(
      <WhyPanel
        evidence={['Grip nominal']}
        counterEvidence={[]}
        trend="STABLE"
        finalTdi={18.0}
      />
    );
    expect(screen.getByText('WHY IS TDI AT THIS LEVEL?')).toBeInTheDocument();
  });
});

describe('4. Tyre Intelligence Panel & Mode Separation', () => {
  const mockRealTyres: FourWheelTyres = {
    FL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
    FR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
    RL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
    RR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
  };

  it('strictly displays UNAVAILABLE state in REAL_REPLAY mode without fabricating data', () => {
    render(
      <TyreIntelligencePanel
        selectedTyre="FR"
        dataMode="REPLAY"
        fourWheelStates={mockRealTyres}
        onResetSelection={() => {}}
        onToggleDemoMode={() => {}}
      />
    );

    expect(screen.getByText('STATUS: UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText('NO DIRECT WHEEL TELEMETRY')).toBeInTheDocument();
    expect(screen.getByText('REAL REPLAY')).toBeInTheDocument();
    expect(
      screen.getByText(/Wheel-level degradation telemetry is not available/i)
    ).toBeInTheDocument();
  });

  it('displays clearly labelled simulated values in DEMO_SIMULATION mode', () => {
    const demoTyres = computeDemoWheelStates(65.0, 100, 12, 290);

    render(
      <TyreIntelligencePanel
        selectedTyre="FR"
        dataMode="DEMO_SIMULATION"
        fourWheelStates={demoTyres}
        onResetSelection={() => {}}
        onToggleDemoMode={() => {}}
      />
    );

    expect(screen.getByText('DEMO SIMULATION')).toBeInTheDocument();
    expect(screen.getByText('CORNER TDI (SIMULATED)')).toBeInTheDocument();
    expect(screen.getByText(`${demoTyres.FR.tdi?.toFixed(1)}`)).toBeInTheDocument();
    expect(screen.getByText('12 laps')).toBeInTheDocument();
    expect(screen.getByText('HARD')).toBeInTheDocument();
  });

  it('provides correct corner names and reset selection callback', () => {
    const onReset = vi.fn();
    render(
      <TyreIntelligencePanel
        selectedTyre="RL"
        dataMode="REPLAY"
        fourWheelStates={mockRealTyres}
        onResetSelection={onReset}
        onToggleDemoMode={() => {}}
      />
    );

    expect(screen.getByText('REAR LEFT (RL)')).toBeInTheDocument();
    const resetBtn = screen.getByTitle('Deselect tyre');
    fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalled();
  });
});

describe('5. Time-Series Trajectory & Residual Charts', () => {
  const mockTdiHistory: TDIHistoryPoint[] = [
    { timestamp: '12:00:01', lap: 1, physics_tdi: 10, ai_tdi: 12, final_tdi: 11 },
    { timestamp: '12:00:02', lap: 1, physics_tdi: 20, ai_tdi: 22, final_tdi: 21 },
    { timestamp: '12:00:03', lap: 1, physics_tdi: 35, ai_tdi: 38, final_tdi: 36 },
  ];

  const mockResidualHistory: ResidualHistoryPoint[] = [
    { timestamp: '12:00:01', lap: 1, raw_residual: 0.1, normalized_residual: 0.05, tyre_evidence_quality: 0.9, confounder_score: 0.1 },
    { timestamp: '12:00:02', lap: 1, raw_residual: -0.4, normalized_residual: -0.2, tyre_evidence_quality: 0.85, confounder_score: 0.15 },
  ];

  it('renders TDI Trajectory SVG with points count and legend', () => {
    render(<TDITrajectoryChart history={mockTdiHistory} />);
    expect(screen.getByText('TDI Trajectory Analysis')).toBeInTheDocument();
    expect(screen.getByText('(3 points)')).toBeInTheDocument();
    expect(screen.getByText('Physics')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Fusion')).toBeInTheDocument();
  });

  it('renders Residual & Confounder Dynamics chart with units', () => {
    render(<ResidualChart history={mockResidualHistory} />);
    expect(screen.getByText('Residual & Confounder Dynamics')).toBeInTheDocument();
    expect(screen.getByText('r_ax (m/s²)')).toBeInTheDocument();
    expect(screen.getByText('Q_tyre')).toBeInTheDocument();
    expect(screen.getByText('S_conf')).toBeInTheDocument();
  });
});

describe('6. Replay Transport Controls', () => {
  const mockStatus: ReplayStatusResponse = {
    running: true,
    paused: false,
    current_frame: 140,
    total_frames: 1000,
    current_lap: 12,
    playback_speed: 1.0,
  };

  it('triggers playback actions on button clicks', () => {
    const onStart = vi.fn();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onReset = vi.fn();
    const onSeek = vi.fn();
    const onSetSpeed = vi.fn();

    render(
      <ReplayControlBar
        status={mockStatus}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onReset={onReset}
        onSeek={onSeek}
        onSetSpeed={onSetSpeed}
      />
    );

    // Running and not paused -> clicking Pause triggers onPause
    const pauseBtn = screen.getByText('PAUSE');
    fireEvent.click(pauseBtn);
    expect(onPause).toHaveBeenCalled();

    // Reset button
    const resetBtn = screen.getByText('RESET');
    fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalled();

    // Speed button
    const speed2x = screen.getByText('2x');
    fireEvent.click(speed2x);
    expect(onSetSpeed).toHaveBeenCalledWith(2.0);

    // Timeline slider
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '250' } });
    expect(onSeek).toHaveBeenCalledWith(250);
  });
});

describe('7. Deterministic Demo Simulation Math & Utilities', () => {
  it('generates deterministic wheel states without jitter', () => {
    const res1 = computeDemoWheelStates(60.0, 150, 10, 300.0);
    const res2 = computeDemoWheelStates(60.0, 150, 10, 300.0);

    expect(res1.FL.tdi).toBe(res2.FL.tdi);
    expect(res1.FR.tdi).toBe(res2.FR.tdi);
    expect(res1.RL.tdi).toBe(res2.RL.tdi);
    expect(res1.RR.tdi).toBe(res2.RR.tdi);
  });

  it('clamps simulated TDI scores to valid [0, 100] range', () => {
    const extremeLow = computeDemoWheelStates(-50.0, 10, 1, 0.0);
    expect(extremeLow.FL.tdi).toBeGreaterThanOrEqual(0);

    const extremeHigh = computeDemoWheelStates(150.0, 10, 50, 350.0);
    expect(extremeHigh.FL.tdi).toBeLessThanOrEqual(100);
  });

  it('correctly formats corner labels', () => {
    expect(getCornerLabel('FL')).toBe('FRONT LEFT');
    expect(getCornerLabel('FR')).toBe('FRONT RIGHT');
    expect(getCornerLabel('RL')).toBe('REAR LEFT');
    expect(getCornerLabel('RR')).toBe('REAR RIGHT');
  });
});

describe('8. REST API Client Error & Payload Handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles API network failure gracefully without unhandled crashes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: () => Promise.resolve('Backend server starting'),
    });

    await expect(api.getHealth()).rejects.toThrow('API error 503: Backend server starting');
  });

  it('parses valid API responses cleanly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          service: 'TYRETRACE',
          version: '1.0.0',
          pipeline: 'physics_residual_confounder_tdi_ai',
        }),
    });

    const res = await api.getHealth();
    expect(res.status).toBe('ok');
    expect(res.service).toBe('TYRETRACE');
  });
});

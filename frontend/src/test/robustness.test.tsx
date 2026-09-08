/**
 * TYRETRACE — Phase 10 Frontend Robustness & Mode Separation Tests
 * Tests UI error tolerance, mode switching resets, and buffer stability.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { TopBar } from '../components/TopBar';
import { TyreIntelligencePanel } from '../components/TyreIntelligencePanel';
import { computeDemoWheelStates } from '../services/demoSimulation';
import type { FourWheelTyres } from '../types/telemetry';

describe('Phase 10 Frontend Mode Separation & Recovery', () => {
  const mockRealTyres: FourWheelTyres = {
    FL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
    FR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
    RL: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
    RR: { available: false, tdi: null, reason: 'Wheel-level telemetry unavailable in FastF1 source' },
  };

  it('switching from DEMO_SIMULATION to REAL_REPLAY immediately clears simulated values', () => {
    const demoTyres = computeDemoWheelStates(70.0, 50, 15, 300.0);
    const onToggle = vi.fn();

    const { rerender } = render(
      <TyreIntelligencePanel
        selectedTyre="FL"
        dataMode="DEMO_SIMULATION"
        fourWheelStates={demoTyres}
        onResetSelection={() => {}}
        onToggleDemoMode={() => {}}
      />
    );

    expect(screen.getByText('DEMO SIMULATION')).toBeInTheDocument();
    expect(screen.getByText('CORNER TDI (SIMULATED)')).toBeInTheDocument();

    // Rerender as REAL_REPLAY
    rerender(
      <TyreIntelligencePanel
        selectedTyre="FL"
        dataMode="REPLAY"
        fourWheelStates={mockRealTyres}
        onResetSelection={() => {}}
        onToggleDemoMode={onToggle}
      />
    );

    // Simulated values MUST be gone
    expect(screen.queryByText('DEMO SIMULATION')).not.toBeInTheDocument();
    expect(screen.getByText('STATUS: UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText('NO DIRECT WHEEL TELEMETRY')).toBeInTheDocument();
    expect(screen.getByText('REAL REPLAY')).toBeInTheDocument();
  });

  it('TopBar safely handles null/zero telemetry without crashing', () => {
    render(
      <TopBar
        session={null}
        vehicleState={null}
        connectionStatus="DISCONNECTED"
        dataMode="REPLAY"
        onToggleDataMode={() => {}}
        onReconnect={() => {}}
      />
    );

    expect(screen.getByText('TYRETRACE')).toBeInTheDocument();
    expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('km/h')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument(); // Gear Neutral
  });

  it('TopBar allows interactive switching between REPLAY and DEMO_SIMULATION', () => {
    const onToggle = vi.fn();
    render(
      <TopBar
        session={null}
        vehicleState={null}
        connectionStatus="CONNECTED"
        dataMode="REPLAY"
        onToggleDataMode={onToggle}
        onReconnect={() => {}}
      />
    );

    const demoBtn = screen.getByText('DEMO SIMULATION');
    fireEvent.click(demoBtn);
    expect(onToggle).toHaveBeenCalledWith('DEMO_SIMULATION');
  });
});

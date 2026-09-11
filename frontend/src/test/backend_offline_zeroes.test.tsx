import { describe, it, expect } from 'vitest';
import { calculateTyreCornerState } from '../utils/tyreCalculations';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TelemetryPanel } from '../components/Dashboard/TelemetryPanel';
import { ThermalPanel } from '../components/Dashboard/ThermalPanel';
import { DegradationPanel } from '../components/Dashboard/DegradationPanel';
import { TyrePositionSelector } from '../components/TyreSelector/TyrePositionSelector';

describe('Offline and Zero Dummy Values Guarantee', () => {
  it('calculateTyreCornerState returns strict zeroes when backend telemetry/physics data is null', () => {
    const state = calculateTyreCornerState(
      'FR',
      null,
      null,
      null,
      null,
      'REPLAY'
    );

    // Thermal metrics must be 0
    expect(state.thermal.inner_c).toBe(0);
    expect(state.thermal.center_c).toBe(0);
    expect(state.thermal.outer_c).toBe(0);
    expect(state.thermal.surface_c).toBe(0);
    expect(state.thermal.core_c).toBe(0);

    // Wear & health metrics must be 0
    expect(state.wear.wear_pct).toBe(0);
    expect(state.wear.health_pct).toBe(0);
    expect(state.wear.wear_rate_mm_lap).toBe(0);
    expect(state.wear.remaining_laps).toBe(0);

    // Loads must be 0
    expect(state.load.vertical_load_kn).toBe(0);
    expect(state.load.longitudinal_load_kn).toBe(0);
    expect(state.load.lateral_load_kn).toBe(0);

    // Grip & slip must be 0
    expect(state.grip.available_grip_pct).toBe(0);
    expect(state.grip.slip_angle_deg).toBe(0);
    expect(state.grip.slip_ratio_pct).toBe(0);

    // Pressure & age must be 0
    expect(state.pressure_psi).toBe(0);
    expect(state.age_laps).toBe(0);
    expect(state.tdi).toBe(0);
  });

  it('TelemetryPanel renders 0 for all metrics and OFFLINE status when state is zeroed', () => {
    const zeroState = calculateTyreCornerState('FR', null, null, null, null, 'REPLAY');
    render(<TelemetryPanel state={zeroState} />);

    expect(screen.getAllByText('0°C').length).toBe(4);
    expect(screen.getByText('0 PSI')).toBeDefined();
    expect(screen.getByText('0 kN')).toBeDefined();
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OFFLINE').length).toBeGreaterThan(0);
  });

  it('ThermalPanel renders 0°C across all 3 zones when zeroed', () => {
    const zeroState = calculateTyreCornerState('FR', null, null, null, null, 'REPLAY');
    render(<ThermalPanel thermal={zeroState.thermal} />);

    const zeroTemps = screen.getAllByText('0°C');
    expect(zeroTemps.length).toBe(3); // INNER, CENTER, OUTER
  });

  it('DegradationPanel renders 0 mm/lap, 0 LAPS, (0%), and LAP 0 when zeroed', () => {
    const zeroState = calculateTyreCornerState('FR', null, null, null, null, 'REPLAY');
    render(<DegradationPanel wear={zeroState.wear} />);

    expect(screen.getByText('0 mm/lap')).toBeDefined();
    expect(screen.getByText('0 LAPS')).toBeDefined();
    expect(screen.getByText('(0%)')).toBeDefined();
    expect(screen.getByText('LAP 0')).toBeDefined();
  });

  it('TyrePositionSelector defaults to 0°C and 0% when no corner data is provided', () => {
    render(
      <TyrePositionSelector
        selectedCorner="FR"
        onSelectCorner={() => {}}
        temperatures={{ FL: 0, FR: 0, RL: 0, RR: 0 }}
        healths={{ FL: 0, FR: 0, RL: 0, RR: 0 }}
      />
    );

    const zeroes = screen.getAllByText('0°C');
    expect(zeroes.length).toBe(4);
    const healthZeroes = screen.getAllByText('0%');
    expect(healthZeroes.length).toBe(4);
  });
});

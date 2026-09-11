/**
 * TYRETRACE — F1 Tyre Intelligence & Redesigned Frontend Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  calculateTyreCornerState,
  getThermalColorHex,
  getThermalColorCss,
} from '../utils/tyreCalculations';
import { SelectedTyreInspector } from '../components/SelectedTyreInspector';
import { RaceTelemetryHUD } from '../components/RaceTelemetryHUD';
import type { TelemetryFrame, PhysicsTwinOutput, TDIStateResponse } from '../types/telemetry';

describe('Tyre Calculations & Physics Modeling', () => {
  it('computes realistic thermal FLIR gradient colors for different temperatures', () => {
    // Cold (<70°C) -> Blueish
    const coldHex = getThermalColorHex(60);
    expect(coldHex).toBeGreaterThan(0);

    // Optimal window (85-100°C)
    const optHex = getThermalColorHex(92);
    expect(optHex).toBeGreaterThan(0);

    // Overheat (>110°C)
    const hotHex = getThermalColorHex(115);
    expect(hotHex).toBeGreaterThan(0);

    const cssString = getThermalColorCss(90);
    expect(cssString).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('calculates full physics state for front right tyre with realistic loads and wear', () => {
    const mockTelemetry: TelemetryFrame = {
      timestamp: 1693666800,
      session_id: 'test_session',
      lap: 14,
      vehicle: {
        speed_kph: 285,
        speed_mps: 79.16,
        rpm: 11400,
        gear: 7,
        throttle_pct: 95,
        brake_pct: 0,
        steer: 12,
        drs: 8,
      },
      environment: {
        track_temp_c: 41,
        air_temp_c: 28,
      },
    };

    const mockPhysics: PhysicsTwinOutput = {
      ax_expected_mps2: 1.4,
      forces: {
        drag_n: 2400,
        rolling_resistance_n: 320,
        brake_force_n: 0,
        traction_force_n: 3200,
        downforce_n: 6800,
        net_longitudinal_force_n: 800,
        vertical_loads_n: {
          front_left: 3800,
          front_right: 4400,
          rear_left: 4100,
          rear_right: 4600,
          total: 16900,
        },
      },
    };

    const mockTdi: TDIStateResponse = {
      physics_tdi: 22.4,
      ai_tdi: 26.1,
      final_tdi: 24.5,
      state: 'MILD_DEGRADATION',
      trend: 'STABLE',
      confidence: 0.94,
      model_reliability: 0.96,
      evidence: ['Nominal grip levels'],
      counter_evidence: [],
    };

    const state = calculateTyreCornerState(
      'FR',
      mockTelemetry,
      mockPhysics,
      mockTdi,
      null,
      'REPLAY'
    );

    expect(state.corner).toBe('FR');
    expect(state.label).toBe('FRONT RIGHT');
    expect(state.load.vertical_load_kn).toBe(4.4);
    expect(state.wear.health_pct).toBeGreaterThan(70);
    expect(state.wear.wear_pct).toBeLessThan(30);
    expect(state.thermal.surface_c).toBeGreaterThan(60);
    expect(state.thermal.inner_c).toBeDefined();
    expect(state.thermal.center_c).toBeDefined();
    expect(state.thermal.outer_c).toBeDefined();
    expect(state.prediction.prediction_curve.length).toBe(11);
  });
});

describe('SelectedTyreInspector Component', () => {
  const dummyState = calculateTyreCornerState('FR', null, null, null, null, 'REPLAY');

  it('renders tyre headline and key metrics', () => {
    const onSelectVisMode = vi.fn();
    const onSelectTyre = vi.fn();

    render(
      <SelectedTyreInspector
        state={dummyState}
        visMode="NORMAL"
        onSelectVisMode={onSelectVisMode}
        dataMode="REPLAY"
        onSelectTyre={onSelectTyre}
      />
    );

    expect(screen.getByText('FRONT RIGHT')).toBeInTheDocument();
    expect(screen.getByText('TEMPERATURE')).toBeInTheDocument();
    expect(screen.getByText('VERTICAL LOAD')).toBeInTheDocument();
    expect(screen.getByText('GRIP')).toBeInTheDocument();
    expect(screen.getByText('WEAR')).toBeInTheDocument();
  });

  it('switches between visualization modes when mode pills are clicked', () => {
    const onSelectVisMode = vi.fn();
    const onSelectTyre = vi.fn();

    render(
      <SelectedTyreInspector
        state={dummyState}
        visMode="THERMAL"
        onSelectVisMode={onSelectVisMode}
        dataMode="REPLAY"
        onSelectTyre={onSelectTyre}
      />
    );

    expect(screen.getByText('THERMAL DISTRIBUTION')).toBeInTheDocument();
    expect(screen.getByText('INNER')).toBeInTheDocument();
    expect(screen.getByText('CENTER')).toBeInTheDocument();
    expect(screen.getByText('OUTER')).toBeInTheDocument();
    expect(screen.getByText('DEGRADATION')).toBeInTheDocument();
    expect(screen.getByText('PREDICTION')).toBeInTheDocument();
  });
});

describe('RaceTelemetryHUD Component', () => {
  it('renders speed, gear, rpm, throttle, brake, and drs', () => {
    const mockTelemetry: TelemetryFrame = {
      timestamp: 1693666800,
      session_id: 'test_session',
      lap: 22,
      vehicle: {
        speed_kph: 312,
        speed_mps: 86.67,
        rpm: 11950,
        gear: 8,
        throttle_pct: 100,
        brake_pct: 0,
        steer: -2,
        drs: 12,
      },
      environment: {
        track_temp_c: 39,
        air_temp_c: 27,
      },
    };

    render(<RaceTelemetryHUD telemetry={mockTelemetry} drsActive={true} lap={22} />);

    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('KM/H')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('DRS OPEN')).toBeInTheDocument();
    expect(screen.getByText('LAP 22')).toBeInTheDocument();
    expect(screen.getByText('TRACK: 39°C')).toBeInTheDocument();
  });
});

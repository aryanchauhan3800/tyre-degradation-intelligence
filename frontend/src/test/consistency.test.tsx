/**
 * TYRETRACE — Frontend State Consistency Regression Tests
 * Validates single source of truth across TopBar, Confounder Engine,
 * Why Panel, Tyre Intelligence, and mode isolation.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { TopBar } from '../components/TopBar';
import { ConfoundersPanel } from '../components/ConfoundersPanel';
import { WhyPanel } from '../components/WhyPanel';
import { TyreIntelligencePanel } from '../components/TyreIntelligencePanel';
import { GlobalTDICard } from '../components/GlobalTDICard';
import type { ConfounderFrame, FourWheelTyres, TDIStateResponse, VehicleState } from '../types/telemetry';

describe('Frontend State Consistency & Single Source of Truth', () => {
  const mockVehicleFrame: VehicleState = {
    speed_kph: 262,
    speed_mps: 72.78,
    throttle_pct: 0,
    brake_pct: 100,
    gear: 7,
    rpm: 11500,
    drs: 8,
  };

  const mockActiveConfounders: ConfounderFrame = {
    active_flags: ['DRS_ACTIVE', 'HEAVY_BRAKING', 'HIGH_SPEED', 'TRANSIENT_EVENT'],
    drs_active: true,
    braking_active: true,
    high_speed_active: true,
    transient_active: true,
    non_tyre_explanation_score: 0.88,
    tyre_evidence_quality: 0.25,
    confounders: {
      drs: { active: true, classification: 'EXPLANATORY' },
      braking: { active: true, classification: 'EXPLANATORY' },
      high_speed: { active: true, classification: 'EXPLANATORY' },
      transient: { active: true, classification: 'POSSIBLE' },
    },
  };

  const mockInactiveConfounders: ConfounderFrame = {
    active_flags: [],
    drs_active: false,
    braking_active: false,
    high_speed_active: false,
    transient_active: false,
    non_tyre_explanation_score: 0.05,
    tyre_evidence_quality: 0.95,
    confounders: {
      drs: { active: false, classification: 'NONE' },
      braking: { active: false, classification: 'NONE' },
      high_speed: { active: false, classification: 'NONE' },
      transient: { active: false, classification: 'NONE' },
    },
  };

  it('1. DRS consistency: TopBar displays DRS OPEN and ConfoundersPanel displays ACTIVE when drsActive is true', () => {
    render(
      <div>
        <TopBar
          session={null}
          vehicleState={mockVehicleFrame}
          drsActive={true}
          connectionStatus="CONNECTED"
          dataMode="REPLAY"
          onToggleDataMode={() => {}}
          onReconnect={() => {}}
        />
        <ConfoundersPanel confounders={mockActiveConfounders} />
      </div>
    );

    expect(screen.getByText('DRS OPEN')).toBeInTheDocument();
    expect(screen.getByText('DRS')).toBeInTheDocument();
  });

  it('2. Braking consistency: brake=100% displays BRK 100% and ConfoundersPanel displays ACTIVE', () => {
    render(
      <div>
        <TopBar
          session={null}
          vehicleState={mockVehicleFrame}
          drsActive={true}
          connectionStatus="CONNECTED"
          dataMode="REPLAY"
          onToggleDataMode={() => {}}
          onReconnect={() => {}}
        />
        <ConfoundersPanel confounders={mockActiveConfounders} />
      </div>
    );

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('BRAKING')).toBeInTheDocument();
    // All 4 confounders are ACTIVE
    expect(screen.getAllByText('ACTIVE').length).toBe(4);
    expect(screen.queryByText('INACTIVE')).not.toBeInTheDocument();
  });

  it('3. High-speed consistency: speed=262 km/h displays in TopBar and HIGH SPEED is ACTIVE', () => {
    render(
      <div>
        <TopBar
          session={null}
          vehicleState={mockVehicleFrame}
          drsActive={true}
          connectionStatus="CONNECTED"
          dataMode="REPLAY"
          onToggleDataMode={() => {}}
          onReconnect={() => {}}
        />
        <ConfoundersPanel confounders={mockActiveConfounders} />
      </div>
    );

    expect(screen.getByText('262')).toBeInTheDocument();
    expect(screen.getByText('HIGH SPEED')).toBeInTheDocument();
  });

  it('4. Inactive frame consistency: low speed, 0% brake, DRS closed shows INACTIVE across confounders', () => {
    const inactiveVehicle: VehicleState = {
      speed_kph: 85,
      speed_mps: 23.6,
      throttle_pct: 30,
      brake_pct: 0,
      gear: 3,
      rpm: 9000,
      drs: 0,
    };

    render(
      <div>
        <TopBar
          session={null}
          vehicleState={inactiveVehicle}
          drsActive={false}
          connectionStatus="CONNECTED"
          dataMode="REPLAY"
          onToggleDataMode={() => {}}
          onReconnect={() => {}}
        />
        <ConfoundersPanel confounders={mockInactiveConfounders} />
      </div>
    );

    expect(screen.getByText('DRS CLOSED')).toBeInTheDocument();
    expect(screen.getAllByText('INACTIVE').length).toBe(4);
  });

  it('5. Tyre age consistency: canonical tyre age is displayed consistently in TyreIntelligencePanel', () => {
    render(
      <TyreIntelligencePanel
        selectedTyre="FL"
        dataMode="REPLAY"
        canonicalTyreAge={2}
        canonicalCompound="SOFT"
        onResetSelection={() => {}}
        onToggleDemoMode={() => {}}
      />
    );

    expect(screen.getByText('2 laps')).toBeInTheDocument();
    expect(screen.getByText('SOFT')).toBeInTheDocument();
  });

  it('6. WhyPanel: shows ASSESSMENT with no significant degradation when evidence is empty', () => {
    render(
      <WhyPanel
        evidence={[]}
        counterEvidence={['Tyre set is fresh (2 laps old), reducing degradation likelihood']}
        trend="STABLE"
        finalTdi={6.7}
      />
    );

    expect(screen.getByText('ASSESSMENT')).toBeInTheDocument();
    expect(screen.getByText('No significant degradation evidence detected.')).toBeInTheDocument();
    expect(screen.getByText(/Tyre set is fresh \(2 laps old\)/)).toBeInTheDocument();
  });

  it('7. Confidence label semantics: SYSTEM CONFIDENCE vs MODEL RELIABILITY vs SIMULATION CONFIDENCE', () => {
    const mockTdi: TDIStateResponse = {
      physics_tdi: 6.2,
      ai_tdi: 7.1,
      final_tdi: 6.7,
      state: 'NOMINAL',
      trend: 'STABLE',
      confidence: 0.04,
      model_reliability: 0.15,
      evidence: [],
      counter_evidence: [],
    };

    const mockSimulatedTyres: FourWheelTyres = {
      FL: { available: true, tdi: 6.4, confidence: 0.89, age_laps: 2, compound: 'SOFT', trend: 'STABLE' },
      FR: { available: true, tdi: 6.4, confidence: 0.89, age_laps: 2, compound: 'SOFT', trend: 'STABLE' },
      RL: { available: true, tdi: 6.4, confidence: 0.89, age_laps: 2, compound: 'SOFT', trend: 'STABLE' },
      RR: { available: true, tdi: 6.4, confidence: 0.89, age_laps: 2, compound: 'SOFT', trend: 'STABLE' },
    };

    render(
      <div>
        <GlobalTDICard tdiData={mockTdi} />
        <TyreIntelligencePanel
          selectedTyre="FR"
          dataMode="DEMO_SIMULATION"
          fourWheelStates={mockSimulatedTyres}
          canonicalTyreAge={2}
          canonicalCompound="SOFT"
          onResetSelection={() => {}}
          onToggleDemoMode={() => {}}
        />
      </div>
    );

    expect(screen.getByText('SYSTEM CONFIDENCE')).toBeInTheDocument();
    expect(screen.getByText('4%')).toBeInTheDocument();
    expect(screen.getByText('MODEL RELIABILITY')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByText('SIMULATION CONFIDENCE')).toBeInTheDocument();
    expect(screen.getByText('89%')).toBeInTheDocument();
  });

  it('8. Header displays DIGITAL TWIN without phase labels', () => {
    render(
      <TopBar
        session={null}
        vehicleState={mockVehicleFrame}
        drsActive={true}
        connectionStatus="CONNECTED"
        dataMode="REPLAY"
        onToggleDataMode={() => {}}
        onReconnect={() => {}}
      />
    );

    expect(screen.getByText('DIGITAL TWIN')).toBeInTheDocument();
    expect(screen.getByText('PHYSICS-INFORMED TYRE INTELLIGENCE')).toBeInTheDocument();
    expect(screen.queryByText(/PHASE/i)).not.toBeInTheDocument();
  });
});

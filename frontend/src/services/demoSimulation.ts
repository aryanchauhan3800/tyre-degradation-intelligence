/**
 * TYRETRACE — Synthetic 4-Wheel Degradation Demo Simulation
 *
 * SCIENTIFIC INTEGRITY MANDATE:
 * This generator is explicitly labelled SIMULATED and is strictly isolated to DEMO_SIMULATION mode.
 * FastF1 telemetry does not provide wheel-level degradation sensors.
 * This simulation demonstrates the 3D car corner interaction and future four-wheel UI visualization
 * without corrupting the canonical FastF1 replay pipeline.
 */

import type { FourWheelTyres, TDITrend, TyreCorner } from '../types/telemetry';

export function computeDemoWheelStates(
  globalTdi: number,
  frameIndex: number,
  lap: number,
  vehicleSpeedKph: number
): FourWheelTyres {
  // Monza track bias: Heavy continuous loading on Left-hand tyres (FL, RL) through
  // Curva Grande (T3), Curva di Lesmo (T6, T7), Variante Ascari (T8-10), and Curva Parabolica (T11).
  const smoothOscillation = Math.sin(frameIndex * 0.02) * 1.5;
  const speedWeight = Math.min(1.0, vehicleSpeedKph / 320.0);

  // FL: Highest thermal and mechanical stress on Monza (front left)
  const tdiFL = Math.max(0, Math.min(100, Math.round((globalTdi * 1.10 + smoothOscillation + 2.0) * 10) / 10));
  // FR: Lower stress, clean line
  const tdiFR = Math.max(0, Math.min(100, Math.round((globalTdi * 0.92 - smoothOscillation - 1.0) * 10) / 10));
  // RL: High traction drive stress + lateral loading out of Parabolica
  const tdiRL = Math.max(0, Math.min(100, Math.round((globalTdi * 1.06 + smoothOscillation * 0.8 + 1.5) * 10) / 10));
  // RR: Moderate longitudinal traction wear
  const tdiRR = Math.max(0, Math.min(100, Math.round((globalTdi * 0.95 - smoothOscillation * 0.6) * 10) / 10));

  const getTrend = (t: number): TDITrend => {
    if (t > 70) return 'RISING';
    if (t > 40) return 'RISING';
    return 'STABLE';
  };

  const getConfidence = (): number => {
    return Math.round((0.74 + 0.15 * Math.cos(frameIndex * 0.03)) * 100) / 100;
  };

  return {
    FL: {
      available: true,
      tdi: tdiFL,
      source: 'SIMULATED',
      trend: getTrend(tdiFL),
      confidence: getConfidence(),
      compound: 'HARD',
      age_laps: lap > 0 ? lap : 14,
      reason: null,
      evidence: [
        'High lateral duty cycle in Curva Grande & Parabolica (Simulated)',
        'Slip angle persistence in high-speed entry (Simulated)',
        'Elevated carcass thermal accumulation (Simulated)',
      ],
      counter_evidence: speedWeight > 0.8 ? ['High straightline cooling effect active'] : [],
    },
    FR: {
      available: true,
      tdi: tdiFR,
      source: 'SIMULATED',
      trend: getTrend(tdiFR),
      confidence: getConfidence(),
      compound: 'HARD',
      age_laps: lap > 0 ? lap : 14,
      reason: null,
      evidence: [
        'Nominal inside wheel unloading (Simulated)',
        'Tread surface within thermal operating window (Simulated)',
      ],
      counter_evidence: ['Chicane kerb strike transient observed'],
    },
    RL: {
      available: true,
      tdi: tdiRL,
      source: 'SIMULATED',
      trend: getTrend(tdiRL),
      confidence: getConfidence(),
      compound: 'HARD',
      age_laps: lap > 0 ? lap : 14,
      reason: null,
      evidence: [
        'Longitudinal traction slip during acceleration zones (Simulated)',
        'Lateral support loading out of Variante del Rettifilo (Simulated)',
      ],
      counter_evidence: ['DRS activation reduced aerodynamic downforce'],
    },
    RR: {
      available: true,
      tdi: tdiRR,
      source: 'SIMULATED',
      trend: getTrend(tdiRR),
      confidence: getConfidence(),
      compound: 'HARD',
      age_laps: lap > 0 ? lap : 14,
      reason: null,
      evidence: [
        'Symmetric longitudinal braking torque distribution (Simulated)',
        'Stable slip ratio across straightline acceleration (Simulated)',
      ],
      counter_evidence: ['Minor wheelspin detected at gearshift 3->4'],
    },
  };
}

export function getCornerLabel(corner: TyreCorner): string {
  switch (corner) {
    case 'FL':
      return 'FRONT LEFT';
    case 'FR':
      return 'FRONT RIGHT';
    case 'RL':
      return 'REAR LEFT';
    case 'RR':
      return 'REAR RIGHT';
  }
}

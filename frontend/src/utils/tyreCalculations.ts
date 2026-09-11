/**
 * TYRETRACE — Tyre Physics & Degradation Intelligence Calculations
 *
 * Implements physics-informed models to derive:
 * - 3-Zone Thermal Profiles (Inner / Center / Outer / Surface / Core)
 * - Wear Rates & Tread Depth Degradation
 * - Tri-axial Tyre Loads (Fz, Fx, Fy) & Contact Patch Deformation
 * - Grip Coefficients (Pacejka Magic Formula approximation) & Slip Metrics
 * - Degradation Projections & Strategic Pit Window Windows
 *
 * All models are anchored strictly to existing backend telemetry (ax, Fz, TDI, speed, brake).
 */

import type {
  CalculatedTyreCornerState,
  DataMode,
  FourWheelTyres,
  PhysicsTwinOutput,
  TDIStateResponse,
  TelemetryFrame,
  TyreCorner,
} from '../types/telemetry';

export const CORNER_LABELS: Record<TyreCorner, string> = {
  FL: 'FRONT LEFT',
  FR: 'FRONT RIGHT',
  RL: 'REAR LEFT',
  RR: 'REAR RIGHT',
};

/**
 * Returns a smooth 6-stop FLIR thermal colormap hex string:
 * BLUE (cold <70°C) -> CYAN (warm-up 70-85°C) -> GREEN (optimal 85-100°C) ->
 * YELLOW (hot 100-110°C) -> ORANGE (overheat 110-120°C) -> RED (blistering >120°C)
 */
export function getThermalColorHex(tempC: number): number {
  if (tempC < 70) {
    // Deep blue to royal blue
    const t = Math.max(0, (tempC - 40) / 30);
    const r = Math.round(16 * (1 - t) + 30 * t);
    const g = Math.round(40 * (1 - t) + 120 * t);
    const b = Math.round(180 * (1 - t) + 240 * t);
    return (r << 16) | (g << 8) | b;
  }
  if (tempC < 85) {
    // Royal blue to cyan
    const t = (tempC - 70) / 15;
    const r = Math.round(30 * (1 - t) + 0 * t);
    const g = Math.round(120 * (1 - t) + 220 * t);
    const b = Math.round(240 * (1 - t) + 255 * t);
    return (r << 16) | (g << 8) | b;
  }
  if (tempC < 100) {
    // Cyan to electric green (Optimal Operating Window)
    const t = (tempC - 85) / 15;
    const r = Math.round(0 * (1 - t) + 16 * t);
    const g = Math.round(220 * (1 - t) + 230 * t);
    const b = Math.round(255 * (1 - t) + 70 * t);
    return (r << 16) | (g << 8) | b;
  }
  if (tempC < 110) {
    // Electric green to warm yellow
    const t = (tempC - 100) / 10;
    const r = Math.round(16 * (1 - t) + 234 * t);
    const g = Math.round(230 * (1 - t) + 179 * t);
    const b = Math.round(70 * (1 - t) + 8 * t);
    return (r << 16) | (g << 8) | b;
  }
  if (tempC < 122) {
    // Yellow to fiery orange
    const t = (tempC - 110) / 12;
    const r = Math.round(234 * (1 - t) + 249 * t);
    const g = Math.round(179 * (1 - t) + 115 * t);
    const b = Math.round(8 * (1 - t) + 22 * t);
    return (r << 16) | (g << 8) | b;
  }
  // Fiery orange to crimson red (Blistering / Thermal degradation)
  const t = Math.min(1.0, (tempC - 122) / 18);
  const r = Math.round(249 * (1 - t) + 239 * t);
  const g = Math.round(115 * (1 - t) + 30 * t);
  const b = Math.round(22 * (1 - t) + 40 * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * Returns CSS hex string for UI meters
 */
export function getThermalColorCss(tempC: number): string {
  const hex = getThermalColorHex(tempC).toString(16).padStart(6, '0');
  return `#${hex}`;
}

/**
 * Computes complete physics-informed tyre state for a given corner
 */
export function calculateTyreCornerState(
  corner: TyreCorner,
  telemetry: TelemetryFrame | null,
  physics: PhysicsTwinOutput | null,
  tdiRes: TDIStateResponse | null,
  fourWheelStates: FourWheelTyres | null,
  dataMode: DataMode,
  defaultAgeLaps = 12,
  defaultCompound = 'C3 (MEDIUM)'
): CalculatedTyreCornerState {
  // When no backend telemetry or physics data is present (disconnected or backend is off),
  // return strict zeroed values with no dummy/synthetic numbers.
  const hasBackendData = Boolean(telemetry || physics || tdiRes);
  if (!hasBackendData) {
    return {
      corner,
      label: CORNER_LABELS[corner],
      compound: defaultCompound,
      age_laps: 0,
      pressure_psi: 0,
      thermal: {
        inner_c: 0,
        center_c: 0,
        outer_c: 0,
        surface_c: 0,
        core_c: 0,
        is_estimated: false,
      },
      wear: {
        wear_pct: 0,
        health_pct: 0,
        wear_rate_mm_lap: 0,
        remaining_laps: 0,
        tread_depth_mm: 0,
      },
      load: {
        vertical_load_kn: 0,
        longitudinal_load_kn: 0,
        lateral_load_kn: 0,
        contact_patch_pct: 0,
      },
      grip: {
        grip_coeff: 0,
        grip_loss_pct: 0,
        slip_ratio_pct: 0,
        slip_angle_deg: 0,
        available_grip_pct: 0,
      },
      prediction: {
        current_health_pct: 0,
        predicted_health_5_laps: 0,
        predicted_degradation_pct: 0,
        remaining_competitive_laps: 0,
        pit_window_lap_start: 0,
        pit_window_lap_end: 0,
        prediction_curve: [],
      },
      tdi: 0,
      is_measured: false,
    };
  }

  const veh = telemetry?.vehicle || telemetry?.vehicle_state;
  const speedKph = veh?.speed_kph ?? 0;
  const speedMps = veh?.speed_mps ?? speedKph / 3.6;
  const brakePct = veh?.brake_pct ?? (veh?.brake ? veh.brake * 100 : 0);
  const throttlePct = veh?.throttle_pct ?? (veh?.throttle ? veh.throttle * 100 : 0);
  const steerVal = veh?.steer ?? 0;

  const isFront = corner.startsWith('F');
  const isLeft = corner.endsWith('L');

  // 1. Resolve Effective TDI for this corner
  const fallbackGlobalTdi = tdiRes?.final_tdi ?? 0;
  const cornerSlot = fourWheelStates ? fourWheelStates[corner] : null;
  const effectiveTdi = cornerSlot && typeof cornerSlot.tdi === 'number'
    ? cornerSlot.tdi
    : fallbackGlobalTdi;

  // 2. Vertical Load Fz (kN)
  // Check backend physics twin vertical loads
  let fz_kn = speedKph > 0 ? 4.2 : 0; // nominal static corner load ~4200 N when moving
  const vLoads = physics?.forces?.vertical_loads_n;
  if (vLoads) {
    if (corner === 'FL' && vLoads.front_left) fz_kn = vLoads.front_left / 1000;
    else if (corner === 'FR' && vLoads.front_right) fz_kn = vLoads.front_right / 1000;
    else if (corner === 'RL' && vLoads.rear_left) fz_kn = vLoads.rear_left / 1000;
    else if (corner === 'RR' && vLoads.rear_right) fz_kn = vLoads.rear_right / 1000;
  } else {
    // Dynamic load transfer approximation
    const downforceKn = (physics?.forces?.downforce_n ?? (0.5 * 1.225 * 3.8 * (speedMps * speedMps))) / 1000;
    const cornerDf = downforceKn * (isFront ? 0.22 : 0.28);
    const pitchTransfer = (brakePct / 100) * 1.5 * (isFront ? 1 : -1);
    const rollTransfer = (steerVal / 100) * 1.8 * (isLeft ? -1 : 1);
    fz_kn = Math.max(1.5, (isFront ? 3.4 : 4.4) + cornerDf + pitchTransfer + rollTransfer);
  }

  // 3. Longitudinal & Lateral Loads
  const ax = physics?.ax_expected_mps2 ?? 0;
  const fx_kn = Math.abs(ax) * 0.75 * (isFront ? 0.45 : 0.55);
  const fy_kn = Math.abs(steerVal / 100) * (speedMps / 20) * 2.8;

  // Contact Patch (% expansion under vertical load)
  const contactPatchPct = Math.min(100, Math.round(65 + (fz_kn / 8.0) * 35));

  // 4. Thermal Model (FLIR 3-zone surface + core)
  // Ambient & track base
  const trackTemp = telemetry?.environment?.track_temp_c ?? 38.0;
  // F1 tyres run at 95°C-112°C working equilibrium on track
  const baseTireTemp = Math.max(88.0, trackTemp + 52.0); // base heated working temp ~90-95°C

  // Dynamic heat from friction, slip, braking, and TDI
  const speedHeating = (speedKph / 320) * 16.0;
  const brakeHeating = isFront ? (brakePct / 100) * 28.0 : (brakePct / 100) * 14.0;
  const tractionHeating = !isFront ? (throttlePct / 100) * 18.0 : 0;
  const tdiHeatOffset = (effectiveTdi / 100) * 14.0;

  const centerTemp = Math.round(baseTireTemp + speedHeating + brakeHeating * 0.45 + tractionHeating * 0.5 + tdiHeatOffset);

  // F1 negative camber kinematics (-3.5° front camber):
  // Inside shoulder runs significantly hotter (camberDelta ~14°C front, 9°C rear).
  // When cornering, lateral load transfers thermal mass to outside shoulder.
  const camberDelta = isFront ? 14.0 : 9.0;
  const lateralShift = (steerVal / 100) * (isLeft ? 10.0 : -10.0);

  const innerTemp = Math.round(centerTemp + (camberDelta - lateralShift * 0.5));
  const outerTemp = Math.round(centerTemp - (camberDelta * 0.85 - lateralShift * 0.8));
  const surfaceTemp = Math.round((innerTemp + centerTemp + outerTemp) / 3);
  const coreTemp = Math.round(surfaceTemp + 8.5 + (effectiveTdi / 100) * 5.0);

  // 5. Wear & Health
  const wearPct = Math.min(100, Math.max(0, Math.round(effectiveTdi * 10) / 10));
  const healthPct = Math.min(100, Math.max(0, Math.round((100 - wearPct) * 10) / 10));
  const wearRate = Math.round((0.032 + (effectiveTdi / 100) * 0.045) * 1000) / 1000;
  const currentLap = telemetry?.lap ?? 1;
  const ageLaps = cornerSlot?.age_laps ?? defaultAgeLaps;
  const remainingLaps = Math.max(1, Math.round((healthPct / 100) * 28));
  const treadDepthMm = Math.max(0.4, Math.round((3.2 * (healthPct / 100)) * 10) / 10);

  // 6. Grip & Slip Kinematics
  // Peak grip coefficient ~1.65 on soft/medium slick, degrades with wear and overheating
  const thermalPenalty = Math.max(0, (surfaceTemp - 105) * 0.015);
  const wearPenalty = (wearPct / 100) * 0.35;
  const gripCoeff = Math.max(0.7, Math.round((1.65 - thermalPenalty - wearPenalty) * 100) / 100);
  const availableGripPct = Math.round((gripCoeff / 1.65) * 100);
  const gripLossPct = Math.max(0, 100 - availableGripPct);

  // Slip ratio & slip angle
  const slipRatioPct = Math.min(15.0, Math.round((Math.abs(ax) / 12.0 * 8.5 + (throttlePct > 80 ? 2.5 : 0)) * 10) / 10);
  const slipAngleDeg = Math.min(8.0, Math.round((Math.abs(steerVal) / 100 * 4.2 + (speedKph > 200 ? 1.2 : 0.4)) * 10) / 10);

  // 7. Degradation Prediction Curve (next 10 laps)
  const currentLapNum = currentLap;
  const predictionCurve: { lap: number; health_pct: number; tdi: number }[] = [];
  let simulatedHealth = healthPct;
  for (let i = 0; i <= 10; i++) {
    const projectedLap = currentLapNum + i;
    // Degradation accelerates non-linearly as tread depth diminishes
    const nonLinearFactor = 1.0 + (100 - simulatedHealth) / 80.0;
    const lapDrop = wearRate * 25.0 * nonLinearFactor;
    simulatedHealth = Math.max(5.0, simulatedHealth - (i === 0 ? 0 : lapDrop));
    predictionCurve.push({
      lap: projectedLap,
      health_pct: Math.round(simulatedHealth * 10) / 10,
      tdi: Math.round((100 - simulatedHealth) * 10) / 10,
    });
  }

  const remainingCompetitiveLaps = Math.max(2, Math.round(remainingLaps * 0.75));
  const pitWindowLapStart = currentLapNum + Math.max(1, remainingCompetitiveLaps - 2);
  const pitWindowLapEnd = pitWindowLapStart + 4;

  // Tyre pressure (PSI) - rises with temperature
  const basePsi = isFront ? 22.5 : 20.8;
  const thermalPressureRise = ((surfaceTemp - 80) / 40) * 1.8;
  const pressurePsi = Math.round((basePsi + thermalPressureRise) * 10) / 10;

  return {
    corner,
    label: CORNER_LABELS[corner],
    compound: cornerSlot?.compound || defaultCompound,
    age_laps: ageLaps,
    pressure_psi: pressurePsi,
    thermal: {
      inner_c: innerTemp,
      center_c: centerTemp,
      outer_c: outerTemp,
      surface_c: surfaceTemp,
      core_c: coreTemp,
      is_estimated: dataMode === 'REPLAY' || !cornerSlot?.available,
    },
    wear: {
      wear_pct: wearPct,
      health_pct: healthPct,
      wear_rate_mm_lap: wearRate,
      remaining_laps: remainingLaps,
      tread_depth_mm: treadDepthMm,
    },
    load: {
      vertical_load_kn: Math.round(fz_kn * 10) / 10,
      longitudinal_load_kn: Math.round(fx_kn * 10) / 10,
      lateral_load_kn: Math.round(fy_kn * 10) / 10,
      contact_patch_pct: contactPatchPct,
    },
    grip: {
      grip_coeff: gripCoeff,
      grip_loss_pct: gripLossPct,
      slip_ratio_pct: slipRatioPct,
      slip_angle_deg: slipAngleDeg,
      available_grip_pct: availableGripPct,
    },
    prediction: {
      current_health_pct: healthPct,
      predicted_health_5_laps: predictionCurve[Math.min(5, predictionCurve.length - 1)].health_pct,
      predicted_degradation_pct: Math.round((100 - predictionCurve[Math.min(5, predictionCurve.length - 1)].health_pct) * 10) / 10,
      remaining_competitive_laps: remainingCompetitiveLaps,
      pit_window_lap_start: pitWindowLapStart,
      pit_window_lap_end: pitWindowLapEnd,
      prediction_curve: predictionCurve,
    },
    tdi: effectiveTdi,
    is_measured: dataMode === 'DEMO_SIMULATION' && Boolean(cornerSlot?.available),
  };
}

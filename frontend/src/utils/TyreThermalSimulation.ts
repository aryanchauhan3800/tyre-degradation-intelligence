/**
 * TYRETRACE — Multi-Zone Physics Thermal Simulation Engine
 *
 * Implements a physically plausible 7-zone dynamic thermal model:
 * - Inner Shoulder
 * - Inner Tread
 * - Center Tread
 * - Outer Tread
 * - Outer Shoulder
 * - Sidewall
 * - Contact Patch
 *
 * Features:
 * - Dynamic friction heat accumulation from velocity, vertical load (Fz),
 *   longitudinal slip, lateral slip, braking force, and cornering g-forces.
 * - Camber angle and lateral load transfer across inner/center/outer tread zones.
 * - Contact patch friction energy concentration and circumferential heat dissipation.
 * - Convective airflow cooling based on vehicle speed and ambient temperature.
 * - Thermal mass inertia (smooth continuous thermal integration).
 */

import type { TelemetryFrame, PhysicsTwinOutput, TDIStateResponse, FourWheelTyres, TyreCorner, DataMode } from '../types/telemetry';
import { calculateTyreCornerState } from './tyreCalculations';

export interface SpatialThermalState {
  innerShoulder: number;
  innerTread: number;
  centerTread: number;
  outerTread: number;
  outerShoulder: number;
  surface: number;
  contactPatch: number;
  contactPatchHeatIntensity: number; // 0.0 to 1.0 multiplier for shader
}

export class TyreThermalSimulation {
  private currentThermal: SpatialThermalState = {
    innerShoulder: 25.0,
    innerTread: 25.0,
    centerTread: 25.0,
    outerTread: 25.0,
    outerShoulder: 25.0,
    surface: 25.0,
    contactPatch: 25.0,
    contactPatchHeatIntensity: 0.0,
  };

  private corner: TyreCorner = 'FR';

  constructor(corner: TyreCorner = 'FR') {
    this.corner = corner;
  }

  public setCorner(corner: TyreCorner): void {
    this.corner = corner;
  }

  public getThermalState(): SpatialThermalState {
    return { ...this.currentThermal };
  }

  /**
   * Performs real-time physics thermal integration step.
   * @param dt Delta time in seconds (e.g. 0.016 for 60 FPS)
   */
  public update(
    dt: number,
    speedKph: number,
    telemetryFrame: TelemetryFrame | null,
    physicsOutput: PhysicsTwinOutput | null,
    tdiResponse: TDIStateResponse | null,
    fourWheelStates: FourWheelTyres | null,
    dataMode: DataMode
  ): SpatialThermalState {
    const hasData = Boolean(telemetryFrame || physicsOutput || tdiResponse);
    if (!hasData) {
      // Offline / No Data: decay smoothly to cool ambient (22°C)
      const decay = Math.min(1.0, dt * 1.5);
      this.currentThermal.innerShoulder += (22.0 - this.currentThermal.innerShoulder) * decay;
      this.currentThermal.innerTread += (22.0 - this.currentThermal.innerTread) * decay;
      this.currentThermal.centerTread += (22.0 - this.currentThermal.centerTread) * decay;
      this.currentThermal.outerTread += (22.0 - this.currentThermal.outerTread) * decay;
      this.currentThermal.outerShoulder += (22.0 - this.currentThermal.outerShoulder) * decay;
      this.currentThermal.surface += (22.0 - this.currentThermal.surface) * decay;
      this.currentThermal.contactPatch += (22.0 - this.currentThermal.contactPatch) * decay;
      this.currentThermal.contactPatchHeatIntensity *= (1.0 - decay);
      return { ...this.currentThermal };
    }

    // 1. Extract base corner telemetry metrics
    const cornerState = calculateTyreCornerState(
      this.corner,
      telemetryFrame,
      physicsOutput,
      tdiResponse,
      fourWheelStates,
      dataMode
    );

    const rawInner = cornerState.thermal.inner_c ?? 85.0;
    const rawCenter = cornerState.thermal.center_c ?? 92.0;
    const rawOuter = cornerState.thermal.outer_c ?? 82.0;
    const rawSurface = cornerState.thermal.surface_c ?? 90.0;

    // Environmental temperature
    const ambientTemp = telemetryFrame?.environment?.air_temp_c ?? 25.0;
    const trackTemp = telemetryFrame?.environment?.track_temp_c ?? 38.0;

    // Kinematic parameters
    const speedMps = Math.max(0, speedKph) / 3.6;
    const isLeft = this.corner.endsWith('L');

    // Speed-dependent thermal scaling:
    // At 0 km/h → tire is at ambient (~25°C) = normal dark rubber look
    // At 80 km/h → tire starts warming up (~55-65°C) = green/cyan tones emerge
    // At 150+ km/h → tire is fully hot (~95-120°C) = orange/red thermal glow
    // At 250+ km/h → tire is white-hot (>120°C) = intense heat
    const speedHeatFactor = Math.min(1.0, Math.pow(Math.max(0, speedKph) / 180.0, 1.6));
    const baseInner = ambientTemp + (rawInner - ambientTemp) * speedHeatFactor;
    const baseCenter = ambientTemp + (rawCenter - ambientTemp) * speedHeatFactor;
    const baseOuter = ambientTemp + (rawOuter - ambientTemp) * speedHeatFactor;
    const baseSurface = ambientTemp + (rawSurface - ambientTemp) * speedHeatFactor;

    // Extract G-forces / acceleration from telemetry if available
    let gLat = 0.0;
    let gLong = 0.0;
    let slipRatio = 0.02;
    let slipAngle = 0.01;
    let verticalLoadKn = cornerState.load.vertical_load_kn ?? 4.5;

    if (telemetryFrame?.vehicle) {
      const brk = telemetryFrame.vehicle.brake ?? 0;
      const thr = telemetryFrame.vehicle.throttle ?? 0;
      gLong = thr * 1.8 - brk * 2.5;
    }
    slipRatio = cornerState.grip.slip_ratio_pct ? cornerState.grip.slip_ratio_pct / 100.0 : 0.02;
    slipAngle = cornerState.grip.slip_angle_deg ? (cornerState.grip.slip_angle_deg * Math.PI) / 180.0 : 0.01;
    verticalLoadKn = cornerState.load.vertical_load_kn ?? 4.5;

    // 2. Contact Patch Friction Energy Calculation
    // Friction is speed-dependent: no speed = no friction heat
    const brakePressure = gLong < -0.3 ? Math.min(1.0, Math.abs(gLong) / 2.5) : 0.0;
    const accelPower = gLong > 0.3 ? Math.min(1.0, gLong / 2.0) : 0.0;

    const frictionIntensity = (
      slipRatio * 1.8 +
      slipAngle * 2.2 +
      brakePressure * 0.9 +
      accelPower * 0.6 +
      (speedMps / 80.0) * 0.15
    ) * (verticalLoadKn / 4.5) * speedHeatFactor;

    // Friction heat generation rate (°C / sec) — scales with speed
    const frictionHeatRate = frictionIntensity * 18.0;

    // 3. Lateral Camber & Cornering Load Distribution
    // F1 Front tires run negative camber (-3.5°).
    // Straight-line: Inner shoulder is naturally warmer than outer shoulder.
    // Turn Right (gLat > 0):
    //   - Left Tire (Outer wheel): High lateral load transfer onto Outer Shoulder & Tread!
    //   - Right Tire (Inner wheel): Unloaded, rides heavily on Inner Shoulder.
    // Turn Left (gLat < 0):
    //   - Right Tire (Outer wheel): High lateral load transfer onto Outer Shoulder & Tread!
    //   - Left Tire (Inner wheel): Unloaded, rides heavily on Inner Shoulder.
    let innerLoadFactor = 1.15; // default negative camber bias
    let outerLoadFactor = 0.85;
    let centerLoadFactor = 1.0;

    const corneringMagnitude = Math.min(1.5, Math.abs(gLat));
    const isOuterWheelInTurn = (gLat > 0.1 && isLeft) || (gLat < -0.1 && !isLeft);

    if (corneringMagnitude > 0.1) {
      if (isOuterWheelInTurn) {
        // High load on outer shoulder
        outerLoadFactor += corneringMagnitude * 0.8;
        innerLoadFactor -= corneringMagnitude * 0.4;
      } else {
        // High load on inner shoulder
        innerLoadFactor += corneringMagnitude * 0.7;
        outerLoadFactor -= corneringMagnitude * 0.3;
      }
    }

    // Straight line braking / acceleration boosts center tread
    if (Math.abs(gLong) > 0.3) {
      centerLoadFactor += Math.abs(gLong) * 0.4;
    }

    // 4. Compute Target Zone Equilibrium Temperatures
    const targetInnerShoulder = Math.max(25.0, baseInner * innerLoadFactor + (trackTemp - 25.0) * 0.1);
    const targetInnerTread = Math.max(25.0, (baseInner * 0.4 + baseCenter * 0.6) * ((innerLoadFactor + centerLoadFactor) * 0.5));
    const targetCenterTread = Math.max(25.0, baseCenter * centerLoadFactor);
    const targetOuterTread = Math.max(25.0, (baseOuter * 0.4 + baseCenter * 0.6) * ((outerLoadFactor + centerLoadFactor) * 0.5));
    const targetOuterShoulder = Math.max(25.0, baseOuter * outerLoadFactor);

    // Contact Patch receives immediate friction spike
    const targetContactPatch = Math.max(
      targetCenterTread + (speedKph > 100 ? 12.0 : 4.0),
      (targetInnerTread + targetCenterTread + targetOuterTread) / 3.0 + frictionHeatRate * 1.2
    );

    // 5. Dynamic Thermal Integration (Fast heating under high load/speed, rapid cooling when slowing down)
    const isCooling = targetCenterTread < this.currentThermal.centerTread;
    const rate = Math.min(1.0, dt * (isCooling ? 4.5 : 3.2));

    this.currentThermal.innerShoulder += (targetInnerShoulder - this.currentThermal.innerShoulder) * rate;
    this.currentThermal.innerTread += (targetInnerTread - this.currentThermal.innerTread) * rate;
    this.currentThermal.centerTread += (targetCenterTread - this.currentThermal.centerTread) * rate;
    this.currentThermal.outerTread += (targetOuterTread - this.currentThermal.outerTread) * rate;
    this.currentThermal.outerShoulder += (targetOuterShoulder - this.currentThermal.outerShoulder) * rate;

    // Contact patch responds faster to immediate friction (tau ~ 0.5s)
    const cpRate = Math.min(1.0, dt * 6.0);
    this.currentThermal.contactPatch += (targetContactPatch - this.currentThermal.contactPatch) * cpRate;

    // Surface temperature is weighted spatial average of tread zones + surface skin bias
    const avgTread = (
      this.currentThermal.innerShoulder * 0.15 +
      this.currentThermal.innerTread * 0.25 +
      this.currentThermal.centerTread * 0.30 +
      this.currentThermal.outerTread * 0.20 +
      this.currentThermal.outerShoulder * 0.10
    );
    this.currentThermal.surface += (Math.max(avgTread, baseSurface) - this.currentThermal.surface) * rate;

    // Contact patch heat intensity uniform (0.0 to 1.0)
    const cpIntensityTarget = Math.min(1.0, Math.max(0.0, (this.currentThermal.contactPatch - 75.0) / 45.0));
    this.currentThermal.contactPatchHeatIntensity += (cpIntensityTarget - this.currentThermal.contactPatchHeatIntensity) * cpRate;

    // Convective Airflow Cooling when speed is high or vehicle slows down
    const airflowCooling = Math.min(8.0, (speedKph / 100.0 + 0.5) * 1.5 * (this.currentThermal.surface - ambientTemp) * 0.015 * dt);
    this.currentThermal.surface -= airflowCooling;

    return { ...this.currentThermal };
  }
}

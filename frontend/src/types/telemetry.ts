/**
 * TYRETRACE — Canonical TypeScript Telemetry & Intelligence Types
 * Strictly mirrors backend Pydantic schemas (Phases 1-8).
 */

export type DataMode = 'REPLAY' | 'DEMO_SIMULATION';

export type TyreVisMode = 'NORMAL' | 'THERMAL' | 'WEAR' | 'LOAD' | 'GRIP' | 'PREDICTION';

export type CameraPreset = 'HERO' | 'FRONT' | 'REAR' | 'TOP' | 'LEFT' | 'RIGHT' | 'TYRE_FOCUS';

export type ConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';

export type TDIState =
  | 'NOMINAL'
  | 'MILD_DEGRADATION'
  | 'MODERATE_DEGRADATION'
  | 'HIGH_DEGRADATION'
  | 'SEVERE_DEGRADATION';

export type TDITrend = 'STABLE' | 'RISING' | 'FALLING' | 'SPIKE' | 'UNKNOWN';

export type TyreCorner = 'FL' | 'FR' | 'RL' | 'RR';

export interface TyreThermalState {
  inner_c: number;
  center_c: number;
  outer_c: number;
  surface_c: number;
  core_c: number;
  is_estimated: boolean;
}

export interface TyreWearState {
  wear_pct: number;
  health_pct: number;
  wear_rate_mm_lap: number;
  remaining_laps: number;
  tread_depth_mm: number;
}

export interface TyreLoadState {
  vertical_load_kn: number;
  longitudinal_load_kn: number;
  lateral_load_kn: number;
  contact_patch_pct: number;
}

export interface TyreGripState {
  grip_coeff: number;
  grip_loss_pct: number;
  slip_ratio_pct: number;
  slip_angle_deg: number;
  available_grip_pct: number;
}

export interface TyrePredictionState {
  current_health_pct: number;
  predicted_health_5_laps: number;
  predicted_degradation_pct: number;
  remaining_competitive_laps: number;
  pit_window_lap_start: number;
  pit_window_lap_end: number;
  prediction_curve: { lap: number; health_pct: number; tdi: number }[];
}

export interface CalculatedTyreCornerState {
  corner: TyreCorner;
  label: string;
  compound: string;
  age_laps: number;
  pressure_psi: number;
  thermal: TyreThermalState;
  wear: TyreWearState;
  load: TyreLoadState;
  grip: TyreGripState;
  prediction: TyrePredictionState;
  tdi: number;
  is_measured: boolean;
}

export interface VehicleState {
  speed_kph: number;
  speed_mps: number;
  rpm?: number | null;
  gear?: number | null;
  throttle?: number;
  throttle_pct?: number;
  brake?: number;
  brake_pct?: number;
  drs?: number | null;
  steer?: number | null;
  distance_m?: number;
  relative_distance?: number | null;
}

export interface EnvironmentState {
  air_temp_c?: number | null;
  track_temp_c?: number | null;
  humidity_pct?: number | null;
  wind_speed_mps?: number | null;
  rainfall?: boolean | null;
}

export interface TyreAvailabilitySlot {
  available: boolean;
  tdi: number | null;
  reason?: string | null;
  source?: string;
  trend?: TDITrend | null;
  confidence?: number | null;
  compound?: string | null;
  age_laps?: number | null;
  evidence?: string[];
  counter_evidence?: string[];
}

export interface FourWheelTyres {
  FL: TyreAvailabilitySlot;
  FR: TyreAvailabilitySlot;
  RL: TyreAvailabilitySlot;
  RR: TyreAvailabilitySlot;
}

export interface TyreCornerMetadata {
  compound?: string | null;
  tyre_life_laps?: number | null;
  stint?: number | null;
  [key: string]: any;
}

export interface TelemetryFrame {
  timestamp: number;
  timestamp_iso?: string | null;
  session_id: string;
  lap: number;
  vehicle?: VehicleState;
  vehicle_state?: VehicleState;
  tyres?: {
    fl?: TyreCornerMetadata;
    fr?: TyreCornerMetadata;
    rl?: TyreCornerMetadata;
    rr?: TyreCornerMetadata;
  } | null;
  four_wheel_states?: FourWheelTyres | null;
  environment?: EnvironmentState | null;
}


export interface PhysicsForces {
  drag_n: number;
  rolling_resistance_n: number;
  brake_force_n: number;
  traction_force_n: number;
  downforce_n: number;
  net_longitudinal_force_n: number;
  vertical_loads_n?: {
    front_left: number;
    front_right: number;
    rear_left: number;
    rear_right: number;
    total: number;
  };
}

export interface PhysicsTwinOutput {
  ax_expected_mps2: number;
  forces: PhysicsForces;
  load_transfer_longitudinal_n?: number;
  provenance?: {
    model_type: string;
    vehicle_mass_kg: number;
    reference_downforce_n: number;
    aero_efficiency: number;
    source: string;
  };
}

export interface RollingFeatures {
  window_size: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  persistence_ratio: number;
  slope_mps3: number;
}

export interface ResidualFrame {
  actual_ax_mps2: number;
  expected_ax_mps2: number;
  raw_residual_mps2: number;
  normalized_residual: number;
  persistence_ratio: number;
  slope_mps3: number;
  residual_quality: number;
  rolling_features?: RollingFeatures | null;
  trend?: string | null;
}

export interface ConfounderDetail {
  name: string;
  active: boolean;
  strength: number;
  classification: 'EXPLANATORY' | 'POSSIBLE' | 'WEAK' | 'NONE' | 'UNKNOWN';
  reason: string;
  status: string;
}

export interface ConfounderEvaluation {
  drs: ConfounderDetail;
  braking: ConfounderDetail;
  throttle: ConfounderDetail;
  high_speed: ConfounderDetail;
  transient: ConfounderDetail;
  tyre_age?: ConfounderDetail;
  compound?: ConfounderDetail;
  environment?: ConfounderDetail;
  rainfall?: ConfounderDetail;
  data_quality?: ConfounderDetail;
}

export interface ConfounderActiveFlags {
  drs_active?: boolean;
  braking_active?: boolean;
  high_speed_active?: boolean;
  transient_active?: boolean;
  cold_tyre_active?: boolean;
  old_tyre_active?: boolean;
  wet_active?: boolean;
  poor_data_active?: boolean;
}

export interface ConfounderFrame {
  active_flags: string[];
  drs_active?: boolean;
  braking_active?: boolean;
  high_speed_active?: boolean;
  transient_active?: boolean;
  throttle_active?: boolean;
  confounders?: ConfounderEvaluation;
  non_tyre_explanation_score: number;
  tyre_evidence_quality: number;
  tyre_age_laps?: number;
  compound?: string;
  environmental_context?: {
    track_temp_c?: number | null;
    air_temp_c?: number | null;
    compound?: string | null;
    tyre_age_laps?: number | null;
  };
  dominant_confounder?: string | null;
  explanation?: string | string[] | null;
  interpretation?: string | null;
}

export interface TDIStateResponse {
  physics_tdi: number;
  ai_tdi: number;
  final_tdi: number;
  state: TDIState;
  trend: TDITrend;
  confidence: number;
  model_reliability: number;
  evidence: string[];
  counter_evidence: string[];
}

export interface AIStateResponse {
  ai_tdi: number;
  model_reliability: number;
  target_type: string;
  model_version: string;
}

export interface BlenderTyreState {
  available: boolean;
  tdi: number | null;
}

export interface BlenderFramePayload {
  vehicle: {
    speed_kph: number;
    speed_mps?: number;
    gear?: number;
    rpm?: number;
  };
  tyres: {
    FL: BlenderTyreState;
    FR: BlenderTyreState;
    RL: BlenderTyreState;
    RR: BlenderTyreState;
  };
  global_tdi: number;
  selected_component: string | null;
}

export interface WebSocketTelemetryMessage {
  type: 'telemetry_update';
  sequence: number;
  timestamp: string;
  telemetry: TelemetryFrame;
  physics: PhysicsTwinOutput;
  residual: ResidualFrame;
  confounders: ConfounderFrame;
  tdi: TDIStateResponse;
  ai: AIStateResponse;
  blender: BlenderFramePayload;
}

export interface SessionResponse {
  session_id: string;
  event: string;
  year: number;
  session: string;
  driver: string;
  data_mode: string;
  total_laps: number;
  current_lap: number;
  tyre_compound?: string | null;
  tyre_age?: number | null;
}

export interface ReplayStatusResponse {
  running: boolean;
  paused: boolean;
  current_frame: number;
  total_frames: number;
  current_lap: number;
  playback_speed: number;
}

export interface TDIHistoryPoint {
  timestamp: string;
  lap: number;
  physics_tdi: number;
  ai_tdi: number;
  final_tdi: number;
}

export interface ResidualHistoryPoint {
  timestamp: string;
  lap: number;
  raw_residual: number;
  normalized_residual: number;
  tyre_evidence_quality: number;
  confounder_score: number;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  pipeline: string;
}

export interface LapSummaryResponse {
  lap_number: number;
  tyre_compound?: string | null;
  tyre_age?: number | null;
  average_residual: number;
  final_tdi: number;
  trend: TDITrend;
  confidence: number;
}

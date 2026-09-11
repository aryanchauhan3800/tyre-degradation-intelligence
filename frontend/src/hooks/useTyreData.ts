/**
 * TYRETRACE — Tyre Data Hook
 *
 * Provides reactive calculated physics state for selected tyre corner.
 */

import { useMemo } from 'react';
import type {
  CalculatedTyreCornerState,
  DataMode,
  FourWheelTyres,
  PhysicsTwinOutput,
  TDIStateResponse,
  TelemetryFrame,
  TyreCorner,
} from '../types/telemetry';
import { calculateTyreCornerState } from '../utils/tyreCalculations';

export function useTyreData(
  corner: TyreCorner,
  telemetry: TelemetryFrame | null,
  physics: PhysicsTwinOutput | null,
  tdi: TDIStateResponse | null,
  fourWheelStates: FourWheelTyres | null,
  dataMode: DataMode,
  ageLaps = 12,
  compound = 'C3 (MEDIUM)'
): CalculatedTyreCornerState {
  return useMemo(() => {
    return calculateTyreCornerState(
      corner,
      telemetry,
      physics,
      tdi,
      fourWheelStates,
      dataMode,
      ageLaps,
      compound
    );
  }, [corner, telemetry, physics, tdi, fourWheelStates, dataMode, ageLaps, compound]);
}

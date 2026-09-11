import type { TyreCorner } from '../types/telemetry';

export interface SceneCallbacks {
  onSelectTyre: (corner: TyreCorner | null) => void;
  onHoverTyre: (corner: TyreCorner | null) => void;
}

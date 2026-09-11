/**
 * TYRETRACE — Unified Telemetry Stream Hook
 */

import { useTelemetryWebSocket } from './useTelemetryWebSocket';
import type { WebSocketTelemetryMessage } from '../types/telemetry';

export interface UseTelemetryOptions {
  onMessage?: (message: WebSocketTelemetryMessage) => void;
  autoReconnect?: boolean;
}

export function useTelemetry(options: UseTelemetryOptions = {}) {
  return useTelemetryWebSocket(options);
}

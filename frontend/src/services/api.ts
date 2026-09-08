/**
 * TYRETRACE — REST API Client
 * Interfaces with Phase 8 FastAPI backend endpoints.
 */

import type {
  HealthResponse,
  LapSummaryResponse,
  PhysicsTwinOutput,
  ReplayStatusResponse,
  ResidualFrame,
  ResidualHistoryPoint,
  SessionResponse,
  TDIHistoryPoint,
  TDIStateResponse,
  TelemetryFrame,
  FourWheelTyres,
  ConfounderFrame,
} from '../types/telemetry';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${errorText}`);
  }
  return res.json();
}

export const api = {
  getHealth: (): Promise<HealthResponse> =>
    fetchJson<HealthResponse>(`${API_BASE}/health`),

  getSession: (): Promise<SessionResponse> =>
    fetchJson<SessionResponse>(`${API_BASE}/session`),

  getTelemetry: (): Promise<TelemetryFrame> =>
    fetchJson<TelemetryFrame>(`${API_BASE}/telemetry`),

  getPhysics: (): Promise<PhysicsTwinOutput> =>
    fetchJson<PhysicsTwinOutput>(`${API_BASE}/physics`),

  getResidual: (): Promise<ResidualFrame> =>
    fetchJson<ResidualFrame>(`${API_BASE}/residual`),

  getConfounders: (): Promise<ConfounderFrame> =>
    fetchJson<ConfounderFrame>(`${API_BASE}/confounders`),

  getTDI: (): Promise<TDIStateResponse> =>
    fetchJson<TDIStateResponse>(`${API_BASE}/tdi`),

  getTyres: (): Promise<FourWheelTyres> =>
    fetchJson<FourWheelTyres>(`${API_BASE}/tyres`),

  getReplayStatus: (): Promise<ReplayStatusResponse> =>
    fetchJson<ReplayStatusResponse>(`${API_BASE}/replay/status`),

  startReplay: (): Promise<ReplayStatusResponse> =>
    fetchJson<ReplayStatusResponse>(`${API_BASE}/replay/start`, { method: 'POST' }),

  pauseReplay: (): Promise<ReplayStatusResponse> =>
    fetchJson<ReplayStatusResponse>(`${API_BASE}/replay/pause`, { method: 'POST' }),

  resumeReplay: (): Promise<ReplayStatusResponse> =>
    fetchJson<ReplayStatusResponse>(`${API_BASE}/replay/resume`, { method: 'POST' }),

  stopReplay: (): Promise<ReplayStatusResponse> =>
    fetchJson<ReplayStatusResponse>(`${API_BASE}/replay/stop`, { method: 'POST' }),

  resetReplay: (): Promise<ReplayStatusResponse> =>
    fetchJson<ReplayStatusResponse>(`${API_BASE}/replay/reset`, { method: 'POST' }),

  seekReplay: (frameIndex: number): Promise<ReplayStatusResponse> =>
    fetchJson<ReplayStatusResponse>(`${API_BASE}/replay/seek`, {
      method: 'POST',
      body: JSON.stringify({ frame_index: frameIndex }),
    }),

  setPlaybackSpeed: (speed: number): Promise<ReplayStatusResponse> =>
    fetchJson<ReplayStatusResponse>(`${API_BASE}/replay/speed`, {
      method: 'POST',
      body: JSON.stringify({ speed }),
    }),

  getTDIHistory: (limit = 300): Promise<TDIHistoryPoint[]> =>
    fetchJson<TDIHistoryPoint[]>(`${API_BASE}/history/tdi?limit=${limit}`),

  getResidualHistory: (limit = 300): Promise<ResidualHistoryPoint[]> =>
    fetchJson<ResidualHistoryPoint[]>(`${API_BASE}/history/residual?limit=${limit}`),

  getAvailableLaps: (): Promise<number[]> =>
    fetchJson<number[]>(`${API_BASE}/laps`),

  getLapSummary: (lapNumber: number): Promise<LapSummaryResponse> =>
    fetchJson<LapSummaryResponse>(`${API_BASE}/laps/${lapNumber}`),
};

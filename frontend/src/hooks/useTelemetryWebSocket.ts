/**
 * TYRETRACE — useTelemetryWebSocket Hook
 * Manages resilient WebSocket connectivity to FastAPI backend with auto-reconnect.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ConnectionStatus, WebSocketTelemetryMessage } from '../types/telemetry';

interface UseTelemetryWebSocketOptions {
  url?: string;
  onMessage?: (data: WebSocketTelemetryMessage) => void;
  enabled?: boolean;
}

export function useTelemetryWebSocket({
  url,
  onMessage,
  enabled = true,
}: UseTelemetryWebSocketOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [lastMessage, setLastMessage] = useState<WebSocketTelemetryMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sequence, setSequence] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const defaultUrl = (() => {
    if (typeof window === 'undefined') return 'ws://localhost:8000/ws/telemetry';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.port === '5173' ? 'localhost:8000' : window.location.host;
    return `${proto}//${host}/ws/telemetry`;
  })();

  const targetUrl = url || defaultUrl;

  const connect = useCallback(() => {
    if (!enabled) return;

    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setStatus('CONNECTING');
    setError(null);

    try {
      const ws = new WebSocket(targetUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setStatus('CONNECTED');
        reconnectAttemptsRef.current = 0;
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.type === 'telemetry_update') {
            const typedPayload = payload as WebSocketTelemetryMessage;
            setLastMessage(typedPayload);
            setSequence(typedPayload.sequence);
            if (onMessageRef.current) {
              onMessageRef.current(typedPayload);
            }
          }
        } catch (err) {
          console.warn('Failed to parse WebSocket telemetry frame:', err);
        }
      };

      ws.onerror = () => {
        setStatus('ERROR');
        setError('WebSocket encountered a network error');
      };

      ws.onclose = (event) => {
        socketRef.current = null;
        setStatus('DISCONNECTED');

        if (enabled && !event.wasClean) {
          const delay = Math.min(10000, 1000 * Math.pow(1.5, reconnectAttemptsRef.current));
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (err) {
      setStatus('ERROR');
      setError(err instanceof Error ? err.message : 'Unknown WebSocket error');
    }
  }, [enabled, targetUrl]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setStatus('DISCONNECTED');
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close(1000, 'Component unmounted');
        socketRef.current = null;
      }
    };
  }, [connect, enabled]);

  const sendPing = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send('ping');
    }
  }, []);

  return {
    status,
    lastMessage,
    error,
    sequence,
    reconnect: connect,
    sendPing,
  };
}

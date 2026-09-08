/**
 * TYRETRACE — Replay Control Bar
 * Synchronizes playback state (play/pause/reset/seek/speed) with Phase 8 REST endpoints.
 */

import React from 'react';
import type { ReplayStatusResponse } from '../types/telemetry';
import { Play, Pause, RotateCcw, SkipBack, SkipForward, FastForward } from 'lucide-react';

interface ReplayControlBarProps {
  status: ReplayStatusResponse | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSeek: (frameIndex: number) => void;
  onSetSpeed: (speed: number) => void;
}

export const ReplayControlBar: React.FC<ReplayControlBarProps> = ({
  status,
  onStart,
  onPause,
  onResume,
  onReset,
  onSeek,
  onSetSpeed,
}) => {
  const isRunning = status?.running ?? false;
  const isPaused = status?.paused ?? false;
  const currentFrame = status?.current_frame ?? 0;
  const totalFrames = status?.total_frames ?? 1000;
  const currentLap = status?.current_lap ?? 1;
  const speed = status?.playback_speed ?? 1.0;

  const speeds = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0];

  const handlePlayPause = () => {
    if (!isRunning) {
      onStart();
    } else if (isPaused) {
      onResume();
    } else {
      onPause();
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = parseInt(e.target.value, 10);
    onSeek(frame);
  };

  // Estimate elapsed simulated telemetry time (approx 20Hz: 0.05s per frame)
  const elapsedSeconds = currentFrame * 0.05;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = (elapsedSeconds % 60).toFixed(1);
  const formattedTime = `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="w-full bg-[#0a0c10] border-t border-[#1f2637] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 select-none">
      {/* Playback Transport Buttons */}
      <div className="flex items-center space-x-2">
        {/* Reset */}
        <button
          onClick={onReset}
          className="px-2.5 py-1.5 rounded bg-[#121622] hover:bg-[#1a2133] border border-[#222a3d] text-xs font-mono text-slate-300 flex items-center space-x-1 cursor-pointer transition-colors"
          title="Reset replay to frame 0"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>RESET</span>
        </button>

        {/* Step Back (Seek -20 frames) */}
        <button
          onClick={() => onSeek(Math.max(0, currentFrame - 20))}
          className="p-1.5 rounded bg-[#121622] hover:bg-[#1a2133] border border-[#222a3d] text-slate-300 cursor-pointer transition-colors"
          title="Step back 1 second"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        {/* Play / Pause Toggle */}
        <button
          onClick={handlePlayPause}
          className={`px-4 py-1.5 rounded text-xs font-mono font-bold flex items-center space-x-1.5 cursor-pointer transition-all shadow-md ${
            isRunning && !isPaused
              ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_12px_rgba(245,158,11,0.3)]'
              : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
          }`}
        >
          {isRunning && !isPaused ? (
            <>
              <Pause className="w-4 h-4 fill-current" />
              <span>PAUSE</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>{currentFrame > 0 && isPaused ? 'RESUME' : 'PLAY'}</span>
            </>
          )}
        </button>

        {/* Step Forward (Seek +20 frames) */}
        <button
          onClick={() => onSeek(Math.min(totalFrames - 1, currentFrame + 20))}
          className="p-1.5 rounded bg-[#121622] hover:bg-[#1a2133] border border-[#222a3d] text-slate-300 cursor-pointer transition-colors"
          title="Step forward 1 second"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center Timeline Scrubbing Slider */}
      <div className="flex-1 min-w-[280px] max-w-2xl flex items-center space-x-3 px-2">
        <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
          LAP <strong className="text-slate-200">{currentLap}</strong>
        </span>

        <div className="flex-1 relative flex items-center">
          <input
            type="range"
            min={0}
            max={Math.max(1, totalFrames - 1)}
            value={currentFrame}
            onChange={handleSliderChange}
            className="w-full h-1.5 bg-[#171d2b] rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
          />
        </div>

        <div className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
          <span className="text-cyan-300 font-bold tabular-nums">{currentFrame}</span>
          <span className="text-slate-600"> / </span>
          <span className="tabular-nums">{totalFrames}</span>
          <span className="text-slate-500 ml-2">({formattedTime})</span>
        </div>
      </div>

      {/* Playback Speed Multiplier Deck */}
      <div className="flex items-center space-x-1.5 bg-[#11141c] p-1 rounded border border-[#1f2738]">
        <FastForward className="w-3 h-3 text-slate-500 ml-1" />
        <span className="text-[10px] font-mono text-slate-500 uppercase mr-1">Speed:</span>
        {speeds.map((s) => (
          <button
            key={s}
            onClick={() => onSetSpeed(s)}
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-medium transition-all cursor-pointer ${
              speed === s
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
};

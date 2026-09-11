/**
 * TYRETRACE — Replay Control Bar
 * Synchronizes playback state (play/pause/reset/seek/speed) with Phase 8 REST endpoints.
 */

import React from 'react';
import type { ReplayStatusResponse } from '../types/telemetry';
import { Play, Pause, RotateCcw, SkipBack, SkipForward } from 'lucide-react';

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
    <div className="w-full bg-white border-t border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 select-none shadow-xs text-slate-800">
      {/* Left: Playback Transport Buttons */}
      <div className="flex items-center space-x-2">
        {/* Reset */}
        <button
          onClick={onReset}
          className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 flex items-center space-x-1.5 cursor-pointer transition-colors shadow-2xs font-semibold"
          title="Reset replay"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>RESET</span>
        </button>

        {/* Step Back (Seek -20 frames) */}
        <button
          onClick={() => onSeek(Math.max(0, currentFrame - 20))}
          className="p-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 cursor-pointer transition-colors shadow-2xs"
          title="Step back"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        {/* Play / Pause Toggle (Solid Red Button matching reference) */}
        <button
          onClick={handlePlayPause}
          className="px-5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center space-x-2 cursor-pointer transition-all shadow-2xs bg-[#E10600] hover:bg-red-700 text-white"
        >
          {isRunning && !isPaused ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>PAUSE</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>PLAY</span>
            </>
          )}
        </button>

        {/* Step Forward (Seek +20 frames) */}
        <button
          onClick={() => onSeek(Math.min(totalFrames - 1, currentFrame + 20))}
          className="p-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 cursor-pointer transition-colors shadow-2xs"
          title="Step forward"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center: Timeline Scrubbing Slider matching LAP 12 / 56 & 18:24 / 1:32:17 */}
      <div className="flex-1 min-w-[320px] max-w-2xl flex items-center space-x-4 px-2">
        <span className="text-xs font-mono text-slate-800 whitespace-nowrap font-bold">
          LAP <strong className="text-slate-900 font-black ml-1">{currentLap || 12}</strong>
          <span className="text-slate-400 font-normal mx-1">/</span>
          <span className="text-slate-700 font-bold">56</span>
        </span>

        <div className="flex-1 relative flex items-center">
          <input
            type="range"
            min={0}
            max={Math.max(1, totalFrames - 1)}
            value={currentFrame}
            onChange={handleSliderChange}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#E10600] focus:outline-none"
          />
        </div>

        <div className="text-xs font-mono whitespace-nowrap font-bold">
          <span className="text-[#E10600] font-black">{formattedTime || '18:24'}</span>
          <span className="text-slate-400 font-normal mx-1">/</span>
          <span className="text-slate-500 font-semibold">1:32:17</span>
        </div>
      </div>

      {/* Right: Playback Speed Multipliers & LIVE Status Badge */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1 text-xs font-mono">
          <span className="text-slate-500 font-bold mr-1">SPEED:</span>
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                speed === s
                  ? 'bg-[#E10600] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* LIVE Status Badge */}
        <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>LIVE</span>
        </div>
      </div>
    </div>
  );
};

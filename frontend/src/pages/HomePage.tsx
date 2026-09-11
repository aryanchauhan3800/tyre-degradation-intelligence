import React, { useRef, useEffect, useState } from 'react';
import type { ActiveNavTab } from '../components/Navbar';
import type { FourWheelTyres, TelemetryFrame, TyreCorner } from '../types/telemetry';
import { Maximize2, Volume2, VolumeX, Scaling } from 'lucide-react';

interface HomePageProps {
  onNavigate?: (tab: ActiveNavTab, subTab?: '3d' | 'image') => void;
  telemetry?: TelemetryFrame | null;
  fourWheelStates?: FourWheelTyres | null;
  selectedTyre?: TyreCorner;
  lap?: number;
}

export const HomePage: React.FC<HomePageProps> = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');

  useEffect(() => {
    const video = videoRef.current;
    if (video && typeof video.play === 'function') {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          console.warn('AutoPlay handled:', err);
        });
      }
    }
  }, []);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => { });
    } else {
      document.exitFullscreen?.().catch(() => { });
    }
  };

  const toggleFitMode = () => {
    setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'));
  };

  return (
    <div
      ref={containerRef}
      className="w-full flex-1 h-[calc(100vh-82px)] min-h-[calc(100vh-82px)] bg-zinc-950 overflow-hidden flex items-center justify-center relative select-none"
    >
      {/* Ambient background glow if in contain mode */}
      {fitMode === 'contain' && (
        <div className="absolute inset-0 pointer-events-none opacity-30 blur-3xl overflow-hidden scale-110">
          <video
            src="/homepage_video.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Main High-Definition Video Player */}
      <video
        ref={videoRef}
        src="/homepage_video.mp4"
        autoPlay
        loop
        muted={isMuted}
        playsInline
        onEnded={() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => { });
          }
        }}
        className={`relative z-10 w-full h-full transition-all duration-300 ${fitMode === 'contain'
            ? 'object-contain max-h-full max-w-full'
            : 'object-cover object-center'
          }`}
        style={{
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      />

      {/* Discrete Floating Cinema Controls (Bottom Right) */}
      <div className="absolute bottom-5 right-5 z-20 flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-white shadow-xl opacity-70 hover:opacity-100 transition-opacity">
        {/* Fit Mode Toggle */}
        <button
          onClick={toggleFitMode}
          className="flex items-center space-x-1.5 px-2 py-1 rounded-lg text-xs font-mono hover:bg-white/10 cursor-pointer transition-colors"
          title={fitMode === 'contain' ? 'Current: 100% Uncropped Frame (Click to Fill)' : 'Current: Fill Screen (Click to Fit Frame)'}
        >
          <Scaling className="w-3.5 h-3.5 text-zinc-300" />
          <span className="text-[11px] text-zinc-300">
            {fitMode === 'contain' ? 'Fit 16:9 Frame' : 'Fill Screen'}
          </span>
        </button>

        <span className="text-white/20">|</span>

        {/* Audio Toggle */}
        <button
          onClick={toggleMute}
          className="p-1 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
          title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-zinc-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-emerald-400" />
          )}
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="p-1 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
          title="Toggle Fullscreen"
        >
          <Maximize2 className="w-4 h-4 text-zinc-300" />
        </button>
      </div>
    </div>
  );
};

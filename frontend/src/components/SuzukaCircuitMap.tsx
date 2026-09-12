import React, { useEffect, useRef, useState } from 'react';

export interface SuzukaCircuitMapProps {
  speedKph?: number;
  theme?: 'dark' | 'light';
  className?: string;
  showLabels?: boolean;
  showLegend?: boolean;
  showDRS?: boolean;
  showKerbs?: boolean;
  isAnimated?: boolean;
}

export const SUZUKA_TRACK_PATH =
  'M 182,130 L 196,86 C 200,74 212,65 226,72 C 238,78 240,94 232,106 C 224,116 214,122 218,132 C 222,142 232,146 226,154 C 220,160 208,158 202,148 C 196,138 188,132 178,134 C 166,136 154,142 146,152 C 140,160 148,166 156,162 C 162,158 164,148 158,140 C 152,130 136,118 122,108 C 106,96 86,90 84,106 C 82,118 96,126 108,122 C 120,118 128,102 118,84 C 110,70 92,52 74,40 C 58,28 36,24 24,38 C 12,52 18,72 38,82 C 54,90 72,86 88,74 C 106,62 134,92 152,112 C 164,124 176,132 188,118 C 196,108 194,88 178,78 C 168,72 160,76 164,86 C 168,96 174,108 182,130 Z';

export const SuzukaCircuitMap: React.FC<SuzukaCircuitMapProps> = ({
  speedKph = 287,
  theme = 'dark',
  className = 'w-full h-36',
  showLabels = true,
  showLegend = true,
  showDRS = true,
  showKerbs = true,
  isAnimated = true,
}) => {
  const isDark = theme === 'dark';
  const trackPathRef = useRef<SVGPathElement>(null);
  const trackProgressRef = useRef<number>(0.08);
  const [carCoords, setCarCoords] = useState<{ x: number; y: number }>({ x: 182, y: 130 });

  useEffect(() => {
    if (!isAnimated) return;

    let animId: number;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      // Suzuka circuit total length = 5807m
      const effectiveSpeed = Math.max(60, speedKph);
      const lapDurationSec = 5807 / (effectiveSpeed / 3.6);
      trackProgressRef.current = (trackProgressRef.current + dt / lapDurationSec) % 1.0;

      if (trackPathRef.current) {
        try {
          const totalLen = trackPathRef.current.getTotalLength();
          const pt = trackPathRef.current.getPointAtLength(trackProgressRef.current * totalLen);
          setCarCoords({ x: Math.round(pt.x), y: Math.round(pt.y) });
        } catch {
          // ignore
        }
      }
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [isAnimated, speedKph]);

  return (
    <div className={`relative select-none ${className}`}>
      {/* Sector Legend Pills */}
      {showLegend && (
        <div className="absolute top-1 left-1.5 flex items-center space-x-1.5 text-[7.5px] font-mono font-bold select-none z-10">
          <span className={`flex items-center space-x-0.5 ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block"></span>
            <span>S1</span>
          </span>
          <span className={`flex items-center space-x-0.5 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
            <span>S2</span>
          </span>
          <span className={`flex items-center space-x-0.5 ${isDark ? 'text-pink-300' : 'text-pink-700'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 inline-block"></span>
            <span>S3</span>
          </span>
        </div>
      )}

      {/* Circuit SVG */}
      <svg
        viewBox="0 0 260 170"
        className="w-full h-full select-none overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id={`suzukaBridgeShadow-${theme}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="1.5" stdDeviation="1.5" floodColor={isDark ? '#000000' : '#0f172a'} floodOpacity={isDark ? '0.7' : '0.45'} />
          </filter>
          <linearGradient id={`suzukaTarmacRibbon-${theme}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isDark ? '#1e293b' : '#1e293b'} />
            <stop offset="100%" stopColor={isDark ? '#090d16' : '#0f172a'} />
          </linearGradient>
        </defs>

        {/* 1. Track Runoff / Gravel Halo */}
        <path
          d={SUZUKA_TRACK_PATH}
          fill="none"
          stroke={isDark ? '#334155' : '#cbd5e1'}
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isDark ? 0.4 : 0.6}
        />

        {/* 2. Main Track Tarmac Ribbon */}
        <path
          ref={trackPathRef}
          d={SUZUKA_TRACK_PATH}
          fill="none"
          stroke={`url(#suzukaTarmacRibbon-${theme})`}
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 3. Underpass Lower Segment Dark Shadow */}
        <path
          d="M 158,140 C 152,130 136,118 122,108"
          fill="none"
          stroke={isDark ? '#020617' : '#0f172a'}
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* 4. Crossover Flyover Bridge (crossing at x:138, y:98) */}
        <g filter={`url(#suzukaBridgeShadow-${theme})`}>
          <path
            d="M 126,84 L 148,108"
            fill="none"
            stroke={isDark ? '#475569' : '#334155'}
            strokeWidth="8"
            strokeLinecap="butt"
          />
          <path
            d="M 126,84 L 148,108"
            fill="none"
            stroke={isDark ? '#0f172a' : '#0f172a'}
            strokeWidth="5.5"
            strokeLinecap="butt"
          />
          <line x1="123" y1="87" x2="145" y2="111" stroke="#f8fafc" strokeWidth="1.2" />
          <line x1="129" y1="81" x2="151" y2="105" stroke="#f8fafc" strokeWidth="1.2" />
        </g>

        {/* 5. Sector Overlays */}
        {/* Sector 1 (Pit Straight through Dunlop) */}
        <path
          d="M 182,130 L 196,86 C 200,74 212,65 226,72 C 238,78 240,94 232,106 C 224,116 214,122 218,132 C 222,142 232,146 226,154 C 220,160 208,158 202,148 C 196,138 188,132 178,134 C 166,136 154,142 146,152"
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeOpacity="0.95"
        />
        {/* Sector 2 (Degners through Spoon) */}
        <path
          d="M 146,152 C 140,160 148,166 156,162 C 162,158 164,148 158,140 C 152,130 136,118 122,108 C 106,96 86,90 84,106 C 82,118 96,126 108,122 C 120,118 128,102 118,84 C 110,70 92,52 74,40 C 58,28 36,24 24,38 C 12,52 18,72 38,82 C 54,90 72,86 88,74"
          fill="none"
          stroke="#eab308"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeOpacity="0.95"
        />
        {/* Sector 3 (Back Straight through 130R, Casio, Finish) */}
        <path
          d="M 88,74 C 106,62 134,92 152,112 C 164,124 176,132 188,118 C 196,108 194,88 178,78 C 168,72 160,76 164,86 C 168,96 174,108 182,130"
          fill="none"
          stroke="#ec4899"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeOpacity="0.95"
        />

        {/* 6. DRS Zones */}
        {showDRS && (
          <>
            {/* Main Straight */}
            <line x1="184" y1="125" x2="194" y2="92" stroke="#22c55e" strokeWidth="2.5" strokeDasharray="3,2" />
            {/* Back Straight */}
            <line x1="102" y1="66" x2="128" y2="88" stroke="#22c55e" strokeWidth="2.5" strokeDasharray="3,2" />
          </>
        )}

        {/* 7. Start/Finish Line with Checkered Gantry Line */}
        <line x1="180" y1="124" x2="188" y2="126" stroke="#ffffff" strokeWidth="3" />
        <line x1="180" y1="124" x2="188" y2="126" stroke="#E10600" strokeWidth="1.5" strokeDasharray="2,2" />

        {/* 8. Apex Kerbs at iconic corners */}
        {showKerbs && (
          <>
            <path d="M 230,73 C 236,78 238,88 234,96" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
            <path d="M 216,130 C 219,136 224,140 220,146" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
            <path d="M 82,102 C 80,110 86,116 94,114" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
            <path d="M 22,46 C 16,56 18,68 30,76" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
            <path d="M 194,102 C 192,90 186,84 176,78" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
            <path d="M 162,75 C 158,78 160,84 165,88" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeDasharray="2.5,2.5" />
          </>
        )}

        {/* 9. Iconic Corner Labels */}
        {showLabels && (
          <g className="text-[7px] font-mono font-bold select-none">
            <text x="198" y="102" fill={isDark ? '#f8fafc' : '#0f172a'} className="font-extrabold">
              130R
            </text>
            <text x="12" y="32" fill={isDark ? '#cbd5e1' : '#0f172a'}>
              SPOON
            </text>
            <text x="56" y="118" fill={isDark ? '#cbd5e1' : '#0f172a'}>
              HAIRPIN
            </text>
            <text x="226" y="140" fill={isDark ? '#cbd5e1' : '#0f172a'}>
              S-CURVES
            </text>
            <text x="144" y="174" fill={isDark ? '#cbd5e1' : '#0f172a'}>
              DEGNER
            </text>
            <text x="142" y="70" fill={isDark ? '#cbd5e1' : '#0f172a'}>
              CASIO
            </text>
            <text x="190" y="136" fill="#ef4444" className="text-[6.5px]">
              S/F
            </text>
          </g>
        )}

        {/* 10. Live Telemetry Car Marker */}
        <g transform={`translate(${carCoords.x}, ${carCoords.y})`}>
          {isAnimated && speedKph > 0 && (
            <circle r="6" fill="none" stroke="#ef4444" strokeWidth="1.2" className="animate-ping opacity-75" />
          )}
          <circle r="3.8" fill="#ffffff" stroke="#e10600" strokeWidth="1.2" />
          <circle r="2" fill="#e10600" />
        </g>
      </svg>
    </div>
  );
};

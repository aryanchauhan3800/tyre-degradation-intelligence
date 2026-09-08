/**
 * TYRETRACE — TDI Trajectory Time-Series Chart
 * Renders Physics TDI, AI TDI, and Fused TDI historical trajectory with zoom and hover crosshairs.
 */

import React, { useState, useMemo, useRef } from 'react';
import type { TDIHistoryPoint } from '../types/telemetry';
import { LineChart } from 'lucide-react';

interface TDITrajectoryChartProps {
  history: TDIHistoryPoint[];
  currentFinalTdi?: number;
}

export const TDITrajectoryChart: React.FC<TDITrajectoryChartProps> = ({
  history,
}) => {
  const [zoomRange, setZoomRange] = useState<number>(150); // number of recent points
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayedPoints = useMemo(() => {
    if (!history || history.length === 0) return [];
    if (zoomRange === 0 || history.length <= zoomRange) return history;
    return history.slice(-zoomRange);
  }, [history, zoomRange]);

  // SVG Dimensions
  const width = 640;
  const height = 180;
  const padding = { top: 20, right: 30, bottom: 30, left: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Scales
  const n = displayedPoints.length;
  const getX = (idx: number) => padding.left + (idx / Math.max(1, n - 1)) * plotWidth;
  const getY = (val: number) => {
    const safeVal = typeof val === 'number' && !isNaN(val) ? val : 0;
    const clamped = Math.max(0, Math.min(100, safeVal));
    return padding.top + plotHeight - (clamped / 100) * plotHeight;
  };

  // Paths
  const { physicsPath, aiPath, fusionPath } = useMemo(() => {
    if (n === 0) return { physicsPath: '', aiPath: '', fusionPath: '' };

    let pPath = '';
    let aPath = '';
    let fPath = '';

    displayedPoints.forEach((pt, i) => {
      const x = getX(i);
      const yp = getY(pt.physics_tdi);
      const ya = getY(pt.ai_tdi);
      const yf = getY(pt.final_tdi);

      if (i === 0) {
        pPath += `M ${x} ${yp}`;
        aPath += `M ${x} ${ya}`;
        fPath += `M ${x} ${yf}`;
      } else {
        pPath += ` L ${x} ${yp}`;
        aPath += ` L ${x} ${ya}`;
        fPath += ` L ${x} ${yf}`;
      }
    });

    return { physicsPath: pPath, aiPath: aPath, fusionPath: fPath };
  }, [displayedPoints]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const plotX = mouseX - padding.left;
    const ratio = Math.max(0, Math.min(1, plotX / plotWidth));
    const idx = Math.round(ratio * (n - 1));
    setHoverIndex(idx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const hoveredPoint = hoverIndex !== null && displayedPoints[hoverIndex] ? displayedPoints[hoverIndex] : null;

  return (
    <div className="bg-[#0e1118] border border-[#202738] rounded-lg p-3 flex flex-col justify-between shadow-md">
      {/* Header & Controls */}
      <div className="flex items-center justify-between border-b border-[#1b2233] pb-1.5 mb-1.5">
        <div className="flex items-center space-x-2">
          <LineChart className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            TDI Trajectory Analysis
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            ({displayedPoints.length} points)
          </span>
        </div>

        <div className="flex items-center space-x-3 text-[10px] font-mono">
          {/* Legend */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" />
              <span className="text-slate-400">Physics</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-0.5 bg-amber-400 inline-block stroke-dash" />
              <span className="text-slate-400">AI</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-purple-400 inline-block" />
              <span className="text-purple-300 font-bold">Fusion</span>
            </div>
          </div>

          {/* Zoom Buttons */}
          <div className="flex items-center space-x-1 bg-[#121622] p-0.5 rounded border border-[#1e2639]">
            {[50, 150, 300, 0].map((range) => (
              <button
                key={range}
                onClick={() => setZoomRange(range)}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  zoomRange === range
                    ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {range === 0 ? 'ALL' : `${range}P`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Chart Area */}
      <div ref={containerRef} className="relative w-full h-[180px] select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Horizontal Grid & Reference Thresholds */}
          {[0, 25, 50, 75, 100].map((val) => {
            const y = getY(val);
            return (
              <g key={val}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke={val === 50 ? '#2a354c' : '#171d2b'}
                  strokeDasharray={val === 50 ? '4,4' : undefined}
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[9px]"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Subtle wear cliff danger band above 75 */}
          <rect
            x={padding.left}
            y={getY(100)}
            width={plotWidth}
            height={getY(75) - getY(100)}
            fill="#ef4444"
            fillOpacity="0.04"
          />

          {/* Paths */}
          {displayedPoints.length > 1 && (
            <>
              {/* Physics TDI */}
              <path
                d={physicsPath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeOpacity="0.75"
                strokeDasharray="4,2"
              />
              {/* AI TDI */}
              <path
                d={aiPath}
                fill="none"
                stroke="#fbbf24"
                strokeWidth="1.5"
                strokeOpacity="0.8"
                strokeDasharray="2,2"
              />
              {/* Fusion TDI */}
              <path
                d={fusionPath}
                fill="none"
                stroke="#c084fc"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Latest Point Indicator Beacon */}
          {displayedPoints.length > 0 && (
            <g>
              <circle
                cx={getX(displayedPoints.length - 1)}
                cy={getY(displayedPoints[displayedPoints.length - 1].final_tdi)}
                r="4"
                className="fill-purple-400 stroke-[#0a0c10] stroke-2 animate-pulse"
              />
            </g>
          )}

          {/* Interactive Hover Crosshair */}
          {hoveredPoint && hoverIndex !== null && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={padding.top}
                x2={getX(hoverIndex)}
                y2={height - padding.bottom}
                stroke="#00f0ff"
                strokeWidth="1"
                strokeDasharray="3,3"
                strokeOpacity="0.6"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(hoveredPoint.final_tdi)}
                r="4.5"
                fill="#c084fc"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && hoverIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none bg-[#10141d]/95 backdrop-blur border border-[#27344d] rounded px-2.5 py-1.5 text-[10px] font-mono shadow-xl text-slate-200"
            style={{
              left: `${Math.min(
                plotWidth - 80,
                Math.max(10, ((getX(hoverIndex) - padding.left) / plotWidth) * 100)
              )}%`,
              top: '10px',
            }}
          >
            <div className="flex justify-between space-x-3 text-slate-400 border-b border-[#1f293d] pb-0.5 mb-1">
              <span>LAP {hoveredPoint.lap}</span>
              <span>{hoveredPoint.timestamp}</span>
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between space-x-3">
                <span className="text-purple-300 font-bold">FUSION:</span>
                <span className="font-bold text-white">{(typeof hoveredPoint.final_tdi === 'number' && !isNaN(hoveredPoint.final_tdi) ? hoveredPoint.final_tdi : 0).toFixed(1)}</span>
              </div>
              <div className="flex justify-between space-x-3">
                <span className="text-cyan-400">PHYSICS:</span>
                <span>{(typeof hoveredPoint.physics_tdi === 'number' && !isNaN(hoveredPoint.physics_tdi) ? hoveredPoint.physics_tdi : 0).toFixed(1)}</span>
              </div>
              <div className="flex justify-between space-x-3">
                <span className="text-amber-400">AI MODEL:</span>
                <span>{(typeof hoveredPoint.ai_tdi === 'number' && !isNaN(hoveredPoint.ai_tdi) ? hoveredPoint.ai_tdi : 0).toFixed(1)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

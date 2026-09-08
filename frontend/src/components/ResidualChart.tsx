/**
 * TYRETRACE — Residual & Evidence Quality Chart
 * Displays actual vs expected longitudinal acceleration residual (m/s²),
 * normalized residual, Tyre Evidence Quality (0-1), and Confounder score (0-1).
 */

import React, { useState, useMemo } from 'react';
import type { ResidualHistoryPoint } from '../types/telemetry';
import { Activity } from 'lucide-react';

interface ResidualChartProps {
  history: ResidualHistoryPoint[];
}

export const ResidualChart: React.FC<ResidualChartProps> = ({ history }) => {
  const [zoomRange, setZoomRange] = useState<number>(150);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const displayedPoints = useMemo(() => {
    if (!history || history.length === 0) return [];
    if (zoomRange === 0 || history.length <= zoomRange) return history;
    return history.slice(-zoomRange);
  }, [history, zoomRange]);

  const width = 640;
  const height = 180;
  const padding = { top: 20, right: 36, bottom: 30, left: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const n = displayedPoints.length;
  const getX = (idx: number) => padding.left + (idx / Math.max(1, n - 1)) * plotWidth;

  // Left Axis: Residual in m/s² (typically -3.0 to +3.0)
  const yMin = -3.0;
  const yMax = 3.0;
  const getYResidual = (val: number) => {
    const safeVal = typeof val === 'number' && !isNaN(val) ? val : 0;
    const clamped = Math.max(yMin, Math.min(yMax, safeVal));
    const normalized = (clamped - yMin) / (yMax - yMin);
    return padding.top + plotHeight - normalized * plotHeight;
  };

  // Right Axis: Evidence Quality & Confounders (0.0 to 1.0)
  const getYQuality = (val: number) => {
    const safeVal = typeof val === 'number' && !isNaN(val) ? val : 0;
    const clamped = Math.max(0, Math.min(1.0, safeVal));
    return padding.top + plotHeight - clamped * plotHeight;
  };

  const { rawPath, normPath, qualityPath, confPath } = useMemo(() => {
    if (n === 0) return { rawPath: '', normPath: '', qualityPath: '', confPath: '' };

    let rPath = '';
    let nrPath = '';
    let qPath = '';
    let cPath = '';

    displayedPoints.forEach((pt, i) => {
      const x = getX(i);
      const yr = getYResidual(pt.raw_residual);
      const ynr = getYResidual(pt.normalized_residual);
      const yq = getYQuality(pt.tyre_evidence_quality);
      const yc = getYQuality(pt.confounder_score);

      if (i === 0) {
        rPath += `M ${x} ${yr}`;
        nrPath += `M ${x} ${ynr}`;
        qPath += `M ${x} ${yq}`;
        cPath += `M ${x} ${yc}`;
      } else {
        rPath += ` L ${x} ${yr}`;
        nrPath += ` L ${x} ${ynr}`;
        qPath += ` L ${x} ${yq}`;
        cPath += ` L ${x} ${yc}`;
      }
    });

    return { rawPath: rPath, normPath: nrPath, qualityPath: qPath, confPath: cPath };
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

  const handleMouseLeave = () => setHoverIndex(null);
  const hoveredPoint = hoverIndex !== null && displayedPoints[hoverIndex] ? displayedPoints[hoverIndex] : null;

  return (
    <div className="bg-[#0e1118] border border-[#202738] rounded-lg p-3 flex flex-col justify-between shadow-md">
      {/* Header & Controls */}
      <div className="flex items-center justify-between border-b border-[#1b2233] pb-1.5 mb-1.5">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            Residual & Confounder Dynamics
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            ({displayedPoints.length} points)
          </span>
        </div>

        <div className="flex items-center space-x-3 text-[10px] font-mono">
          {/* Legend */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-0.5 bg-rose-400 inline-block" />
              <span className="text-slate-400">r_ax (m/s²)</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-0.5 bg-cyan-400 inline-block stroke-dash" />
              <span className="text-slate-400">Norm Res</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-emerald-400 inline-block" />
              <span className="text-emerald-300 font-bold">Q_tyre</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-amber-400 inline-block" />
              <span className="text-amber-300 font-bold">S_conf</span>
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

      {/* SVG Chart */}
      <div className="relative w-full h-[180px] select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Grid lines and zero line */}
          {[-2, -1, 0, 1, 2].map((val) => {
            const y = getYResidual(val);
            return (
              <g key={val}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke={val === 0 ? '#384866' : '#171d2b'}
                  strokeDasharray={val === 0 ? undefined : '2,2'}
                  strokeWidth={val === 0 ? '1.5' : '1'}
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[9px]"
                >
                  {val > 0 ? `+${val}` : val}
                </text>
              </g>
            );
          })}

          {/* Right Y-Axis (Quality 0.0 to 1.0) */}
          {[0, 0.5, 1.0].map((q) => {
            const y = getYQuality(q);
            return (
              <text
                key={q}
                x={width - padding.right + 6}
                y={y + 3}
                textAnchor="start"
                className="fill-slate-500 font-mono text-[9px]"
              >
                {q.toFixed(1)}
              </text>
            );
          })}

          {displayedPoints.length > 1 && (
            <>
              {/* Confounder Score */}
              <path
                d={confPath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.2"
                strokeOpacity="0.6"
                strokeDasharray="3,2"
              />
              {/* Tyre Evidence Quality */}
              <path
                d={qualityPath}
                fill="none"
                stroke="#10b981"
                strokeWidth="1.5"
                strokeOpacity="0.8"
              />
              {/* Normalized Residual */}
              <path
                d={normPath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeOpacity="0.75"
                strokeDasharray="4,2"
              />
              {/* Raw Acceleration Residual */}
              <path
                d={rawPath}
                fill="none"
                stroke="#f43f5e"
                strokeWidth="2.0"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
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
                cy={getYResidual(hoveredPoint.raw_residual)}
                r="4.5"
                fill="#f43f5e"
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
                <span className="text-rose-400 font-bold">RAW RESIDUAL:</span>
                <span className="font-bold text-white">{(typeof hoveredPoint.raw_residual === 'number' && !isNaN(hoveredPoint.raw_residual) ? hoveredPoint.raw_residual : 0).toFixed(2)} m/s²</span>
              </div>
              <div className="flex justify-between space-x-3">
                <span className="text-cyan-400">NORM RESIDUAL:</span>
                <span>{(typeof hoveredPoint.normalized_residual === 'number' && !isNaN(hoveredPoint.normalized_residual) ? hoveredPoint.normalized_residual : 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between space-x-3">
                <span className="text-emerald-400">TYRE EVIDENCE (Q):</span>
                <span>{(typeof hoveredPoint.tyre_evidence_quality === 'number' && !isNaN(hoveredPoint.tyre_evidence_quality) ? hoveredPoint.tyre_evidence_quality : 1).toFixed(2)}</span>
              </div>
              <div className="flex justify-between space-x-3">
                <span className="text-amber-400">CONFOUNDER (S):</span>
                <span>{(typeof hoveredPoint.confounder_score === 'number' && !isNaN(hoveredPoint.confounder_score) ? hoveredPoint.confounder_score : 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

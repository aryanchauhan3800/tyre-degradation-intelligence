import React from 'react';
import type { TelemetryFrame } from '../../types/telemetry';
import { Activity } from 'lucide-react';

interface RaceTelemetryProps {
  telemetry: TelemetryFrame | null;
  lap?: number;
}

export const RaceTelemetry: React.FC<RaceTelemetryProps> = ({ telemetry, lap: _lap }) => {
  const isLive = Boolean(telemetry);

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex flex-col justify-between shadow-xs font-sans h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900 tracking-wider">
          <Activity className="w-3.5 h-3.5 text-red-600" />
          <span>RACE TELEMETRY</span>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-semibold">
          {isLive ? 'CANBUS · 20 Hz' : 'OFFLINE'}
        </span>
      </div>

      {/* 5-Channel Legend Row matching reference */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 my-1 text-[9px] font-semibold">
        <div className="flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="text-slate-600">SURFACE TEMP</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span className="text-slate-600">PRESSURE</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-slate-600">VERTICAL LOAD</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span className="text-slate-600">GRIP</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          <span className="text-slate-600">WEAR</span>
        </div>
      </div>

      {/* Multi-Channel Wave Chart with Dual Y-Axes */}
      <div className="relative w-full flex items-center h-14 my-0.5">
        {/* Left Y-Axis: 120°C, 80°C, 0°C */}
        <div className="flex flex-col justify-between h-full text-[8px] font-medium text-slate-400 pr-1 select-none">
          <span>120°C</span>
          <span>80°C</span>
          <span>0°C</span>
        </div>

        {/* SVG Multi-Line Chart */}
        <div className="flex-1 h-full relative">
          <svg viewBox="0 0 500 70" preserveAspectRatio="none" className="w-full h-full stroke-[1.5] fill-none">
            {/* Subtle Grid Horizontal Lines */}
            <line x1="0" y1="12" x2="500" y2="12" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="0" y1="35" x2="500" y2="35" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="0" y1="58" x2="500" y2="58" stroke="#f1f5f9" strokeWidth="1" />

            {/* Vertical grid lines */}
            <line x1="83" y1="0" x2="83" y2="70" stroke="#f8fafc" strokeWidth="1" />
            <line x1="166" y1="0" x2="166" y2="70" stroke="#f8fafc" strokeWidth="1" />
            <line x1="250" y1="0" x2="250" y2="70" stroke="#f8fafc" strokeWidth="1" />
            <line x1="333" y1="0" x2="333" y2="70" stroke="#f8fafc" strokeWidth="1" />
            <line x1="416" y1="0" x2="416" y2="70" stroke="#f8fafc" strokeWidth="1" />

            {/* Channel 1: Surface Temp */}
            <path
              d={isLive ? "M 0,46 Q 30,35 60,40 T 120,24 T 180,48 T 240,22 T 300,42 T 360,26 T 420,40 T 500,28" : "M 0,58 L 500,58"}
              stroke="#ef4444"
              strokeWidth="1.6"
              className={isLive ? "opacity-95" : "opacity-30"}
            />

            {/* Channel 2: Pressure */}
            <path
              d={isLive ? "M 0,38 Q 40,48 90,32 T 180,44 T 270,24 T 360,44 T 450,32 T 500,36" : "M 0,58 L 500,58"}
              stroke="#3b82f6"
              strokeWidth="1.6"
              className={isLive ? "opacity-90" : "opacity-30"}
            />

            {/* Channel 3: Vertical Load */}
            <path
              d={isLive ? "M 0,54 Q 50,36 100,56 T 200,32 T 300,54 T 400,34 T 500,42" : "M 0,58 L 500,58"}
              stroke="#10b981"
              strokeWidth="1.6"
              className={isLive ? "opacity-90" : "opacity-30"}
            />

            {/* Channel 4: Grip */}
            <path
              d={isLive ? "M 0,28 Q 60,38 130,22 T 260,34 T 380,24 T 460,38 T 500,22" : "M 0,58 L 500,58"}
              stroke="#f97316"
              strokeWidth="1.6"
              className={isLive ? "opacity-90" : "opacity-30"}
            />

            {/* Channel 5: Wear */}
            <path
              d={isLive ? "M 0,58 Q 60,54 120,50 T 240,42 T 360,34 T 460,26 T 500,20" : "M 0,58 L 500,58"}
              stroke="#a855f7"
              strokeWidth="1.6"
              className={isLive ? "opacity-90" : "opacity-30"}
            />
          </svg>
        </div>

        {/* Right Y-Axis: 100%, 50%, 0% */}
        <div className="flex flex-col justify-between h-full text-[8px] font-mono font-bold text-slate-400 pl-1 select-none text-right">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
      </div>

      {/* X-Axis Labels: LAP 0, 10, 20, 30, 40, 50, 56 */}
      <div className="flex justify-between text-[8px] font-mono text-slate-400 font-bold px-5 border-t border-slate-100 pt-1">
        <span>LAP 0</span>
        <span>10</span>
        <span>20</span>
        <span>30</span>
        <span>40</span>
        <span>50</span>
        <span>56</span>
      </div>
    </div>
  );
};

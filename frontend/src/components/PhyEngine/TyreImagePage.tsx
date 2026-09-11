import React, { useState } from 'react';
import { 
  Camera, 
  Flame, 
  Scan, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  ChevronRight
} from 'lucide-react';
import type { TyreCorner } from '../../types/telemetry';

interface TyreImagePageProps {
  selectedTyre: TyreCorner;
  onSelectTyre?: (corner: TyreCorner) => void;
  surfaceTemp: number;
  wearPercentage: number;
}

type ImageAnalysisMode = 'flir_thermal' | 'laser_graining' | 'upload_scanner';

interface SamplePreset {
  id: string;
  name: string;
  image: string;
  type: string;
  compound: string;
  wearLevel: string;
  healthScore: number;
  defects: string[];
  thermalPeak: number;
}

const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'flir_hot',
    name: 'FLIR Thermal Heatmap (High Load Turn 1)',
    image: '/assets/f1_tyre_thermal_flir.jpg',
    type: 'Thermal Infrared',
    compound: 'C3 (Medium)',
    wearLevel: '42.5%',
    healthScore: 57.5,
    defects: ['Inner Shoulder Hotspot (>125°C)', 'Brake Radiation Spike', 'Transient Overheating'],
    thermalPeak: 128.4,
  },
  {
    id: 'laser_graining',
    name: 'Optical Laser Graining & Blistering Inspection',
    image: '/assets/f1_tyre_graining_wear.jpg',
    type: 'Laser Optical Macro',
    compound: 'C3 (Medium)',
    wearLevel: '58.2%',
    healthScore: 41.8,
    defects: ['Severe Surface Graining (Level 4)', 'Sub-surface Rubber Blistering', 'Track Pickup Marbles'],
    thermalPeak: 116.0,
  },
];

export const TyreImagePage: React.FC<TyreImagePageProps> = ({
  selectedTyre,
  surfaceTemp,
  wearPercentage,
}) => {
  const [activeMode, setActiveMode] = useState<ImageAnalysisMode>('flir_thermal');
  const [selectedPreset, setSelectedPreset] = useState<SamplePreset>(SAMPLE_PRESETS[0]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>('shoulder');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadedImage(url);
      setActiveMode('upload_scanner');
      runAiScan();
    }
  };

  const runAiScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
    }, 1200);
  };

  const currentImage = 
    activeMode === 'upload_scanner' && uploadedImage 
      ? uploadedImage 
      : activeMode === 'laser_graining' 
      ? '/assets/f1_tyre_graining_wear.jpg' 
      : '/assets/f1_tyre_thermal_flir.jpg';

  return (
    <div className="flex-1 flex flex-col gap-4 max-w-[1920px] w-full mx-auto">
      {/* Top Header & Mode Switcher Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-black font-mono tracking-wider text-slate-900 uppercase">
                PHYENGINE // OPTICAL & THERMAL IMAGE INSPECTION
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-800 font-mono font-bold">
                CORNER: {selectedTyre}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              FLIR thermography false-color heat analysis, laser surface graining scanner, & AI defect diagnostics
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 font-mono text-xs font-bold">
          <button
            onClick={() => {
              setActiveMode('flir_thermal');
              setSelectedPreset(SAMPLE_PRESETS[0]);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
              activeMode === 'flir_thermal'
                ? 'bg-white text-red-600 shadow-xs border border-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-red-500" />
            <span>FLIR Thermal Scan</span>
          </button>

          <button
            onClick={() => {
              setActiveMode('laser_graining');
              setSelectedPreset(SAMPLE_PRESETS[1]);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
              activeMode === 'laser_graining'
                ? 'bg-white text-red-600 shadow-xs border border-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scan className="w-3.5 h-3.5 text-emerald-600" />
            <span>Laser Graining Scan</span>
          </button>

          <button
            onClick={() => {
              setActiveMode('upload_scanner');
              if (!uploadedImage) runAiScan();
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
              activeMode === 'upload_scanner'
                ? 'bg-white text-red-600 shadow-xs border border-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>AI Image Upload</span>
          </button>
        </div>
      </div>

      {/* Main Image Inspection Grid */}
      <div className="grid grid-cols-12 gap-4 items-start">
        {/* Left Column: Interactive Image Viewer with Overlays */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-3">
          <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 shadow-lg relative min-h-[480px] lg:min-h-[560px] flex items-center justify-center group">
            {/* Main Visual Image */}
            <img 
              src={currentImage} 
              alt="Tyre Inspection Visual" 
              className="w-full h-full object-contain max-h-[600px] select-none"
            />

            {/* Scanning Laser Animation Bar */}
            {isScanning && (
              <div className="absolute inset-0 bg-red-500/10 pointer-events-none flex flex-col justify-start">
                <div className="h-1 bg-gradient-to-r from-red-500 via-white to-red-500 shadow-[0_0_15px_#ff0033] animate-bounce"></div>
                <div className="p-4 text-center">
                  <span className="px-3 py-1 bg-black/80 rounded-md font-mono text-xs font-bold text-red-400 border border-red-500/40">
                    SCANNING RUBBER MICRO-STRUCTURE & THERMAL FLUX...
                  </span>
                </div>
              </div>
            )}

            {/* Interactive Hotspot Probes for FLIR mode */}
            {activeMode === 'flir_thermal' && (
              <>
                {/* Hotspot 1: Inner Shoulder */}
                <button
                  onClick={() => setSelectedHotspot('shoulder')}
                  className="absolute top-[28%] left-[48%] -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group/pin"
                  title="Peak Inner Shoulder Temperature"
                >
                  <span className="relative flex h-6 w-6">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-6 w-6 bg-red-600/90 border-2 border-white items-center justify-center text-[10px] font-bold text-white shadow-lg">
                      1
                    </span>
                  </span>
                  {selectedHotspot === 'shoulder' && (
                    <div className="absolute left-7 top-1/2 -translate-y-1/2 bg-black/90 border border-red-500/60 rounded-lg px-2.5 py-1 text-[11px] font-mono text-white whitespace-nowrap shadow-xl">
                      <strong className="text-red-400">T_peak: 128.4°C</strong> (Camber Loaded)
                    </div>
                  )}
                </button>

                {/* Hotspot 2: Brake Hub Radiation */}
                <button
                  onClick={() => setSelectedHotspot('brake')}
                  className="absolute top-[52%] left-[43%] -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group/pin"
                  title="Carbon-Carbon Brake Rotor Radiation"
                >
                  <span className="relative flex h-6 w-6">
                    <span className="relative inline-flex rounded-full h-6 w-6 bg-amber-500/90 border-2 border-white items-center justify-center text-[10px] font-bold text-white shadow-lg">
                      2
                    </span>
                  </span>
                  {selectedHotspot === 'brake' && (
                    <div className="absolute right-7 top-1/2 -translate-y-1/2 bg-black/90 border border-amber-500/60 rounded-lg px-2.5 py-1 text-[11px] font-mono text-white whitespace-nowrap shadow-xl">
                      <strong className="text-amber-400">Brake Drum: 615°C</strong> (Radiation Flux)
                    </div>
                  )}
                </button>

                {/* Hotspot 3: Outer Edge Tread */}
                <button
                  onClick={() => setSelectedHotspot('outer')}
                  className="absolute top-[82%] left-[58%] -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group/pin"
                  title="Outer Shoulder Surface Temp"
                >
                  <span className="relative flex h-6 w-6">
                    <span className="relative inline-flex rounded-full h-6 w-6 bg-blue-500/90 border-2 border-white items-center justify-center text-[10px] font-bold text-white shadow-lg">
                      3
                    </span>
                  </span>
                  {selectedHotspot === 'outer' && (
                    <div className="absolute left-7 top-1/2 -translate-y-1/2 bg-black/90 border border-blue-500/60 rounded-lg px-2.5 py-1 text-[11px] font-mono text-white whitespace-nowrap shadow-xl">
                      <strong className="text-blue-400">T_outer: 84.0°C</strong> (Optimal Window)
                    </div>
                  )}
                </button>
              </>
            )}

            {/* Bottom HUD Bar overlay */}
            <div className="absolute bottom-3 left-3 right-3 bg-slate-950/80 backdrop-blur-md rounded-xl p-3 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-300">
              <div className="flex items-center space-x-4">
                <span className="text-slate-400">
                  RESOLUTION: <strong className="text-white">1920×1080 OPTICAL</strong>
                </span>
                <span className="text-slate-400">
                  CORNER: <strong className="text-red-400 font-bold">{selectedTyre}</strong>
                </span>
                <span className="text-slate-400">
                  ESTIMATED TEMP: <strong className="text-amber-400 font-bold">{surfaceTemp}°C</strong>
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={runAiScan}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white cursor-pointer transition-colors border border-slate-700"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>Rescan Image</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Preset Selector Thumbnails */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-slate-700 uppercase">
                TELEMETRY INSPECTION DATASETS & PRESETS
              </span>
              <span className="text-[11px] font-mono text-slate-500">2 HIGH-RES SAMPLES</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SAMPLE_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => {
                    setSelectedPreset(preset);
                    if (preset.id === 'flir_hot') setActiveMode('flir_thermal');
                    else setActiveMode('laser_graining');
                  }}
                  className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${
                    selectedPreset.id === preset.id
                      ? 'bg-red-50/50 border-red-500 shadow-xs'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                  }`}
                >
                  <img 
                    src={preset.image} 
                    alt={preset.name} 
                    className="w-16 h-12 rounded-lg object-cover border border-slate-300"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-mono font-bold text-slate-900 truncate">
                      {preset.name}
                    </h4>
                    <p className="text-[10px] font-mono text-slate-500">
                      {preset.type} • Peak: {preset.thermalPeak}°C
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${selectedPreset.id === preset.id ? 'text-red-600' : 'text-slate-400'}`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: AI Diagnostics & Defect Analysis Panel */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-3">
          {/* Card 1: Optical Analysis Metrics */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-2">
                <Scan className="w-4 h-4 text-red-600" />
                <h3 className="font-mono font-black text-sm text-slate-900">
                  AI DEFECT SEGMENTATION
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold">
                CONFIDENCE: 98.4%
              </span>
            </div>

            {/* Health Score Gauge */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono text-slate-600 font-bold">TREAD SURFACE INTEGRITY</span>
                <span className="text-sm font-mono font-black text-slate-900">
                  {(100 - wearPercentage).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className={`h-2.5 rounded-full transition-all duration-500 ${
                    wearPercentage > 50 ? 'bg-red-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(0, 100 - wearPercentage)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                <span>Critical Cliff</span>
                <span>Marginal</span>
                <span>Optimal</span>
              </div>
            </div>

            {/* Detected Defects Checklist */}
            <div className="space-y-2 mb-4">
              <span className="text-xs font-mono font-bold text-slate-700 uppercase block">
                DIAGNOSTIC ANOMALIES DETECTED:
              </span>
              {selectedPreset.defects.map((defect, i) => (
                <div 
                  key={i} 
                  className="flex items-start space-x-2 p-2.5 rounded-lg bg-red-50/50 border border-red-200/70 text-xs font-mono text-red-900"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{defect}</span>
                </div>
              ))}
            </div>

            {/* Technical Metric Indicators */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 block">EST. GROOVE DEPTH</span>
                <strong className="text-slate-900 font-bold text-sm">2.18 mm</strong>
                <span className="text-[9px] text-slate-400 block mt-0.5">Orig: 4.50 mm</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 block">GRAINING LEVEL</span>
                <strong className="text-amber-600 font-bold text-sm">GRADE 4 / 5</strong>
                <span className="text-[9px] text-slate-400 block mt-0.5">High Shear Scrub</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 block">BLISTER COVERAGE</span>
                <strong className="text-red-600 font-bold text-sm">14.2% AREA</strong>
                <span className="text-[9px] text-slate-400 block mt-0.5">Inner Shoulder</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 block">SURFACE PICKUP</span>
                <strong className="text-slate-700 font-bold text-sm">8.6% MARBLES</strong>
                <span className="text-[9px] text-slate-400 block mt-0.5">Off-line Marbles</span>
              </div>
            </div>
          </div>

          {/* Card 2: Custom Tyre Photo Upload & Diagnostic Tool */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center space-x-2 mb-2">
              <Upload className="w-4 h-4 text-blue-600" />
              <h3 className="font-mono font-black text-sm text-slate-900">
                UPLOAD TYRE FOR AI INSPECTION
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-mono mb-4 leading-relaxed">
              Upload a high-resolution photograph or thermal camera capture from pitlane inspection 
              to run neural segmentation and wear estimation.
            </p>

            <label className="border-2 border-dashed border-slate-300 hover:border-red-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50 hover:bg-red-50/20 group">
              <Camera className="w-8 h-8 text-slate-400 group-hover:text-red-600 mb-2 transition-colors" />
              <span className="text-xs font-mono font-bold text-slate-700 group-hover:text-red-600 text-center">
                Click to browse or drop tyre photo
              </span>
              <span className="text-[10px] font-mono text-slate-400 mt-1">
                PNG, JPG, or WEBP up to 25MB
              </span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileUpload} 
                className="hidden" 
              />
            </label>

            {uploadedImage && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-mono font-bold text-emerald-900">
                    Custom Photo Active & Calibrated
                  </span>
                </div>
                <button
                  onClick={() => {
                    setUploadedImage(null);
                    setActiveMode('flir_thermal');
                  }}
                  className="text-xs font-mono text-red-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

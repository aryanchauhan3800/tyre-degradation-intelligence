import React from 'react';
import { 
  Info, 
  Layers, 
  Thermometer, 
  Activity, 
  Radio, 
  CheckCircle2
} from 'lucide-react';
import type { ActiveNavTab } from '../components/Navbar';

interface OtherInfoPageProps {
  onNavigate: (tab: ActiveNavTab, subTab?: '3d' | 'image') => void;
}

export const OtherInfoPage: React.FC<OtherInfoPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-[calc(100vh-65px)] bg-slate-50 text-slate-900 pb-16">
      {/* Top Banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-black font-mono tracking-wider text-slate-900 uppercase">
                  TECHNICAL SPECIFICATIONS & PARTNERSHIP ARCHITECTURE
                </h1>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">
                  TGR × F1 COLLABORATION
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Aerodynamic coupling, Pirelli compound specifications, mathematical physics models, & telemetry gateway
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onNavigate('phyengine', '3d')}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            >
              Open 3D Phyengine
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* TGR x F1 Partnership Card */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center space-x-2 mb-3">
                <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 text-xs font-mono font-bold">
                  OFFICIAL ENGINEERING ALLIANCE
                </span>
                <span className="text-xs font-mono text-slate-400">EST. 2024–2026</span>
              </div>
              <h2 className="text-2xl font-black font-mono tracking-tight text-slate-900 mb-3">
                Toyota Gazoo Racing × Formula 1 Partnership
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed font-sans mb-4">
                The technical collaboration between Toyota Gazoo Racing and modern Formula 1 combines 
                world-championship endurance racing powertrain know-how with pinnacle single-seater aerodynamics. 
                This Tyre Degradation Intelligence platform serves as the central digital twin for understanding 
                rubber shear mechanics, thermal dissipation, and real-time race engineering decision-making.
              </p>
              <div className="grid grid-cols-3 gap-4 font-mono text-xs pt-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">COLLABORATION</span>
                  <strong className="text-slate-900 font-bold">Aerodynamics & CFD</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">DATA PIPELINE</span>
                  <strong className="text-slate-900 font-bold">20Hz CAN-bus Telemetry</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">AI METHODOLOGY</span>
                  <strong className="text-slate-900 font-bold">Physics-Informed ML</strong>
                </div>
              </div>
            </div>

            <div className="shrink-0 w-64 h-32 bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-center shadow-xs">
              <img 
                src="/logo.png" 
                alt="TGR x F1 Logo" 
                className="max-h-20 max-w-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* Physics Formulation & Mathematical Models */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Thermal Lumped Model */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 mb-4">
              <Thermometer className="w-5 h-5 text-red-600" />
              <h3 className="font-mono font-black text-sm text-slate-900 uppercase">
                3-ZONE LUMPED THERMODYNAMIC MODEL
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-sans mb-4">
              The tyre tread surface is discretized into inner shoulder, center crown, and outer shoulder zones. 
              The temperature governing differential equation accounts for frictional heat dissipation, brake drum radiation, 
              convective track cooling, and atmospheric airflow:
            </p>

            <div className="p-4 rounded-xl bg-slate-900 text-cyan-300 font-mono text-xs overflow-x-auto mb-4">
              <code>
                dT/dt = (Q_fric + Q_brake - Q_conv - Q_rad) / (m_zone * c_p)
              </code>
            </div>

            <div className="space-y-1.5 text-xs font-mono text-slate-600">
              <div>• <strong>Q_fric:</strong> Friction power = F_x * v_sx + F_y * v_sy</div>
              <div>• <strong>Q_brake:</strong> Radiative transfer from carbon-carbon brake rotor (up to 650°C)</div>
              <div>• <strong>Q_conv:</strong> Forced convection cooling = h_conv(v_air) * A * (T_surf - T_ambient)</div>
              <div>• <strong>Q_rad:</strong> Stefan-Boltzmann radiative blackbody emission to track surface</div>
            </div>
          </div>

          {/* Card 2: Pacejka Magic Formula 6.2 & Wear */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 mb-4">
              <Activity className="w-5 h-5 text-blue-600" />
              <h3 className="font-mono font-black text-sm text-slate-900 uppercase">
                PACEJKA MF6.2 & ARCHARD WEAR FORMULATION
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-sans mb-4">
              Cornering lateral force and traction grip are computed using the semi-empirical Pacejka Magic Formula 6.2, 
              coupled with Archard mechanical abrasive degradation:
            </p>

            <div className="p-4 rounded-xl bg-slate-900 text-amber-300 font-mono text-xs overflow-x-auto mb-4">
              <code>
                F_y = D * sin(C * arctan(B * α - E * (B * α - arctan(B * α))))
              </code>
            </div>

            <div className="space-y-1.5 text-xs font-mono text-slate-600">
              <div>• <strong>α (Slip Angle):</strong> Angle between tyre heading and velocity vector</div>
              <div>• <strong>D (Peak Force):</strong> μ_max * F_z (Normal wheel load)</div>
              <div>• <strong>B (Stiffness Factor):</strong> Derived from compound carcass elasticity</div>
              <div>• <strong>Wear Rate:</strong> dw/dt = k_wear(T) * |v_slip| * (F_z / F_z0)^n</div>
            </div>
          </div>
        </div>

        {/* Pirelli 18-Inch Tyre Technical Specifications Table */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 mb-4">
            <Layers className="w-5 h-5 text-emerald-600" />
            <h3 className="font-mono font-black text-sm text-slate-900 uppercase">
              PIRELLI 18-INCH FORMULA 1 TECHNICAL SPECIFICATIONS
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                  <th className="py-2.5 px-4 font-bold">COMPOUND</th>
                  <th className="py-2.5 px-4 font-bold">TYPE</th>
                  <th className="py-2.5 px-4 font-bold">OPTIMAL WINDOW</th>
                  <th className="py-2.5 px-4 font-bold">WORKING PROFILE</th>
                  <th className="py-2.5 px-4 font-bold">MAX STINT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">C1 (WHITE)</td>
                  <td className="py-3 px-4">Hard Slick</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">110°C – 130°C</td>
                  <td className="py-3 px-4">Low degradation, high abrasion circuits (e.g. Silverstone, Suzuka)</td>
                  <td className="py-3 px-4 font-bold">38 Laps</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">C2 (WHITE)</td>
                  <td className="py-3 px-4">Medium-Hard</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">105°C – 125°C</td>
                  <td className="py-3 px-4">High energy loads and high track temperatures</td>
                  <td className="py-3 px-4 font-bold">34 Laps</td>
                </tr>
                <tr className="bg-red-50/40">
                  <td className="py-3 px-4 font-bold text-red-600">C3 (YELLOW) [CURRENT]</td>
                  <td className="py-3 px-4 font-bold">Medium Slick</td>
                  <td className="py-3 px-4 text-red-600 font-bold">95°C – 115°C</td>
                  <td className="py-3 px-4">Versatile performance / degradation compromise</td>
                  <td className="py-3 px-4 font-bold text-red-600">28 Laps</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">C4 (RED)</td>
                  <td className="py-3 px-4">Soft Slick</td>
                  <td className="py-3 px-4 text-amber-600 font-bold">90°C – 110°C</td>
                  <td className="py-3 px-4">Fast warm-up, street and low-abrasion circuits</td>
                  <td className="py-3 px-4 font-bold">20 Laps</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-900">C5 (RED)</td>
                  <td className="py-3 px-4">Ultra-Soft Slick</td>
                  <td className="py-3 px-4 text-amber-600 font-bold">85°C – 105°C</td>
                  <td className="py-3 px-4">Maximum mechanical grip, rapid graining cliff (Monaco)</td>
                  <td className="py-3 px-4 font-bold">15 Laps</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Telemetry Architecture & Sensor Placement */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 mb-4">
            <Radio className="w-5 h-5 text-red-600" />
            <h3 className="font-mono font-black text-sm text-slate-900 uppercase">
              HARDWARE SENSOR ARRAY & FASTAPI PIPELINE
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-bold text-slate-900 mb-2 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Infrared Pyrometers</span>
              </h4>
              <p className="text-slate-600 font-sans leading-relaxed text-[11px]">
                8-channel optical infrared sensors mounted on front wing endplates and rear brake ducts 
                sampling tyre tread surface temperature at 100 Hz.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-bold text-slate-900 mb-2 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>TPMS Carcass Sensors</span>
              </h4>
              <p className="text-slate-600 font-sans leading-relaxed text-[11px]">
                Rim-mounted wireless transducers measuring internal carcass air pressure (PSI) and 
                inner cavity bulk temperature at 20 Hz.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-bold text-slate-900 mb-2 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>FastAPI WebSocket Stream</span>
              </h4>
              <p className="text-slate-600 font-sans leading-relaxed text-[11px]">
                Asynchronous WebSocket server broadcasting synchronized vehicle kinematics, tyre states, 
                and physics twin residual estimates to React Three.js clients.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

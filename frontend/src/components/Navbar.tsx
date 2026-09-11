import React from 'react';
import type { ConnectionStatus, DataMode } from '../types/telemetry';

export type ActiveNavTab = 'home' | 'phyengine' | 'health' | 'info';

interface NavbarProps {
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  lap?: number;
  dataMode?: DataMode;
  connectionStatus?: ConnectionStatus;
  onToggleDataMode?: (mode: DataMode) => void;
  onReconnect?: () => void;
  phyEngineSubTab?: '3d' | 'image';
  onSelectPhyEngineSubTab?: (subTab: '3d' | 'image') => void;
}

interface NavItem {
  key: ActiveNavTab;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'HOME' },
  { key: 'phyengine', label: 'PHYENGINE' },
  { key: 'health', label: 'SYSTEM HEALTH' },
  { key: 'info', label: 'RACE INSIGHTS' },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <header className="relative w-full bg-white border-b border-neutral-200 h-[82px] shrink-0 flex items-center justify-between z-50 sticky top-0 select-none overflow-hidden font-barlow">
      {/* Top-Left Red Corner Wedge */}
      <div className="absolute top-0 left-0 w-8 h-8 pointer-events-none z-10">
        <svg viewBox="0 0 32 32" className="w-full h-full">
          <polygon points="0,0 32,0 0,32" fill="#E10600" />
        </svg>
      </div>

      {/* LEFT: Extra Large TGR × F1 Logo */}
      <div className="flex items-center pl-6 sm:pl-8 lg:pl-10 z-20 min-w-[340px]">
        <button
          onClick={() => onSelectTab('home')}
          className="focus:outline-none cursor-pointer flex items-center group py-1"
          title="Toyota Gazoo Racing × F1"
        >
          <img
            src="/logo.png"
            alt="Toyota Gazoo Racing × F1"
            className="h-14 sm:h-16 md:h-[68px] max-h-[72px] w-auto object-contain transition-transform duration-150 group-hover:scale-105 drop-shadow-xs"
          />
        </button>
      </div>

      {/* CENTER: Exact Race-Engineering Centered Navigation Links */}
      <nav className="flex items-center justify-center space-x-8 sm:space-x-10 lg:space-x-14 z-20">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelectTab(item.key)}
              className={`relative flex flex-col items-center pt-2 pb-1 text-[17px] sm:text-[18px] font-bold tracking-wider uppercase transition-colors duration-150 cursor-pointer focus:outline-none ${
                isActive
                  ? 'text-[#E10600]'
                  : 'text-[#18181B] hover:text-[#E10600]'
              }`}
            >
              <span className="leading-tight">{item.label}</span>

              {/* Centered Thick Red Active Bar (Fixed-height container to preserve vertical baseline) */}
              <div className="h-[5px] mt-1.5 flex items-center justify-center">
                {isActive ? (
                  <span className="w-7 sm:w-8 h-[3px] bg-[#E10600] rounded-xs transition-all duration-150" />
                ) : (
                  <span className="w-7 sm:w-8 h-[3px] bg-transparent" />
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* RIGHT: Divider + Official TGR Label + Iconic TGR Diagonal Livery + Slogan */}
      <div className="flex items-center justify-end z-20 min-w-[340px] pr-6 sm:pr-8">
        {/* Vertical Divider */}
        <div className="hidden sm:block h-9 w-[1.5px] bg-neutral-300 mr-5" />

        {/* Official Right Label */}
        <span className="hidden sm:inline-block text-[13px] sm:text-[14px] font-semibold tracking-widest text-neutral-500 uppercase mr-4">
          TOYOTA GAZOO RACING × F1
        </span>

        {/* Far-Right Iconic Toyota Gazoo Racing Diagonal Livery Slash */}
        <div className="relative w-14 sm:w-16 h-[82px] shrink-0 pointer-events-none overflow-hidden">
          <svg
            viewBox="0 0 64 82"
            className="w-full h-full"
          >
            {/* Subtle silver hairline accent line */}
            <line
              x1="6"
              y1="82"
              x2="46"
              y2="0"
              stroke="#CBD5E1"
              strokeWidth="1.2"
            />
            {/* Sleek Black Racing Stripe */}
            <polygon
              points="12,82 17,82 57,0 52,0"
              fill="#18181B"
            />
            {/* Sleek Toyota Racing Red Stripe */}
            <polygon
              points="20,82 26,82 66,0 60,0"
              fill="#E10600"
            />
          </svg>
        </div>

        {/* Right Slogan: PUSH THE LIMITS / FOR A BETTER TOMORROW */}
        <div className="hidden lg:flex flex-col justify-center text-left text-[11px] font-bold leading-tight uppercase tracking-wider text-[#18181B] ml-4 font-mono">
          <span>PUSH THE LIMITS</span>
          <span className="text-neutral-500 text-[10px] font-medium">FOR A BETTER TOMORROW</span>
        </div>
      </div>
    </header>
  );
};

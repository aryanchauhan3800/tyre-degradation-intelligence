import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '../components/Navbar';
import { HomePage } from '../pages/HomePage';
import { OverallHealthPage } from '../pages/OverallHealthPage';
import { OtherInfoPage } from '../pages/OtherInfoPage';
import { TyreImagePage } from '../components/PhyEngine/TyreImagePage';

describe('Navigation and Multi-Page UI Component Tests', () => {
  it('renders F1 race-engineering Navbar matching reference image', () => {
    const handleSelectTab = vi.fn();
    render(
      <Navbar
        activeTab="home"
        onSelectTab={handleSelectTab}
      />
    );

    // Check logo exists
    const logo = screen.getByAltText(/Toyota Gazoo Racing × F1/i);
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', '/logo.png');

    // Check all 4 race-engineering tabs
    expect(screen.getByText('HOME')).toBeInTheDocument();
    expect(screen.getByText('PHYENGINE')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM HEALTH')).toBeInTheDocument();
    expect(screen.getByText('RACE INSIGHTS')).toBeInTheDocument();

    // Check right label
    expect(screen.getByText(/TOYOTA GAZOO RACING × F1/i)).toBeInTheDocument();

    // Click on PHYENGINE
    fireEvent.click(screen.getByText('PHYENGINE'));
    expect(handleSelectTab).toHaveBeenCalledWith('phyengine');

    // Click on SYSTEM HEALTH
    fireEvent.click(screen.getByText('SYSTEM HEALTH'));
    expect(handleSelectTab).toHaveBeenCalledWith('health');

    // Click on RACE INSIGHTS
    fireEvent.click(screen.getByText('RACE INSIGHTS'));
    expect(handleSelectTab).toHaveBeenCalledWith('info');
  });

  it('renders HomePage with full-screen auto-looping video player', () => {
    const { container } = render(
      <HomePage
        onNavigate={vi.fn()}
        telemetry={null}
        fourWheelStates={null}
        selectedTyre="FR"
        lap={27}
      />
    );

    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', '/homepage_video.mp4');
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('loop');
  });

  it('renders TyreImagePage inside Phyengine with FLIR thermal and laser inspection', () => {
    render(
      <TyreImagePage
        selectedTyre="FR"
        surfaceTemp={97}
        wearPercentage={42.5}
      />
    );

    expect(screen.getByText(/PHYENGINE \/\/ OPTICAL & THERMAL IMAGE INSPECTION/i)).toBeInTheDocument();
    expect(screen.getByText(/FLIR Thermal Scan/i)).toBeInTheDocument();
    expect(screen.getByText(/Laser Graining Scan/i)).toBeInTheDocument();
    expect(screen.getByText(/AI DEFECT SEGMENTATION/i)).toBeInTheDocument();
  });

  it('renders OverallHealthPage with 4-corner telemetry and pit stop calculator', () => {
    const handleSelectTyre = vi.fn();
    const handleNavigate = vi.fn();
    render(
      <OverallHealthPage
        telemetry={null}
        fourWheelStates={null}
        selectedTyre="FR"
        onSelectTyre={handleSelectTyre}
        onNavigate={handleNavigate}
        lap={27}
      />
    );

    expect(screen.getByText(/OVERALL FLEET HEALTH & DEGRADATION INTELLIGENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/CHASSIS CORNERS TELEMETRY MATRIX/i)).toBeInTheDocument();
    expect(screen.getByText(/PIT STOP WINDOW CALCULATOR/i)).toBeInTheDocument();
  });

  it('renders OtherInfoPage with partnership and Pirelli specifications', () => {
    const handleNavigate = vi.fn();
    render(<OtherInfoPage onNavigate={handleNavigate} />);

    expect(screen.getByText(/Toyota Gazoo Racing × Formula 1 Partnership/i)).toBeInTheDocument();
    expect(screen.getByText(/3-ZONE LUMPED THERMODYNAMIC MODEL/i)).toBeInTheDocument();
    expect(screen.getByText(/PACEJKA MF6.2 & ARCHARD WEAR FORMULATION/i)).toBeInTheDocument();
    expect(screen.getByText(/PIRELLI 18-INCH FORMULA 1 TECHNICAL SPECIFICATIONS/i)).toBeInTheDocument();
  });
});

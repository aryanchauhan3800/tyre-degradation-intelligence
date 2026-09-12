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

  it('renders HomePage with project explanation video in briefing section', () => {
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
    expect(video).toHaveAttribute('src');
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

    expect(screen.getByText(/SYSTEM HEALTH COMMAND CENTER/i)).toBeInTheDocument();
    expect(screen.getByText(/TYRE HEALTH & CORNER SYNCHRONIZATION/i)).toBeInTheDocument();
    expect(screen.getByText(/PIT STOP WINDOW CALCULATOR/i)).toBeInTheDocument();
    expect(screen.getByText(/SUZUKA CIRCUIT/i)).toBeInTheDocument();
    expect(screen.getByText(/130R/i)).toBeInTheDocument();
    expect(screen.getByText(/SPOON/i)).toBeInTheDocument();
    expect(screen.getByText(/HAIRPIN/i)).toBeInTheDocument();
    expect(screen.getByText(/RPM & SPEED TRACE/i)).toBeInTheDocument();
    expect(screen.getByText(/THERMAL PROFILES/i)).toBeInTheDocument();
    expect(screen.getByText(/TYRE & AERO LOAD/i)).toBeInTheDocument();
  });

  it('renders OverallHealthPage live charts driven by real backend telemetry frames', () => {
    const mockTelemetry: any = {
      timestamp: 4445.5,
      session_id: 'TEST_SESSION',
      lap: 18,
      vehicle: {
        speed_kph: 312.4,
        speed_mps: 86.7,
        throttle_pct: 100,
        brake_pct: 0,
        rpm: 11450,
      },
    };

    const mockPhysics: any = {
      ax_expected_mps2: 1.2,
      forces: {
        drag_n: 2500,
        rolling_resistance_n: 300,
        brake_force_n: 0,
        traction_force_n: 3800,
        downforce_n: 8500,
        net_longitudinal_force_n: 1000,
        vertical_loads_n: {
          front_left: 4800,
          front_right: 5200,
          rear_left: 6100,
          rear_right: 6400,
          total: 22500,
        },
      },
    };

    render(
      <OverallHealthPage
        telemetry={mockTelemetry}
        fourWheelStates={null}
        selectedTyre="FR"
        onSelectTyre={vi.fn()}
        onNavigate={vi.fn()}
        lap={18}
        physics={mockPhysics}
      />
    );

    // Verify real values rendered into telemetry graph headers
    expect(screen.getByText(/11,450 RPM/i)).toBeInTheDocument();
    expect(screen.getByText(/CURRENT: 312 KM\/H/i)).toBeInTheDocument();
    expect(screen.getByText(/8.5 kN Aero/i)).toBeInTheDocument();
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

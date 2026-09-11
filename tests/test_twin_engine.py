import math
import pytest

from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)
from backend.twin_engine.interface import TwinEngine
from backend.twin_engine.mock_twin import MockTwinEngine
from backend.twin_engine.parameters import PhysicsParameters
from backend.twin_engine.physics_model import (
    calculate_drag,
    calculate_effective_grip,
    calculate_expected_acceleration,
    calculate_load_transfer,
    calculate_pressure_temperature_relation,
    calculate_rolling_resistance,
    calculate_thermal_rate,
    calculate_tyre_force_limit,
    calculate_vertical_load,
)


def create_sample_telemetry_frame(
    speed_mps: float = 50.0,
    throttle_pct: float = 80.0,
    brake_pct: float = 0.0,
    timestamp: float = 1.0,
) -> TelemetryFrame:
    def make_corner(c):
        return TyreState(corner=c)

    return TelemetryFrame(
        timestamp=timestamp,
        session_id="TWIN_TEST_SESSION",
        lap=1,
        vehicle=VehicleState(
            speed_mps=speed_mps,
            speed_kph=speed_mps * 3.6,
            throttle_pct=throttle_pct,
            brake_pct=brake_pct,
            gear=4,
        ),
        tyres=FourWheelTyreStates(
            fl=make_corner(WheelCorner.FL),
            fr=make_corner(WheelCorner.FR),
            rl=make_corner(WheelCorner.RL),
            rr=make_corner(WheelCorner.RR),
        ),
        environment=EnvironmentState(
            ambient_temp_c=25.0,
            track_temp_c=35.0,
            track_condition="dry",
        ),
    )


# ========================================================
# 1. TEST DRAG: Increasing velocity increases drag with v^2
# ========================================================
def test_drag_quadratic_velocity_relationship():
    rho = 1.225
    cd = 0.85
    area = 1.50

    v1 = 20.0
    v2 = 40.0  # Exactly 2x velocity

    f_drag_1 = calculate_drag(speed_mps=v1, air_density=rho, cd=cd, frontal_area_m2=area)
    f_drag_2 = calculate_drag(speed_mps=v2, air_density=rho, cd=cd, frontal_area_m2=area)

    # Since v2 = 2 * v1, drag should be exactly (2^2) = 4x
    ratio = f_drag_2 / f_drag_1
    assert math.isclose(ratio, 4.0, rel_tol=1e-5)
    assert f_drag_1 == 0.5 * rho * cd * area * (v1 ** 2)


# ========================================================
# 2. TEST ROLLING RESISTANCE: F_rolling = Crr * m * g
# ========================================================
def test_rolling_resistance_formula():
    m = 798.0
    crr = 0.015
    g = 9.80665

    expected_f_rolling = crr * m * g
    actual_f_rolling = calculate_rolling_resistance(mass_kg=m, crr=crr, gravity=g)

    assert math.isclose(actual_f_rolling, expected_f_rolling, rel_tol=1e-6)
    assert actual_f_rolling == 0.015 * 798.0 * 9.80665


# ========================================================
# 3. TEST FORCE BALANCE: ax_expected = (Ftr - Fdrag - Froll - Fbrk) / m
# ========================================================
def test_force_balance_expected_acceleration():
    m = 798.0
    f_tr = 8500.0
    f_drag = 1200.0
    f_roll = 117.4
    f_brake = 0.0

    expected_ax = (f_tr - f_drag - f_roll - f_brake) / m
    actual_ax = calculate_expected_acceleration(
        f_traction=f_tr,
        f_drag=f_drag,
        f_rolling=f_roll,
        f_brake=f_brake,
        mass_kg=m,
    )

    assert math.isclose(actual_ax, expected_ax, rel_tol=1e-6)

    # Negative net force under heavy braking
    f_brake_heavy = 18000.0
    f_tr_zero = 0.0
    expected_decel = (f_tr_zero - f_drag - f_roll - f_brake_heavy) / m
    actual_decel = calculate_expected_acceleration(
        f_traction=f_tr_zero,
        f_drag=f_drag,
        f_rolling=f_roll,
        f_brake=f_brake_heavy,
        mass_kg=m,
    )
    assert actual_decel < 0.0
    assert math.isclose(actual_decel, expected_decel, rel_tol=1e-6)


# ========================================================
# 4. TEST LOAD TRANSFER: Increasing ax increases DeltaFz
# ========================================================
def test_load_transfer_magnitude():
    m = 798.0
    h = 0.30
    l = 3.60
    g = 9.80665

    ax_low = 3.0
    ax_high = 12.0  # 4x higher acceleration/braking

    delta_low, fz_f_low, fz_r_low = calculate_load_transfer(
        mass_kg=m, ax_mps2=ax_low, cg_height_m=h, wheelbase_m=l, gravity=g
    )
    delta_high, fz_f_high, fz_r_high = calculate_load_transfer(
        mass_kg=m, ax_mps2=ax_high, cg_height_m=h, wheelbase_m=l, gravity=g
    )

    assert delta_high > delta_low
    assert math.isclose(delta_high / delta_low, 4.0, rel_tol=1e-5)

    # Axle normal loads must conserve total vertical load (m * g)
    fz_total = m * g
    assert math.isclose(fz_f_low + fz_r_low, fz_total, rel_tol=1e-5)
    assert math.isclose(fz_f_high + fz_r_high, fz_total, rel_tol=1e-5)


# ========================================================
# 5. TEST GRIP: Increasing degradation D must reduce mu_eff
# ========================================================
def test_effective_grip_degradation():
    mu0 = 1.60

    mu_fresh = calculate_effective_grip(mu0=mu0, degradation=0.0)
    mu_worn_20 = calculate_effective_grip(mu0=mu0, degradation=0.20)
    mu_worn_50 = calculate_effective_grip(mu0=mu0, degradation=0.50)
    mu_dead_100 = calculate_effective_grip(mu0=mu0, degradation=1.00)

    assert mu_fresh == 1.60
    assert math.isclose(mu_worn_20, 1.60 * 0.80, rel_tol=1e-6)
    assert math.isclose(mu_worn_50, 1.60 * 0.50, rel_tol=1e-6)
    assert mu_dead_100 == 0.0
    assert mu_fresh > mu_worn_20 > mu_worn_50 > mu_dead_100


# ========================================================
# 6. TEST TYRE FORCE: F_tyre_max = mu_eff * Fz
# ========================================================
def test_tyre_force_limit():
    mu_eff = 1.45
    fz = 4500.0

    expected_limit = mu_eff * fz
    actual_limit = calculate_tyre_force_limit(mu_eff=mu_eff, fz=fz)

    assert math.isclose(actual_limit, expected_limit, rel_tol=1e-6)
    assert actual_limit == 1.45 * 4500.0


# ========================================================
# 7. TEST THERMAL: P_heat > P_loss => dT/dt > 0
# ========================================================
def test_thermal_energy_conservation_rates():
    # When heat generation exceeds cooling loss
    fx = 2500.0
    v_slip_x = 0.80  # P_heat = 2500 * 0.8 = 2000 W
    fy = 0.0
    v_slip_y = 0.0
    hA = 25.0
    t_surf = 360.0   # K (~87°C)
    t_amb = 298.0    # K (25°C) -> delta_t = 62 K -> P_loss = 25 * 62 = 1550 W
    m_t = 10.5
    cp = 1450.0

    # Net power = 2000 - 1550 = +450 W => heating
    dt_dt_heat, status_heat = calculate_thermal_rate(
        fx=fx, fy=fy, v_slip_x=v_slip_x, v_slip_y=v_slip_y,
        hA=hA, t_surface_k=t_surf, t_ambient_k=t_amb,
        tyre_mass_kg=m_t, cp=cp
    )
    assert status_heat == "CALCULATED"
    assert dt_dt_heat is not None
    assert dt_dt_heat > 0.0
    expected_dt = 450.0 / (10.5 * 1450.0)
    assert math.isclose(dt_dt_heat, expected_dt, rel_tol=1e-5)

    # When cooling exceeds slip heat generation (e.g. straight line rolling, zero slip)
    dt_dt_cool, status_cool = calculate_thermal_rate(
        fx=0.0, fy=0.0, v_slip_x=0.0, v_slip_y=0.0,
        hA=hA, t_surface_k=t_surf, t_ambient_k=t_amb,
        tyre_mass_kg=m_t, cp=cp
    )
    assert status_cool == "CALCULATED"
    assert dt_dt_cool < 0.0  # Cooling down


# ========================================================
# 8. TEST MISSING DATA: None signals never fabricated
# ========================================================
def test_missing_data_strictly_preserved_as_none():
    dt_dt, status = calculate_thermal_rate(
        fx=None, fy=None, v_slip_x=None, v_slip_y=None,
        hA=25.0, t_surface_k=None, t_ambient_k=None,
        tyre_mass_kg=10.5, cp=1450.0
    )
    assert dt_dt is None
    assert status == "UNAVAILABLE"

    # Gas law relation when pressure is unmeasured
    p2, p_status = calculate_pressure_temperature_relation(p1_pa=None, t1_k=300.0, t2_k=350.0)
    assert p2 is None
    assert p_status == "UNAVAILABLE"

    # Running TwinEngine on a real-style frame with None tyre temperatures
    engine = TwinEngine()
    frame = create_sample_telemetry_frame()
    assert frame.tyres.fl.surface_temp_c is None
    assert frame.tyres.fl.pressure_bar is None

    out = engine.step(frame)
    assert out.thermal_status == "UNAVAILABLE"
    assert out.thermal_prediction_k_per_s is None
    assert "tyres.fl/fr/rl/rr.surface_temp_c" in out.unavailable_inputs


# ========================================================
# 9. TEST DETERMINISM: Same input + same params = identical output
# ========================================================
def test_twin_engine_determinism():
    params = PhysicsParameters(mass_kg=798.0, cd=0.85)

    engine_a = TwinEngine(parameters=params)
    engine_b = TwinEngine(parameters=params)

    frame_1 = create_sample_telemetry_frame(speed_mps=60.0, throttle_pct=90.0, timestamp=10.0)
    frame_2 = create_sample_telemetry_frame(speed_mps=62.5, throttle_pct=90.0, timestamp=10.2)

    # Step 1
    out_a1 = engine_a.step(frame_1)
    out_b1 = engine_b.step(frame_1)
    assert out_a1.expected_acceleration_mps2 == out_b1.expected_acceleration_mps2
    assert out_a1.expected_drag_n == out_b1.expected_drag_n
    assert out_a1.expected_traction_force_n == out_b1.expected_traction_force_n

    # Step 2 (with derived acceleration)
    out_a2 = engine_a.step(frame_2)
    out_b2 = engine_b.step(frame_2)
    assert out_a2.derived_acceleration_mps2 == out_b2.derived_acceleration_mps2
    assert out_a2.expected_acceleration_mps2 == out_b2.expected_acceleration_mps2
    assert out_a2.model_dump() == out_b2.model_dump()


# ========================================================
# 10. TEST ACCELERATION DERIVATION FROM CONSECUTIVE FRAMES
# ========================================================
def test_acceleration_derivation_from_consecutive_speed():
    engine = TwinEngine()

    f1 = create_sample_telemetry_frame(speed_mps=50.0, timestamp=1.0)
    f2 = create_sample_telemetry_frame(speed_mps=52.0, timestamp=1.2)  # Delta v = 2.0 m/s, Delta t = 0.2 s -> ax = 10.0 m/s^2

    out1 = engine.step(f1)
    assert out1.derived_acceleration_mps2 is None  # First frame has no history

    out2 = engine.step(f2)
    assert out2.derived_acceleration_mps2 is not None
    assert math.isclose(out2.derived_acceleration_mps2, 10.0, rel_tol=1e-3)
    assert out2.derived_inputs["derived_acceleration_mps2"]["method"] == "Delta v / Delta t (DERIVED FROM FASTF1 SPEED)"


# ========================================================
# 11. TEST MOCK TWIN ENGINE LABELLING
# ========================================================
def test_mock_twin_engine_label():
    mock = MockTwinEngine()
    frame = create_sample_telemetry_frame()
    out = mock.step(frame)

    assert "DEMO / SYNTHETIC / MODELLED" in out.modelled_inputs["mode"]
    assert mock.health()["mode"] == "DEMO / SYNTHETIC / MODELLED"

"""
TYRETRACE — Physics Reference Model Equations
Authoritative first-principles mathematical implementation of vehicle dynamics,
aerodynamic drag, rolling resistance, longitudinal load transfer, tyre grip degradation,
and tyre thermal energy balance.

All functions use SI units:
    Speed           : m/s
    Acceleration    : m/s^2
    Force           : N
    Mass            : kg
    Distance        : m
    Temperature     : K
    Pressure        : Pa
"""

import math
from typing import Optional, Tuple


def calculate_drag(
    speed_mps: float,
    air_density: float,
    cd: float,
    frontal_area_m2: float,
) -> float:
    """
    Calculates aerodynamic drag force:
        F_drag = 0.5 * rho * Cd * A * v^2

    The force strictly increases with v^2 and opposes the direction of travel.
    """
    v = float(speed_mps)
    # 0.5 * rho * Cd * A * v^2 with sign preservation for velocity direction
    f_drag_mag = 0.5 * air_density * cd * frontal_area_m2 * (v ** 2)
    return math.copysign(f_drag_mag, v) if v != 0.0 else 0.0


def calculate_rolling_resistance(
    mass_kg: float,
    crr: float,
    gravity: float = 9.80665,
) -> float:
    """
    Calculates rolling resistance force:
        F_rolling = Crr * m * g
    """
    return float(crr * mass_kg * gravity)


def calculate_vertical_load(
    mass_kg: float,
    gravity: float = 9.80665,
    f_aero: float = 0.0,
) -> float:
    """
    Calculates total vehicle vertical normal load:
        Fz_total = m * g + F_aero
    """
    return float(mass_kg * gravity + f_aero)


def calculate_load_transfer(
    mass_kg: float,
    ax_mps2: float,
    cg_height_m: float,
    wheelbase_m: float,
    static_front_fraction: float = 0.45,
    gravity: float = 9.80665,
    f_aero: float = 0.0,
) -> Tuple[float, float, float]:
    """
    Calculates longitudinal load transfer:
        DeltaFz = (m * ax * h) / L

    Under forward acceleration (ax > 0), vertical load transfers from front to rear:
        Fz_front = Fz_front_static - DeltaFz
        Fz_rear  = Fz_rear_static  + DeltaFz

    Under braking/deceleration (ax < 0), vertical load transfers from rear to front:
        Fz_front = Fz_front_static + |DeltaFz|
        Fz_rear  = Fz_rear_static  - |DeltaFz|

    Returns:
        (DeltaFz_magnitude, Fz_front, Fz_rear) in Newtons.
    """
    if wheelbase_m <= 0.0:
        raise ValueError("Wheelbase must be greater than zero.")

    fz_total = calculate_vertical_load(mass_kg, gravity=gravity, f_aero=f_aero)
    fz_front_static = fz_total * static_front_fraction
    fz_rear_static = fz_total * (1.0 - static_front_fraction)

    # DeltaFz = (m * ax * h) / L
    # Positive ax = forward acceleration -> rearward load transfer
    # Negative ax = deceleration/braking  -> forward load transfer
    delta_fz = (mass_kg * ax_mps2 * cg_height_m) / wheelbase_m

    fz_front = fz_front_static - delta_fz
    fz_rear = fz_rear_static + delta_fz

    # Physical clamping to prevent unphysical negative wheel loads
    fz_front = max(0.0, min(fz_total, fz_front))
    fz_rear = max(0.0, min(fz_total, fz_rear))

    return abs(delta_fz), fz_front, fz_rear


def calculate_effective_grip(
    mu0: float,
    degradation: float = 0.0,
    f_temp: float = 1.0,
    f_pressure: float = 1.0,
    f_slip: float = 1.0,
) -> float:
    """
    Calculates effective tyre-road friction coefficient mu_eff:
        mu_eff = mu0 * (1 - D) * f_temperature * f_pressure * f_slip

    where:
        mu0         : Baseline clean friction coefficient
        degradation : Degradation state D in [0.0, 1.0]
        f_temp      : Thermal sensitivity factor (nominal 1.0)
        f_pressure  : Pressure sensitivity factor (nominal 1.0)
        f_slip      : Slip curve sensitivity factor (nominal 1.0)
    """
    d_clamped = max(0.0, min(1.0, float(degradation)))
    mu_eff = mu0 * (1.0 - d_clamped) * f_temp * f_pressure * f_slip
    return max(0.0, float(mu_eff))


def calculate_tyre_force_limit(
    mu_eff: float,
    fz: float,
) -> float:
    """
    Calculates peak available tyre grip force:
        F_tyre_max = mu_eff * Fz
    """
    return max(0.0, float(mu_eff * max(0.0, fz)))


def calculate_expected_acceleration(
    f_traction: float,
    f_drag: float,
    f_rolling: float,
    f_brake: float,
    mass_kg: float,
) -> float:
    """
    Authoritative Primary Vehicle Physics Equation:
        F_net = F_traction - F_drag - F_rolling - F_brake
        ax_expected = F_net / m
    """
    if mass_kg <= 0.0:
        raise ValueError("Vehicle mass must be strictly positive.")

    f_net = float(f_traction) - float(f_drag) - float(f_rolling) - float(f_brake)
    ax_expected = f_net / float(mass_kg)
    return float(ax_expected)


def calculate_thermal_rate(
    fx: Optional[float],
    fy: Optional[float],
    v_slip_x: Optional[float],
    v_slip_y: Optional[float],
    hA: float,
    t_surface_k: Optional[float],
    t_ambient_k: Optional[float],
    tyre_mass_kg: float,
    cp: float,
) -> Tuple[Optional[float], str]:
    """
    First-principles Tyre Thermal Energy Model:
        m_t * cp * dT/dt = P_heat - P_loss
        P_heat = Fx * v_slip_x + Fy * v_slip_y
        P_loss = hA * (T - T_ambient)
        dT/dt = (Fx * v_slip_x + Fy * v_slip_y - hA * (T - T_ambient)) / (m_t * cp)

    IMPORTANT:
    If any required physical input (forces, slip velocities, surface temperature,
    or ambient temperature) is None, DOES NOT INVENT VALUES.
    Returns (None, "UNAVAILABLE").
    """
    required_inputs = [fx, fy, v_slip_x, v_slip_y, t_surface_k, t_ambient_k]
    if any(val is None for val in required_inputs):
        return None, "UNAVAILABLE"

    if tyre_mass_kg <= 0.0 or cp <= 0.0:
        raise ValueError("Tyre mass and specific heat must be positive.")

    # Mechanical dissipation heat generation (W = N * m/s)
    p_heat = abs(fx * v_slip_x) + abs(fy * v_slip_y)

    # Convective/radiative heat loss to ambient (W = W/K * K)
    delta_t = t_surface_k - t_ambient_k
    p_loss = hA * delta_t

    # Net rate of temperature change (K/s)
    dt_dt = (p_heat - p_loss) / (tyre_mass_kg * cp)
    return float(dt_dt), "CALCULATED"


def calculate_pressure_temperature_relation(
    p1_pa: Optional[float],
    t1_k: Optional[float],
    t2_k: Optional[float],
) -> Tuple[Optional[float], str]:
    """
    Isochoric (constant volume) Ideal Gas Law Relationship:
        P * V = n * R * T
        For constant V and n: P2 = P1 * (T2 / T1)

    IMPORTANT CONSTRAINT:
    Do NOT generate tyre pressure when measured pressure is unavailable.
    Returns (None, "UNAVAILABLE") if any input is None.
    """
    if p1_pa is None or t1_k is None or t2_k is None:
        return None, "UNAVAILABLE"
    if t1_k <= 0.0 or t2_k <= 0.0:
        return None, "UNAVAILABLE"

    p2_pa = p1_pa * (t2_k / t1_k)
    return float(p2_pa), "CALCULATED"

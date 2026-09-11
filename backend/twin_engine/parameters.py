"""
TYRETRACE — Physics Parameters
Defines baseline vehicle mass, aerodynamics, rolling resistance, geometry, and tyre properties.
All parameters use SI units (kg, m, s, N, K, Pa).

IMPORTANT:
Every default value in this configuration is explicitly marked:
"MODEL PARAMETER — DEMO ASSUMPTION"
These values serve as baseline nominal reference parameters for the digital twin.
They are NOT claimed to be proprietary OEM / Formula 1 vehicle telemetry.
"""

from dataclasses import dataclass, field
from typing import Dict, Any


@dataclass(frozen=True)
class PhysicsParameters:
    """
    Vehicle, aerodynamic, and tyre nominal parameters for the TYRETRACE Twin Engine.
    All defaults are explicitly labelled: MODEL PARAMETER — DEMO ASSUMPTION.
    """

    # Vehicle mass & geometry
    mass_kg: float = 798.0
    # MODEL PARAMETER — DEMO ASSUMPTION: 2022+ F1 technical regulation minimum car+driver mass (798 kg)

    cg_height_m: float = 0.30
    # MODEL PARAMETER — DEMO ASSUMPTION: Center of gravity height above ground (0.30 m)

    wheelbase_m: float = 3.60
    # MODEL PARAMETER — DEMO ASSUMPTION: Wheelbase distance between front and rear axle centers (3.60 m)

    static_front_weight_fraction: float = 0.45
    # MODEL PARAMETER — DEMO ASSUMPTION: Static front weight distribution (45% front, 55% rear)

    # Aerodynamics
    cd: float = 0.85
    # MODEL PARAMETER — DEMO ASSUMPTION: Aerodynamic drag coefficient in medium-downforce trim (0.85)

    frontal_area_m2: float = 1.50
    # MODEL PARAMETER — DEMO ASSUMPTION: Effective projected vehicle frontal area (1.50 m^2)

    air_density: float = 1.225
    # MODEL PARAMETER — DEMO ASSUMPTION: Standard sea-level air density at 15°C / 101.325 kPa (1.225 kg/m^3)

    gravity: float = 9.80665
    # Standard acceleration due to gravity (9.80665 m/s^2)

    # Rolling resistance
    crr: float = 0.015
    # MODEL PARAMETER — DEMO ASSUMPTION: Rolling resistance coefficient on smooth asphalt (0.015)

    # Powertrain & braking modelled limits (used only when direct engine torque/pressure is unavailable)
    max_engine_power_w: float = 750_000.0
    # MODEL PARAMETER — DEMO ASSUMPTION: Peak total powertrain power output ~1000 bhp (750 kW)

    max_brake_force_n: float = 28_000.0
    # MODEL PARAMETER — DEMO ASSUMPTION: Peak four-wheel braking force limit at 100% pedal effort (28 kN)

    # Tyre physical properties
    base_tyre_mu: float = 1.60
    # MODEL PARAMETER — DEMO ASSUMPTION: Baseline clean tyre-road static friction coefficient mu0 (1.60)

    tyre_mass_kg: float = 10.5
    # MODEL PARAMETER — DEMO ASSUMPTION: Mass of a single tyre carcass + tread (10.5 kg)

    tyre_specific_heat: float = 1450.0
    # MODEL PARAMETER — DEMO ASSUMPTION: Specific heat capacity of synthetic tyre rubber cp (1450 J / kg·K)

    thermal_loss_coefficient: float = 25.0
    # MODEL PARAMETER — DEMO ASSUMPTION: Convective/conductive heat transfer coefficient h*A (25.0 W/K)

    def describe_assumptions(self) -> Dict[str, str]:
        """Returns metadata detailing the assumptions and origins of every parameter."""
        return {
            "mass_kg": f"{self.mass_kg} kg (MODEL PARAMETER — DEMO ASSUMPTION: F1 min reg mass)",
            "cd": f"{self.cd} (MODEL PARAMETER — DEMO ASSUMPTION: F1 medium drag coefficient)",
            "frontal_area_m2": f"{self.frontal_area_m2} m^2 (MODEL PARAMETER — DEMO ASSUMPTION: F1 frontal area)",
            "crr": f"{self.crr} (MODEL PARAMETER — DEMO ASSUMPTION: Racing slick rolling resistance)",
            "cg_height_m": f"{self.cg_height_m} m (MODEL PARAMETER — DEMO ASSUMPTION: Chassis CG height)",
            "wheelbase_m": f"{self.wheelbase_m} m (MODEL PARAMETER — DEMO ASSUMPTION: Modern wheelbase)",
            "static_front_weight_fraction": f"{self.static_front_weight_fraction} (MODEL PARAMETER — DEMO ASSUMPTION: Front weight bias)",
            "base_tyre_mu": f"{self.base_tyre_mu} (MODEL PARAMETER — DEMO ASSUMPTION: Dry slick nominal friction mu0)",
            "max_engine_power_w": f"{self.max_engine_power_w / 1000.0:.0f} kW (MODEL PARAMETER — DEMO ASSUMPTION: ICE+MGU-K peak)",
            "max_brake_force_n": f"{self.max_brake_force_n / 1000.0:.1f} kN (MODEL PARAMETER — DEMO ASSUMPTION: Peak deceleration clamp)",
            "tyre_mass_kg": f"{self.tyre_mass_kg} kg (MODEL PARAMETER — DEMO ASSUMPTION: Tyre mass)",
            "tyre_specific_heat": f"{self.tyre_specific_heat} J/kg*K (MODEL PARAMETER — DEMO ASSUMPTION: Rubber specific heat)",
            "thermal_loss_coefficient": f"{self.thermal_loss_coefficient} W/K (MODEL PARAMETER — DEMO ASSUMPTION: Convective cooling hA)",
        }

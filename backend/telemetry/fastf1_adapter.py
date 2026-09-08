"""
TYRETRACE — FastF1 Telemetry Ingestion Adapter
Ingests official Formula 1 timing, car telemetry, and weather data via FastF1,
mapping verified existing fields into canonical TelemetryFrames while strictly preserving
unavailable signals (tyre temps, pressures, slip) as None without fabrication.
"""

from dataclasses import dataclass
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd

from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)
from backend.telemetry.adapter import MalformedTelemetryError, TelemetryAdapter

logger = logging.getLogger(__name__)


@dataclass
class FastF1SessionConfig:
    year: int = 2023
    event: Union[str, int] = "Monza"
    session: str = "Q"
    driver: str = "VER"
    cache_dir: str = "data/cache/fastf1"
    lap_limit: Optional[int] = None  # None for all laps, or int e.g. 1 for single fastest lap
    fastest_only: bool = False


class FastF1Adapter(TelemetryAdapter):
    """
    Adapter converting FastF1 telemetry & session data into canonical TelemetryFrames.
    """

    AVAILABLE_COLUMNS = [
        "Date", "SessionTime", "Time", "RPM", "Speed", "nGear", "Throttle",
        "Brake", "DRS", "Distance", "RelativeDistance", "X", "Y", "Z",
        "Driver", "LapNumber", "Compound", "TyreLife", "Stint",
        "AirTemp", "TrackTemp", "Humidity", "Pressure", "WindSpeed", "WindDirection", "Rainfall"
    ]

    UNAVAILABLE_COLUMNS = [
        "pressure_bar", "surface_temp_c", "carcass_temp_c", "inner_temp_c",
        "middle_temp_c", "outer_temp_c", "wheel_speed_mps", "slip_ratio",
        "slip_angle_deg", "vertical_load_n", "steer_angle_deg",
        "longitudinal_accel_g", "lateral_accel_g", "yaw_rate_deg_s"
    ]

    def __init__(self, config: Optional[FastF1SessionConfig] = None):
        self.config = config or FastF1SessionConfig()
        self._setup_cache()

    def _setup_cache(self) -> None:
        """Enables FastF1 disk cache and configures reliable CDN mirrors for schedule."""
        try:
            import fastf1
            import fastf1.events
            # Ensure reliable mirror for schedule data
            fastf1.events._SCHEDULE_BASE_URL = "https://cdn.jsdelivr.net/gh/theOehrly/f1schedule@master/"
            cache_path = Path(self.config.cache_dir)
            cache_path.mkdir(parents=True, exist_ok=True)
            fastf1.Cache.enable_cache(str(cache_path))
        except ImportError:
            logger.warning("fastf1 package not installed; online fetch will not be available.")

    def parse(self, raw_data: Union[str, bytes, Dict[str, Any]]) -> TelemetryFrame:
        """
        Parses a single canonical or pre-mapped dictionary into a TelemetryFrame.
        """
        if isinstance(raw_data, (str, bytes)):
            payload = json.loads(raw_data)
        else:
            payload = raw_data
        return TelemetryFrame.model_validate(payload)

    def load_session_telemetry(
        self,
        config: Optional[FastF1SessionConfig] = None,
    ) -> Tuple[List[TelemetryFrame], Dict[str, Any]]:
        """
        Downloads / loads F1 session data via FastF1, processes laps and telemetry for
        the specified driver, and converts them to canonical TelemetryFrames.
        Returns (frames, metadata_summary).
        """
        import fastf1

        cfg = config or self.config
        session = fastf1.get_session(cfg.year, cfg.event, cfg.session)
        session.load(telemetry=True, weather=True, messages=False)

        driver_code = cfg.driver.upper()
        driver_laps = session.laps.pick_drivers(driver_code)
        if len(driver_laps) == 0:
            raise ValueError(f"No laps found for driver '{driver_code}' in {cfg.year} {cfg.event} {cfg.session}")

        selected_laps = driver_laps
        if cfg.fastest_only:
            fastest_lap = driver_laps.pick_fastest()
            selected_laps = session.laps.loc[[fastest_lap.name]]
        elif cfg.lap_limit is not None and cfg.lap_limit > 0:
            selected_laps = driver_laps.iloc[:cfg.lap_limit]

        weather_df = session.weather_data if hasattr(session, "weather_data") else pd.DataFrame()
        session_id = f"F1_{cfg.year}_{session.event['EventName'].replace(' ', '_')}_{cfg.session}_{driver_code}"

        all_frames: List[TelemetryFrame] = []
        for _, lap in selected_laps.iterlaps():
            try:
                lap_tel = lap.get_telemetry()
            except Exception as e:
                logger.warning(f"Could not retrieve telemetry for Lap {lap.get('LapNumber')}: {e}")
                continue

            frames = self.convert_lap_telemetry(
                telemetry_df=lap_tel,
                lap_series=lap,
                weather_df=weather_df,
                session_id=session_id,
            )
            all_frames.extend(frames)

        metadata = {
            "year": cfg.year,
            "event": session.event["EventName"],
            "session": cfg.session,
            "driver": driver_code,
            "total_session_laps": len(session.laps),
            "driver_laps_loaded": len(selected_laps),
            "telemetry_frames_count": len(all_frames),
            "available_columns": self.AVAILABLE_COLUMNS,
            "unavailable_columns": self.UNAVAILABLE_COLUMNS,
        }

        return all_frames, metadata

    def convert_lap_telemetry(
        self,
        telemetry_df: pd.DataFrame,
        lap_series: pd.Series,
        weather_df: Optional[pd.DataFrame] = None,
        session_id: str = "FASTF1_SESSION",
    ) -> List[TelemetryFrame]:
        """
        Converts a FastF1 telemetry DataFrame for a single lap into canonical TelemetryFrames.
        """
        frames: List[TelemetryFrame] = []
        if telemetry_df.empty:
            return frames

        lap_num = int(lap_series.get("LapNumber", 1)) if pd.notna(lap_series.get("LapNumber")) else 1
        driver_code = str(lap_series.get("Driver", "UNK"))
        compound = str(lap_series.get("Compound")) if pd.notna(lap_series.get("Compound")) else None
        tyre_life = int(lap_series.get("TyreLife")) if pd.notna(lap_series.get("TyreLife")) else None
        stint = int(lap_series.get("Stint")) if pd.notna(lap_series.get("Stint")) else None

        for _, row in telemetry_df.iterrows():
            # Timestamp conversion
            if "SessionTime" in row and pd.notna(row["SessionTime"]):
                t_sec = float(row["SessionTime"].total_seconds())
            elif "Time" in row and pd.notna(row["Time"]):
                t_sec = float(row["Time"].total_seconds())
            else:
                t_sec = 0.0

            iso_ts = None
            if "Date" in row and pd.notna(row["Date"]):
                try:
                    iso_ts = pd.to_datetime(row["Date"]).isoformat()
                except Exception:
                    iso_ts = None

            # Vehicle state (mapped ONLY from real fields)
            speed_kph = float(row["Speed"]) if "Speed" in row and pd.notna(row["Speed"]) else 0.0
            speed_mps = round(speed_kph / 3.6, 3)

            throttle = float(row["Throttle"]) if "Throttle" in row and pd.notna(row["Throttle"]) else 0.0
            raw_brake = row.get("Brake", 0)
            if isinstance(raw_brake, (bool, np.bool_)):
                brake_pct = 100.0 if raw_brake else 0.0
            else:
                brake_pct = float(raw_brake) if pd.notna(raw_brake) else 0.0

            gear = int(row["nGear"]) if "nGear" in row and pd.notna(row["nGear"]) else 0
            rpm = float(row["RPM"]) if "RPM" in row and pd.notna(row["RPM"]) else None
            drs = int(row["DRS"]) if "DRS" in row and pd.notna(row["DRS"]) else None

            dist = float(row["Distance"]) if "Distance" in row and pd.notna(row["Distance"]) else None
            if dist is not None:
                dist = max(0.0, dist)
            rel_dist = float(row["RelativeDistance"]) if "RelativeDistance" in row and pd.notna(row["RelativeDistance"]) else None
            if rel_dist is not None:
                rel_dist = min(1.0, max(0.0, rel_dist))

            pos_x = float(row["X"]) if "X" in row and pd.notna(row["X"]) else None
            pos_y = float(row["Y"]) if "Y" in row and pd.notna(row["Y"]) else None
            pos_z = float(row["Z"]) if "Z" in row and pd.notna(row["Z"]) else None

            vehicle = VehicleState(
                speed_mps=speed_mps,
                speed_kph=speed_kph,
                throttle_pct=throttle,
                brake_pct=brake_pct,
                gear=gear,
                rpm=rpm,
                drs=drs,
                steer_angle_deg=None,           # UNAVAILABLE in FastF1
                longitudinal_accel_g=None,      # UNAVAILABLE in FastF1
                lateral_accel_g=None,           # UNAVAILABLE in FastF1
                yaw_rate_deg_s=None,            # UNAVAILABLE in FastF1
                position_x=pos_x,
                position_y=pos_y,
                position_z=pos_z,
            )

            # Four-corner tyre states (NEVER FABRICATED — preserved as None)
            def make_corner(corner: WheelCorner) -> TyreState:
                return TyreState(
                    corner=corner,
                    pressure_bar=None,          # UNAVAILABLE in FastF1
                    surface_temp_c=None,        # UNAVAILABLE in FastF1
                    carcass_temp_c=None,        # UNAVAILABLE in FastF1
                    inner_temp_c=None,          # UNAVAILABLE in FastF1
                    middle_temp_c=None,         # UNAVAILABLE in FastF1
                    outer_temp_c=None,          # UNAVAILABLE in FastF1
                    wheel_speed_mps=None,       # UNAVAILABLE in FastF1
                    slip_ratio=None,            # UNAVAILABLE in FastF1
                    slip_angle_deg=None,        # UNAVAILABLE in FastF1
                    vertical_load_n=None,       # UNAVAILABLE in FastF1
                    compound=compound,          # From lap metadata
                    tyre_life_laps=tyre_life,   # From lap metadata
                    stint=stint,                # From lap metadata
                )

            tyres = FourWheelTyreStates(
                fl=make_corner(WheelCorner.FL),
                fr=make_corner(WheelCorner.FR),
                rl=make_corner(WheelCorner.RL),
                rr=make_corner(WheelCorner.RR),
            )

            # Environment context (from weather data if available)
            env_state = self._extract_environment_sample(weather_df, t_sec)

            frame = TelemetryFrame(
                timestamp=t_sec,
                timestamp_iso=iso_ts,
                session_id=session_id,
                lap=lap_num,
                distance_m=dist,
                relative_distance=rel_dist,
                driver=driver_code,
                vehicle=vehicle,
                tyres=tyres,
                environment=env_state,
            )
            frames.append(frame)

        return frames

    def _extract_environment_sample(
        self,
        weather_df: Optional[pd.DataFrame],
        current_time_sec: float,
    ) -> EnvironmentState:
        """Interpolates or extracts the closest weather conditions for the given time."""
        if weather_df is None or weather_df.empty:
            return EnvironmentState(
                ambient_temp_c=None,
                track_temp_c=None,
                humidity_pct=None,
                air_pressure_mbar=None,
                wind_speed_mps=None,
                wind_direction_deg=None,
                rainfall=None,
                track_condition="dry",
                track_friction_mu=None,
            )

        # Find closest weather row by Time
        closest_row = weather_df.iloc[0]
        if "Time" in weather_df.columns:
            try:
                deltas = weather_df["Time"].apply(lambda t: abs(t.total_seconds() - current_time_sec))
                closest_idx = deltas.idxmin()
                closest_row = weather_df.loc[closest_idx]
            except Exception:
                closest_row = weather_df.iloc[0]

        air_temp = float(closest_row["AirTemp"]) if "AirTemp" in closest_row and pd.notna(closest_row["AirTemp"]) else None
        track_temp = float(closest_row["TrackTemp"]) if "TrackTemp" in closest_row and pd.notna(closest_row["TrackTemp"]) else None
        humidity = float(closest_row["Humidity"]) if "Humidity" in closest_row and pd.notna(closest_row["Humidity"]) else None
        pressure = float(closest_row["Pressure"]) if "Pressure" in closest_row and pd.notna(closest_row["Pressure"]) else None
        wind_speed = float(closest_row["WindSpeed"]) if "WindSpeed" in closest_row and pd.notna(closest_row["WindSpeed"]) else None
        wind_dir = float(closest_row["WindDirection"]) if "WindDirection" in closest_row and pd.notna(closest_row["WindDirection"]) else None
        rainfall = bool(closest_row["Rainfall"]) if "Rainfall" in closest_row and pd.notna(closest_row["Rainfall"]) else None
        track_cond = "wet" if rainfall else "dry"

        return EnvironmentState(
            ambient_temp_c=air_temp,
            track_temp_c=track_temp,
            humidity_pct=humidity,
            air_pressure_mbar=pressure,
            wind_speed_mps=wind_speed,
            wind_direction_deg=wind_dir,
            rainfall=rainfall,
            track_condition=track_cond,
            track_friction_mu=None,
        )

    def save_replay_data(
        self,
        frames: List[TelemetryFrame],
        output_path: Union[str, Path],
    ) -> Path:
        """Saves canonical frames as JSON replay dataset."""
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        dumped = [f.model_dump() for f in frames]
        out.write_text(json.dumps(dumped, indent=2), encoding="utf-8")
        return out

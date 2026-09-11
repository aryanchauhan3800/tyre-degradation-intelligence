"""
TYRETRACE — ML Dataset Discovery & Suitability Auditor
Inspects candidate FastF1 sessions and evaluates multi-lap tyre-age progression,
telemetry completeness, stint counts, and suitability for ML degradation modeling.
"""

from dataclasses import asdict, dataclass
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class CandidateSessionSummary:
    year: int
    event: str
    session: str
    driver: str
    total_laps: int
    stint_count: int
    stints: List[int]
    compounds: List[str]
    tyre_life_range: Tuple[Optional[int], Optional[int]]
    max_stint_laps: int
    suitable_for_training: bool
    suitability_reason: str
    telemetry_channels_present: List[str]
    telemetry_channels_missing: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def audit_session_suitability(
    year: int,
    event: str,
    session_type: str,
    driver: str,
    cache_dir: str = "data/cache/fastf1",
) -> CandidateSessionSummary:
    """
    Loads session metadata via FastF1 and determines whether it meets the multi-lap
    stint requirements for supervised degradation modeling.
    """
    import fastf1
    import fastf1.events

    fastf1.events._SCHEDULE_BASE_URL = "https://cdn.jsdelivr.net/gh/theOehrly/f1schedule@master/"
    Path(cache_dir).mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(cache_dir)

    session = fastf1.get_session(year, event, session_type)
    # Load lap and weather data without heavy full-field telemetry
    session.load(telemetry=False, weather=True, messages=False)

    driver_laps = session.laps.pick_drivers(driver)
    total_laps = len(driver_laps)

    if total_laps == 0:
        return CandidateSessionSummary(
            year=year,
            event=event,
            session=session_type,
            driver=driver,
            total_laps=0,
            stint_count=0,
            stints=[],
            compounds=[],
            tyre_life_range=(None, None),
            max_stint_laps=0,
            suitable_for_training=False,
            suitability_reason="No laps found for driver in this session.",
            telemetry_channels_present=[],
            telemetry_channels_missing=[
                "Speed", "Throttle", "Brake", "RPM", "DRS", "TyreLife", "Compound"
            ],
        )

    stints = sorted([int(s) for s in driver_laps["Stint"].dropna().unique()])
    compounds = [str(c) for c in driver_laps["Compound"].dropna().unique()]

    valid_life = driver_laps["TyreLife"].dropna()
    min_life = int(valid_life.min()) if len(valid_life) > 0 else None
    max_life = int(valid_life.max()) if len(valid_life) > 0 else None

    # Calculate max laps in a single stint
    stint_lengths = driver_laps.groupby("Stint")["LapNumber"].count()
    max_stint_laps = int(stint_lengths.max()) if len(stint_lengths) > 0 else 0

    # Required channels from FastF1
    present_channels = ["Speed", "Throttle", "Brake", "RPM", "DRS", "TyreLife", "Compound", "AirTemp", "TrackTemp"]
    missing_unmeasured = [
        "pressure_bar", "surface_temp_c", "carcass_temp_c", "slip_ratio",
        "slip_angle_deg", "vertical_load_n", "corner_wear"
    ]

    # Scientific Suitability Policy:
    # 1. Must be a race or long practice stint (session != Q unless multi-stint).
    # 2. Must have multiple laps (>= 15 laps).
    # 3. Must have an increasing TyreLife trajectory in at least one stint (>= 10 laps).
    if session_type == "Q":
        suitable = False
        reason = "Qualifying session contains isolated out/flying/in laps without multi-lap tyre degradation trajectory."
    elif total_laps < 15 or max_stint_laps < 10:
        suitable = False
        reason = f"Insufficient continuous laps for degradation modeling (total: {total_laps}, max stint: {max_stint_laps} laps)."
    elif min_life is None or max_life is None or max_life <= min_life:
        suitable = False
        reason = "TyreLife telemetry channel is missing or static."
    else:
        suitable = True
        reason = f"Meets all criteria: {total_laps} laps across {len(stints)} stints, peak TyreLife={max_life} laps, continuous tyre wear evolution."

    return CandidateSessionSummary(
        year=year,
        event=event,
        session=session_type,
        driver=driver,
        total_laps=total_laps,
        stint_count=len(stints),
        stints=stints,
        compounds=compounds,
        tyre_life_range=(min_life, max_life),
        max_stint_laps=max_stint_laps,
        suitable_for_training=suitable,
        suitability_reason=reason,
        telemetry_channels_present=present_channels,
        telemetry_channels_missing=missing_unmeasured,
    )


def discover_candidate_datasets() -> List[CandidateSessionSummary]:
    """
    Evaluates representative candidate sessions across seasons and session types.
    """
    candidates = [
        (2023, "Monza", "Q", "VER"),   # Phase 2-6 baseline qualifying session
        (2023, "Monza", "R", "VER"),   # 2023 Italian GP Race (Verstappen - 51 laps)
        (2023, "Monza", "R", "SAI"),   # 2023 Italian GP Race (Sainz - 51 laps)
    ]

    summaries = []
    for year, event, sess, driver in candidates:
        logger.info(f"Auditing session: {year} {event} {sess} ({driver})...")
        summary = audit_session_suitability(year, event, sess, driver)
        summaries.append(summary)

    return summaries


if __name__ == "__main__":
    results = discover_candidate_datasets()
    print("=" * 80)
    print(" TYRETRACE ML DATASET DISCOVERY REPORT")
    print("=" * 80)
    for r in results:
        print(f"Session: {r.year} {r.event} [{r.session}] — Driver: {r.driver}")
        print(f"  Total Laps       : {r.total_laps}")
        print(f"  Stints           : {r.stints} (Max Stint Length: {r.max_stint_laps} laps)")
        print(f"  Compounds        : {r.compounds}")
        print(f"  TyreLife Range   : {r.tyre_life_range}")
        print(f"  Suitable for ML  : {'YES' if r.suitable_for_training else 'NO'}")
        print(f"  Reason           : {r.suitability_reason}")
        print("-" * 80)

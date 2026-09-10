"""
TYRETRACE — Track Coordinate Mapper (Phase 3)
Connects real Formula 1 telemetry distance and GPS data to the Monza digital twin track geometry.

The primary mapping is distance-along-lap -> 3D position + heading along MONZA_TEST_RACING_LINE,
as established by the Phase 2 TYRETRACE_TRACK_COORDS coordinate system.
An optional 2D affine calibration transform is also provided for raw GPS coordinates.
"""

from __future__ import annotations

import bisect
import json
import logging
import math
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("TyreTraceTrackMapper")

# Default Monza circuit length in meters (matching Phase 2 Blender curve)
MONZA_TRACK_LENGTH_M = 5792.9996


class TelemetryTrackMapper:
    """
    Transforms telemetry data (lap distance, relative distance, GPS) into
    Blender world coordinates, headings, and track deviations.
    """

    def __init__(self, track_file_path: Optional[str] = None):
        self.track_length: float = MONZA_TRACK_LENGTH_M
        self.samples: List[Dict[str, Any]] = []
        self._dists: List[float] = []
        
        # Affine calibration parameters: [M_00, M_01, M_10, M_11], [T_0, T_1]
        self._affine_matrix: Optional[List[List[float]]] = None
        self._affine_translation: Optional[List[float]] = None

        if track_file_path:
            self.load_track_file(track_file_path)
        else:
            # Look for default data file
            default_path = Path(__file__).resolve().parents[2] / "data" / "track" / "monza_racing_line.json"
            if default_path.exists():
                self.load_track_file(str(default_path))
            else:
                self._init_default_polyline()

    def load_track_file(self, path: str) -> None:
        """Loads sampled racing-line polyline table from a JSON file."""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.samples = data
        self._dists = [s["dist"] for s in self.samples]
        if self._dists:
            self.track_length = self._dists[-1]
        logger.info(f"Loaded {len(self.samples)} track points, total length: {self.track_length:.2f}m")

    def _init_default_polyline(self) -> None:
        """Fallback synthetic points if track file is absent."""
        # Minimal Monza-like oval/loop of length 5793m
        num_pts = 100
        step = self.track_length / num_pts
        self.samples = []
        self._dists = []
        for i in range(num_pts + 1):
            d = i * step
            theta = 2.0 * math.pi * (d / self.track_length)
            # Rough Monza footprint (long rectangle with rounded ends)
            x = 1000.0 * math.sin(theta)
            y = 500.0 * math.cos(theta)
            tangent = [math.cos(theta), -math.sin(theta), 0.0]
            normal = [-tangent[1], tangent[0], 0.0]
            self.samples.append({
                "dist": d,
                "pos": [x, y, 0.0],
                "tangent": tangent,
                "left_normal": normal,
            })
            self._dists.append(d)

    def world_transform_at_distance(self, dist_m: float) -> Tuple[Tuple[float, float, float], float]:
        """
        Interpolates 3D position and heading angle (radians) at a given distance along the lap.
        Wraps automatically when distance exceeds track length.
        """
        if not self.samples:
            return (0.0, 0.0, 0.0), 0.0

        d = dist_m % self.track_length
        idx = bisect.bisect_right(self._dists, d) - 1
        idx = max(0, min(idx, len(self.samples) - 2))

        a = self.samples[idx]
        b = self.samples[idx + 1]

        span = (b["dist"] - a["dist"]) or 1e-9
        frac = max(0.0, min(1.0, (d - a["dist"]) / span))

        px = a["pos"][0] + frac * (b["pos"][0] - a["pos"][0])
        py = a["pos"][1] + frac * (b["pos"][1] - a["pos"][1])
        pz = a["pos"][2] + frac * (b["pos"][2] - a["pos"][2])

        tx = a["tangent"][0] + frac * (b["tangent"][0] - a["tangent"][0])
        ty = a["tangent"][1] + frac * (b["tangent"][1] - a["tangent"][1])
        heading = math.atan2(ty, tx)

        return (px, py, pz), heading

    def world_position_at_distance(self, dist_m: float) -> Tuple[float, float, float]:
        """Returns 3D (x, y, z) position in Blender coordinates."""
        pos, _ = self.world_transform_at_distance(dist_m)
        return pos

    def heading_at_distance(self, dist_m: float) -> float:
        """Returns heading tangent in radians (about world Z) at distance."""
        _, heading = self.world_transform_at_distance(dist_m)
        return heading

    def lap_fraction(self, dist_m: float) -> float:
        """Returns normalized lap progress [0.0, 1.0)."""
        return (dist_m % self.track_length) / self.track_length

    def distance_from_position(self, x: float, y: float) -> float:
        """
        Finds the nearest track point to (x, y) with segment projection and returns lap distance in meters.
        """
        if not self.samples:
            return 0.0

        n = len(self.samples)
        best_idx = 0
        best_dist_sq = float("inf")
        for i, s in enumerate(self.samples):
            dx = s["pos"][0] - x
            dy = s["pos"][1] - y
            d_sq = dx * dx + dy * dy
            if d_sq < best_dist_sq:
                best_dist_sq = d_sq
                best_idx = i

        # Project (x, y) onto adjacent segments to find exact fractional distance
        best_d = self.samples[best_idx]["dist"]
        p = (x, y)

        for neighbor_idx in (best_idx - 1, best_idx + 1):
            if neighbor_idx < 0 or neighbor_idx >= n:
                continue
            i0, i1 = min(best_idx, neighbor_idx), max(best_idx, neighbor_idx)
            p0 = self.samples[i0]["pos"]
            p1 = self.samples[i1]["pos"]
            vx, vy = p1[0] - p0[0], p1[1] - p0[1]
            seg_len_sq = vx * vx + vy * vy
            if seg_len_sq < 1e-9:
                continue
            # Project vector (p - p0) onto (p1 - p0)
            u = ((p[0] - p0[0]) * vx + (p[1] - p0[1]) * vy) / seg_len_sq
            u = max(0.0, min(1.0, u))
            proj_x = p0[0] + u * vx
            proj_y = p0[1] + u * vy
            d_proj_sq = (p[0] - proj_x) ** 2 + (p[1] - proj_y) ** 2
            if d_proj_sq < best_dist_sq:
                best_dist_sq = d_proj_sq
                best_d = self.samples[i0]["dist"] + u * (self.samples[i1]["dist"] - self.samples[i0]["dist"])

        return best_d

    def nearest_track_point(self, x: float, y: float) -> Tuple[float, float, float]:
        """Returns the (x, y, z) coordinates of the nearest sampled point on the racing line."""
        track_dist = self.distance_from_position(x, y)
        return self.world_position_at_distance(track_dist)

    def track_error(self, pos: Tuple[float, float, float], track_dist_m: float) -> float:
        """
        Calculates the Euclidean deviation between a 3D position and the racing line at track_dist_m.
        """
        expected_pos = self.world_position_at_distance(track_dist_m)
        dx = pos[0] - expected_pos[0]
        dy = pos[1] - expected_pos[1]
        dz = pos[2] - expected_pos[2]
        return math.sqrt(dx * dx + dy * dy + dz * dz)

    def calibrate(
        self,
        fastf1_positions: List[Tuple[float, float]],
        blender_positions: List[Tuple[float, float]],
    ) -> bool:
        """
        Calibrates a 2D affine transformation from FastF1 coordinates to Blender coordinates.
        (x_b, y_b) = (x_f, y_f) @ M + T
        """
        if len(fastf1_positions) < 3 or len(fastf1_positions) != len(blender_positions):
            return False

        try:
            import numpy as np
            F = np.array(fastf1_positions, dtype=float)
            B = np.array(blender_positions, dtype=float)
            ones = np.ones((len(F), 1))
            A = np.hstack([F, ones])
            params, _, _, _ = np.linalg.lstsq(A, B, rcond=None)
            self._affine_matrix = params[:2, :].tolist()
            self._affine_translation = params[2, :].tolist()
            logger.info("Track mapper calibrated 2D affine transformation successfully.")
            return True
        except Exception as e:
            logger.warning(f"Calibration failed: {e}")
            return False

    def gps_to_blender(self, gps_x: float, gps_y: float) -> Optional[Tuple[float, float]]:
        """Transforms raw GPS (x, y) to Blender (x, y) using calibrated affine transform."""
        if self._affine_matrix is None or self._affine_translation is None:
            return None
        m = self._affine_matrix
        t = self._affine_translation
        bx = gps_x * m[0][0] + gps_y * m[1][0] + t[0]
        by = gps_x * m[0][1] + gps_y * m[1][1] + t[1]
        return (bx, by)

    def map_telemetry_frame(self, frame_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enriches a raw telemetry frame or TelemetryFrame dict with Blender world coordinates.
        Supports both `distance_m` and `relative_distance`.
        """
        rel_dist = frame_data.get("relative_distance")
        dist_m = frame_data.get("distance_m")

        if rel_dist is not None:
            # Map normalized lap fraction to Blender track length
            mapped_dist = float(rel_dist) * self.track_length
        elif dist_m is not None:
            mapped_dist = float(dist_m)
        else:
            mapped_dist = 0.0

        pos, heading = self.world_transform_at_distance(mapped_dist)

        # Check track error if GPS or alternative coordinates are present
        track_error_val = 0.0
        veh = frame_data.get("vehicle", {})
        gx = veh.get("position_x")
        gy = veh.get("position_y")
        if gx is not None and gy is not None and self._affine_matrix is not None:
            cal_pos = self.gps_to_blender(float(gx), float(gy))
            if cal_pos:
                dx = cal_pos[0] - pos[0]
                dy = cal_pos[1] - pos[1]
                track_error_val = round(math.sqrt(dx * dx + dy * dy), 2)

        return {
            "position": [round(pos[0], 3), round(pos[1], 3), round(pos[2], 3)],
            "heading": round(heading, 4),
            "heading_deg": round(math.degrees(heading), 2),
            "track_distance_m": round(mapped_dist, 2),
            "lap_fraction": round(self.lap_fraction(mapped_dist), 4),
            "track_error_m": track_error_val,
        }

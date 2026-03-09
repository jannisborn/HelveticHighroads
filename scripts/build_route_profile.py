#!/usr/bin/env python3
"""Build a simplified route-profile JSON from the shared Komoot tour."""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

COUNTRY_CODE_TO_NAME = {
    "AT": "Austria",
    "CH": "Switzerland",
    "DE": "Germany",
    "FR": "France",
    "IT": "Italy",
    "LI": "Liechtenstein",
}
GEOADMIN_CANTON_LAYER = "ch.swisstopo.swissboundaries3d-kanton-flaeche.fill"


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description=(
            "Fetch the shared Komoot tour and build data/route-profile.json for the website."
        )
    )
    parser.add_argument(
        "--project",
        type=Path,
        default=repo_root / "data" / "project.json",
        help="Path to project.json (default: data/project.json).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=repo_root / "data" / "route-profile.json",
        help="Output path for the generated route profile JSON.",
    )
    parser.add_argument(
        "--country-crossings",
        type=Path,
        default=repo_root / "data" / "country-crossings.json",
        help="Optional path to the static country-crossing anchor data.",
    )
    parser.add_argument(
        "--sample-distance-m",
        type=float,
        default=250.0,
        help="Distance interval between profile samples (default: 250m).",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=30,
        help="HTTP timeout for Komoot requests (default: 30s).",
    )
    return parser.parse_args()


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def request_json(url: str, *, timeout_seconds: int) -> Any:
    request = Request(
        url,
        headers={
            "User-Agent": "HelveticHighroads/1.0 (+https://www.komoot.com)",
        },
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} for {url}: {body[:300]}") from error
    except URLError as error:
        raise RuntimeError(f"Network error for {url}: {error}") from error

    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON response from {url}: {raw[:300]}") from error


def parse_komoot_tour_url(tour_url: str) -> Tuple[int, Optional[str]]:
    parsed = urlparse(tour_url)
    path_parts = parsed.path.strip("/").split("/")
    if len(path_parts) < 2 or path_parts[-2] != "tour":
        raise ValueError(f"Unsupported Komoot tour URL: {tour_url}")

    try:
        tour_id = int(path_parts[-1])
    except ValueError as error:
        raise ValueError(f"Could not parse Komoot tour ID from {tour_url}") from error

    share_token = parse_qs(parsed.query).get("share_token", [None])[0]

    return tour_id, share_token


def build_komoot_url(tour_id: int, *, share_token: Optional[str], suffix: str = "") -> str:
    base = f"https://api.komoot.de/v007/tours/{tour_id}"
    if suffix:
        base = f"{base}/{suffix.lstrip('/')}"

    if not share_token:
        return base

    return f"{base}?{urlencode({'share_token': share_token})}"


def haversine_distance_m(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    earth_radius_m = 6_371_000.0
    lat1 = math.radians(a_lat)
    lat2 = math.radians(b_lat)
    delta_lat = math.radians(b_lat - a_lat)
    delta_lng = math.radians(b_lng - a_lng)

    sin_lat = math.sin(delta_lat / 2.0)
    sin_lng = math.sin(delta_lng / 2.0)
    h = sin_lat * sin_lat + math.cos(lat1) * math.cos(lat2) * sin_lng * sin_lng
    return 2.0 * earth_radius_m * math.asin(math.sqrt(h))


def build_scaled_distances(
    coordinates: List[Dict[str, Any]], *, target_distance_m: float
) -> Tuple[List[float], float]:
    if not coordinates:
        return [], 0.0

    raw_cumulative = [0.0]
    total_raw_distance_m = 0.0

    for prev, current in zip(coordinates, coordinates[1:]):
        segment_distance_m = haversine_distance_m(
            float(prev["lat"]),
            float(prev["lng"]),
            float(current["lat"]),
            float(current["lng"]),
        )
        total_raw_distance_m += segment_distance_m
        raw_cumulative.append(total_raw_distance_m)

    if total_raw_distance_m <= 0:
        return [0.0 for _ in coordinates], 0.0

    distance_scale = target_distance_m / total_raw_distance_m
    scaled = [distance_m * distance_scale for distance_m in raw_cumulative]
    scaled[-1] = target_distance_m
    return scaled, total_raw_distance_m


def iter_sample_distances(total_distance_m: float, sample_distance_m: float) -> Iterable[float]:
    if total_distance_m <= 0:
        yield 0.0
        return

    distance_m = 0.0
    while distance_m < total_distance_m:
        yield distance_m
        distance_m += sample_distance_m
    yield total_distance_m


def sample_profile(
    coordinates: List[Dict[str, Any]],
    scaled_distances_m: List[float],
    *,
    sample_distance_m: float,
) -> List[Dict[str, Any]]:
    if not coordinates:
        return []

    total_distance_m = scaled_distances_m[-1]
    samples: List[Dict[str, Any]] = []
    point_idx = 1

    for target_distance_m in iter_sample_distances(total_distance_m, sample_distance_m):
        while (
            point_idx < len(scaled_distances_m) - 1
            and scaled_distances_m[point_idx] < target_distance_m
        ):
            point_idx += 1

        left_idx = max(point_idx - 1, 0)
        right_idx = point_idx
        left_distance_m = scaled_distances_m[left_idx]
        right_distance_m = scaled_distances_m[right_idx]

        left_altitude_m = float(coordinates[left_idx]["alt"])
        right_altitude_m = float(coordinates[right_idx]["alt"])

        if right_distance_m <= left_distance_m:
            altitude_m = right_altitude_m
        else:
            fraction = (target_distance_m - left_distance_m) / (right_distance_m - left_distance_m)
            altitude_m = left_altitude_m + (right_altitude_m - left_altitude_m) * fraction

        samples.append(
            {
                "km": round(target_distance_m / 1000.0, 3),
                "elevationM": round(altitude_m, 1),
            }
        )

    return samples


def build_waypoints(
    path_items: List[Dict[str, Any]],
    scaled_distances_m: List[float],
    coordinates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    waypoints: List[Dict[str, Any]] = []
    max_index = len(scaled_distances_m) - 1

    for item in path_items:
        location = item.get("location") or {}
        source_index = int(item.get("index") or 0)
        if source_index < 0 or source_index > max_index:
            continue

        waypoint = {
            "sourceIndex": source_index,
            "km": round(scaled_distances_m[source_index] / 1000.0, 3),
            "lat": round(float(location.get("lat")), 6),
            "lng": round(float(location.get("lng")), 6),
            "elevationM": round(float(coordinates[source_index]["alt"]), 1),
        }
        reference = item.get("reference")
        if isinstance(reference, str) and reference:
            waypoint["reference"] = reference

        waypoints.append(waypoint)

    return waypoints


def build_route_segments(
    segments: List[Dict[str, Any]], scaled_distances_m: List[float]
) -> List[Dict[str, Any]]:
    route_segments: List[Dict[str, Any]] = []
    max_index = len(scaled_distances_m) - 1

    for segment in segments:
        from_index = int(segment.get("from") or 0)
        to_index = int(segment.get("to") or 0)
        if from_index < 0 or to_index < 0 or from_index > max_index or to_index > max_index:
            continue

        route_segments.append(
            {
                "type": str(segment.get("type") or "Unknown"),
                "fromIndex": from_index,
                "toIndex": to_index,
                "fromKm": round(scaled_distances_m[from_index] / 1000.0, 3),
                "toKm": round(scaled_distances_m[to_index] / 1000.0, 3),
            }
        )

    return route_segments


def normalize_country_code(value: Any) -> str:
    return str(value or "").strip().upper()


def read_country_crossings(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}

    payload = read_json(path)
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object.")

    crossings = payload.get("crossings")
    if crossings is not None and not isinstance(crossings, list):
        raise ValueError(f"{path} must contain a 'crossings' array.")

    return payload


def find_nearest_coordinate_index(
    *,
    lat: float,
    lng: float,
    coordinates: List[Dict[str, Any]],
    scaled_distances_m: Optional[List[float]] = None,
    approx_km: Optional[float] = None,
    approx_window_km: float = 10.0,
) -> int:
    best_index = 0
    best_distance_m = math.inf
    start_index = 0
    end_index = len(coordinates) - 1

    if (
        approx_km is not None
        and scaled_distances_m
        and len(scaled_distances_m) == len(coordinates)
        and approx_window_km > 0
    ):
        target_distance_m = approx_km * 1000.0
        min_distance_m = max(0.0, target_distance_m - approx_window_km * 1000.0)
        max_distance_m = target_distance_m + approx_window_km * 1000.0

        start_index = next(
            (
                index
                for index, distance_m in enumerate(scaled_distances_m)
                if distance_m >= min_distance_m
            ),
            0,
        )
        end_index = next(
            (
                index
                for index, distance_m in enumerate(scaled_distances_m[start_index:], start_index)
                if distance_m > max_distance_m
            ),
            len(coordinates),
        ) - 1

    for index in range(start_index, end_index + 1):
        coordinate = coordinates[index]
        distance_m = haversine_distance_m(
            lat,
            lng,
            float(coordinate["lat"]),
            float(coordinate["lng"]),
        )
        if distance_m < best_distance_m:
            best_distance_m = distance_m
            best_index = index

    return best_index


def build_country_sections(
    country_crossings_payload: Dict[str, Any],
    *,
    coordinates: List[Dict[str, Any]],
    scaled_distances_m: List[float],
    timeout_seconds: int,
) -> List[Dict[str, Any]]:
    crossings = country_crossings_payload.get("crossings")
    if not isinstance(crossings, list) or not crossings:
        return []

    start_country_code = normalize_country_code(
        country_crossings_payload.get("startCountryCode")
    )
    if not start_country_code:
        raise ValueError("country-crossings.json is missing startCountryCode.")

    total_distance_km = round(scaled_distances_m[-1] / 1000.0, 3) if scaled_distances_m else 0.0
    resolved_crossings: List[Dict[str, Any]] = []
    swiss_membership_cache: Dict[int, bool] = {}

    def is_swiss_at_km(target_km: float) -> bool:
        clamped_km = max(0.0, min(total_distance_km, target_km))
        cache_key = int(round(clamped_km * 1000.0))
        if cache_key in swiss_membership_cache:
            return swiss_membership_cache[cache_key]

        point = point_at_distance(
            coordinates,
            scaled_distances_m,
            target_distance_m=clamped_km * 1000.0,
        )
        swiss_membership_cache[cache_key] = (
            lookup_swiss_canton(
                lat=point["lat"],
                lng=point["lng"],
                timeout_seconds=timeout_seconds,
            )
            is not None
        )
        return swiss_membership_cache[cache_key]

    def refine_swiss_transition_km(
        crossing_km: float,
        *,
        entering_switzerland: bool,
        search_window_km: float = 4.0,
        coarse_step_km: float = 0.75,
    ) -> float:
        if total_distance_km <= 0:
            return round(crossing_km, 3)

        start_km = max(0.0, crossing_km - search_window_km)
        end_km = min(total_distance_km, crossing_km + search_window_km)
        probe_kms: List[float] = []
        probe_km = start_km
        while probe_km < end_km:
            probe_kms.append(round(probe_km, 3))
            probe_km += coarse_step_km
        probe_kms.extend([round(crossing_km, 3), round(end_km, 3)])
        probe_kms = sorted(set(probe_kms))

        expected_left_is_swiss = not entering_switzerland
        expected_right_is_swiss = entering_switzerland
        best_pair: Optional[Tuple[float, float]] = None
        best_pair_delta = math.inf

        for left_km, right_km in zip(probe_kms, probe_kms[1:]):
            left_is_swiss = is_swiss_at_km(left_km)
            right_is_swiss = is_swiss_at_km(right_km)
            if (
                left_is_swiss == expected_left_is_swiss
                and right_is_swiss == expected_right_is_swiss
            ):
                pair_midpoint = (left_km + right_km) / 2.0
                pair_delta = abs(pair_midpoint - crossing_km)
                if pair_delta < best_pair_delta:
                    best_pair = (left_km, right_km)
                    best_pair_delta = pair_delta

        if not best_pair:
            return round(crossing_km, 3)

        low_km, high_km = best_pair
        for _ in range(15):
            if high_km - low_km <= 0.02:
                break

            mid_km = (low_km + high_km) / 2.0
            mid_is_swiss = is_swiss_at_km(mid_km)
            if entering_switzerland:
                if mid_is_swiss:
                    high_km = mid_km
                else:
                    low_km = mid_km
            else:
                if mid_is_swiss:
                    low_km = mid_km
                else:
                    high_km = mid_km

        return round((low_km + high_km) / 2.0, 3)

    for crossing in crossings:
        if not isinstance(crossing, dict):
            continue

        from_country_code = normalize_country_code(crossing.get("fromCountryCode"))
        to_country_code = normalize_country_code(crossing.get("toCountryCode"))
        if not from_country_code or not to_country_code:
            raise ValueError("Each crossing must include fromCountryCode and toCountryCode.")

        lat = float(crossing.get("lat"))
        lng = float(crossing.get("lng"))
        approx_km_raw = crossing.get("approxKm")
        approx_km = float(approx_km_raw) if approx_km_raw is not None else None
        source_index = find_nearest_coordinate_index(
            lat=lat,
            lng=lng,
            coordinates=coordinates,
            scaled_distances_m=scaled_distances_m,
            approx_km=approx_km,
            approx_window_km=0.0,
        )
        crossing_km = round(scaled_distances_m[source_index] / 1000.0, 3)
        if from_country_code == "CH" or to_country_code == "CH":
            crossing_km = refine_swiss_transition_km(
                crossing_km,
                entering_switzerland=to_country_code == "CH",
            )
        resolved_crossings.append(
            {
                "fromCountryCode": from_country_code,
                "toCountryCode": to_country_code,
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "km": crossing_km,
            }
        )

    resolved_crossings.sort(key=lambda item: item["km"])
    current_country_code = start_country_code
    current_start_km = 0.0
    sections: List[Dict[str, Any]] = []

    for crossing in resolved_crossings:
        if crossing["fromCountryCode"] != current_country_code:
            raise ValueError(
                "Country crossings are out of sequence: "
                f"expected {current_country_code}, got {crossing['fromCountryCode']}."
            )

        crossing_km = max(current_start_km, min(total_distance_km, float(crossing["km"])))
        sections.append(
            {
                "countryCode": current_country_code,
                "countryName": COUNTRY_CODE_TO_NAME.get(
                    current_country_code, current_country_code
                ),
                "startKm": round(current_start_km, 3),
                "endKm": round(crossing_km, 3),
            }
        )
        current_country_code = crossing["toCountryCode"]
        current_start_km = crossing_km

    sections.append(
        {
            "countryCode": current_country_code,
            "countryName": COUNTRY_CODE_TO_NAME.get(
                current_country_code, current_country_code
            ),
            "startKm": round(current_start_km, 3),
            "endKm": round(total_distance_km, 3),
        }
    )

    return sections


def point_at_distance(
    coordinates: List[Dict[str, Any]],
    scaled_distances_m: List[float],
    *,
    target_distance_m: float,
) -> Dict[str, float]:
    if not coordinates or not scaled_distances_m:
        raise ValueError("Route coordinates are required to interpolate a point.")

    clamped_distance_m = max(0.0, min(target_distance_m, scaled_distances_m[-1]))
    point_index = 1

    while (
        point_index < len(scaled_distances_m) - 1
        and scaled_distances_m[point_index] < clamped_distance_m
    ):
        point_index += 1

    left_index = max(point_index - 1, 0)
    right_index = point_index
    left_distance_m = scaled_distances_m[left_index]
    right_distance_m = scaled_distances_m[right_index]
    left = coordinates[left_index]
    right = coordinates[right_index]

    if right_distance_m <= left_distance_m:
        lat = float(right["lat"])
        lng = float(right["lng"])
    else:
        fraction = (clamped_distance_m - left_distance_m) / (
            right_distance_m - left_distance_m
        )
        lat = float(left["lat"]) + (float(right["lat"]) - float(left["lat"])) * fraction
        lng = float(left["lng"]) + (float(right["lng"]) - float(left["lng"])) * fraction

    return {"lat": lat, "lng": lng}


def lookup_swiss_canton(
    *,
    lat: float,
    lng: float,
    timeout_seconds: int,
) -> Optional[Dict[str, str]]:
    params = urlencode(
        {
            "geometryType": "esriGeometryPoint",
            "geometry": f"{lng},{lat}",
            "sr": "4326",
            "layers": f"all:{GEOADMIN_CANTON_LAYER}",
            "imageDisplay": "0,0,0",
            "mapExtent": "0,0,0,0",
            "tolerance": "0",
            "returnGeometry": "false",
            "lang": "en",
        }
    )
    payload = request_json(
        f"https://api3.geo.admin.ch/rest/services/api/MapServer/identify?{params}",
        timeout_seconds=timeout_seconds,
    )
    if not isinstance(payload, dict):
        return None

    results = payload.get("results")
    if not isinstance(results, list) or not results:
        return None

    attributes = results[0].get("attributes")
    if not isinstance(attributes, dict):
        return None

    canton_code = normalize_country_code(attributes.get("ak"))
    if not canton_code:
        return None

    canton_name = str(attributes.get("name") or attributes.get("label") or canton_code)
    return {"cantonCode": canton_code, "cantonName": canton_name}


def build_canton_sections(
    country_sections: List[Dict[str, Any]],
    *,
    waypoints: List[Dict[str, Any]],
    coordinates: List[Dict[str, Any]],
    scaled_distances_m: List[float],
    timeout_seconds: int,
) -> List[Dict[str, Any]]:
    if not country_sections:
        return []

    cache_by_key: Dict[Tuple[str, int], Optional[Dict[str, str]]] = {}
    probe_spacing_km = 3.0

    def lookup_canton_at_km(target_km: float) -> Optional[Dict[str, str]]:
        key = ("km", int(round(target_km * 1000)))
        if key in cache_by_key:
            return cache_by_key[key]

        point = point_at_distance(
            coordinates,
            scaled_distances_m,
            target_distance_m=target_km * 1000.0,
        )
        result = lookup_swiss_canton(
            lat=point["lat"],
            lng=point["lng"],
            timeout_seconds=timeout_seconds,
        )
        cache_by_key[key] = result
        return result

    def lookup_canton_near_km(
        target_km: float,
        *,
        section_start_km: float,
        section_end_km: float,
    ) -> Optional[Dict[str, Any]]:
        offsets_km = (0.0, -0.05, 0.05, -0.15, 0.15, -0.35, 0.35, -0.75, 0.75, -1.5, 1.5)

        for offset_km in offsets_km:
            probe_km = max(
                section_start_km,
                min(section_end_km, target_km + offset_km),
            )
            result = lookup_canton_at_km(probe_km)
            if result:
                return {"km": round(target_km, 3), "probeKm": round(probe_km, 3), **result}

        return None

    def find_canton_boundary(
        *,
        start_km: float,
        start_code: str,
        end_km: float,
        end_code: str,
    ) -> float:
        low_km = start_km
        high_km = end_km

        for _ in range(14):
            if high_km - low_km <= 0.1:
                break

            mid_km = (low_km + high_km) / 2.0
            midpoint_canton = lookup_canton_at_km(mid_km)
            midpoint_code = (
                normalize_country_code(midpoint_canton.get("cantonCode"))
                if midpoint_canton
                else ""
            )
            if midpoint_code == start_code:
                low_km = mid_km
            elif midpoint_code == end_code:
                high_km = mid_km
            else:
                # If a third canton appears in-between, keep the split conservative.
                high_km = mid_km

        return round(high_km, 3)

    canton_sections: List[Dict[str, Any]] = []
    waypoint_km_entries = [
        {**waypoint, "km": float(waypoint["km"])}
        for waypoint in waypoints
        if "km" in waypoint and "lat" in waypoint and "lng" in waypoint
    ]

    for country_section in country_sections:
        section_start_km = float(country_section["startKm"])
        section_end_km = float(country_section["endKm"])
        country_code = normalize_country_code(country_section.get("countryCode"))

        if country_code != "CH":
            canton_sections.append(
                {
                    "type": "external",
                    "countryCode": country_code,
                    "startKm": round(section_start_km, 3),
                    "endKm": round(section_end_km, 3),
                }
            )
            continue

        anchor_kms = {
            round(
                min(section_end_km, section_start_km + min(0.05, max(0.0, section_end_km - section_start_km))),
                3,
            ),
            round(
                max(section_start_km, section_end_km - min(0.05, max(0.0, section_end_km - section_start_km))),
                3,
            ),
        }

        probe_km = section_start_km + probe_spacing_km
        while probe_km < section_end_km:
            anchor_kms.add(round(probe_km, 3))
            probe_km += probe_spacing_km

        for waypoint in waypoint_km_entries:
            waypoint_km = float(waypoint["km"])
            if section_start_km < waypoint_km < section_end_km:
                anchor_kms.add(round(waypoint_km, 3))

        anchors = [
            resolved_anchor
            for resolved_anchor in (
                lookup_canton_near_km(
                    anchor_km,
                    section_start_km=section_start_km,
                    section_end_km=section_end_km,
                )
                for anchor_km in sorted(anchor_kms)
            )
            if resolved_anchor
        ]
        if not anchors:
            continue

        compressed_anchors: List[Dict[str, Any]] = []
        for anchor in anchors:
            canton_code = normalize_country_code(anchor.get("cantonCode"))
            if not canton_code:
                continue

            if compressed_anchors and compressed_anchors[-1]["cantonCode"] == canton_code:
                compressed_anchors[-1] = {
                    **anchor,
                    "runStartKm": compressed_anchors[-1].get("runStartKm", compressed_anchors[-1]["km"]),
                }
            else:
                compressed_anchors.append({**anchor, "runStartKm": anchor["km"]})

        if not compressed_anchors:
            continue

        current_start_km = round(section_start_km, 3)
        for current_anchor, next_anchor in zip(
            compressed_anchors, compressed_anchors[1:]
        ):
            current_code = normalize_country_code(current_anchor["cantonCode"])
            next_code = normalize_country_code(next_anchor["cantonCode"])
            if current_code == next_code:
                continue

            boundary_km = find_canton_boundary(
                start_km=float(current_anchor["km"]),
                start_code=current_code,
                end_km=float(next_anchor["km"]),
                end_code=next_code,
            )
            canton_sections.append(
                {
                    "type": "canton",
                    "countryCode": "CH",
                    "cantonCode": current_code,
                    "cantonName": str(current_anchor["cantonName"]),
                    "startKm": round(current_start_km, 3),
                    "endKm": round(boundary_km, 3),
                }
            )
            current_start_km = boundary_km

        final_anchor = compressed_anchors[-1]
        canton_sections.append(
            {
                "type": "canton",
                "countryCode": "CH",
                "cantonCode": normalize_country_code(final_anchor["cantonCode"]),
                "cantonName": str(final_anchor["cantonName"]),
                "startKm": round(current_start_km, 3),
                "endKm": round(section_end_km, 3),
            }
        )

    return smooth_canton_sections(canton_sections)


def smooth_canton_sections(
    sections: List[Dict[str, Any]],
    *,
    min_sliver_km: float = 0.75,
) -> List[Dict[str, Any]]:
    if not sections:
        return []

    smoothed: List[Dict[str, Any]] = []
    index = 0

    while index < len(sections):
        current = sections[index]

        if smoothed and index + 1 < len(sections):
            previous = smoothed[-1]
            following = sections[index + 1]
            current_length_km = float(current["endKm"]) - float(current["startKm"])

            if (
                current.get("type") == "canton"
                and previous.get("type") == "canton"
                and following.get("type") == "canton"
                and normalize_country_code(previous.get("countryCode")) == "CH"
                and normalize_country_code(current.get("countryCode")) == "CH"
                and normalize_country_code(following.get("countryCode")) == "CH"
                and normalize_country_code(previous.get("cantonCode"))
                == normalize_country_code(following.get("cantonCode"))
                and current_length_km <= min_sliver_km
            ):
                smoothed[-1] = {
                    **previous,
                    "endKm": round(float(following["endKm"]), 3),
                }
                index += 2
                continue

        if smoothed:
            previous = smoothed[-1]
            if (
                current.get("type") == previous.get("type")
                and normalize_country_code(current.get("countryCode"))
                == normalize_country_code(previous.get("countryCode"))
                and normalize_country_code(current.get("cantonCode"))
                == normalize_country_code(previous.get("cantonCode"))
            ):
                smoothed[-1] = {
                    **previous,
                    "endKm": round(float(current["endKm"]), 3),
                }
                index += 1
                continue

        smoothed.append(current)
        index += 1

    return smoothed


def project_data_matches_route(project: Dict[str, Any], tour: Dict[str, Any]) -> bool:
    project_distance_m = float(project.get("totalDistanceKm") or 0.0) * 1000.0
    project_elevation_m = float(project.get("totalElevationM") or 0.0)
    tour_distance_m = float(tour.get("distance") or 0.0)
    tour_elevation_m = float(tour.get("elevation_up") or 0.0)

    return (
        math.isclose(project_distance_m, tour_distance_m, rel_tol=0.0, abs_tol=5.0)
        and math.isclose(project_elevation_m, tour_elevation_m, rel_tol=0.0, abs_tol=5.0)
    )


def iso_now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def main() -> int:
    args = parse_args()
    project = read_json(args.project)
    country_crossings_payload = read_country_crossings(args.country_crossings)
    if not isinstance(project, dict):
        raise ValueError(f"{args.project} must contain a JSON object.")

    tour_url = str(project.get("komootTourUrl") or "").strip()
    if not tour_url:
        raise ValueError(f"{args.project} is missing komootTourUrl.")

    if args.sample_distance_m <= 0:
        raise ValueError("--sample-distance-m must be greater than zero.")

    tour_id, share_token = parse_komoot_tour_url(tour_url)
    tour = request_json(
        build_komoot_url(tour_id, share_token=share_token),
        timeout_seconds=args.timeout_seconds,
    )
    coordinates_payload = request_json(
        build_komoot_url(tour_id, share_token=share_token, suffix="coordinates"),
        timeout_seconds=args.timeout_seconds,
    )

    if not isinstance(tour, dict):
        raise RuntimeError("Unexpected Komoot tour payload.")
    if not isinstance(coordinates_payload, dict):
        raise RuntimeError("Unexpected Komoot coordinates payload.")

    coordinates = coordinates_payload.get("items")
    if not isinstance(coordinates, list) or not coordinates:
        raise RuntimeError("Komoot coordinates payload did not include any items.")

    if not project_data_matches_route(project, tour):
        print(
            "Warning: project totals do not exactly match the Komoot tour totals. "
            "Using Komoot as the source of truth.",
        )

    total_distance_m = float(tour.get("distance") or 0.0)
    total_elevation_m = float(tour.get("elevation_up") or 0.0)
    total_duration_s = float(tour.get("duration") or 0.0)

    scaled_distances_m, raw_distance_m = build_scaled_distances(
        coordinates, target_distance_m=total_distance_m
    )
    samples = sample_profile(
        coordinates,
        scaled_distances_m,
        sample_distance_m=args.sample_distance_m,
    )

    elevations = [float(point["alt"]) for point in coordinates]
    path_items = tour.get("path")
    segments = tour.get("segments")

    waypoints_payload = build_waypoints(
        path_items if isinstance(path_items, list) else [],
        scaled_distances_m,
        coordinates,
    )
    route_segments_payload = build_route_segments(
        segments if isinstance(segments, list) else [],
        scaled_distances_m,
    )
    country_sections_payload = build_country_sections(
        country_crossings_payload,
        coordinates=coordinates,
        scaled_distances_m=scaled_distances_m,
        timeout_seconds=args.timeout_seconds,
    )

    payload = {
        "meta": {
            "generatedAt": iso_now_utc(),
            "source": "komoot",
            "tourId": tour_id,
            "tourName": str(tour.get("name") or ""),
            "tourChangedAt": tour.get("changed_at"),
            "tourDistanceKm": round(total_distance_m / 1000.0, 3),
            "tourElevationM": round(total_elevation_m, 1),
            "tourDurationH": round(total_duration_s / 3600.0, 2),
            "sampleDistanceM": round(args.sample_distance_m, 3),
            "pointCount": len(coordinates),
            "sampleCount": len(samples),
            "minElevationM": round(min(elevations), 1),
            "maxElevationM": round(max(elevations), 1),
            "rawCoordinateDistanceKm": round(raw_distance_m / 1000.0, 3),
        },
        "samples": samples,
        "waypoints": waypoints_payload,
        "routeSegments": route_segments_payload,
        "countrySections": country_sections_payload,
        "cantonSections": build_canton_sections(
            country_sections_payload,
            waypoints=waypoints_payload,
            coordinates=coordinates,
            scaled_distances_m=scaled_distances_m,
            timeout_seconds=args.timeout_seconds,
        ),
    }

    write_json(args.output, payload)
    print(f"Wrote {args.output}")
    print(
        f"Tour: {payload['meta']['tourDistanceKm']} km, "
        f"{payload['meta']['tourElevationM']} m, "
        f"{payload['meta']['pointCount']} raw points -> "
        f"{payload['meta']['sampleCount']} samples",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

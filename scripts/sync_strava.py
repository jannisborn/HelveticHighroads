#!/usr/bin/env python3
"""Sync Strava activities into Helvetic Highroads JSON data files."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

try:
    from tqdm import tqdm as _tqdm

    HAS_TQDM = True
except ImportError:  # pragma: no cover - fallback for environments without tqdm
    HAS_TQDM = False

AUTH_URL = "https://www.strava.com/oauth/token"
ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
ACTIVITY_DETAIL_URL = "https://www.strava.com/api/v3/activities/{}"
ACTIVITY_WEB_URL = "https://www.strava.com/activities/{}"

COUNTRY_ALIAS_MAP: Dict[str, List[str]] = {
    "Germany": ["Deutschland"],
    "Switzerland": ["Schweiz", "Suisse", "Svizzera"],
    "France": ["Frankreich"],
    "Italy": ["Italien", "Italia"],
    "Austria": ["Osterreich", "Österreich"],
    "Liechtenstein": [],
}

CANTON_NORMALIZED_ALIAS_MAP: Dict[str, List[str]] = {
    "zurich": ["Zurich", "Zuerich"],
    "geneve": ["Geneva", "Genf", "Geneve"],
    "basel stadt": ["Basel-Stadt", "Basel Stadt"],
    "basel land": ["Basel-Landschaft", "Baselland"],
    "st gallen": ["St. Gallen", "St Gallen", "Sankt Gallen"],
    "ticino": ["Tessin"],
    "graubunden": ["Graubunden", "Grisons", "Grigioni"],
    "appenzell innerrhoden": ["Appenzell AI"],
    "appenzell ausserrhoden": ["Appenzell AR", "Appenzell Außerrhoden"],
}


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description=(
            "Fetch recent Strava activities and update Helvetic Highroads data files.\n"
            "Only ride activities whose title contains the configured tag words are considered."
        )
    )
    parser.add_argument(
        "--credentials",
        type=Path,
        default=repo_root / "secret.json",
        help="Path to credentials JSON with client_id, client_secret, refresh_token.",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=repo_root / "data",
        help="Path to website data directory.",
    )
    parser.add_argument(
        "--prefix",
        default="Helvetic Highroads",
        help='Activity title tag words to match (default: "Helvetic Highroads").',
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=5,
        help="Maximum Strava activity pages to fetch (200 activities/page).",
    )
    parser.add_argument(
        "--sync-overlap-seconds",
        type=int,
        default=86400,
        help="Overlap window added to the previous sync checkpoint (default: 86400 = 24h).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned changes but do not write files.",
    )
    parser.add_argument(
        "--no-write-refresh-token",
        action="store_true",
        help="Do not persist rotated refresh token back to credentials file.",
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


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    query: Optional[Dict[str, Any]] = None,
    form: Optional[Dict[str, Any]] = None,
    timeout_seconds: int = 30,
) -> Any:
    full_url = url
    if query:
        full_url = f"{full_url}?{urlencode(query)}"

    data = urlencode(form).encode("utf-8") if form else None
    request = Request(full_url, data=data, method=method, headers=headers or {})

    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} for {full_url}: {body}") from error
    except URLError as error:
        raise RuntimeError(f"Network error for {full_url}: {error}") from error

    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON response from {full_url}: {raw[:300]}") from error


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def to_unix_timestamp(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp())


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return value.strip()


def activity_datetime(activity: Dict[str, Any]) -> Optional[datetime]:
    return parse_iso_datetime(activity.get("start_date_local") or activity.get("start_date"))


def activity_is_ride(activity: Dict[str, Any]) -> bool:
    for key in ("sport_type", "type"):
        raw = activity.get(key)
        if not isinstance(raw, str):
            continue
        normalized = raw.strip().lower()
        if normalized.endswith("ride"):
            return True
    return False


def progress_iter(items: Iterable[Any], *, desc: str, unit: str) -> Iterator[Any]:
    items_list = list(items)
    if HAS_TQDM:
        return _tqdm(
            items_list,
            desc=desc,
            unit=unit,
            leave=True,
            dynamic_ncols=True,
            disable=False,
        )

    total = len(items_list)
    if total == 0:
        print(f"{desc}: 0/0 {unit}", file=sys.stderr)
        return iter(())

    def _iter() -> Iterator[Any]:
        for idx, item in enumerate(items_list, start=1):
            print(f"\r{desc}: {idx}/{total} {unit}", end="", file=sys.stderr, flush=True)
            yield item
        print(file=sys.stderr)

    return _iter()


def refresh_access_token(credentials: Dict[str, Any]) -> Dict[str, Any]:
    required = ("client_id", "client_secret", "refresh_token")
    missing = [key for key in required if key not in credentials]
    if missing:
        raise ValueError(f"Credentials missing keys: {', '.join(missing)}")

    payload = {
        "client_id": credentials["client_id"],
        "client_secret": credentials["client_secret"],
        "refresh_token": credentials["refresh_token"],
        "grant_type": "refresh_token",
    }
    response = request_json(AUTH_URL, method="POST", form=payload)
    if "access_token" not in response:
        raise RuntimeError(f"Unexpected Strava auth response: {response}")
    return response


def fetch_activities(access_token: str, *, after_epoch: Optional[int], max_pages: int) -> List[Dict[str, Any]]:
    activities: List[Dict[str, Any]] = []
    headers = {"Authorization": f"Bearer {access_token}"}

    for page in range(1, max_pages + 1):
        params: Dict[str, Any] = {"per_page": 200, "page": page}
        if after_epoch is not None:
            params["after"] = after_epoch

        page_data = request_json(ACTIVITIES_URL, headers=headers, query=params)
        if not isinstance(page_data, list):
            raise RuntimeError(f"Unexpected activities payload type: {type(page_data)}")

        if not page_data:
            break
        activities.extend(page_data)

        if len(page_data) < 200:
            break

    return activities


def fetch_activity_detail(access_token: str, activity_id: int) -> Dict[str, Any]:
    headers = {"Authorization": f"Bearer {access_token}"}
    payload = request_json(ACTIVITY_DETAIL_URL.format(activity_id), headers=headers)
    if not isinstance(payload, dict):
        raise RuntimeError(f"Unexpected activity detail payload type: {type(payload)}")
    return payload


def enrich_activities_with_details(access_token: str, activities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    enriched: List[Dict[str, Any]] = []
    for activity in progress_iter(activities, desc="Fetching activity details", unit="activity"):
        raw_id = activity.get("id")
        if raw_id is None:
            enriched.append(activity)
            continue

        try:
            detail = fetch_activity_detail(access_token, int(raw_id))
        except Exception as error:  # noqa: BLE001
            print(
                f"Warning: could not fetch full details for activity {raw_id}: {error}",
                file=sys.stderr,
            )
            enriched.append(activity)
            continue

        merged = deepcopy(activity)
        merged.update(detail)
        enriched.append(merged)

    return enriched


def fetch_activities_by_id(access_token: str, activity_ids: List[int]) -> List[Dict[str, Any]]:
    activities: List[Dict[str, Any]] = []
    for activity_id in progress_iter(activity_ids, desc="Refreshing known rides", unit="ride"):
        try:
            detail = fetch_activity_detail(access_token, activity_id)
        except Exception as error:  # noqa: BLE001
            print(
                f"Warning: could not refresh known activity {activity_id}: {error}",
                file=sys.stderr,
            )
            continue
        activities.append(detail)
    return activities


def infer_after_epoch(state: Dict[str, Any], overlap_seconds: int) -> Optional[int]:
    raw_after = state.get("lastFetchedAfterEpoch")
    if isinstance(raw_after, int):
        return max(0, raw_after - overlap_seconds)

    raw_last_sync = state.get("lastStravaSyncAt")
    dt = parse_iso_datetime(raw_last_sync if isinstance(raw_last_sync, str) else None)
    if dt is None:
        return None
    return max(0, to_unix_timestamp(dt) - overlap_seconds)


def extract_activity_id_from_ride(ride: Dict[str, Any]) -> Optional[int]:
    raw_id = ride.get("stravaActivityId")
    if isinstance(raw_id, int):
        return raw_id
    if isinstance(raw_id, str) and raw_id.isdigit():
        return int(raw_id)

    url = ride.get("stravaUrl")
    if not isinstance(url, str):
        return None

    path = urlparse(url).path
    match = re.search(r"/activities/(\d+)", path)
    if not match:
        return None
    return int(match.group(1))


def extract_existing_ride_ids(rides: List[Dict[str, Any]]) -> List[int]:
    ids: List[int] = []
    seen = set()
    for ride in rides:
        ride_id = extract_activity_id_from_ride(ride)
        if ride_id is None or ride_id in seen:
            continue
        ids.append(ride_id)
        seen.add(ride_id)
    return ids


def dedupe_activities_by_id(activities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen = set()
    for activity in activities:
        raw_id = activity.get("id")
        if raw_id is None:
            continue
        activity_id = int(raw_id)
        if activity_id in seen:
            continue
        seen.add(activity_id)
        deduped.append(activity)
    return deduped


def build_canton_alias_map(canton_names: List[str]) -> Dict[str, List[str]]:
    alias_map: Dict[str, List[str]] = {name: [] for name in canton_names}
    normalized_to_canonical = {normalize_text(name): name for name in canton_names}

    for normalized_canton, aliases in CANTON_NORMALIZED_ALIAS_MAP.items():
        canonical_name = normalized_to_canonical.get(normalized_canton)
        if canonical_name is None:
            continue
        alias_map[canonical_name].extend(aliases)

    return alias_map


def extract_cantons_from_text(text: str, canton_names: List[str]) -> List[str]:
    canton_aliases = build_canton_alias_map(canton_names)
    return extract_terms_from_text(text, canton_aliases)


def extract_terms_from_text(text: str, alias_map: Dict[str, List[str]]) -> List[str]:
    normalized_text = normalize_text(text)
    alias_entries: List[tuple[str, str]] = []

    for canonical, aliases in alias_map.items():
        for alias in [canonical, *aliases]:
            normalized_alias = normalize_text(alias)
            if normalized_alias:
                alias_entries.append((canonical, normalized_alias))

    # Longest first to avoid partial overlaps with similar names.
    alias_entries.sort(key=lambda item: len(item[1]), reverse=True)

    matches: List[str] = []
    for canonical, normalized_alias in alias_entries:
        if re.search(rf"\b{re.escape(normalized_alias)}\b", normalized_text):
            matches.append(canonical)

    seen = set()
    unique_matches: List[str] = []
    for match in matches:
        if match in seen:
            continue
        unique_matches.append(match)
        seen.add(match)
    return unique_matches


def extract_cantons_from_activity(activity: Dict[str, Any], canton_names: List[str]) -> List[str]:
    name = str(activity.get("name") or "")
    description = str(activity.get("description") or "")
    search_text = f"{name}\n{description}".strip()
    return extract_cantons_from_text(search_text, canton_names)


def extract_countries_from_activity(activity: Dict[str, Any], country_names: List[str]) -> List[str]:
    name = str(activity.get("name") or "")
    description = str(activity.get("description") or "")
    search_text = f"{name}\n{description}".strip()

    country_aliases: Dict[str, List[str]] = {}
    for country in country_names:
        country_aliases[country] = COUNTRY_ALIAS_MAP.get(country, [])

    extracted = extract_terms_from_text(search_text, country_aliases)
    if extracted:
        return extracted
    if "Switzerland" in country_aliases:
        return ["Switzerland"]
    return extracted


def clean_featured_rider_name(value: str) -> str:
    return re.sub(r"\s+", " ", str(value)).strip(" \t\r\n,.;:")


def extract_featured_riders_from_activity(activity: Dict[str, Any]) -> List[str]:
    description = str(activity.get("description") or "")
    if not description:
        return []

    match = re.search(r"(?i)\bFeaturing:\s*([^\n\r.]+)", description)
    if not match:
        return []

    riders: List[str] = []
    seen = set()
    for chunk in match.group(1).split(","):
        rider_name = clean_featured_rider_name(chunk)
        rider_key = normalize_text(rider_name)
        if not rider_name or not rider_key or rider_key in seen:
            continue
        riders.append(rider_name)
        seen.add(rider_key)
    return riders


def activity_to_ride(
    activity: Dict[str, Any], canton_names: List[str], country_names: List[str]
) -> Dict[str, Any]:
    activity_id = int(activity["id"])
    name = str(activity.get("name") or "")
    activity_dt = activity_datetime(activity)
    date_value = activity_dt.date().isoformat() if activity_dt else "TBD"
    distance_m = float(activity.get("distance") or 0.0)
    elevation_m = float(activity.get("total_elevation_gain") or 0.0)

    return {
        "name": name,
        "date": date_value,
        "distanceKm": round(distance_m / 1000.0, 3),
        "elevationM": round(elevation_m),
        "cantons": extract_cantons_from_activity(activity, canton_names),
        "countriesVisited": extract_countries_from_activity(activity, country_names),
        "featuredRiders": extract_featured_riders_from_activity(activity),
        "stravaUrl": ACTIVITY_WEB_URL.format(activity_id),
        "stravaActivityId": activity_id,
    }


def merge_rides(existing_rides: List[Dict[str, Any]], new_rides: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged = deepcopy(existing_rides)
    index_by_id: Dict[int, Dict[str, Any]] = {}

    for ride in merged:
        ride_id = extract_activity_id_from_ride(ride)
        if ride_id is None:
            continue
        index_by_id[ride_id] = ride

    for new_ride in new_rides:
        ride_id = int(new_ride["stravaActivityId"])
        existing = index_by_id.get(ride_id)

        if existing is None:
            merged.append(new_ride)
            index_by_id[ride_id] = merged[-1]
            continue

        # Always refresh core activity fields from Strava.
        existing["name"] = new_ride["name"]
        existing["date"] = new_ride["date"]
        existing["distanceKm"] = new_ride["distanceKm"]
        existing["elevationM"] = new_ride["elevationM"]
        existing["stravaUrl"] = new_ride["stravaUrl"]
        existing["stravaActivityId"] = ride_id

        # Refresh inferred fields from Strava text when available.
        existing["cantons"] = new_ride["cantons"] or existing.get("cantons", [])
        existing["countriesVisited"] = new_ride["countriesVisited"] or existing.get(
            "countriesVisited", []
        )
        existing["featuredRiders"] = list(new_ride.get("featuredRiders") or [])

    def sort_key(ride: Dict[str, Any]) -> tuple:
        dt = parse_iso_datetime(f"{ride.get('date')}T00:00:00+00:00")
        ts = to_unix_timestamp(dt) if dt else 0
        return (ts, extract_activity_id_from_ride(ride) or 0)

    merged.sort(key=sort_key)
    return merged


def update_canton_peaks(canton_peaks: List[Dict[str, Any]], rides: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    latest_by_canton: Dict[str, str] = {}

    def ride_sort_key(ride: Dict[str, Any]) -> tuple:
        dt = parse_iso_datetime(f"{ride.get('date')}T00:00:00+00:00")
        ts = to_unix_timestamp(dt) if dt else 0
        return (ts, extract_activity_id_from_ride(ride) or 0)

    for ride in sorted(rides, key=ride_sort_key, reverse=True):
        url = ride.get("stravaUrl")
        if not isinstance(url, str) or not url:
            continue
        for canton in ride.get("cantons", []):
            if canton not in latest_by_canton:
                latest_by_canton[canton] = url

    updated = deepcopy(canton_peaks)
    for row in updated:
        canton = row.get("canton")
        if canton in latest_by_canton:
            row["done"] = True
            row["stravaUrl"] = latest_by_canton[canton]

    return updated


def build_featured_riders(rides: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def ride_sort_key(ride: Dict[str, Any]) -> tuple:
        dt = parse_iso_datetime(f"{ride.get('date')}T00:00:00+00:00")
        ts = to_unix_timestamp(dt) if dt else 0
        return (ts, extract_activity_id_from_ride(ride) or 0)

    grouped: Dict[str, Dict[str, Any]] = {}

    for ride in sorted(rides, key=ride_sort_key):
        ride_names = ride.get("featuredRiders")
        if not isinstance(ride_names, list):
            continue

        ride_name = str(ride.get("name") or "").strip()
        ride_date = str(ride.get("date") or "").strip()
        ride_url = str(ride.get("stravaUrl") or "").strip()
        ride_entry = {
            "date": ride_date,
            "name": ride_name,
            "stravaUrl": ride_url,
        }
        ride_entry_key = (
            ride_entry["date"],
            ride_entry["name"],
            ride_entry["stravaUrl"],
        )

        for raw_rider_name in ride_names:
            rider_name = clean_featured_rider_name(raw_rider_name)
            rider_key = normalize_text(rider_name)
            if not rider_name or not rider_key:
                continue

            group = grouped.setdefault(
                rider_key,
                {
                    "name": rider_name,
                    "rides": [],
                    "rideCount": 0,
                    "peakCount": 0,
                    "cantons": [],
                    "distanceKm": 0.0,
                    "elevationM": 0,
                    "_seen_ride_keys": set(),
                    "_seen_cantons": set(),
                },
            )
            if not group.get("name"):
                group["name"] = rider_name

            if ride_entry_key in group["_seen_ride_keys"]:
                continue
            group["_seen_ride_keys"].add(ride_entry_key)
            group["rides"].append(ride_entry)
            group["rideCount"] += 1
            group["distanceKm"] += float(ride.get("distanceKm") or 0.0)
            group["elevationM"] += round(float(ride.get("elevationM") or 0.0))

            ride_cantons = ride.get("cantons")
            if isinstance(ride_cantons, list):
                for raw_canton in ride_cantons:
                    canton = str(raw_canton).strip()
                    canton_key = normalize_text(canton)
                    if not canton or not canton_key or canton_key in group["_seen_cantons"]:
                        continue
                    group["_seen_cantons"].add(canton_key)
                    group["cantons"].append(canton)

            group["peakCount"] = len(group["cantons"])

    featured_riders: List[Dict[str, Any]] = []
    for rider_key in sorted(grouped, key=lambda value: grouped[value]["name"].casefold()):
        group = grouped[rider_key]
        featured_riders.append(
            {
                "name": group["name"],
                "rideCount": group["rideCount"],
                "peakCount": group["peakCount"],
                "cantons": group["cantons"],
                "distanceKm": round(group["distanceKm"], 3),
                "elevationM": round(group["elevationM"]),
                "rides": group["rides"],
            }
        )

    return featured_riders


def activities_with_prefix(activities: List[Dict[str, Any]], prefix: str) -> List[Dict[str, Any]]:
    normalized_prefix = normalize_text(prefix)
    if not normalized_prefix:
        return []

    required_tokens = [token for token in normalized_prefix.split(" ") if token]
    if not required_tokens:
        return []

    matched: List[Dict[str, Any]] = []
    for activity in progress_iter(activities, desc="Filtering activities", unit="activity"):
        title_tokens = set(normalize_text(str(activity.get("name") or "")).split(" "))
        if all(token in title_tokens for token in required_tokens):
            matched.append(activity)
    return matched


def print_summary(
    *,
    fetched_count: int,
    matched_count: int,
    refreshed_known_count: int,
    rides_before: int,
    rides_after: int,
    featured_before: int,
    featured_after: int,
    canton_done_before: int,
    canton_done_after: int,
    dry_run: bool,
) -> None:
    mode = "DRY RUN" if dry_run else "APPLIED"
    print(f"[{mode}] fetched activities: {fetched_count}")
    print(f"[{mode}] matched title-tag ride activities: {matched_count}")
    print(f"[{mode}] refreshed known ride activities: {refreshed_known_count}")
    print(f"[{mode}] rides: {rides_before} -> {rides_after}")
    print(f"[{mode}] featured riders: {featured_before} -> {featured_after}")
    print(f"[{mode}] completed canton peaks: {canton_done_before} -> {canton_done_after}")


def main() -> int:
    args = parse_args()

    project_path = args.data_dir / "project.json"
    rides_path = args.data_dir / "rides.json"
    canton_peaks_path = args.data_dir / "canton-peaks.json"
    pass_gallery_path = args.data_dir / "pass-gallery.json"
    featured_riders_path = args.data_dir / "featured-riders.json"
    state_path = args.data_dir / "state.json"

    for path in (project_path, rides_path, canton_peaks_path, pass_gallery_path):
        if not path.exists():
            raise FileNotFoundError(f"Missing required data file: {path}")

    if not args.credentials.exists():
        raise FileNotFoundError(
            f"Credentials file not found: {args.credentials}\n"
            "Create it with keys: client_id, client_secret, refresh_token."
        )

    project = read_json(project_path)
    rides = read_json(rides_path)
    canton_peaks = read_json(canton_peaks_path)
    featured_riders = read_json(featured_riders_path) if featured_riders_path.exists() else []
    state = read_json(state_path) if state_path.exists() else {}
    credentials = read_json(args.credentials)

    if not isinstance(rides, list):
        raise ValueError("data/rides.json must contain a JSON list.")
    if not isinstance(canton_peaks, list):
        raise ValueError("data/canton-peaks.json must contain a JSON list.")
    if not isinstance(featured_riders, list):
        raise ValueError("data/featured-riders.json must contain a JSON list.")
    if not isinstance(state, dict):
        raise ValueError("data/state.json must contain a JSON object.")

    token_response = refresh_access_token(credentials)
    access_token = token_response["access_token"]
    rotated_refresh = token_response.get("refresh_token")
    if isinstance(rotated_refresh, str) and rotated_refresh:
        credentials["refresh_token"] = rotated_refresh

    after_epoch = infer_after_epoch(state, args.sync_overlap_seconds)
    fetched_activities = fetch_activities(
        access_token,
        after_epoch=after_epoch,
        max_pages=args.max_pages,
    )

    matched_activities = activities_with_prefix(fetched_activities, args.prefix)
    if not matched_activities and after_epoch is not None:
        print(
            "No tagged ride activities in incremental window; retrying full lookback pages...",
            file=sys.stderr,
        )
        full_window_activities = fetch_activities(
            access_token,
            after_epoch=None,
            max_pages=args.max_pages,
        )
        fetched_activities = dedupe_activities_by_id([*fetched_activities, *full_window_activities])
        matched_activities = activities_with_prefix(fetched_activities, args.prefix)

    matched_ride_activities = [activity for activity in matched_activities if activity_is_ride(activity)]
    detailed_matched_activities = enrich_activities_with_details(access_token, matched_ride_activities)
    detailed_matched_activities = [
        activity for activity in detailed_matched_activities if activity_is_ride(activity)
    ]

    existing_ride_ids = extract_existing_ride_ids(rides)
    matched_ids = {int(activity["id"]) for activity in detailed_matched_activities if "id" in activity}
    ids_to_refresh = [activity_id for activity_id in existing_ride_ids if activity_id not in matched_ids]
    refreshed_known_activities = fetch_activities_by_id(access_token, ids_to_refresh)
    refreshed_known_ride_activities = [
        activity for activity in refreshed_known_activities if activity_is_ride(activity)
    ]

    all_activities_to_merge = dedupe_activities_by_id(
        [*detailed_matched_activities, *refreshed_known_ride_activities]
    )

    canton_names = [str(c.get("canton")) for c in canton_peaks if c.get("canton")]
    country_names = [
        str(country)
        for country in project.get("neighboringCountries", [])
        if isinstance(country, str) and country
    ]
    if "Switzerland" not in country_names:
        country_names.append("Switzerland")

    new_rides = [
        activity_to_ride(activity, canton_names, country_names)
        for activity in all_activities_to_merge
    ]

    merged_rides = merge_rides(rides, new_rides)
    updated_cantons = update_canton_peaks(canton_peaks, merged_rides)
    updated_featured_riders = build_featured_riders(merged_rides)

    done_before = sum(1 for row in canton_peaks if row.get("done"))
    done_after = sum(1 for row in updated_cantons if row.get("done"))

    now_utc = datetime.now(timezone.utc)
    updated_state = deepcopy(state)
    updated_state["lastStravaSyncAt"] = now_utc.isoformat()
    updated_state["lastFetchedAfterEpoch"] = to_unix_timestamp(now_utc)
    updated_state["lastFetchedActivityCount"] = len(fetched_activities)
    updated_state["lastMatchedActivityCount"] = len(detailed_matched_activities)
    if detailed_matched_activities:
        updated_state["lastProcessedActivityId"] = max(
            int(a["id"]) for a in detailed_matched_activities if "id" in a
        )

    print_summary(
        fetched_count=len(fetched_activities),
        matched_count=len(detailed_matched_activities),
        refreshed_known_count=len(refreshed_known_ride_activities),
        rides_before=len(rides),
        rides_after=len(merged_rides),
        featured_before=len(featured_riders),
        featured_after=len(updated_featured_riders),
        canton_done_before=done_before,
        canton_done_after=done_after,
        dry_run=args.dry_run,
    )

    if args.dry_run:
        return 0

    rides_changed = merged_rides != rides
    cantons_changed = updated_cantons != canton_peaks
    featured_riders_changed = updated_featured_riders != featured_riders
    state_changed = updated_state != state

    if rides_changed:
        write_json(rides_path, merged_rides)
    if cantons_changed:
        write_json(canton_peaks_path, updated_cantons)
    if featured_riders_changed:
        write_json(featured_riders_path, updated_featured_riders)
    if state_changed:
        write_json(state_path, updated_state)

    if not args.no_write_refresh_token:
        write_json(args.credentials, credentials)

    print(f"[APPLIED] rides changed: {rides_changed}")
    print(f"[APPLIED] canton peaks changed: {cantons_changed}")
    print(f"[APPLIED] featured riders changed: {featured_riders_changed}")
    print(f"[APPLIED] state changed: {state_changed}")
    if args.no_write_refresh_token:
        print("[APPLIED] refresh token write: skipped (--no-write-refresh-token)")
    else:
        print("[APPLIED] refresh token write: updated credentials file")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)

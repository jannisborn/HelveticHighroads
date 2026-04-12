# Helvetic Highroads

Website for the 2026 project to road-bike the highest paved road in every Swiss canton.

## Run locally

Serve the folder (the app loads JSON data via `fetch`):

```bash
python3 -m http.server
```

Then open `http://localhost:8000`.

## Update project progress

Edit the JSON files in [`data/`](./data):

- [`data/rides.json`](./data/rides.json): add one entry per completed ride (date, km, elevation, cantons, Strava URL).
- [`data/canton-peaks.json`](./data/canton-peaks.json): set `done` to `true` and add `stravaUrl` when a canton peak is completed.
- [`data/project.json`](./data/project.json): keep route totals aligned with Komoot, set the map tour URL (`komootTourUrl`), and optionally set `komootEmbedLocale` (for example `de-de`, `en-us`).
- [`data/country-crossings.json`](./data/country-crossings.json): maintain the ordered route border anchors used to generate the country strip under the profile.
- [`data/route-profile.json`](./data/route-profile.json): generated from the shared Komoot route for the website elevation profile. Rebuild it after route edits.
- [`data/pass-gallery.json`](./data/pass-gallery.json): update pass cards.
- [`data/featured-riders.json`](./data/featured-riders.json): generated from Strava ride descriptions for the Featuring section.

## Build route profile

Generate the simplified whole-route profile JSON from the Komoot tour configured in [`data/project.json`](./data/project.json):

```bash
uv run scripts/build_route_profile.py
```

Useful option:

- `--sample-distance-m 250`: control how densely the profile is sampled

## Strava sync routine

Use [`scripts/sync_strava.py`](./scripts/sync_strava.py) to fetch recent Strava activities and update:

- [`data/rides.json`](./data/rides.json)
- [`data/canton-peaks.json`](./data/canton-peaks.json)
- [`data/featured-riders.json`](./data/featured-riders.json)
- [`data/state.json`](./data/state.json)

### 1. Create local credentials file

Create `secret.json` in repo root:

```json
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "refresh_token": "YOUR_REFRESH_TOKEN"
}
```

### 2. Name activities with prefix

The sync script only considers ride activities whose title contains all words from:

`Helvetic Highroads`

If the title or description includes canton names, it auto-marks those canton rows as done (including common aliases such as `Tessin` -> `Ticino`).
The sync fetches full activity details for matched rides, so description text is included reliably.
It also refreshes already tracked Strava ride IDs each run, so title/description edits on older rides are picked up.
It also fills `countriesVisited` by scanning title + description and mapping German country names to English (for example `Deutschland` -> `Germany`, `Schweiz` -> `Switzerland`).
It also extracts fellow riders from a `Featuring:` block in the description. Use a comma-separated list and end it with either a period or a line break, for example `Featuring: First Last, Second Rider.`.
If no country is mentioned, it defaults to `Switzerland`.
If incremental sync finds no tagged rides, the script retries a full lookback (bounded by `--max-pages`) automatically.

Example:

`Helvetic Highroads | Zürich, Schaffhausen`

### 3. Run sync

Install progress-bar dependency once:

```bash
python3 -m pip install tqdm
```

```bash
python3 scripts/sync_strava.py
```

Useful options:

- `--dry-run`: show what would change without writing files
- `--prefix "Helvetic Highroads"`: custom title prefix
- `--max-pages 10`: fetch more recent pages
- `--no-write-refresh-token`: do not persist rotated refresh token

## Daily automation

Use the local wrapper script [`scripts/sync_and_publish.sh`](./scripts/sync_and_publish.sh) if you want a daily scheduled run that also pushes website updates to GitHub.

This runs locally instead of in GitHub Actions because Strava rotates the refresh token, and the local `secret.json` can be updated safely on disk after each sync.

### Run manually

```bash
./scripts/sync_and_publish.sh
```

### Install as a daily cron job

Open your crontab:

```bash
crontab -e
```

Add one line like this to run every day at 06:15:

```cron
15 6 * * * /Users/jannisborn/projects/HelveticHighroads/scripts/sync_and_publish.sh >> /Users/jannisborn/Library/Logs/helvetic-highroads-sync.log 2>&1
```

Notes:

- The repo remote should use SSH so `git push` can authenticate non-interactively.
- GitHub Pages must already publish from the branch you push to.
- The script only publishes when `data/rides.json`, `data/canton-peaks.json`, or `data/featured-riders.json` changes. `data/state.json` stays local-only unless a real website-data update is being committed.

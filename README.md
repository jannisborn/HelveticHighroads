# Helvetic Highroads

Website for the 2026 project to road-bike the highest paved road in every Swiss canton.

## Run locally

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server
```

Then open `http://localhost:8000`.

## Update project progress

Edit [`app.js`](./app.js):

- `rides`: add one entry per completed ride (date, km, elevation, cantons, Strava URL).
- `cantonPeaks[].done`: set this value to `true` when that canton peak is completed.
- `project.totalDistanceKm` and `project.totalElevationM`: keep these values aligned with total route targets from Komoot.

#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCK_DIR="${REPO_ROOT}/.sync-and-publish.lock"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "sync_and_publish is already running" >&2
  exit 1
fi

cleanup() {
  rmdir "${LOCK_DIR}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

cd "${REPO_ROOT}"

if command -v uv >/dev/null 2>&1; then
  uv run --with tqdm python3 scripts/sync_strava.py --max-pages 5
else
  python3 scripts/sync_strava.py --max-pages 5
fi

git add data/rides.json data/canton-peaks.json data/state.json

if git diff --cached --quiet -- data/rides.json data/canton-peaks.json data/state.json; then
  echo "No website data changes to publish."
  exit 0
fi

git commit -m "chore: sync Strava website data"
git push origin "$(git branch --show-current)"

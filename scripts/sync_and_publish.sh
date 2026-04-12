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

current_branch() {
  local branch

  branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  if [ -z "${branch}" ]; then
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  fi
  if [ -z "${branch}" ] || [ "${branch}" = "HEAD" ]; then
    branch="main"
  fi

  printf '%s\n' "${branch}"
}

push_branch_if_needed() {
  local branch ahead_count

  branch="$(current_branch)"

  if git rev-parse --verify --quiet "@{u}" >/dev/null 2>&1; then
    ahead_count="$(git rev-list --count "@{u}..HEAD")"
    if [ "${ahead_count}" = "0" ]; then
      echo "No commits to push."
      return 0
    fi
  fi

  git push origin "${branch}"
}

if command -v uv >/dev/null 2>&1; then
  uv run --with tqdm python3 scripts/sync_strava.py --max-pages 5
else
  python3 scripts/sync_strava.py --max-pages 5
fi

git add data/rides.json data/canton-peaks.json data/featured-riders.json

if git diff --cached --quiet -- data/rides.json data/canton-peaks.json data/featured-riders.json; then
  echo "No website data changes to publish. Leaving data/state.json local-only."
  push_branch_if_needed
  exit 0
fi

git add data/state.json
git commit -m "chore: sync Strava website data"
push_branch_if_needed

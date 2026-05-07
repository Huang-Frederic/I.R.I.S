#!/usr/bin/env bash
# scripts/backup/rotate.sh
# Keeps the N most recent releases per backup category.
# backup-manual-* are NEVER deleted (no entry below).

set -euo pipefail

keep_recent() {
  local prefix=$1
  local count=$2
  echo "[rotate] keeping last $count of '${prefix}*'"

  # Use --json to get tag names robustly (independent of gh release list table format).
  # `|| true` swallows grep's exit-1 when zero releases match the prefix
  # (e.g. backup-weekly-* on a Tuesday — none have been created yet).
  local tags
  tags=$(gh release list --limit 1000 --json tagName -q '.[].tagName' \
    | grep "^${prefix}" \
    || true)

  if [ -z "$tags" ]; then
    echo "  (none)"
    return 0
  fi

  echo "$tags" \
    | sort -r \
    | tail -n +$((count + 1)) \
    | while read -r tag; do
        [ -z "$tag" ] && continue
        echo "  delete: $tag"
        gh release delete "$tag" --yes --cleanup-tag
      done
}

keep_recent "backup-daily-"   30
keep_recent "backup-weekly-"  12
keep_recent "backup-monthly-" 12

echo "[rotate] done."

#!/usr/bin/env bash
# scripts/backup/rotate.sh
# Keeps the N most recent releases per backup category.
# backup-manual-* are NEVER deleted (no entry below).

set -euo pipefail

keep_recent() {
  local prefix=$1
  local count=$2
  echo "[rotate] keeping last $count of '${prefix}*'"
  gh release list --limit 1000 \
    | awk '{print $1}' \
    | grep "^${prefix}" \
    | sort -r \
    | tail -n +$((count + 1)) \
    | while read -r tag; do
        echo "  delete: $tag"
        gh release delete "$tag" --yes --cleanup-tag
      done
}

keep_recent "backup-daily-"   30
keep_recent "backup-weekly-"  12
keep_recent "backup-monthly-" 12

echo "[rotate] done."

#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/scripts/telegram-exec-alert/.env.telegram-alerts"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

exec "$REPO_ROOT/scripts/telegram-exec-alert/monitor-and-alert.sh" "$@"

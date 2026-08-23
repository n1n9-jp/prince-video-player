#!/usr/bin/env bash
set -euo pipefail

if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ]; then
  echo "skip secret put on pull_request"
  exit 0
fi
if [ -z "${YOUTUBE_API_KEY:-}" ]; then
  echo "YOUTUBE_API_KEY is empty; skip secret put"
  exit 0
fi

jq -n --arg k "$YOUTUBE_API_KEY" '{YOUTUBE_API_KEY:$k}' | wrangler secret bulk

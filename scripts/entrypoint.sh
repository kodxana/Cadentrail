#!/bin/sh
set -eu
umask 077
export DAW_STORAGE="${DAW_STORAGE:-/workspace/yue2-daw}"
export HF_HOME="$DAW_STORAGE/models/huggingface"
export TORCH_HOME="$DAW_STORAGE/cache/torch"
mkdir -p "$DAW_STORAGE"
if [ -z "${DAW_PASSWORD:-}" ]; then
  echo 'Cadentrail is in open-access mode. Set DAW_PASSWORD to protect the app and API; see Access settings in the app.' >&2
fi
cd /app
exec python -m uvicorn backend.app:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1 --proxy-headers --forwarded-allow-ips '*'

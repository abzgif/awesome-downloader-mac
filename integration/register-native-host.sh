#!/bin/bash
# Awesome Downloader – macOS browser native messaging host registration.
# Equivalent of register-native-host.ps1 for macOS.
#
# Usage:
#   ./register-native-host.sh --browser Chrome --extension-id YOUR_EXTENSION_ID
#   ./register-native-host.sh --browser Edge   --extension-id YOUR_EXTENSION_ID
#   ./register-native-host.sh --browser Firefox --extension-id YOUR_EXTENSION_ID

set -euo pipefail

BROWSER="Chrome"
EXTENSION_ID=""
HOST_PATH=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --browser|-b) BROWSER="$2"; shift 2 ;;
    --extension-id|-e) EXTENSION_ID="$2"; shift 2 ;;
    --host-path|-h) HOST_PATH="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$EXTENSION_ID" ]]; then
  echo "Usage: $0 --browser <Chrome|Edge|Firefox> --extension-id <ID>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_PATH="${HOST_PATH:-$SCRIPT_DIR/native-host.sh}"

if [[ ! -x "$HOST_PATH" ]]; then
  echo "Native host not found or not executable: $HOST_PATH" >&2
  exit 1
fi

HOST_NAME="com.awesome.downloader"

case "$BROWSER" in
  Chrome)
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  Edge)
    MANIFEST_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    ;;
  Firefox)
    MANIFEST_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
    ;;
  *)
    echo "Browser must be Chrome, Edge, or Firefox." >&2
    exit 1
    ;;
esac

mkdir -p "$MANIFEST_DIR"
MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"

# Back up existing manifest
if [[ -f "$MANIFEST_PATH" ]]; then
  STAMP=$(date '+%Y%m%d-%H%M%S')
  cp "$MANIFEST_PATH" "$MANIFEST_PATH.$STAMP.bak"
fi

if [[ "$BROWSER" == "Firefox" ]]; then
  cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Awesome Downloader browser bridge",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_extensions": ["$EXTENSION_ID"]
}
EOF
else
  cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Awesome Downloader browser bridge",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF
fi

echo "Registered $BROWSER bridge for $EXTENSION_ID at $MANIFEST_PATH"

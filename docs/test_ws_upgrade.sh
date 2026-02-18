#!/usr/bin/env bash
# Test WebSocket upgrade to ds_send: shows HTTP status and headers (no full WS).
# Usage: ./docs/test_ws_upgrade.sh [URL]
# Default URL: https://veuspxhoghenwakxnunw.supabase.co/functions/v1/ds_send

set -e
URL="${1:-https://veuspxhoghenwakxnunw.supabase.co/functions/v1/ds_send}"
KEY=$(openssl rand -base64 16)

echo "Testing: $URL"
echo "---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X GET "$URL" \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: $KEY" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Origin: https://app.minimum.chat"

echo "Full response (verbose):"
curl -v -X GET "$URL" \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: $KEY" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Origin: https://app.minimum.chat" 2>&1 | head -50

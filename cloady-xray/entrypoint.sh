#!/bin/sh
set -e
: "${UUID:?UUID env required}"
cat > /tmp/config.json <<JSON
{"log":{"loglevel":"warning"},
 "inbounds":[{"listen":"0.0.0.0","port":${PORT:-3000},"protocol":"vless",
  "settings":{"clients":[{"id":"${UUID}"}],"decryption":"none"},
  "streamSettings":{"network":"ws","wsSettings":{"path":"${WSPATH:-/ws}"}}}],
 "outbounds":[{"protocol":"freedom"}]}
JSON
exec /usr/local/bin/xray run -c /tmp/config.json

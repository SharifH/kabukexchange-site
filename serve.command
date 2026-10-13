#!/bin/bash
# ---------------------------------------------------------------------------
# KabuK Exchange — local preview launcher (macOS: double-click to run).
#
# Serves THIS folder as the web root, which is required for the site to work:
#   - /styles.css, /script.js load correctly
#   - clean URLs like /hotels/ and /platform/ resolve to their index.html
#   - site-config.json, partners.json, and i18n/*.json can be fetched
#
# Opening the .html files directly (file://) will NOT work — always use this.
# ---------------------------------------------------------------------------
cd "$(dirname "$0")" || exit 1
PORT=8080
echo "Serving KabuK Exchange from: $(pwd)"
echo "Open:  http://localhost:$PORT/   —   press Ctrl+C to stop."
# Open the browser once the server is up.
( sleep 1; (command -v open >/dev/null && open "http://localhost:$PORT/") || true ) &
exec python3 -m http.server "$PORT"

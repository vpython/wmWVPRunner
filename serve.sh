#!/bin/bash
# Starts the WASM (Pyodide) runner dev server on port 5173.
#
# FLASK_HOST must match the origin of the flaskHost that will load this runner
# in an iframe. It is injected as PUBLIC_TRUSTED_HOST, which the runner uses
# to validate incoming postMessage events from the parent window.
# Default is localhost for normal dev; override for external device testing:
#
#   FLASK_HOST=http://192.168.1.66:8080 ./serve.sh
#
# --host tells Vite to bind to 0.0.0.0 instead of localhost, making the
# dev server reachable on all network interfaces for tablets and phones.

export PUBLIC_TRUSTED_HOST=${FLASK_HOST:-"http://localhost:8080"}
echo "{\"PUBLIC_TRUSTED_HOST\": \"$PUBLIC_TRUSTED_HOST\"}" > static/config.json
echo "Starting wmWVPRunner dev server on port 5173 (trusted host: $PUBLIC_TRUSTED_HOST)"
npm run dev -- --host

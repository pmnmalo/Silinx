#!/bin/sh
# Runs window.mjs (#482) with the Node.js copied beside it (install.sh --system: root's own copy, not
# the runner's user's), else the runner's own Node.js, the newest of its externals/node*/bin/node (the
# machine needs no Node.js of its own), or the one on the PATH. RUNNER_DIR is optional: run by hand, window.mjs reads
# it from the window's plist (#5606).
set -eu
node="$(dirname "$0")/node"
[ -x "$node" ] || [ -z "${RUNNER_DIR:-}" ] || node=$(ls -d "$RUNNER_DIR"/externals/node*/bin/node 2>/dev/null | sort -V | tail -n 1)
[ -n "$node" ] && [ -x "$node" ] || node=$(command -v node) || { echo "window.sh: no Node.js (set RUNNER_DIR to the runner's folder)" >&2; exit 1; }
exec "$node" "$(dirname "$0")/window.mjs" "$@"

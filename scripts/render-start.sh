#!/bin/sh
set -eu
# Local containers retain the ordinary entrypoint. Render builds must be approved.
if [ "${RENDER:-}" = "true" ] || [ -n "${RENDER_GIT_COMMIT:-}" ]; then
  if [ -z "${FATAL_RELEASE_COMMIT:-}" ] || [ "${RENDER_GIT_COMMIT:-}" != "$FATAL_RELEASE_COMMIT" ]; then
    echo "Release parked: this Render build is not the explicitly approved commit."
    exec sleep 86400
  fi
fi
exec node dist/server/index.js

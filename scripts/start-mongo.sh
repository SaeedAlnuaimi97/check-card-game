#!/usr/bin/env bash
# Starts a local mongod instance for development if one is not already running.
# Data is stored in /tmp/mongodb-dev so no system-level setup is needed.
# Logs go to /tmp/mongodb-dev.log.
#
# Safe to call multiple times — exits immediately if mongod is already up.

DBPATH="/tmp/mongodb-dev"
LOGPATH="/tmp/mongodb-dev.log"
PORT=27017

# Check if mongod is already accepting connections on the expected port
if mongosh --port "$PORT" --eval "db.runCommand({ ping: 1 })" --quiet >/dev/null 2>&1; then
  echo "[mongo] MongoDB already running on port $PORT"
  exit 0
fi

echo "[mongo] Starting MongoDB (dbpath: $DBPATH, log: $LOGPATH)..."
mkdir -p "$DBPATH"

mongod \
  --dbpath "$DBPATH" \
  --port "$PORT" \
  --fork \
  --logpath "$LOGPATH"

# Wait up to 10 seconds for mongod to be ready
for i in $(seq 1 10); do
  if mongosh --port "$PORT" --eval "db.runCommand({ ping: 1 })" --quiet >/dev/null 2>&1; then
    echo "[mongo] MongoDB is ready"
    exit 0
  fi
  sleep 1
done

echo "[mongo] ERROR: MongoDB did not become ready in time. Check $LOGPATH for details." >&2
exit 1

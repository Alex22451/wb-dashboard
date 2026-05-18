#!/bin/bash
# Dev server daemon with auto-restart
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting Next.js dev server..." >> /tmp/dev-daemon.log
  bun next dev -p 3000 >> /tmp/dev-daemon.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 3s..." >> /tmp/dev-daemon.log
  sleep 3
done

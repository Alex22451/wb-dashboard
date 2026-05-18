#!/bin/bash
# Persistent dev server with auto-restart
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting Next.js dev server..." >> dev.log
  bun next dev -p 3000 >> dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 2s..." >> dev.log
  sleep 2
done

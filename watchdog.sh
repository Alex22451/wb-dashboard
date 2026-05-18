#!/bin/bash
# Check if next-server is running
if ! pgrep -f "next-server" > /dev/null 2>&1; then
  echo "[$(date)] Starting Next.js dev server..." >> /home/z/my-project/watchdog.log
  cd /home/z/my-project
  # Kill any stale processes
  pkill -f "next dev" 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  sleep 2
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1 &
  echo "[$(date)] Server started" >> /home/z/my-project/watchdog.log
fi

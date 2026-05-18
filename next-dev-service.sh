#!/bin/bash
# Next.js dev server service
# Runs independently of shell sessions
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=1024"
while true; do
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Server exited, restarting in 3s..." >> /home/z/my-project/dev.log
  sleep 3
done

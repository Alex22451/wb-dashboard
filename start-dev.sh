#!/bin/bash
cd /home/z/my-project
export PORT=3000
while true; do
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Server crashed, restarting in 3s..." >> /home/z/my-project/dev.log
  sleep 3
done

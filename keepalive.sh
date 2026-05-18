#!/bin/bash
# Keepalive script to ensure dev server stays running
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting dev server..."
  bun next dev -p 3000
  EXIT_CODE=$?
  echo "[$(date)] Dev server exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
done

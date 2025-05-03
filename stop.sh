#!/bin/bash

# Check if PID file exists
if [ -f .pid ]; then
  PID=$(cat .pid)
  echo "Stopping Discord Webhook Scanner (PID: $PID)..."
  kill $PID
  rm .pid
  echo "Scanner stopped."
else
  # Try to find the process by name
  PID=$(pgrep -f "node scanner.js")
  if [ -n "$PID" ]; then
    echo "Stopping Discord Webhook Scanner (PID: $PID)..."
    kill $PID
    echo "Scanner stopped."
  else
    echo "Scanner is not running."
  fi
fi

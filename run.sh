#!/bin/bash

# Create necessary directories
mkdir -p data logs

# Check if .env file exists
if [ ! -f .env ]; then
  echo "Creating .env file from example..."
  cp .env.example .env
  echo "Please edit .env file and add your GitHub token before running the scanner."
  exit 1
fi

# Check if GITHUB_TOKEN is set in .env
if ! grep -q "GITHUB_TOKEN=.*" .env || grep -q "GITHUB_TOKEN=your_github_token_here" .env; then
  echo "Please set your GITHUB_TOKEN in the .env file."
  exit 1
fi

# Check if the scanner is already running
if pgrep -f "node scanner.js" > /dev/null; then
  echo "Scanner is already running."
  echo "To stop it, run: ./stop.sh"
  exit 0
fi

# Start the scanner in the background
echo "Starting Discord Webhook Scanner in the background..."
nohup node scanner.js > logs/output.log 2> logs/error.log &

# Save the PID to a file
echo $! > .pid
echo "Scanner started with PID: $!"
echo "To stop the scanner, run: ./stop.sh"
echo "To view logs: tail -f logs/scanner.log"

# Discord Webhook Scanner

A Node.js application that scans public GitHub repositories for potentially exposed Discord webhook URLs. This tool is designed to promote webhook security awareness, not to exploit vulnerabilities.

## Features

- Continuously scans GitHub repositories for exposed Discord webhook URLs
- Configurable scan intervals and search queries
- Stores webhooks in chunked JSON files (max 1MB per chunk)
- Optional notifications to webhook owners about their exposed webhooks
- Detailed logging with rotation
- Runs 24/7 in the background without requiring PM2

## Ethical Guidelines

This tool is designed for educational and security awareness purposes only. Please follow these guidelines:

1. Only use this tool to identify and secure your own webhooks or with explicit permission
2. When sending notifications, be respectful and helpful
3. Do not use this tool to spam, harass, or exploit webhook owners
4. Report security issues responsibly

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/pilot2254/discord-webhook-scanner.git
   cd discord-webhook-scanner
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create necessary directories:
   ```
   mkdir -p data logs
   ```

4. Create a `.env` file from the example:
   ```
   cp .env.example .env
   ```

5. Edit the `.env` file and add your GitHub API token (Permission required `public_repo`):
   ```
   GITHUB_TOKEN=your_github_token_here
   ```

6. Make the run and stop scripts executable:
   ```
   chmod +x run.sh stop.sh
   ```

## Usage

### Starting the Scanner

To start the scanner in the background (will run 24/7):

```
./run.sh
```

This will:
- Start the scanner in the background
- Save logs to the `logs` directory
- Continue running even if you close your terminal

### Stopping the Scanner

To stop the scanner:

```
./stop.sh
```

### Viewing Logs

To view the scanner logs:

```
tail -f logs/scanner.log
```

### After Raspberry Pi Reboot

The scanner will NOT automatically start when your Raspberry Pi reboots. After each reboot, you'll need to manually start it:

```
cd /path/to/discord-webhook-scanner
./run.sh
```

## Configuration

The application is configured through the `config.js` file. Here are the main configuration options:

### GitHub Configuration
- `searchQueries`: Array of search terms to use when scanning GitHub
- `pagesPerScan`: Number of pages to scan per query
- `scanIntervalHours`: How often to scan GitHub (in hours)

### Storage Configuration
- `dataDir`: Directory to store webhook data
- `chunkSizeBytes`: Maximum size of each webhook storage file

### Notification Configuration
- `enabled`: Whether to enable notifications
- `message`: The message to send to webhook owners
- `autoNotifyNew`: Whether to automatically notify newly discovered webhooks
- `validateBeforeNotify`: Whether to validate webhooks before sending notifications

### Logging Configuration
- `level`: Log level (debug, info, warn, error)
- `logToFile`: Whether to log to a file
- `logFilePath`: Path to the log file
- `maxLogFileSizeMB`: Maximum size of log files
- `maxLogFiles`: Maximum number of log files to keep

## How It Works

1. The scanner searches GitHub for code containing Discord webhook URLs
2. When it finds potential webhooks, it extracts and stores them
3. On subsequent scans, it identifies new webhooks that weren't previously found
4. Optionally, it can send notifications to webhook owners
5. All activities are logged for monitoring and debugging

## Running on Raspberry Pi

This application is designed to be lightweight and can run on a Raspberry Pi. The setup process is the same as described above.

For optimal performance on Raspberry Pi:
- Consider increasing the scan interval (e.g., 24 hours instead of 12)
- Monitor memory usage during the first few scans

## Troubleshooting

### Scanner Not Starting
- Check if the scanner is already running: `pgrep -f "node scanner.js"`
- Ensure your GitHub token is correctly set in the `.env` file
- Check the logs for errors: `cat logs/error.log`

### Rate Limiting
If you encounter GitHub API rate limits:
- Increase the scan interval in `config.js`
- The scanner will automatically wait for rate limits to reset

### Memory Issues
If you encounter memory problems on your Raspberry Pi:
- Reduce the number of pages scanned per query in `config.js`
- Consider scanning fewer queries at a time

## License

MIT
# Discord Webhook Scanner

A modular Node.js application that continuously scans public GitHub repositories for potentially exposed Discord webhook URLs, validates them, and allows sending custom messages.

## Features

- Interactive terminal interface
- Continuous scanning of GitHub repositories for exposed Discord webhook URLs
- Webhook validation before saving (configurable)
- Storage of webhooks in chunked JSON files
- Send custom messages to all webhooks or specific chunks
- Validate webhooks to check if they're still active
- Detailed logging with rotation
- Modular architecture for easy maintenance and development

## Ethical Guidelines

This tool is designed for educational and security awareness purposes only. Please follow these guidelines:

1. Only use this tool to identify and secure your own webhooks or with explicit permission
2. When sending notifications, be respectful and helpful
3. Do not use this tool to spam, harass, or exploit webhook owners
4. Report security issues responsibly

## Installation

1. Clone this repository:
   \`\`\`
   git clone https://github.com/yourusername/discord-webhook-scanner.git
   cd discord-webhook-scanner
   \`\`\`

2. Install dependencies:
   \`\`\`
   npm install
   \`\`\`

3. Create a `.env` file from the example:
   \`\`\`
   cp .env.example .env
   \`\`\`

4. Edit the `.env` file and add your GitHub API token:
   \`\`\`
   GITHUB_TOKEN=your_github_token_here
   \`\`\`

## Usage

Start the application:

\`\`\`
npm start
\`\`\`

This will display the interactive menu with the following options:

1. **Start continuous scanning** - Continuously scan GitHub without waiting between scans
2. **Perform single scan** - Run a single scan and return to the menu
3. **Send message to all webhooks** - Send a custom message to all stored webhooks
4. **Send message to specific chunk** - Send a custom message to webhooks in a specific chunk
5. **List available chunks** - Show all available webhook chunks
6. **Count total webhooks** - Display the total number of stored webhooks
7. **Validate all webhooks** - Check which webhooks are still active
8. **Exit** - Exit the application

## Configuration

The application is highly configurable through the `src/config.js` file. Here are the main configuration sections:

### GitHub Configuration
- `searchQueries`: Array of search terms to use when scanning GitHub
- `pagesPerScan`: Number of pages to scan per query

### Scanner Configuration
- `validateBeforeSaving`: Whether to validate webhooks before saving them
- `maxConcurrentValidations`: Maximum number of concurrent validation requests
- `validationTimeout`: Timeout for webhook validation requests

### Storage Configuration
- `dataDir`: Directory to store webhook data
- `chunkSizeBytes`: Maximum size of each webhook storage file
- `clearExistingChunks`: Whether to clear existing chunks before saving new webhooks
- `deduplicateWebhooks`: Whether to deduplicate webhooks before saving

### Notification Configuration
- `enabled`: Whether to enable notifications
- `message`: The default message to send to webhook owners
- `autoNotifyNew`: Whether to automatically notify newly discovered webhooks
- `validateBeforeNotify`: Whether to validate webhooks before sending notifications
- `notificationDelay`: Delay between notifications to avoid rate limiting

### Logging Configuration
- `level`: Log level (debug, info, warn, error)
- `logToFile`: Whether to log to a file
- `logFilePath`: Path to the log file
- `maxLogFileSizeMB`: Maximum size of log files
- `maxLogFiles`: Maximum number of log files to keep
- `logWebhookUrls`: Whether to log webhook URLs (may expose sensitive information)

## Project Structure

The application is organized into the following modules:

- `index.js` - Main entry point
- `src/cli.js` - CLI interface and menu
- `src/scanner.js` - GitHub scanning functionality
- `src/webhook.js` - Webhook management (validation, sending messages)
- `src/storage.js` - File storage operations
- `src/logger.js` - Logging functionality
- `src/config.js` - Configuration settings
- `src/utils.js` - Utility functions

This modular structure makes the code more maintainable and easier to develop.

## Development

To extend or modify the application:

1. Fork the repository
2. Make your changes in the appropriate module
3. Test your changes
4. Submit a pull request

## License

MIT

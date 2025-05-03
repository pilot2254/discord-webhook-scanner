/**
 * Configuration file for Discord Webhook Scanner
 */
export default {
  // GitHub API configuration
  github: {
    // Your GitHub token will be loaded from environment variable
    // Set GITHUB_TOKEN in your environment or .env file
    searchQueries: ["discord.com/api/webhooks", "discordapp.com/api/webhooks"],
    pagesPerScan: 5,
    scanIntervalHours: 12, // How often to scan GitHub (in hours)
  },

  // Webhook storage configuration
  storage: {
    dataDir: "data",
    chunkSizeBytes: 1024 * 1024, // 1MB
  },

  // Notification configuration
  notifications: {
    enabled: true,
    message: {
      title: "⚠️ Security Alert: Your Discord Webhook is Exposed",
      description:
        "Your Discord webhook was found exposed on a public GitHub repository. We recommend rotating it or protecting it to avoid abuse.",
      color: 16763904, // Orange
      fields: [
        {
          name: "What should I do?",
          value:
            "1. Delete this webhook and create a new one\n2. Store your webhook securely (use environment variables)\n3. Consider using a webhook proxy service",
        },
        {
          name: "Why am I receiving this?",
          value:
            "This is a friendly notification from a security researcher. This message was sent using your exposed webhook.",
        },
      ],
      footer: {
        text: "Discord Webhook Security Scanner - This tool is designed to promote webhook security awareness",
      },
    },
    // Set to true to automatically send notifications to newly discovered webhooks
    autoNotifyNew: false,
    // Set to true to validate webhooks before sending notifications
    validateBeforeNotify: true,
  },

  // Logging configuration
  logging: {
    level: "info", // debug, info, warn, error
    logToFile: true,
    logFilePath: "logs/scanner.log",
    maxLogFileSizeMB: 10,
    maxLogFiles: 5,
  },
}

#!/usr/bin/env node
import { Octokit } from "@octokit/rest"
import fs from "fs/promises"
import path from "path"
import fetch from "node-fetch"
import { fileURLToPath } from "url"
import { dirname } from "path"
import winston from "winston"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

// Import configuration
import config from "./config.js"

// Setup paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_DIR = path.resolve(__dirname, config.storage.dataDir)
const LOG_DIR = path.resolve(__dirname, "logs")

// Setup webhook pattern
const WEBHOOK_PATTERN = /https:\/\/discord(app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+/g

// Setup logger
let logger

const setupLogger = async () => {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
  } catch (error) {
    console.error("Failed to create log directory:", error)
  }

  const logger = winston.createLogger({
    level: config.logging.level || "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} ${level}: ${message}`
      }),
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      }),
      ...(config.logging.logToFile
        ? [
            new winston.transports.File({
              filename: path.join(LOG_DIR, "scanner.log"),
              maxsize: (config.logging.maxLogFileSizeMB || 10) * 1024 * 1024,
              maxFiles: config.logging.maxLogFiles || 5,
            }),
          ]
        : []),
    ],
  })
  return logger
}

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    return true
  } catch (error) {
    logger.error(`Failed to create data directory: ${error.message}`)
    return false
  }
}

// Scan GitHub for webhooks
async function scanGitHub(token, pages) {
  const octokit = new Octokit({ auth: token })
  const webhooks = new Set()

  for (const query of config.github.searchQueries) {
    logger.info(`Scanning GitHub for query: ${query}`)

    for (let page = 1; page <= pages; page++) {
      logger.debug(`Scanning page ${page}/${pages} for query: ${query}`)

      try {
        // Search for potential Discord webhook URLs in code
        const searchResult = await octokit.search.code({
          q: query,
          per_page: 100,
          page,
        })

        logger.info(`Found ${searchResult.data.items.length} potential files on page ${page}`)

        for (const item of searchResult.data.items) {
          try {
            // Get the file content
            const fileContent = await octokit.repos.getContent({
              owner: item.repository.owner.login,
              repo: item.repository.name,
              path: item.path,
              ref: item.repository.default_branch,
            })

            // Decode content if it's base64 encoded
            if (fileContent.data.encoding === "base64") {
              const content = Buffer.from(fileContent.data.content, "base64").toString()

              // Extract Discord webhook URLs
              const matches = content.match(WEBHOOK_PATTERN)
              if (matches) {
                logger.info(`Found ${matches.length} webhooks in ${item.repository.full_name}/${item.path}`)
                matches.forEach((webhook) => webhooks.add(webhook))
              }
            }
          } catch (error) {
            // Skip files that can't be accessed
            logger.debug(`Couldn't access file: ${error.message}`)
            continue
          }
        }
      } catch (error) {
        if (error.status === 403 && error.headers && error.headers["x-ratelimit-remaining"] === "0") {
          const resetTime = new Date(Number.parseInt(error.headers["x-ratelimit-reset"]) * 1000)
          logger.warn(`Rate limit exceeded. Reset at ${resetTime.toLocaleTimeString()}`)

          // Wait until rate limit resets
          const waitTime = Math.max(0, resetTime - new Date()) + 1000 // Add 1 second buffer
          logger.info(`Waiting for ${Math.ceil(waitTime / 1000 / 60)} minutes until rate limit resets`)
          await new Promise((resolve) => setTimeout(resolve, waitTime))

          // Retry this page
          page--
          continue
        } else {
          logger.error(`Error scanning GitHub: ${error.message}`)
          if (error.response) {
            logger.error(`Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`)
          }
          break
        }
      }
    }
  }

  return Array.from(webhooks)
}

// Save webhooks to files
async function saveWebhooks(webhooks) {
  // Clear existing chunks
  try {
    const files = await fs.readdir(DATA_DIR)
    for (const file of files) {
      if (file.startsWith("webhooks_") && file.endsWith(".json")) {
        await fs.unlink(path.join(DATA_DIR, file))
      }
    }
  } catch (error) {
    logger.error(`Error clearing webhooks: ${error.message}`)
  }

  // Convert webhooks to JSON string
  const webhooksJson = JSON.stringify(webhooks)

  // Split into chunks if needed
  if (webhooksJson.length <= config.storage.chunkSizeBytes) {
    await fs.writeFile(path.join(DATA_DIR, "webhooks_1.json"), webhooksJson)
    logger.info(`Saved ${webhooks.length} webhooks to a single file`)
  } else {
    // Split the array into chunks
    const chunks = []
    let currentChunk = []
    let currentSize = 0

    for (const webhook of webhooks) {
      const webhookJson = JSON.stringify(webhook)
      if (currentSize + webhookJson.length + 2 > config.storage.chunkSizeBytes) {
        // +2 for comma and possible bracket
        chunks.push(currentChunk)
        currentChunk = [webhook]
        currentSize = webhookJson.length + 2
      } else {
        currentChunk.push(webhook)
        currentSize += webhookJson.length + 2
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk)
    }

    // Save each chunk
    for (let i = 0; i < chunks.length; i++) {
      await fs.writeFile(path.join(DATA_DIR, `webhooks_${i + 1}.json`), JSON.stringify(chunks[i]))
    }

    logger.info(`Saved ${webhooks.length} webhooks to ${chunks.length} files`)
  }
}

// Load all webhooks from files
async function loadAllWebhooks() {
  try {
    const files = await fs.readdir(DATA_DIR)
    const webhookFiles = files.filter((file) => file.startsWith("webhooks_") && file.endsWith(".json"))

    if (webhookFiles.length === 0) {
      return []
    }

    const webhooks = []
    for (const file of webhookFiles) {
      const content = await fs.readFile(path.join(DATA_DIR, file), "utf8")
      const fileWebhooks = JSON.parse(content)
      webhooks.push(...fileWebhooks)
    }

    logger.info(`Loaded ${webhooks.length} webhooks from ${webhookFiles.length} files`)
    return webhooks
  } catch (error) {
    logger.error(`Error loading webhooks: ${error.message}`)
    return []
  }
}

// Validate webhook
async function validateWebhook(webhook) {
  try {
    const response = await fetch(webhook)
    const isValid = response.status !== 404 // If not 404, the webhook is likely still active
    logger.debug(`Webhook ${webhook} is ${isValid ? "valid" : "invalid"}`)
    return isValid
  } catch (error) {
    logger.debug(`Error validating webhook ${webhook}: ${error.message}`)
    return false
  }
}

// Send notification to webhook
async function sendNotification(webhook) {
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: null,
        embeds: [config.notifications.message],
      }),
    })

    if (response.ok) {
      logger.info(`Successfully sent notification to ${webhook}`)
      return true
    } else {
      logger.warn(`Failed to send notification to ${webhook}: ${response.status} ${response.statusText}`)
      return false
    }
  } catch (error) {
    logger.error(`Error sending notification to ${webhook}: ${error.message}`)
    return false
  }
}

// Find new webhooks (not in existing list)
function findNewWebhooks(existingWebhooks, newWebhooks) {
  const existingSet = new Set(existingWebhooks)
  return newWebhooks.filter((webhook) => !existingSet.has(webhook))
}

// Main scan function
async function performScan() {
  const startTime = new Date()
  logger.info(`Starting scan at ${startTime.toISOString()}`)

  try {
    const dirCreated = await ensureDataDir()
    if (!dirCreated) {
      logger.error("Could not create data directory, aborting scan")
      return
    }

    // Load existing webhooks
    const existingWebhooks = await loadAllWebhooks()
    logger.info(`Loaded ${existingWebhooks.length} existing webhooks`)

    // Get GitHub token
    const token = process.env.GITHUB_TOKEN
    if (!token) {
      logger.error("GitHub token is required. Set GITHUB_TOKEN environment variable.")
      return
    }

    // Scan GitHub
    const scannedWebhooks = await scanGitHub(token, config.github.pagesPerScan)
    logger.info(`Found ${scannedWebhooks.length} webhooks in scan`)

    // Find new webhooks
    const newWebhooks = findNewWebhooks(existingWebhooks, scannedWebhooks)
    logger.info(`Found ${newWebhooks.length} new webhooks`)

    // Combine existing and new webhooks
    const allWebhooks = [...existingWebhooks, ...newWebhooks]

    // Save all webhooks
    if (newWebhooks.length > 0) {
      await saveWebhooks(allWebhooks)
      logger.info(`Updated webhook storage with ${allWebhooks.length} total webhooks`)

      // Auto-notify new webhooks if enabled
      if (config.notifications.enabled && config.notifications.autoNotifyNew && newWebhooks.length > 0) {
        logger.info(`Auto-notifying ${newWebhooks.length} new webhooks`)

        for (const webhook of newWebhooks) {
          // Validate before notifying if configured
          if (config.notifications.validateBeforeNotify) {
            const isValid = await validateWebhook(webhook)
            if (isValid) {
              await sendNotification(webhook)
            }
          } else {
            await sendNotification(webhook)
          }
        }
      }
    } else {
      logger.info("No new webhooks found, storage unchanged")
    }

    const endTime = new Date()
    const duration = (endTime - startTime) / 1000
    logger.info(`Scan completed at ${endTime.toISOString()} (duration: ${duration.toFixed(2)}s)`)
  } catch (error) {
    logger.error(`Error during scan: ${error.message}`)
    if (error.stack) {
      logger.debug(error.stack)
    }
  }
}

// Main function
async function main() {
  // Setup logger
  logger = await setupLogger()
  logger.info("Discord Webhook Scanner started")

  // Perform initial scan
  await performScan()

  // Schedule regular scans
  const scanIntervalMs = config.github.scanIntervalHours * 60 * 60 * 1000
  logger.info(`Scheduling regular scans every ${config.github.scanIntervalHours} hours`)

  setInterval(async () => {
    logger.info("Starting scheduled scan")
    await performScan()
  }, scanIntervalMs)

  // Handle process termination gracefully
  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully...")
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM. Shutting down gracefully...")
    process.exit(0)
  })

  // Keep the process running
  logger.info("Scanner is running in the background. Press Ctrl+C to stop.")
}

// Start the application
main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})

/**
 * Scanner Module
 *
 * Handles scanning GitHub repositories for Discord webhooks.
 * Includes functions for searching, extracting, and processing webhooks.
 */

import { Octokit } from "@octokit/rest"
import { getLogger } from "./logger.js"
import config from "../config.js"
import { loadAllWebhooks, appendWebhooks, getDataDirectory } from "./storage.js"
import { validateWebhook, sendNotification } from "./webhook.js"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

// Get logger instance
const logger = getLogger()

// Setup paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_DIR = path.resolve(dirname(__dirname), config.storage.dataDir)
const SCAN_STATE_FILE = path.join(DATA_DIR, "scan_state.json")

// Regular expression pattern for Discord webhooks
const WEBHOOK_PATTERN = /https:\/\/discord(app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+/g

// Global scan state
let scanState = {
  lastQuery: 0,
  lastPage: 0,
  scannedRepos: new Set(),
  scannedFiles: new Set(),
  foundWebhooks: new Set(), // Track webhooks found in the current session
}

/**
 * Loads the scan state from disk
 */
async function loadScanState() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })

    try {
      const data = await fs.readFile(SCAN_STATE_FILE, "utf8")
      const state = JSON.parse(data)

      scanState = {
        lastQuery: state.lastQuery || 0,
        lastPage: state.lastPage || 0,
        scannedRepos: new Set(state.scannedRepos || []),
        scannedFiles: new Set(state.scannedFiles || []),
        foundWebhooks: new Set(state.foundWebhooks || []), // Load found webhooks
      }

      logger.info(
        `Loaded scan state: Query ${scanState.lastQuery}, Page ${scanState.lastPage}, ${scanState.scannedRepos.size} repos, ${scanState.scannedFiles.size} files, ${scanState.foundWebhooks.size} webhooks`,
      )
    } catch (error) {
      // If file doesn't exist or is invalid, use default state
      logger.info("No previous scan state found, starting fresh")
    }
  } catch (error) {
    logger.error(`Error loading scan state: ${error.message}`)
  }
}

/**
 * Saves the scan state to disk
 */
async function saveScanState() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })

    const state = {
      lastQuery: scanState.lastQuery,
      lastPage: scanState.lastPage,
      scannedRepos: Array.from(scanState.scannedRepos),
      scannedFiles: Array.from(scanState.scannedFiles),
      foundWebhooks: Array.from(scanState.foundWebhooks), // Save found webhooks
    }

    await fs.writeFile(SCAN_STATE_FILE, JSON.stringify(state, null, 2))
    logger.debug("Saved scan state")
  } catch (error) {
    logger.error(`Error saving scan state: ${error.message}`)
  }
}

/**
 * Resets the scan state to start fresh
 */
export async function resetScanState() {
  scanState = {
    lastQuery: 0,
    lastPage: 0,
    scannedRepos: new Set(),
    scannedFiles: new Set(),
    foundWebhooks: new Set(),
  }

  try {
    await fs.unlink(SCAN_STATE_FILE)
    logger.info("Scan state reset")
  } catch (error) {
    // File might not exist, that's fine
  }
}

/**
 * Scans GitHub for Discord webhooks with incremental saving
 * @param {string} token - GitHub API token
 * @param {number} pages - Number of pages to scan per query
 * @param {boolean} saveIncrementally - Whether to save webhooks incrementally during scanning
 * @param {number} saveInterval - How many webhooks to find before saving (if saveIncrementally is true)
 * @param {boolean} continuePrevious - Whether to continue from previous scan state
 * @returns {Promise<string[]>} Array of discovered webhook URLs
 */
export async function scanGitHub(token, pages, saveIncrementally = false, saveInterval = 5, continuePrevious = false) {
  const octokit = new Octokit({ auth: token })
  const webhooks = new Set()
  const invalidWebhooks = new Set()
  let pendingWebhooks = []
  let totalProcessed = 0
  let lastSaveTime = Date.now()

  // Load previous scan state if continuing
  if (continuePrevious) {
    await loadScanState()
  } else {
    await resetScanState()
  }

  // Function to save pending webhooks
  const savePendingWebhooks = async () => {
    if (pendingWebhooks.length > 0) {
      logger.info(`Incrementally saving ${pendingWebhooks.length} webhooks...`)
      await appendWebhooks(pendingWebhooks)
      pendingWebhooks = []
      lastSaveTime = Date.now()
    }
  }

  const queries = config.github.searchQueries

  // Start from the last query if continuing
  for (let queryIndex = continuePrevious ? scanState.lastQuery : 0; queryIndex < queries.length; queryIndex++) {
    // Load previous scan state if continuing
    if (continuePrevious) {
      await loadScanState()
    } else {
      await resetScanState()
    }
    const query = queries[queryIndex]
    scanState.lastQuery = queryIndex

    logger.info(`Scanning GitHub for query: ${query} (${queryIndex + 1}/${queries.length})`)

    // Start from the last page if continuing, otherwise start from page 1
    const startPage = continuePrevious && queryIndex === scanState.lastQuery ? scanState.lastPage : 1

    for (let page = startPage; page <= pages; page++) {
      scanState.lastPage = page
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
          // Create a unique identifier for this file
          const fileId = `${item.repository.full_name}:${item.path}`

          // Skip if we've already scanned this file in this continuous session
          if (scanState.scannedFiles.has(fileId)) {
            logger.debug(`Skipping already scanned file: ${fileId}`)
            continue
          }

          // Mark this file as scanned
          scanState.scannedFiles.add(fileId)

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
                logger.info(`Found ${matches.length} potential webhooks in ${item.repository.full_name}/${item.path}`)

                // Process each webhook
                for (const webhook of matches) {
                  // Skip if we already know this webhook is invalid
                  if (invalidWebhooks.has(webhook)) {
                    logger.debug(`Skipping already known invalid webhook: ${webhook}`)
                    continue
                  }

                  // Skip if we already have this webhook in the current session
                  if (scanState.foundWebhooks.has(webhook)) {
                    logger.debug(`Skipping duplicate webhook in current session: ${webhook}`)
                    continue
                  }

                  // Mark this webhook as found in the current session
                  scanState.foundWebhooks.add(webhook)

                  // If validation before saving is enabled, validate the webhook
                  if (config.scanner.validateBeforeSaving) {
                    const isValid = await validateWebhook(webhook)
                    if (isValid) {
                      webhooks.add(webhook)
                      pendingWebhooks.push(webhook)
                      totalProcessed++
                      logger.debug(`Added valid webhook: ${webhook}`)
                    } else {
                      invalidWebhooks.add(webhook)
                      logger.debug(`Skipped invalid webhook: ${webhook}`)
                    }
                  } else {
                    // Add all webhooks without validation
                    webhooks.add(webhook)
                    pendingWebhooks.push(webhook)
                    totalProcessed++
                  }

                  // Save incrementally if enabled and we've reached the interval
                  // or if it's been more than 5 minutes since the last save
                  const timeSinceLastSave = Date.now() - lastSaveTime
                  if (
                    saveIncrementally &&
                    (pendingWebhooks.length >= saveInterval || timeSinceLastSave > 5 * 60 * 1000)
                  ) {
                    await savePendingWebhooks()
                    await saveScanState() // Save scan state when saving webhooks
                  }
                }
              }
            }
          } catch (error) {
            // Skip files that can't be accessed
            logger.debug(`Couldn't access file: ${error.message}`)
            continue
          }
        }

        // Save after each page if incremental saving is enabled
        if (saveIncrementally && pendingWebhooks.length > 0) {
          await savePendingWebhooks()
          await saveScanState() // Save scan state after each page
        }
      } catch (error) {
        if (error.status === 403 && error.headers && error.headers["x-ratelimit-remaining"] === "0") {
          const resetTime = new Date(Number.parseInt(error.headers["x-ratelimit-reset"]) * 1000)
          logger.warn(`Rate limit exceeded. Reset at ${resetTime.toLocaleTimeString()}`)

          // Save any pending webhooks before waiting
          if (saveIncrementally && pendingWebhooks.length > 0) {
            await savePendingWebhooks()
            await saveScanState() // Save scan state before waiting
          }

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

          // Save any pending webhooks before breaking
          if (saveIncrementally && pendingWebhooks.length > 0) {
            await savePendingWebhooks()
            await saveScanState() // Save scan state before breaking
          }

          break
        }
      }
    }

    // Reset page counter when moving to next query
    scanState.lastPage = 0
  }

  // Save any remaining pending webhooks
  if (pendingWebhooks.length > 0) {
    await savePendingWebhooks()
  }

  // In continuous mode, we want to maintain the scan state but reset the query and page counters
  if (scanState.lastQuery >= queries.length - 1) {
    logger.info("Completed all queries, preparing for next cycle")
    // Don't reset the entire scan state, just the query and page counters
    scanState.lastQuery = 0
    scanState.lastPage = 0
    await saveScanState()
  } else {
    await saveScanState()
  }

  // Log summary
  logger.info(`Scan complete. Found ${webhooks.size} valid webhooks and ${invalidWebhooks.size} invalid webhooks.`)

  return Array.from(webhooks)
}

/**
 * Find new webhooks that aren't in the existing list
 * @param {string[]} existingWebhooks - Array of existing webhook URLs
 * @param {string[]} newWebhooks - Array of newly discovered webhook URLs
 * @returns {string[]} Array of webhook URLs that are new
 */
export function findNewWebhooks(existingWebhooks, newWebhooks) {
  const existingSet = new Set(existingWebhooks)
  return newWebhooks.filter((webhook) => !existingSet.has(webhook))
}

/**
 * Performs a complete scan operation
 * Loads existing webhooks, scans for new ones, and appends the new ones
 * @param {boolean} isContinuous - Whether this is part of a continuous scan
 */
export async function performScan(isContinuous = false) {
  const startTime = new Date()
  logger.info(`Starting scan at ${startTime.toISOString()}`)
  logger.info(`Data directory: ${getDataDirectory()}`)

  try {
    // Get GitHub token
    const token = process.env.GITHUB_TOKEN
    if (!token) {
      logger.error("GitHub token is required. Set GITHUB_TOKEN environment variable.")
      return
    }

    // Scan GitHub with incremental saving if this is a continuous scan
    // Also continue from previous state if this is a continuous scan
    const scannedWebhooks = await scanGitHub(
      token,
      config.github.pagesPerScan,
      isContinuous,
      config.scanner.incrementalSaveInterval || 5,
      isContinuous && config.scanner.continuePreviousScan,
    )

    logger.info(`Found ${scannedWebhooks.length} valid webhooks in scan`)

    // For single scans, we still need to save at the end
    // For continuous scans, this is just a final check to make sure everything is saved
    if (scannedWebhooks.length > 0 && !isContinuous) {
      // Append new webhooks to storage (this will handle deduplication)
      await appendWebhooks(scannedWebhooks)
    }

    // Auto-notify new webhooks if enabled
    if (config.notifications.enabled && config.notifications.autoNotifyNew && scannedWebhooks.length > 0) {
      // Load existing webhooks to find which ones are new
      const existingWebhooks = await loadAllWebhooks()
      const newWebhooks = findNewWebhooks(
        existingWebhooks.filter((w) => !scannedWebhooks.includes(w)),
        scannedWebhooks,
      )

      if (newWebhooks.length > 0) {
        logger.info(`Auto-notifying ${newWebhooks.length} new webhooks`)

        for (const webhook of newWebhooks) {
          // Validate before notifying if configured
          if (config.notifications.validateBeforeNotify) {
            const isValid = await validateWebhook(webhook)
            if (isValid) {
              await sendNotification(webhook, {
                content: null,
                embeds: [config.notifications.message],
              })
            }
          } else {
            await sendNotification(webhook, {
              content: null,
              embeds: [config.notifications.message],
            })
          }
        }
      }
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
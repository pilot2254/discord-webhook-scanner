/**
 * Storage Module
 *
 * Handles file storage operations for webhooks.
 * Provides functions for saving, loading, and managing webhook data.
 */

import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"
import { getLogger } from "./logger.js"
import config from "../config.js"

// Get logger instance
const logger = getLogger()

// Setup paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_DIR = path.resolve(dirname(__dirname), config.storage.dataDir)

/**
 * Saves webhooks to files, splitting into chunks if necessary
 * Each webhook is saved on a new line for better readability
 * @param {string[]} webhooks - Array of webhook URLs to save
 */
export async function saveWebhooks(webhooks) {
  try {
    // Ensure the data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true })

    logger.info(`Saving ${webhooks.length} webhooks to ${DATA_DIR}`)

    // If there are no webhooks, create an empty file
    if (webhooks.length === 0) {
      await fs.writeFile(path.join(DATA_DIR, "webhooks_1.json"), "[]")
      logger.info("Created empty webhooks file")
      return
    }

    // Format the webhooks array with each webhook on a new line
    const webhooksJson = JSON.stringify(webhooks, null, 2)

    // Split into chunks if needed
    if (webhooksJson.length <= config.storage.chunkSizeBytes) {
      const filePath = path.join(DATA_DIR, "webhooks_1.json")
      await fs.writeFile(filePath, webhooksJson)
      logger.info(`Saved ${webhooks.length} webhooks to ${filePath}`)
    } else {
      // Split the array into chunks
      const chunks = []
      let currentChunk = []
      let currentSize = 0

      for (const webhook of webhooks) {
        // Estimate the size of this webhook in the JSON (including formatting)
        const webhookJson = JSON.stringify(webhook, null, 2)
        if (currentSize + webhookJson.length + 4 > config.storage.chunkSizeBytes) {
          // +4 for comma, newline and possible brackets
          chunks.push(currentChunk)
          currentChunk = [webhook]
          currentSize = webhookJson.length + 4
        } else {
          currentChunk.push(webhook)
          currentSize += webhookJson.length + 4
        }
      }

      if (currentChunk.length > 0) {
        chunks.push(currentChunk)
      }

      // Save each chunk
      for (let i = 0; i < chunks.length; i++) {
        const filePath = path.join(DATA_DIR, `webhooks_${i + 1}.json`)
        await fs.writeFile(filePath, JSON.stringify(chunks[i], null, 2))
      }

      logger.info(`Saved ${webhooks.length} webhooks to ${chunks.length} files in ${DATA_DIR}`)
    }
  } catch (error) {
    logger.error(`Error saving webhooks: ${error.message}`)
    throw error
  }
}

/**
 * Appends new webhooks to existing files without overwriting
 * @param {string[]} newWebhooks - Array of new webhook URLs to append
 */
export async function appendWebhooks(newWebhooks) {
  try {
    if (newWebhooks.length === 0) {
      logger.info("No new webhooks to append")
      return
    }

    // Load existing webhooks
    const existingWebhooks = await loadAllWebhooks()
    logger.info(`Loaded ${existingWebhooks.length} existing webhooks`)

    // Create a set of existing webhooks for faster lookup
    const existingWebhookSet = new Set(existingWebhooks)

    // Filter out webhooks that already exist
    const uniqueNewWebhooks = newWebhooks.filter((webhook) => !existingWebhookSet.has(webhook))

    if (uniqueNewWebhooks.length === 0) {
      logger.info("All new webhooks already exist in storage")
      return
    }

    logger.info(`Appending ${uniqueNewWebhooks.length} new unique webhooks`)

    // Combine existing and new webhooks
    const allWebhooks = [...existingWebhooks, ...uniqueNewWebhooks]

    // Save all webhooks
    await saveWebhooks(allWebhooks)

    logger.info(`Successfully appended ${uniqueNewWebhooks.length} webhooks. Total: ${allWebhooks.length}`)
  } catch (error) {
    logger.error(`Error appending webhooks: ${error.message}`)
    throw error
  }
}

/**
 * Clears all webhook files
 */
export async function clearWebhooks() {
  try {
    const files = await fs.readdir(DATA_DIR)
    for (const file of files) {
      if (file.startsWith("webhooks_") && file.endsWith(".json")) {
        await fs.unlink(path.join(DATA_DIR, file))
      }
    }
    logger.info("Cleared existing webhook files")
  } catch (error) {
    logger.error(`Error clearing webhooks: ${error.message}`)
  }
}

/**
 * Loads all webhooks from all chunk files
 * @returns {Promise<string[]>} Array of webhook URLs
 */
export async function loadAllWebhooks() {
  try {
    // Ensure the data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true })

    const files = await fs.readdir(DATA_DIR)
    const webhookFiles = files.filter((file) => file.startsWith("webhooks_") && file.endsWith(".json"))

    if (webhookFiles.length === 0) {
      logger.info("No webhook files found")
      return []
    }

    const webhooks = []
    for (const file of webhookFiles) {
      try {
        const filePath = path.join(DATA_DIR, file)
        const content = await fs.readFile(filePath, "utf8")

        // Handle empty files
        if (!content.trim()) {
          logger.warn(`Empty webhook file: ${file}`)
          continue
        }

        const fileWebhooks = JSON.parse(content)

        if (Array.isArray(fileWebhooks)) {
          webhooks.push(...fileWebhooks)
        } else {
          logger.warn(`Invalid webhook file format in ${file}`)
        }
      } catch (parseError) {
        logger.error(`Error parsing webhook file ${file}: ${parseError.message}`)
      }
    }

    logger.info(`Loaded ${webhooks.length} webhooks from ${webhookFiles.length} files`)
    return webhooks
  } catch (error) {
    logger.error(`Error loading webhooks: ${error.message}`)
    return []
  }
}

/**
 * Loads webhooks from a specific chunk file
 * @param {number} chunkNumber - The chunk number to load
 * @returns {Promise<string[]>} Array of webhook URLs from the specified chunk
 */
export async function loadWebhooksFromChunk(chunkNumber) {
  try {
    const filePath = path.join(DATA_DIR, `webhooks_${chunkNumber}.json`)
    const content = await fs.readFile(filePath, "utf8")

    // Handle empty files
    if (!content.trim()) {
      logger.warn(`Empty webhook file: webhooks_${chunkNumber}.json`)
      return []
    }

    const webhooks = JSON.parse(content)

    if (!Array.isArray(webhooks)) {
      logger.warn(`Invalid webhook file format in webhooks_${chunkNumber}.json`)
      return []
    }

    logger.info(`Loaded ${webhooks.length} webhooks from chunk ${chunkNumber}`)
    return webhooks
  } catch (error) {
    logger.error(`Error loading webhooks from chunk ${chunkNumber}: ${error.message}`)
    return []
  }
}

/**
 * Gets a list of available chunk numbers
 * @returns {Promise<number[]>} Array of available chunk numbers
 */
export async function getAvailableChunks() {
  try {
    // Ensure the data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true })

    const files = await fs.readdir(DATA_DIR)
    const webhookFiles = files.filter((file) => file.startsWith("webhooks_") && file.endsWith(".json"))

    return webhookFiles
      .map((file) => {
        const match = file.match(/webhooks_(\d+)\.json/)
        return match ? Number.parseInt(match[1]) : null
      })
      .filter((num) => num !== null)
      .sort((a, b) => a - b)
  } catch (error) {
    logger.error(`Error getting available chunks: ${error.message}`)
    return []
  }
}

/**
 * Gets the absolute path to the data directory
 * @returns {string} Absolute path to the data directory
 */
export function getDataDirectory() {
  return DATA_DIR
}
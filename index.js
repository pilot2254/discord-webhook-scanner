#!/usr/bin/env node
/**
 * Discord Webhook Scanner
 *
 * Main entry point for the application.
 * This file initializes the application and starts the CLI interface.
 *
 * @author Your Name
 * @version 1.0.0
 */

import dotenv from "dotenv"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import fs from "fs/promises"

// Load environment variables
dotenv.config()

// Import modules
import { setupLogger, getLogger } from "./src/logger.js"
import config from "./config.js"

// Setup paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_DIR = resolve(__dirname, config.storage.dataDir)
const LOG_DIR = resolve(__dirname, "logs")

/**
 * Ensures that the specified directories exist, creating them if necessary
 * @param {string[]} directories - Array of directory paths to ensure
 */
async function ensureDirectories(directories) {
  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error)
      throw error
    }
  }
}

/**
 * Main function to initialize and start the application
 */
async function main() {
  try {
    // Ensure required directories exist
    await ensureDirectories([DATA_DIR, LOG_DIR])

    // Setup logger first, before importing other modules
    await setupLogger(LOG_DIR)
    const logger = getLogger()
    logger.info("Discord Webhook Scanner started")

    // Check for GitHub token
    if (!process.env.GITHUB_TOKEN) {
      logger.error("GitHub token is required. Set GITHUB_TOKEN environment variable.")
      console.error("Error: GitHub token is required. Please set the GITHUB_TOKEN environment variable.")
      console.error("You can add it to your .env file: GITHUB_TOKEN=your_token_here")
      process.exit(1)
    }

    // Import CLI module after logger is initialized
    const { startCLI } = await import("./src/cli.js")

    // Start CLI interface
    await startCLI()
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

// Start the application
main()

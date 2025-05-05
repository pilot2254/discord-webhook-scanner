/**
 * CLI Interface Module
 *
 * Provides the command-line interface for the Discord Webhook Scanner.
 * Handles user input and menu navigation.
 */

import readline from "readline"
import { getLogger } from "./logger.js"
import { performScan, resetScanState } from "./scanner.js"
import {
  loadAllWebhooks,
  loadWebhooksFromChunk,
  getAvailableChunks,
  saveWebhooks,
  getDataDirectory,
} from "./storage.js"
import { validateWebhook, sendNotification } from "./webhook.js"
import config from "../config.js"

// Get logger instance
const logger = getLogger()

/**
 * Creates a readline interface for CLI interaction
 * @returns {readline.Interface} The readline interface
 */
function createCLI() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

/**
 * Displays the main menu options
 */
function displayMenu() {
  console.log("\n=== Discord Webhook Scanner ===")
  console.log("1. Start continuous scanning")
  console.log("2. Perform single scan")
  console.log("3. Send message to all webhooks")
  console.log("4. Send message to specific chunk")
  console.log("5. List available chunks")
  console.log("6. Count total webhooks")
  console.log("7. Validate all webhooks")
  console.log("8. Show data directory")
  console.log("9. Reset scan state")
  console.log("0. Exit")
  console.log("============================")
}

/**
 * Handles menu selection and executes the corresponding action
 * @param {string} selection - The user's menu selection
 * @param {readline.Interface} rl - The readline interface
 */
async function handleMenuSelection(selection, rl) {
  switch (selection) {
    case "1":
      console.log("Starting continuous scanning. Press Ctrl+C to stop.")
      console.log("Webhooks will be saved incrementally as they are found.")

      if (config.scanner.continuePreviousScan) {
        console.log("Continuing from previous scan state (if available).")
      } else {
        console.log("Starting a fresh scan (not continuing from previous state).")
      }

      await performScan(true) // Pass true to indicate continuous mode

      // Set up continuous scanning
      let scanCount = 1
      const continuousScan = async () => {
        console.log(`\nStarting scan #${scanCount + 1}...`)
        await performScan(true) // Pass true to indicate continuous mode
        scanCount++
        setTimeout(continuousScan, 1000) // Minimal delay between scans
      }

      setTimeout(continuousScan, 1000)
      break

    case "2":
      console.log("Performing single scan...")
      await performScan(false) // Pass false to indicate single scan mode
      displayMenu()
      break

    case "3":
      await sendMessageToAllWebhooks(rl)
      break

    case "4":
      await sendMessageToChunk(rl)
      break

    case "5":
      await listAvailableChunks()
      displayMenu()
      break

    case "6":
      await countTotalWebhooks()
      displayMenu()
      break

    case "7":
      await validateAllWebhooks()
      displayMenu()
      break

    case "8":
      showDataDirectory()
      displayMenu()
      break

    case "9":
      await resetScanState()
      console.log("Scan state has been reset. Next scan will start fresh.")
      displayMenu()
      break

    case "0":
      console.log("Exiting...")
      rl.close()
      process.exit(0)
      break

    default:
      console.log("Invalid selection. Please try again.")
      displayMenu()
      break
  }
}

/**
 * Shows the data directory path
 */
function showDataDirectory() {
  const dataDir = getDataDirectory()
  console.log(`Data directory: ${dataDir}`)
  console.log(`Webhook files are stored in this directory as JSON files.`)
  console.log(`Each webhook is stored on a separate line for easy copying.`)
}

/**
 * Sends a custom message to all webhooks
 * @param {readline.Interface} rl - The readline interface
 */
async function sendMessageToAllWebhooks(rl) {
  rl.question("Enter message content: ", async (content) => {
    const message = {
      content: content,
      embeds: [],
    }
    console.log("Sending message to all webhooks...")

    const webhooks = await loadAllWebhooks()
    if (webhooks.length === 0) {
      console.log("No webhooks found to send messages to")
      displayMenu()
      return
    }

    let successCount = 0
    for (const webhook of webhooks) {
      const isValid = await validateWebhook(webhook)
      if (isValid) {
        const success = await sendNotification(webhook, message)
        if (success) successCount++
      } else {
        logger.info(`Skipping invalid webhook: ${webhook}`)
      }
    }

    console.log(`Message sent to ${successCount}/${webhooks.length} webhooks.`)
    displayMenu()
  })
}

/**
 * Sends a custom message to webhooks in a specific chunk
 * @param {readline.Interface} rl - The readline interface
 */
async function sendMessageToChunk(rl) {
  const chunks = await getAvailableChunks()
  if (chunks.length === 0) {
    console.log("No chunks available.")
    displayMenu()
    return
  }

  console.log("Available chunks:", chunks.join(", "))
  rl.question("Enter chunk number: ", (chunkNumber) => {
    if (!chunks.includes(Number.parseInt(chunkNumber))) {
      console.log("Invalid chunk number.")
      displayMenu()
      return
    }

    rl.question("Enter message content: ", async (content) => {
      const message = {
        content: content,
        embeds: [],
      }
      console.log(`Sending message to webhooks in chunk ${chunkNumber}...`)

      const webhooks = await loadWebhooksFromChunk(Number.parseInt(chunkNumber))
      if (webhooks.length === 0) {
        console.log(`No webhooks found in chunk ${chunkNumber}`)
        displayMenu()
        return
      }

      let successCount = 0
      for (const webhook of webhooks) {
        const isValid = await validateWebhook(webhook)
        if (isValid) {
          const success = await sendNotification(webhook, message)
          if (success) successCount++
        } else {
          logger.info(`Skipping invalid webhook: ${webhook}`)
        }
      }

      console.log(`Message sent to ${successCount}/${webhooks.length} webhooks in chunk ${chunkNumber}.`)
      displayMenu()
    })
  })
}

/**
 * Lists all available webhook chunks
 */
async function listAvailableChunks() {
  const availableChunks = await getAvailableChunks()
  if (availableChunks.length === 0) {
    console.log("No chunks available.")
  } else {
    console.log("Available chunks:", availableChunks.join(", "))
    console.log(`Webhooks are stored in ${getDataDirectory()}`)
  }
}

/**
 * Counts and displays the total number of webhooks
 */
async function countTotalWebhooks() {
  const webhooks = await loadAllWebhooks()
  console.log(`Total webhooks: ${webhooks.length}`)
  console.log(`Webhooks are stored in ${getDataDirectory()}`)
}

/**
 * Validates all webhooks and reports how many are valid/invalid
 */
async function validateAllWebhooks() {
  console.log("Validating all webhooks...")
  const allWebhooks = await loadAllWebhooks()

  if (allWebhooks.length === 0) {
    console.log("No webhooks found to validate.")
    return
  }

  let validCount = 0
  let invalidCount = 0
  const invalidWebhooks = []

  for (const webhook of allWebhooks) {
    const isValid = await validateWebhook(webhook)
    if (isValid) {
      validCount++
    } else {
      invalidCount++
      invalidWebhooks.push(webhook)
    }

    // Show progress for large numbers of webhooks
    if ((validCount + invalidCount) % 10 === 0) {
      process.stdout.write(`\rProgress: ${validCount + invalidCount}/${allWebhooks.length}`)
    }
  }

  console.log(`\nValidation complete: ${validCount} valid, ${invalidCount} invalid webhooks.`)

  // If there are invalid webhooks, ask if the user wants to remove them
  if (invalidCount > 0) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const answer = await new Promise((resolve) => {
      rl.question(`Do you want to remove the ${invalidCount} invalid webhooks? (y/n): `, resolve)
    })

    rl.close()

    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      // Filter out invalid webhooks
      const validWebhooks = allWebhooks.filter((webhook) => !invalidWebhooks.includes(webhook))

      // Save only valid webhooks
      await saveWebhooks(validWebhooks)
      console.log(`Removed ${invalidCount} invalid webhooks. ${validCount} valid webhooks remain.`)
    }
  }
}

/**
 * Starts the CLI interface
 */
export async function startCLI() {
  // Create CLI
  const rl = createCLI()

  // Display menu
  displayMenu()

  // Handle user input
  rl.on("line", (input) => {
    handleMenuSelection(input, rl)
  })

  // Handle Ctrl+C
  rl.on("SIGINT", () => {
    console.log("\nExiting Discord Webhook Scanner...")
    process.exit(0)
  })
}
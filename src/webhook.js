/**
 * Webhook Module
 *
 * Handles webhook validation and notification functionality.
 * Provides functions for checking webhook validity and sending messages.
 */

import fetch from "node-fetch"
import { getLogger } from "./logger.js"

// Get logger instance
const logger = getLogger()

/**
 * Validates a webhook by sending a request to check if it exists and is active
 * @param {string} webhook - The webhook URL to validate
 * @returns {Promise<boolean>} True if the webhook is valid, false otherwise
 */
export async function validateWebhook(webhook) {
  try {
    // Send a GET request to the webhook URL
    const response = await fetch(webhook)

    // Check the status code first
    if (response.status === 404) {
      logger.debug(`Webhook ${webhook} is invalid (status: 404)`)
      return false
    }

    // Try to parse the response as JSON
    try {
      const data = await response.json()

      // Check for Discord's specific error code for invalid webhook tokens
      if (data && data.code === 50027) {
        logger.debug(`Webhook ${webhook} is invalid (Discord error code: 50027)`)
        return false
      }

      // If we got a valid response with webhook data (should have an id field)
      if (data && data.id) {
        logger.debug(`Webhook ${webhook} is valid (ID: ${data.id})`)
        return true
      }
    } catch (parseError) {
      // If we can't parse the response as JSON, check if the status is OK
      if (response.ok) {
        logger.debug(`Webhook ${webhook} appears valid (status: ${response.status})`)
        return true
      }
    }

    // If we get here, the webhook is likely invalid
    logger.debug(`Webhook ${webhook} is invalid (status: ${response.status})`)
    return false
  } catch (error) {
    logger.debug(`Error validating webhook ${webhook}: ${error.message}`)
    return false
  }
}

/**
 * Sends a notification message to a webhook
 * @param {string} webhook - The webhook URL to send the notification to
 * @param {Object} message - The message to send (can include content and embeds)
 * @returns {Promise<boolean>} True if the message was sent successfully, false otherwise
 */
export async function sendNotification(webhook, message) {
  try {
    // Validate the webhook before sending
    const isValid = await validateWebhook(webhook)
    if (!isValid) {
      logger.warn(`Skipping notification to invalid webhook: ${webhook}`)
      return false
    }

    // Send a POST request to the webhook URL with the message
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    })

    if (response.ok) {
      logger.info(`Successfully sent notification to ${webhook}`)
      return true
    } else {
      // Try to parse the error response
      try {
        const errorData = await response.json()
        logger.warn(
          `Failed to send notification to ${webhook}: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`,
        )
      } catch (e) {
        logger.warn(`Failed to send notification to ${webhook}: ${response.status} ${response.statusText}`)
      }

      // If the webhook returns a 429 (rate limit), we can try to extract the retry-after header
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after")
        if (retryAfter) {
          logger.warn(`Rate limited. Retry after ${retryAfter} seconds.`)
        }
      }

      return false
    }
  } catch (error) {
    logger.error(`Error sending notification to ${webhook}: ${error.message}`)
    return false
  }
}

/**
 * Creates a rich embed message for Discord
 * @param {Object} options - Options for the embed
 * @param {string} options.title - The title of the embed
 * @param {string} options.description - The description of the embed
 * @param {number} options.color - The color of the embed (decimal value)
 * @param {Array} options.fields - Array of fields for the embed
 * @param {Object} options.footer - Footer object with text property
 * @returns {Object} The formatted embed object
 */
export function createEmbed({ title, description, color, fields = [], footer = null }) {
  const embed = {
    title,
    description,
    color,
    fields,
  }

  if (footer) {
    embed.footer = footer
  }

  return embed
}

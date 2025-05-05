/**
 * Utilities Module
 *
 * Provides utility functions used throughout the application.
 */

import fs from "fs/promises"

/**
 * Ensures that the specified directories exist, creating them if necessary
 * @param {string[]} directories - Array of directory paths to ensure
 */
export async function ensureDirectories(directories) {
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
 * Sleeps for the specified number of milliseconds
 * @param {number} ms - Number of milliseconds to sleep
 * @returns {Promise<void>} A promise that resolves after the specified time
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Formats a date as an ISO string without milliseconds
 * @param {Date} date - The date to format
 * @returns {string} The formatted date string
 */
export function formatDate(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z")
}

/**
 * Calculates the time difference between two dates in a human-readable format
 * @param {Date} startDate - The start date
 * @param {Date} endDate - The end date
 * @returns {string} The formatted time difference
 */
export function formatTimeDifference(startDate, endDate) {
  const diffMs = endDate - startDate
  const seconds = Math.floor(diffMs / 1000)

  if (seconds < 60) {
    return `${seconds} seconds`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes < 60) {
    return `${minutes} minutes, ${remainingSeconds} seconds`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return `${hours} hours, ${remainingMinutes} minutes, ${remainingSeconds} seconds`
}

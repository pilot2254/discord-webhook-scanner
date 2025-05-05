/**
 * Logger Module
 *
 * Provides logging functionality for the application.
 * Creates and configures a Winston logger instance.
 */

import winston from "winston"
import path from "path"
import config from "../config.js"

// Global logger instance - initialize with a default console logger to avoid errors
let logger = winston.createLogger({
  level: "info",
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
  ],
})

/**
 * Sets up the logger with the specified configuration
 * @param {string} logDir - Directory to store log files
 * @returns {winston.Logger} The configured logger instance
 */
export async function setupLogger(logDir) {
  // Create logger with specified configuration
  logger = winston.createLogger({
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
              filename: path.join(logDir, "scanner.log"),
              maxsize: (config.logging.maxLogFileSizeMB || 10) * 1024 * 1024,
              maxFiles: config.logging.maxLogFiles || 5,
            }),
          ]
        : []),
    ],
  })

  logger.info("Logger initialized")
  return logger
}

/**
 * Gets the logger instance
 * @returns {winston.Logger} The logger instance
 */
export function getLogger() {
  // No need to throw an error, we now have a default logger
  return logger
}

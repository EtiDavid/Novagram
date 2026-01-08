// utils/logger.js
const { createLogger, format, transports } = require("winston");
const { randomUUID } = require("crypto");


const env = process.env.NODE_ENV || "development";
const baseLevel = env === "development" ? "debug" : "info";
const logLevel = process.env.LOG_LEVEL || baseLevel;

// JSON log format, good for production / log aggregators
const jsonFormat = format.printf(({ level, message, timestamp, requestId, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    message,
    requestId,
    ...meta
  });
});

const logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    jsonFormat
  ),
  transports: [
    new transports.Console()
  ]
});

// Express middleware – adds correlation ID and logs incoming HTTP requests
function requestLogger(req, res, next) {
  const requestId = randomUUID();
  req.requestId = requestId;

  logger.info("HTTP_REQUEST", {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  next();
}

module.exports = { logger, requestLogger };

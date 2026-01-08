// server.js  (runs app in real life)
process.on("uncaughtException", err => {
  console.error("UNCAUGHT_EXCEPTION", err);
});

process.on("unhandledRejection", err => {
  console.error("UNHANDLED_REJECTION", err);
});

require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "development"}`
});

const { server } = require("./app");
const { logger } = require("./utils/logger");

const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  logger.info("SERVER_STARTED", {
    port: PORT,
    env: process.env.NODE_ENV || "development"
  });
});

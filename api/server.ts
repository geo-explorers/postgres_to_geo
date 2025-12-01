import express from "express";
import dotenv from "dotenv";
import { authenticateApiKey } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";
import processEpisodesRouter from "./routes/process-episodes.js";

dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

app.use(express.json());

// Apply authentication middleware to all API routes
app.use("/api", authenticateApiKey);

app.use("/api/export", processEpisodesRouter);

app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n=================================`);
  console.log(`Express API Server Started`);
  console.log(`=================================`);
  console.log(`Port: ${PORT}`);
  console.log(`Endpoint: POST http://localhost:${PORT}/api/export`);
  console.log(`API Key: ${process.env.API_KEY ? "ADDED" : "MISSING"}`);
  console.log(`=================================\n`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log("\nShutting down gracefully...");

  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

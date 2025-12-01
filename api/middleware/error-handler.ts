import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "../utils/types.js";

/**
 * Global error handling middleware
 * Catches all errors and formats them into consistent JSON responses
 * Must be registered as the last middleware in the Express app
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error to console for debugging
  console.error("Error occurred:", {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    error: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  // Handle validation errors
  if (err instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: "Validation Error",
      message: err.message,
      details: {
        field: err.field,
        expected: err.expected,
        received: err.received,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle PostgreSQL connection errors
  if (err.code === "ECONNREFUSED" || err.message?.includes("PostgreSQL")) {
    res.status(500).json({
      success: false,
      error: "Database Error",
      message: "Failed to connect to database",
      code: err.code,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle timeout errors
  if (err.name === "TimeoutError" || err.message?.includes("timeout")) {
    res.status(504).json({
      success: false,
      error: "Timeout Error",
      message: "Request processing took too long",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle all other errors as internal server errors
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: err.message || "An unexpected error occurred",
    code: err.code,
    timestamp: new Date().toISOString(),
  });
}

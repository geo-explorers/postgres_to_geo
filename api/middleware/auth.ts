import type { Request, Response, NextFunction } from "express";

/**
 * Middleware to authenticate requests using X-API-Key header
 * Compares the provided API key against the API_KEY environment variable
 */
export function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers["x-api-key"];
  const expectedApiKey = process.env.API_KEY;

  // Check if API key is missing
  if (!apiKey) {
    res.status(403).json({
      success: false,
      error: "Forbidden",
      message: "X-API-Key header is required",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Check if API key is invalid
  if (apiKey !== expectedApiKey) {
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid API key",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}

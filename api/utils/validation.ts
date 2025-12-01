import { type ProcessEpisodesRequest, ValidationError } from "./types.js";

/**
 * Validates the request body for the process episodes endpoint
 * @param body - The request body to validate
 * @returns Validated ProcessEpisodesRequest object
 * @throws ValidationError if validation fails
 */
export function validateRequest(body: any): ProcessEpisodesRequest {
  // Check if body exists
  if (!body || typeof body !== "object") {
    throw new ValidationError(
      "Request body must be a valid JSON object",
      "body",
      "object",
      typeof body
    );
  }

  // Validate podcast_name
  if (!Array.isArray(body.podcast_name)) {
    throw new ValidationError(
      "podcast_name must be an array",
      "podcast_name",
      "string[]",
      typeof body.podcast_name
    );
  }

  if (body.podcast_name.length < 1) {
    throw new ValidationError(
      "podcast_name must contain at least 1 podcast",
      "podcast_name",
      "min 1 item",
      `${body.podcast_name.length} items`
    );
  }

  // Check that all items in podcast_name are strings
  for (let i = 0; i < body.podcast_name.length; i++) {
    if (typeof body.podcast_name[i] !== "string") {
      throw new ValidationError(
        `podcast_name[${i}] must be a string`,
        `podcast_name[${i}]`,
        "string",
        typeof body.podcast_name[i]
      );
    }
  }

  // Validate limit
  if (typeof body.limit !== "number" || !Number.isInteger(body.limit)) {
    throw new ValidationError(
      "limit must be an integer",
      "limit",
      "integer",
      typeof body.limit
    );
  }

  if (body.limit < 1) {
    throw new ValidationError(
      "limit must be at least 1",
      "limit",
      "min 1",
      body.limit.toString()
    );
  }

  // Validate num_episodes
  if (
    typeof body.num_episodes !== "number" ||
    !Number.isInteger(body.num_episodes)
  ) {
    throw new ValidationError(
      "num_episodes must be an integer",
      "num_episodes",
      "integer",
      typeof body.num_episodes
    );
  }

  if (body.num_episodes < 1) {
    throw new ValidationError(
      "num_episodes must be at least 1",
      "num_episodes",
      "min 1",
      body.num_episodes.toString()
    );
  }

  // Validate date_filter
  if (typeof body.date_filter !== "string") {
    throw new ValidationError(
      "date_filter must be a string",
      "date_filter",
      "string (YYYY-MM-DD)",
      typeof body.date_filter
    );
  }

  // Check date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(body.date_filter)) {
    throw new ValidationError(
      "date_filter must be in YYYY-MM-DD format",
      "date_filter",
      "YYYY-MM-DD",
      body.date_filter
    );
  }

  // Check if it's a valid date
  const date = new Date(body.date_filter);
  if (isNaN(date.getTime())) {
    throw new ValidationError(
      "date_filter must be a valid date",
      "date_filter",
      "valid date",
      body.date_filter
    );
  }

  return {
    podcast_name: body.podcast_name,
    limit: body.limit,
    num_episodes: body.num_episodes,
    date_filter: body.date_filter,
  };
}

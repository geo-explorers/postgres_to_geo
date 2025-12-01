import { Router, type Request, type Response, type NextFunction } from "express";
import { validateRequest } from "../utils/validation.js";
import { processPodcastWorkflow } from "../../src/workflow.js";
import type { ProcessEpisodesResponse } from "../utils/types.js";

const router = Router();

/**
 * POST /api/export
 * Main endpoint to process podcast episodes and publish to Geo protocol
 *
 * Request body: { podcast_name: string[], limit: number, num_episodes: number, date_filter: string }
 * Response: { success: boolean, message: string, data: WorkflowResult }
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const validatedParams = validateRequest(req.body);

    console.log("Processing episodes with params:", validatedParams);

    // Call the workflow function
    const result = await processPodcastWorkflow(validatedParams);

    // Format success response
    const response: ProcessEpisodesResponse = {
      success: true,
      message: "Podcast episodes processed successfully",
      data: result,
    };

    res.status(200).json(response);
  } catch (error) {
    // Pass errors to the error handler middleware
    next(error);
  }
});

export default router;

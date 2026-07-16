import { z } from "zod";
import { ConcurrencyLimitStrategy } from "@hatchet-dev/typescript-sdk";
import { hatchet } from "./client.ts";
import { processPodcastWorkflow, type WorkflowResult } from "../workflow.ts";

/**
 * Input contract for podcast.publish — mirrors the retired api/utils/validation.ts
 * rules, so the worker validates its own input now that the HTTP layer is gone.
 */
const PodcastPublishInput = z.object({
  podcast_name: z.array(z.string()).min(1),
  limit: z.number().int().min(1),
  num_episodes: z.number().int().min(1),
  date_filter: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_filter must be YYYY-MM-DD")
    .refine((s) => !Number.isNaN(Date.parse(s)), "date_filter must be a valid date"),
});

// `type` aliases (not the workflow.ts interfaces) so they satisfy the SDK's
// InputType/OutputType = JsonObject constraint; structurally identical to
// WorkflowParams / WorkflowResult.
type PublishInput = z.infer<typeof PodcastPublishInput>;
type PublishResult = { [K in keyof WorkflowResult]: WorkflowResult[K] };

/**
 * podcast.publish — runs the real Geo publish IN this worker (no HTTP proxy).
 *
 * The single step calls the existing, engine-neutral processPodcastWorkflow().
 *
 * concurrency: a constant group with maxRuns=1 makes this a single GLOBAL
 * consumer — at most one publish runs at a time; additional triggers QUEUE.
 * limitStrategy MUST be GROUP_ROUND_ROBIN: the SDK default is CANCEL_IN_PROGRESS,
 * which would kill a running ~25-min non-idempotent publish when the next trigger
 * arrives. retries=0 because the publish is not idempotent.
 */
export const podcastPublish = hatchet.task({
  name: "podcast.publish",
  retries: 0,
  // 2026-07-16: raised from 120m after the zombie-run incident. The corpus sweep
  // grows with the graph and real runs now take up to ~7h under API degradation;
  // when executionTimeout fired, Hatchet marked the run FAILED and freed the
  // maxRuns=1 slot, but processPodcastWorkflow has no abort wiring — the process
  // kept running and PUBLISHED hours later with a stale corpus, concurrently with
  // the next run → duplicate episodes. Same zombie behavior applies to manual
  // console cancels: do not cancel runs until the workflow is cancellation-aware.
  executionTimeout: "360m",
  scheduleTimeout: "420m", // must exceed executionTimeout: a queued run must not be cancelled while one is running
  inputValidator: PodcastPublishInput,
  concurrency: {
    maxRuns: 1,
    limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
    expression: "'podcast-publish'", // constant CEL literal → one global queue
  },
  fn: async (input: PublishInput): Promise<PublishResult> => {
    return await processPodcastWorkflow(input);
  },
});

import { z } from "zod";
import { ConcurrencyLimitStrategy } from "@hatchet-dev/typescript-sdk/v1";
import type { Duration } from "@hatchet-dev/typescript-sdk/v1";
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
// Env-configurable timeouts (Hatchet duration strings, e.g. "360m", "6h").
// Cast: env values can't be statically checked against the SDK's Duration
// template type; invalid strings fail loudly at task registration.
const EXECUTION_TIMEOUT = (process.env.PUBLISH_EXECUTION_TIMEOUT ?? "360m") as Duration;
const SCHEDULE_TIMEOUT = (process.env.PUBLISH_SCHEDULE_TIMEOUT ?? "420m") as Duration;

export const podcastPublish = hatchet.task({
  name: "podcast.publish",
  retries: 0,
  // 2026-07-16 zombie-run incident: when executionTimeout fired (was 120m, far
  // below real sweep durations), Hatchet marked the run FAILED and freed the
  // maxRuns=1 slot while the un-abortable process kept running and PUBLISHED
  // hours later with a stale corpus → duplicate episodes. Two-part fix:
  //   1. timeouts are env-configurable (PUBLISH_EXECUTION_TIMEOUT /
  //      PUBLISH_SCHEDULE_TIMEOUT) with generous defaults;
  //   2. the workflow is now cancellation-aware (ctx.abortController.signal is
  //      threaded through the corpus sweep, the episode loop, and — decisively —
  //      a guard immediately before publish), so a timed-out or console-cancelled
  //      run stops quickly and can NEVER publish as a zombie.
  executionTimeout: EXECUTION_TIMEOUT,
  scheduleTimeout: SCHEDULE_TIMEOUT, // must exceed executionTimeout: a queued run must not be cancelled while one is running
  inputValidator: PodcastPublishInput,
  concurrency: {
    maxRuns: 1,
    limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
    expression: "'podcast-publish'", // constant CEL literal → one global queue
  },
  fn: async (input: PublishInput, ctx): Promise<PublishResult> => {
    return await processPodcastWorkflow(input, { signal: ctx.abortController.signal });
  },
});

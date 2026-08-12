import { hatchet } from "./hatchet/client.ts";
import { podcastPublish } from "./hatchet/podcast-publish.ts";
import { episodeDedupFind, episodeDedupPrune, episodeDedupSweep } from "./hatchet/episode-dedup.ts";
import { updateEpisodeClaims } from "./hatchet/update-episode-claims.ts";

/**
 * postgres-to-geo worker entrypoint (run: `npm run start:worker`).
 *
 * Registers the podcast.publish task and connects to the self-hosted Hatchet
 * engine over gRPC. Long-running; worker.start() blocks.
 *
 * NOTE: importing podcast-publish → workflow.ts → constants.ts → config.ts,
 * which throws at import if PK / RPC / W_ADDRESS / SW_ADDRESS are unset. The
 * worker service must have all publish env vars (plus POSTGRES_* and PK_SW) or
 * it crashes on boot before the handler ever runs.
 */
async function main(): Promise<void> {
  const worker = await hatchet.worker("postgres-to-geo-worker", {
    workflows: [podcastPublish, episodeDedupFind, episodeDedupPrune, episodeDedupSweep, updateEpisodeClaims],
    slots: 2, // concurrency=1 on the task is the real gate; slots just bound local capacity
  });
  await worker.start();
}

main().catch((err) => {
  console.error("postgres-to-geo worker failed to start:", err);
  process.exit(1);
});

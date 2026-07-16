import { HatchetClient } from "@hatchet-dev/typescript-sdk/v1";

/**
 * Shared Hatchet client for the postgres-to-geo worker.
 *
 * Reads its connection config from the environment — the SAME vars the Python
 * extraction-worker uses: HATCHET_CLIENT_TOKEN, HATCHET_CLIENT_HOST_PORT (the
 * engine gRPC, e.g. hatchet-engine.railway.internal:7070), and
 * HATCHET_CLIENT_TLS_STRATEGY=none (insecure gRPC over the private mesh).
 *
 * Construction does not open a connection; that happens when the worker starts.
 */
export const hatchet = HatchetClient.init();

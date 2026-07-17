// ─── Episode → Geo space classifier ─────────────────────────────────────────
// Decides which Geo space an episode's brand-new entities publish to. Today the
// pipeline puts everything in the Podcasts space; this routes shortlisted crypto
// podcasts to the Crypto space instead. Kept as a first-match-wins rule list so
// future rules (more shortlists, keyword rules, ML classifiers) are one-line
// additions — no change to callers or to buildEntityCached.
//
// NOTE: the space returned here is the TARGET for NEW entities. buildEntityCached
// downgrades any entity that already exists on Geo back to Podcasts, so existing
// shared entities never gain a new-space presence. See src/functions.ts (the
// `effectiveSpaceId` restamp before final assembly).

import { normalizeName } from './functions.ts';
import { SPACE_IDS } from './constants.ts';

/** Inputs a rule may consult. `tables` resolves the parent podcast (and future signals). */
export interface ClassificationContext {
  episode: any;
  tables: Record<string, any[]>;
}

/** A single routing rule. Rules are tried in order; the first match wins. */
export interface ClassificationRule {
  name: string;
  match: (ctx: ClassificationContext) => boolean;
  spaceId: string;
}

// Crypto show shortlist (from podcast_space_migration_analysis.md), stored
// PRE-NORMALIZED so matching is O(1) and normalization can't drift between the
// list and the comparison. `normalizeName` lowercases, drops "the", &→and, strips
// punctuation/periods, and collapses whitespace — applied to both sides.
// "Empire" is deliberately NOT listed: the only podcasts row named Empire is
// Goalhanger's history show (feed …/empirepodcast, verified against the DB
// 2026-07-17); Blockworks' crypto Empire is not ingested. Listing the name
// routed history episodes to the Crypto space. If the crypto Empire is ever
// ingested, re-add it keyed by rss_feed_url (…/empire), not by name.
const CRYPTO_PODCAST_NAMES: ReadonlySet<string> = new Set(
  [
    'Bankless', 'What Bitcoin Did', 'TFTC: A Bitcoin Podcast', 'Bitcoin Audible',
    'Stephan Livera Podcast', 'Coin Bureau', 'Unchained', '0xResearch',
    'Epicenter', 'The Breakdown', 'The Pomp Podcast',
  ].map((n) => normalizeName(n)!),
);

/** Resolve the parent podcast row from the episode's `podcast` relation. Null on any gap. */
function resolvePodcast(episode: any, tables: Record<string, any[]>): any | null {
  const toId = episode?.podcast?.[0]?.to_id;
  if (toId == null) return null;
  // `==` on purpose: the episode's to_id and podcasts.id may differ in JS type (number vs string).
  return (tables?.podcasts ?? []).find((r: any) => r?.id == toId) ?? null;
}

const CRYPTO_RULE: ClassificationRule = {
  name: 'crypto-shortlist',
  spaceId: SPACE_IDS.crypto,
  match: ({ episode, tables }) => {
    const name = resolvePodcast(episode, tables)?.name;
    const key = name ? normalizeName(name) : null;
    return !!key && CRYPTO_PODCAST_NAMES.has(key);
  },
};

// Ordered; add more rules here (other shortlists, keyword rules, ML) as we grow.
const RULES: ReadonlyArray<ClassificationRule> = [CRYPTO_RULE];

/**
 * Choose the target Geo space for an episode's new entities. Never throws — any
 * resolution failure falls back to the Podcasts space (today's default behavior).
 */
export function classifyEpisodeSpace(ctx: ClassificationContext): string {
  try {
    for (const rule of RULES) {
      if (rule.match(ctx)) return rule.spaceId;
    }
  } catch {
    // Defensive: a bad classification must degrade to the default, never abort a run.
  }
  return SPACE_IDS.podcasts;
}

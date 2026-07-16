// ─── Local CLI for the episode dedup sweep (same code the Hatchet tasks run) ──
// Usage:
//   tsx run_episode_dedup.ts --since 2026-01-01              # find + report (read-only)
//   tsx run_episode_dedup.ts --since 2026-01-01 --execute --max 200   # prune for real
import { readFileSync, writeFileSync } from 'fs';
import { findDuplicateEpisodes, executePrunePlan } from './src/graph_ops/episode_dedup.ts';

const args = process.argv.slice(2);
const get = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const since = get('--since') ?? new Date(Date.now() - 48 * 3600_000).toISOString();
const execute = args.includes('--execute');
const max = Number(get('--max') ?? 50);
const planFile = get('--plan');

let plan;
if (planFile) {
  console.log(`loading plan from ${planFile}`);
  plan = JSON.parse(readFileSync(planFile, 'utf-8'));
} else {
  console.log(`find: since=${since}`);
  plan = await findDuplicateEpisodes({ sinceIso: new Date(since).toISOString() });
  writeFileSync('episode-prune-plan.json', JSON.stringify(plan, null, 2));
  console.log('plan saved → episode-prune-plan.json');
}
console.log(`scanned=${plan.scanned} groups=${plan.groups.length} surplus=${plan.surplus} review=${plan.review.length}`);
for (const g of plan.groups.slice(0, 15)) console.log(`  PRUNE "${g.name.slice(0, 55)}" keep=${g.keep.slice(0, 8)} prune=[${g.prune.map((p: string) => p.slice(0, 8)).join(',')}]`);
if (plan.groups.length > 15) console.log(`  ... and ${plan.groups.length - 15} more`);
for (const r of plan.review) console.log(`  REVIEW ${r}`);

const report = await executePrunePlan(plan, { dryRun: !execute, maxDeletions: max });
console.log(JSON.stringify(report, null, 2));

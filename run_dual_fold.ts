// CLI for the dual-residency fold (F3). READ-ONLY by default:
//   bun run_dual_fold.ts --find                       # scan + write dual-fold-plan.json
//   bun run_dual_fold.ts --execute [--max N] [--batch M]   # dry-run the saved plan
//   bun run_dual_fold.ts --execute --publish [--max N]     # real fold (deletions published)
import * as fs from 'fs';
import { findDualResidencyFold, executeDualFold, type FoldPlan } from './src/graph_ops/dual_residency_fold.ts';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const num = (f: string, d: number) => { const i = args.indexOf(f); return i >= 0 ? parseInt(args[i + 1]) : d; };
const PLAN_FILE = 'dual-fold-plan.json';

if (has('--find')) {
  const plan = await findDualResidencyFold();
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2));
  const byKindSide: Record<string, number> = {};
  for (const e of plan.entries) byKindSide[`${e.kind}→keep ${e.keepSpace.slice(0, 8)}`] = (byKindSide[`${e.kind}→keep ${e.keepSpace.slice(0, 8)}`] ?? 0) + 1;
  console.log(`scanned: ${plan.scanned.episodes} episodes, ${plan.scanned.claims} claims`);
  console.log(`fold entries: ${plan.entries.length}`, byKindSide);
  console.log(`undeterminable: ${plan.undeterminable.length}`);
  for (const u of plan.undeterminable.slice(0, 10)) console.log(`  ? ${u.kind} ${u.id.slice(0, 8)} — ${u.reason}`);
  console.log(`plan written to ${PLAN_FILE}`);
} else if (has('--execute')) {
  const plan: FoldPlan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
  const max = num('--max', 100);
  const slice: FoldPlan = { ...plan, entries: plan.entries.slice(0, max) };
  const report = await executeDualFold(slice, {
    dryRun: !has('--publish'),
    maxEntities: max,
    batchSize: num('--batch', 25),
  });
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('usage: --find | --execute [--publish] [--max N] [--batch M]');
}

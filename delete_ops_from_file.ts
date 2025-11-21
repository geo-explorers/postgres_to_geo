import fs from 'fs';
import path from 'path';
import { SPACE_IDS, } from './src/constants.ts';
import { Graph, type Op } from '@graphprotocol/grc-20';
import { publishOps, addSpace } from './src/functions.ts';

function readOpsFromFile(dir_in: string, fn: string): any {
  const filePath = path.join(dir_in, fn);

  if (!fs.existsSync(filePath)) {
    console.error(`File ${fn} does not exist`);
    return null;
  }

  const fileContents = fs.readFileSync(filePath, 'utf-8');

  try {
    const ops = JSON.parse(fileContents);
    console.log(`Read ${ops.length} ops from ${fn}`);
    return ops;
  } catch (err) {
    console.error(`Failed to parse JSON from file ${fn}`, err);
    return null;
  }
}

function getPropertyIdsFromUpdateOp(ops: any[], entityId: string): string[] {
  const updateOp = ops.find(op =>
    op.type === "UPDATE_ENTITY" && op.entity.id === entityId
  );

  if (!updateOp || !Array.isArray(updateOp.entity.values)) {
    return [];
  }

  return updateOp.entity.values
    .map((value: any) => value.property)
    .filter((propertyId: any) => propertyId !== undefined && propertyId !== null);
}


const del_ops: Array<Op> = [];
const currSpaceId = SPACE_IDS.podcasts;
let addOps;

//published_ops/push_1_ep_allin_claims_corrected.txt published_ops/push_1_ep_allin_claims_fail.txt published_ops/push_1_ep_allin_rerun_last_fix_sacks.txt published_ops/push_1_ep_allin.txt published_ops/push_1_ep_fridman.txt published_ops/push_10_ep_allin_rerun.txt published_ops/push_10_ep_allin.txt published_ops/push_10_ep_bankless.txt published_ops/push_10_ep_daily.txt published_ops/push_10_ep_freakonomics.txt published_ops/push_10_ep_fridman.txt published_ops/push_10_ep_honestly.txt published_ops/push_10_ep_huberman_v1.txt published_ops/push_10_ep_rogan.txt published_ops/push_10_ep_upfirst.txt published_ops/push_100_ep_allin_claims_attempt1.txt published_ops/push_100_ep_allin_claims_corrected.txt published_ops/push_100_ep_allin.txt published_ops/push_100_ep_daily.txt published_ops/push_100_ep_freakonomics.txt published_ops/push_100_ep_fridman.txt published_ops/push_100_ep_huberman.txt published_ops/push_100_ep_rogan.txt published_ops/push_100_ep_upfirst.txt published_ops/push_roles.txt published_ops/push_topics_second_pass.txt published_ops/push_topics.txt
const dir_in = "published_ops";
const fn = "push_100_ep_allin_claims.txt";
const ops = readOpsFromFile(dir_in, fn);

const del_ent_vals: Array<Op> = [];

const updateEntityIds = ops
  .filter((op: any) => op.type === "UPDATE_ENTITY")
  .map((op: any) => op.entity.id);

const uniqueEntityIds: any[] = [...new Set(updateEntityIds)];

for (const entityId of uniqueEntityIds) {
    addOps = Graph.unsetEntityValues({
        id: entityId,
        properties: getPropertyIdsFromUpdateOp(ops, entityId)
    })
    del_ops.push(...addOps.ops);
}

const createRelationIds = ops
  .filter((op: any) => op.type === "CREATE_RELATION")
  .map((op: any) => op.relation.id);

const uniqueRelationIds: any[] = [...new Set(createRelationIds)];

for (const relationId of uniqueRelationIds) {
    addOps = Graph.deleteRelation({id: relationId});
    del_ops.push(...addOps.ops);
}



//printOps(del_ops)
await publishOps(await addSpace(del_ops, currSpaceId))


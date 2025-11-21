import { SPACE_IDS } from './src/constants.ts';
import { Graph, IdUtils, SystemIds, type Op } from '@graphprotocol/grc-20';
import PostgreSQLClient from "./src/postgres-client.ts";
import { topicBreakdown, platformBreakdown, sourceBreakdown, personBreakdown, listenOnBreakdown, podcastBreakdown, roleBreakdown, podcastAppearanceBreakdown, episodeBreakdown, quoteBreakdown, claimBreakdown, read_in_tables, pageBreakdown, textBlockBreakdown, loadGeoEntities, loadGeoEntities_to_delete } from './src/setup_ontology.ts';
import { printOps, publishOps, type Entity, entityCache, buildEntityCached, addSpace } from './src/functions.ts';
import { processEntity } from './post_entity.ts';
import * as fs from "fs";

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



const ops: Array<Op> = [];
let addOps;
const processingCache: Record<string, Entity> = {};
const imageCache: Record<string, Entity> = {};

const offset = 0
const limit = 100
const pgClient = new PostgreSQLClient();
// global or passed down as a parameter

console.log("HERE")
process.on('SIGINT', async () => {
    console.log("FINAL OFFSET: ", offset);
    console.log('Exiting gracefully...');
    await pgClient.close();
    process.exit(0);
});

try {

    const geoEntities = await loadGeoEntities()

    /*
    // 1️⃣ Optional: filter out empty or null names
    const names = geoEntities.topics
        .map(e => e.name)
        .filter(name => name); // remove null/undefined/empty string

    // 2️⃣ Count occurrences
    const nameCounts: Record<string, number> = {};
    for (const name of names) {
        nameCounts[name] = (nameCounts[name] || 0) + 1;
    }

    // 3️⃣ Keep only duplicates
    const duplicates = Object.entries(nameCounts)
        .filter(([_, count]) => count > 1)
        .map(([name]) => name);

    console.log(duplicates);
    */

    
    //const result = geoEntities.topics.filter(e => e.id == "fa4cd954-56a6-4d20-ad06-d46337022e46");

    const results = geoEntities.topics.filter(e => !e.name);
    for (const entity of results) {
        const allIds = [...new Set(entity.values.map(item => item.propertyId))];

        if (allIds.length > 0) {
            addOps = Graph.unsetEntityValues({
                id: entity.id,
                properties: allIds
            })
            ops.push(...addOps.ops);
        }

        const allRelationIds = [...new Set(entity.relations.map(item => item.id))];
        const uniqueRelationIds: any[] = [...new Set(allRelationIds)];
    
        for (const relationId of uniqueRelationIds) {
            addOps = Graph.deleteRelation({id: relationId});
            ops.push(...addOps.ops);
        }

        const allBacklinkIds = [...new Set(entity.backlinks.map(item => item.id))];
        const uniqueBacklinkIds: any[] = [...new Set(allBacklinkIds)];
    
        for (const relationId of uniqueBacklinkIds) {
            addOps = Graph.deleteRelation({id: relationId});
            ops.push(...addOps.ops);
        }
    }
    console.log(ops)
    //await publishOps(await addSpace(ops, SPACE_IDS.podcasts))

    /*
    
    const TARGET_TYPE_ID = "e1371bcd-a704-4396-adb7-ea7ecc8fe3d4";

    const filtered = geoEntities.episodes.filter(entity => {
    // keep the entity ONLY if it has zero relations with the target typeId
    return !entity.relations?.some(rel => rel.typeId === TARGET_TYPE_ID);
    });
    // 2. Extract the "name" field of the remaining entities
    const episodeNames = filtered
        .map(entity => entity.name)
        .filter(name => !!name); // remove null/undefined

    console.log(episodeNames);

    // Convert to formatted JSON string
    const text2 = JSON.stringify(episodeNames, null, 2); // 2-space indentation
    fs.writeFileSync("episodeNames.txt", text2, "utf-8");
    */



    //const geoEntities = await loadGeoEntities_to_delete()
    //console.log(geoEntities.claims)


} catch (error) {
    console.error(error);
} finally {
    await pgClient.close();
}

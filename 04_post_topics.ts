import { SPACE_IDS } from './src/constants.ts';
import { Graph, IdUtils, SystemIds, type Op } from '@graphprotocol/grc-20';
import PostgreSQLClient from "./src/postgres-client.ts";
import { topicBreakdown, platformBreakdown, sourceBreakdown, personBreakdown, listenOnBreakdown, podcastBreakdown, roleBreakdown, podcastAppearanceBreakdown, episodeBreakdown, quoteBreakdown, claimBreakdown, read_in_tables, pageBreakdown, textBlockBreakdown, loadGeoEntities } from './src/setup_ontology.ts';
import { printOps, publishOps, type Entity, entityCache, buildEntityCached } from './src/functions.ts';
import { processEntity } from './post_entity.ts';
import * as fs from "fs";

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

    const text = JSON.stringify(geoEntities.topics, null, 2); // 2-space indentation
    fs.writeFileSync("geo_pull_topics.txt", text, "utf-8");
    
    let tables = await read_in_tables({
        pgClient: pgClient,
        offset: offset,
        limit: limit,
        podcast_name: ["none"],
        num_episodes: 0,
    });
    
    const formattedTopics = tables.topics.map(e =>
        buildEntityCached(e, topicBreakdown, SPACE_IDS.podcasts, tables, geoEntities, entityCache)
    );

    
    
    for (const topic of formattedTopics) {
        addOps = await processEntity({
            currentOps: ops,
            processingCache: processingCache,
            imageCache: imageCache,
            entity: topic
        })
        ops.push(...addOps.ops)
    }

    console.log(ops)
    const text2 = JSON.stringify(ops, null, 2); // 2-space indentation
    fs.writeFileSync("topic_repush_ops.txt", text2, "utf-8");
    //printOps(ops, "published_ops", "push_topics_new_images_v2.txt")
    //await publishOps(ops)
    ops.length = 0;
    /**/
} catch (error) {
    console.error(error);
} finally {
    await pgClient.close();
}

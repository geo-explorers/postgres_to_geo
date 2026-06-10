import { SPACE_IDS } from './src/constants.ts';
//import { Graph, IdUtils, SystemIds, type Op } from '@graphprotocol/grc-20';
import { type Op } from "@geoprotocol/geo-sdk"
import PostgreSQLClient from "./src/postgres-client.ts";
import { topicBreakdown, platformBreakdown, sourceBreakdown, personBreakdown, listenOnBreakdown, podcastBreakdown, roleBreakdown, podcastAppearanceBreakdown, episodeBreakdown, quoteBreakdown, claimBreakdown, read_in_tables, pageBreakdown, textBlockBreakdown, loadGeoEntities } from './src/setup_ontology.ts';
import { printOps, publishOps, type Entity, entityCache, buildEntityCached, publishOps_w_spaces } from './src/functions.ts';
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
    const { geoEntities, scoringContext } = await loadGeoEntities()
    //const podcast_name = ['All-In with Chamath, Jason, Sacks & Friedberg', 'Lex Fridman Podcast', 'The Joe Rogan Experience', 'Up First from NPR', 'Freakonomics Radio', 'Huberman Lab', 'The Daily', 'Honestly with Bari Weiss', 'Bankless']
    const podcast_name = ['The Joe Rogan Experience']
    const fn = `test_grc_update.txt`;
    
    let tables = await read_in_tables({
        pgClient: pgClient,
        offset: offset,
        limit: limit,
        podcast_name: podcast_name,
        num_episodes: 5,
        date_filter: "2026-02-19"
    });

    console.log(tables.episodes.length)
    console.log(tables.claims.length)

    
    /*
    episodeBreakdown.relations = episodeBreakdown.relations.filter(
        r => !['notable_claims'].includes(r.type)
    );
    //console.log(episodeBreakdown)
    /**/

    //console.log(tables.episodes)
    
    
    const formattedEpisodes = tables.episodes.map(p =>
        buildEntityCached(p, episodeBreakdown, SPACE_IDS.podcasts, tables, geoEntities, entityCache, scoringContext)
    );

    
    console.log("Formatting done")

    
    
    for (const episode of formattedEpisodes) {
        addOps = await processEntity({
            currentOps: ops,
            processingCache: processingCache,
            imageCache: imageCache,
            entity: episode
        })
        ops.push(...addOps.ops)
    }

    //fs.writeFileSync("test_published_ops.txt", JSON.stringify(ops, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
    printOps(ops, "published_ops", fn)
    
    await publishOps_w_spaces(ops)

    /*
    */
} catch (error) {
    console.error(error);
} finally {
    await pgClient.close();
}

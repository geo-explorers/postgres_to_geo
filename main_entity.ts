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
    //'Bankless', 'The Joe Rogan Experience', 'Freakonomics Radio', 'The Daily', 'Lex Fridman Podcast', 'Today, Explained', 'The Genius Life', 'All-In with Chamath, Jason, Sacks & Friedberg'
    //Lex Fridman Podcast, Bankless*, All-In with Chamath, Jason, Sacks & Friedberg, The Joe Rogan Experience, Huberman Lab, Up First from NPR, The Daily, Freakonomics Radio, Honestly with Bari Weiss
    
    // All-In with Chamath, Jason, Sacks & Friedberg,
    // 'Lex Fridman Podcast', 'The Joe Rogan Experience', 'Up First from NPR', 'Freakonomics Radio', 'Huberman Lab', 'The Daily', 'Honestly with Bari Weiss', 'Bankless' 
    const podcast_name = ['All-In with Chamath, Jason, Sacks & Friedberg', 'Lex Fridman Podcast', 'The Joe Rogan Experience', 'Up First from NPR', 'Freakonomics Radio', 'Huberman Lab', 'The Daily', 'Honestly with Bari Weiss', 'Bankless']
    //const podcast_name = ['All-In with Chamath, Jason, Sacks & Friedberg']
    const fn = `update_claims.txt`;
    
    let tables = await read_in_tables({
        pgClient: pgClient,
        offset: offset,
        limit: limit,
        podcast_name: podcast_name,
        num_episodes: 10000,
        date_filter: "2025-11-20"
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
        buildEntityCached(p, episodeBreakdown, SPACE_IDS.podcasts, tables, geoEntities, entityCache)
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

    printOps(ops, "published_ops", fn)
    
    await publishOps(ops)

    /*
    */
} catch (error) {
    console.error(error);
} finally {
    await pgClient.close();
}

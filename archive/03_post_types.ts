import { Graph, type Op } from '@graphprotocol/grc-20';
import * as fs from "fs";
import { publish } from './src/publish';
import { addSpace, filterOps, GEO_IDS, getSpaces, normalizeToUUID, propertyToIdMap, readAllOpsFromFolder, testnetWalletAddress } from './src/constants_v2';

async function publishOps(ops: any) {
    if ((ops.length > 0) && (true)) {
        const iso = new Date().toISOString();
        let txHash;
        const spaces = await getSpaces(ops);

        for (const space of spaces) { 
            txHash = await publish({
                spaceId: space,
                author: testnetWalletAddress,
                editName: `Add properties ${iso}`,
                ops: await filterOps(ops, space), // An edit accepts an array of Ops
            }, "TESTNET");
    
            console.log(`Your transaction hash for ${space} is:`, txHash);
            console.log(iso);
            
            console.log(`Number of ops published in ${space}: `, (await filterOps(ops, space)).length)
        }   
        console.log(`Total ops: ${ops.length}`);
    } else {
        const spaces = await getSpaces(ops);
        console.log("Spaces", spaces);
        for (const space of spaces) {
            console.log(`Number of ops published in ${space}: `, (await filterOps(ops, space)).length)
            console.log(await filterOps(ops, space))
        }
    }
}

const ops: Array<Op> = [];
let addOps;
const usd_id = "0d4d1b02-a9e8-4982-92c4-99b1d22cd430";
const unit_property = "11b06581-20d3-41ea-b570-2ef4ee0a4ffd";


const types = [
  //{ name: "Podcast", properties: ['name', 'avatar', 'description', 'date_founded', 'explicit', 'listen_on', 'hosts', 'topics', 'web_url', 'x_url', 'sources'] },
  //{ name: "Episode", properties: ['name', 'avatar', 'description', 'air_date', 'podcast', 'episode_number', 'listen_on', 'hosts', 'guests', 'contributors', 'notable_quotes', 'notable_claims', 'topics', 'sources'] },
  //{ name: "Podcast appearance", properties: ['roles'] },
  //{ name: "Selector", properties: ['start_offset', 'end_offset'] },

];

for (const type of types) { 
    const mappedProperties = type.properties
        .map(propName => propertyToIdMap[propName])    // get the ID from the map
        .filter(Boolean)                               // remove any undefined if a property is missing
        .map(normalizeToUUID);                         // run your transforming function
    
    addOps = Graph.createType({
        name: type.name,
        properties: mappedProperties
    })
    ops.push(...addOps.ops)

    console.log(`${type.name}: ${addOps.id}`)
}

//console.log(await addSpace(ops, GEO_IDS.cryptoSpace))
await publishOps(await addSpace(ops, GEO_IDS.podcastsSpace))
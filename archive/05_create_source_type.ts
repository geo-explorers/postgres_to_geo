import { Graph, type Op } from '@graphprotocol/grc-20';
import * as fs from "fs";
import { publish } from './src/publish';
import { addSpace, filterOps, GEO_IDS, getSpaces, normalizeToUUID, propertyToIdMap, readAllOpsFromFolder, testnetWalletAddress, typeToIdMap } from './src/constants_v2';

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

//Correct process so this error does not happen
//Get brooken relation ID from crypto space and place it below
const relation_id = "6714a723-08e6-451f-bb4a-65e2870355b9"
addOps = Graph.createType({
    id: typeToIdMap['source'],
    name: "Source",
    properties: ['412ff593-e915-4012-a43d-4c27ec5c68b6', '5e92c8a4-1714-4ee7-9a09-389ef4336aeb', propertyToIdMap['source_db_key'], '198150d0-8f4e-410a-9329-9aab3ac3c1e3']
})
ops.push(...addOps.ops)

//console.log(await addSpace(ops, GEO_IDS.cryptoSpace))
await publishOps(await addSpace(ops, GEO_IDS.rootSpace))
import { Graph, SystemIds, type Op } from '@graphprotocol/grc-20';
import * as fs from "fs";
import { publish } from './src/publish.ts';
import { addSpace, filterOps, GEO_IDS, getSpaces, mainnetWalletAddress, normalizeToUUID, propertyToIdMap, readAllOpsFromFolder, testnetWalletAddress, typeToIdMap } from './src/constants_v2.ts';

async function publishOps(ops: any) {
    if ((ops.length > 0) && (true)) {
        const iso = new Date().toISOString();
        let txHash;
        const spaces = await getSpaces(ops);

        for (const space of spaces) { 
            console.log(space)
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
/*
//Correct process so this error does not happen
//Get brooken relation ID from crypto space and place it below
const relation_id = "6714a723-08e6-451f-bb4a-65e2870355b9"
addOps = Graph.deleteRelation({id: relation_id})
ops.push(...addOps.ops)

addOps = Graph.createRelation({
    type: "9eea393f-17dd-4971-a62e-a603e8bfec20", // Relation value types
    fromEntity: propertyToIdMap['podcast'],
    toEntity: typeToIdMap['podcast']
})
ops.push(...addOps.ops)
*/

/*
addOps = Graph.createEntity({
    id: "253a0604-c129-4941-a4ad-07284971666b",
    values: [
        {
            property: "396f8c72-dfd0-4b57-91ea-09c1b9321b2f",
            value: "MMMM d, yyyy"
        }
    ]
})
ops.push(...addOps.ops)
*/

addOps = Graph.createEntity({
    name: "Prestons space publish test"
})
ops.push(...addOps.ops)
console.log("ENTITY ID: ", addOps.id)

console.log(ops)
//console.log(await addSpace(ops, GEO_IDS.podcastsSpace))
await publishOps(await addSpace(ops, "75586047-d2f5-498a-bd2e-3b5bc6a449f0"))
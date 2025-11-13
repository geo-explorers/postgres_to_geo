import { Graph, type Op } from '@graphprotocol/grc-20';
import * as fs from "fs";
import { publish } from './src/publish';
import { addSpace, filterOps, GEO_IDS, getSpaces, normalizeToUUID, propertyToIdMap, readAllOpsFromFolder, testnetWalletAddress } from './src/constants';

async function publishOps(ops: any) {
    if ((ops.length > 0) && (true)) {
        const iso = new Date().toISOString();
        let txHash;
        const spaces = await getSpaces(ops);

        for (const space of spaces) { 
            txHash = await publish({
                spaceId: space,
                author: testnetWalletAddress,
                editName: `Upload news stories ${iso}`,
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

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['active_unique_wallets_24h']),
    name: "Unique active wallets (24h)",
    dataType: "NUMBER"
})
ops.push(...addOps.ops)

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['active_unique_wallets_7d']),
    name: "Unique active wallets (7d)",
    dataType: "NUMBER"
})
ops.push(...addOps.ops)

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['active_unique_wallets_30d']),
    name: "Unique active wallets (30d)",
    dataType: "NUMBER"
})
ops.push(...addOps.ops)


addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['transaction_count_24h']),
    name: "Transaction count (24h)",
    dataType: "NUMBER"
})
ops.push(...addOps.ops)

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['transaction_count_7d']),
    name: "Transaction count (7d)",
    dataType: "NUMBER"
})
ops.push(...addOps.ops)

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['transaction_count_30d']),
    name: "Transaction count (30d)",
    dataType: "NUMBER"
})
ops.push(...addOps.ops)


addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['total_volume_24h']),
    name: "Total volume (24h)",
    dataType: "NUMBER",
})
ops.push(...addOps.ops)

addOps = Graph.createRelation({
    fromEntity: normalizeToUUID(propertyToIdMap['total_volume_24h']),
    toEntity: usd_id,
    type: unit_property
})
ops.push(...addOps.ops)

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['total_volume_7d']),
    name: "Total volume (7d)",
    dataType: "NUMBER"
})
ops.push(...addOps.ops)

addOps = Graph.createRelation({
    fromEntity: normalizeToUUID(propertyToIdMap['total_volume_7d']),
    toEntity: usd_id,
    type: unit_property
})
ops.push(...addOps.ops)

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['total_volume_30d']),
    name: "Total volume (30d)",
    dataType: "NUMBER"
})
ops.push(...addOps.ops)

addOps = Graph.createRelation({
    fromEntity: normalizeToUUID(propertyToIdMap['total_volume_30d']),
    toEntity: usd_id,
    type: unit_property
})
ops.push(...addOps.ops)



addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['total_balance_24h']),
    name: "Total balance (24h)",
    dataType: "NUMBER",
})
ops.push(...addOps.ops)

addOps = Graph.createRelation({
    fromEntity: normalizeToUUID(propertyToIdMap['total_balance_24h']),
    toEntity: usd_id,
    type: unit_property
})
ops.push(...addOps.ops)

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['total_balance_7d']),
    name: "Total balance (7d)",
    dataType: "NUMBER"
})
ops.push(...addOps.ops)

addOps = Graph.createRelation({
    fromEntity: normalizeToUUID(propertyToIdMap['total_balance_7d']),
    toEntity: usd_id,
    type: unit_property
})
ops.push(...addOps.ops)

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['total_balance_30d']),
    name: "Total balance (30d)",
    dataType: "NUMBER",
})
ops.push(...addOps.ops)

addOps = Graph.createRelation({
    fromEntity: normalizeToUUID(propertyToIdMap['total_balance_30d']),
    toEntity: usd_id,
    type: unit_property
})
ops.push(...addOps.ops)

addOps = Graph.createProperty({
    id: normalizeToUUID(propertyToIdMap['related_apps']),
    name: "Related apps",
    dataType: "NUMBER",
})
ops.push(...addOps.ops)

//console.log(await addSpace(ops, GEO_IDS.cryptoSpace))
await publishOps(await addSpace(ops, GEO_IDS.cryptoSpace))
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
const relationValueTypesId = "9eea393f-17dd-4971-a62e-a603e8bfec20"

// 1️⃣ Put your mappings into a structured array
type RelationMapping = {
  from: string;
  to: string[]; // One or many toEntity IDs
};

//Education relations
const podcastsRelations: RelationMapping[] = [
  {
    from: "71c1575f-0b6f-4b94-97fc-1a2b60d8195b", // Podcast
    to: ["770b338e-d13b-4e9f-9db2-c85a9473ce8a"], // Podcast
  },
  {
    from: "94ac76d5-5407-4268-9a23-7ad680ae58f4", // Listen on
    to: ["484a18c5-030a-499c-b0f2-ef588ff16d50"], // project
  },
  {
    from: "3b9c342d-0da0-42fb-80e5-549ac674a84f", // hosts
    to: ["7ed45f2b-c48b-419e-8e46-64d5ff680b0d"], // person
  },
  {
    from: "0575795a-d58f-4c46-884f-e454cf9762ea", // guests
    to: ["7ed45f2b-c48b-419e-8e46-64d5ff680b0d"], // person
  },
]

// 2️⃣ Loop over them and call Graph.createRelation()

podcastsRelations.forEach(({ from, to }) => {
  to.forEach((toEntity) => {
    const addOps = Graph.createRelation({
      type: relationValueTypesId, // Your relation type
      fromEntity: from,
      toEntity: toEntity,
    });
    ops.push(...addOps.ops);
  });
});

await publishOps(await addSpace(ops, GEO_IDS.podcastsSpace))
//Import necessary libraries
import { v4 as uuidv4 } from 'uuid';
import * as fs from "fs";
import {Id, Base58, SystemIds, Graph, Position, type Op, IdUtils} from "@graphprotocol/grc-20";

import { validate as uuidValidate } from 'uuid';
import { addSpace, cleanText, fetchWithRetry, filterOps, GEO_IDS, getSpaces, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, propertyToTypeIdMap, readAllOpsFromFolder, testnetWalletAddress, typeToIdMap } from '../src/constants.ts';
//import path from 'path';
//import PostgreSQLClient, { TABLES, DB_ID } from "./postgres-client";
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { publish } from '../src/publish.ts';

// Convert import.meta.url to a __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function printOps(ops: any, fn: string) {
  const outputDir = path.join(__dirname, '');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);

    // Create output text
    const outputText = JSON.stringify(ops, null, 2);

    // Write to file
    const filename = fn;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, outputText);

    console.log(`OPS PRINTED to ${filename}`);
  } else {
    console.log("NO OPS TO PRINT");
  }
}

export async function publishOps(ops: any) {
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


export async function searchEntities({
  name, // Note: For V1, can assume always have name and type, but it is possible that there will not be a name to associate this with? 
  type,
  spaceId,
  property,
  searchText,
  typeId,
  notTypeId
}: {
  name?: string;
  type: string[];
  spaceId?: string[];
  property?: string;
  searchText?: string | string[];
  typeId?: string;
  notTypeId?: string;
}) {
  
  await new Promise(resolve => setTimeout(resolve, 200));

  const query = `
    query GetEntities(
      ${name ?  '$name: String!': ''}
      ${spaceId ? '$spaceId: [UUID!]' : ''}
      $type: [UUID!]
    ) {
      entities(
        filter: {
          ${name ? 'name: {isInsensitive: $name},' : ''}  
          ${spaceId ? 'spaceIds: {containedBy: $spaceId},' : ''}  
          relations: {some: {typeId: {is: "8f151ba4-de20-4e3c-9cb4-99ddf96f48f1"}, toEntityId: {in: $type}}},
        }
      ) {
        id
        name
        values {
            nodes {
                spaceId
                propertyId
                string
                language
                time
                number
                unit
                boolean
                point
            }
        }
        relations {
            nodes {
                id
                spaceId
                fromEntityId
                toEntityId
                typeId
                verified
                position
                toSpaceId
                entityId
                entity {
                  id
                  name
                  values {
                      nodes {
                          spaceId
                          propertyId
                          string
                          language
                          time
                          number
                          unit
                          boolean
                          point
                      }
                  }
                  relations {
                      nodes {
                          id
                          spaceId
                          fromEntityId
                          toEntityId
                          typeId
                          verified
                          position
                          toSpaceId
                          entityId
                      }
                  }
                }
            }
        }
      }
    }
  `;


  const variables: Record<string, any> = {
    name: name,
    type: type,
    spaceId: spaceId
  };


  const data = await fetchWithRetry(query, variables);
  const entities = data?.data?.entities;
  return entities

  if (entities?.length === 1) {
    return entities[0]?.id;
  } else if (entities?.length > 1) {
    console.error("DUPLICATE ENTITIES FOUND...");
    console.log(entities);
    return entities[0]?.id;
  }

  return null;
}

export function normalizeValue(v: any): string {
  if (v.value !== undefined) return String(v.value);     // input style
  if (v.string !== undefined) return String(v.string);   // Geo API style
  if (v.number !== undefined) return String(v.number);
  if (v.boolean !== undefined) return String(v.boolean);
  if (v.time !== undefined) return String(v.time);
  if (v.point !== undefined) return String(v.point); //JSON.stringify(v.point); // if needed
  //if (v.unit !== undefined) return String(v.unit);
  //if (v.language !== undefined) return String(v.language);
  return "";
}

export function flatten_api_response(response: any[]): any[] {
  return response.map(item => ({
    ...item,
    values: (item.values?.nodes ?? []).map((v: any) => ({
      spaceId: v.spaceId,
      propertyId: v.propertyId,
      value: normalizeValue(v) // normalized here
    })),
    relations: item.relations?.nodes ?? []
  }));
}

import { searchEntity } from "./search_entity";
import { Graph, Id, Position, SystemIds, type Op } from '@graphprotocol/grc-20';
import * as fs from "fs";
//import { publish } from './src/publish';
import { addSpace, filterOps, GEO_IDS, getSpaces, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, propertyToTypeIdMap, readAllOpsFromFolder, testnetWalletAddress } from './src/constants';
import path from 'path';
import { publish } from './src/publish';

function printOps(ops: any) {
  const outputDir = path.join(__dirname, '');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);

    // Create output text
    const outputText = JSON.stringify(ops, null, 2);

    // Write to file
    const filename = `test_function.txt`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, outputText);

    console.log(`OPS PRINTED to ${filename}`);
  } else {
    console.log("NO OPS TO PRINT");
  }
}

async function publishOps(ops: any) {
    printOps(ops)
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

async function deleteEntity (id: string) {
    let current_state;
    let triples;
    let relations;
    const ops: Array<Op> = [];
    let addOps;
    current_state = await searchEntity(id);

    let toProperty = "Qx8dASiTNsxxP3rJbd4Lzd";
    let fromProperty = "RERshk4JoYoMC17r1qAo9J";
    let relationTypeProperty = "3WxYoAVreE4qFhkDUs5J3q";
    let indexProperty = "WNopXUYxsSsE51gkJGWghe";
    let propertiesDeletedByDeleteRelationFunction = [toProperty, fromProperty, relationTypeProperty, indexProperty]


    if (current_state) {
        //delete all triples and relationsByFromVersionId of duplicate

        const propertyIdMapping = current_state?.values?.nodes?.reduce((acc, item) => {
            if (!acc[item.spaceId]) {
                acc[item.spaceId] = [];
            }
            acc[item.spaceId].push(item.property.id);
            return acc;
        }, {} as Record<string, string[]>);

        for (const [spaceId, propertyIds] of Object.entries(propertyIdMapping)) {
            const addOps = Graph.unsetEntityValues({
                id: id, // whatever your entity ID is
                properties: propertyIds
            });
            
            ops.push(...(await addSpace(addOps.ops, spaceId)));
        }

        relations = current_state?.relations?.nodes;
        for (const relation of relations) {
            addOps = Graph.deleteRelation({id: relation.id})
            ops.push(...(await addSpace(addOps.ops, relation.spaceId)));
            
            if (relation.typeOfId == "beaba5cb-a677-41a8-b353-77030613fc70") { //Blocks property
                //console.log(relation?.toEntity?.id);
                addOps = await deleteEntity(relation?.toEntityId);
                ops.push(...addOps);
            }

            //addOps = await deleteEntity(relation?.entityId);
            //ops.push(...addOps);

        }
    }

    return ops;

}

async function main(keeper: string, duplicate: string) {
    const ops: Array<Op> = [];
    let addOps;
    const current_state_keeper = await searchEntity(keeper);
    //For each space, list all properties from the keeper
    const keeper_properties = current_state_keeper?.values?.nodes?.reduce((acc, item) => {
        if (!acc[item.spaceId]) {
            acc[item.spaceId] = [];
        }
        acc[item.spaceId].push(item.property.id);
        return acc;
    }, {} as Record<string, string[]>);
    
    const current_state_duplicate = await searchEntity(duplicate);
    //For each space, list all properties from the duplicate
    const duplicate_properties = current_state_duplicate?.values?.nodes?.reduce((acc, item) => {
        if (!acc[item.spaceId]) {
            acc[item.spaceId] = [];
        }
        acc[item.spaceId].push(item.property.id);
        return acc;
    }, {} as Record<string, string[]>);
    
    //Remove properties in duplicate list that are already present in the keeper in that space
    for (const spaceId of Object.keys(duplicate_properties)) {
        if (keeper_properties?.[spaceId]) {
            // Keep only properties not in keeper_properties for this space
            duplicate_properties[spaceId] = duplicate_properties[spaceId].filter(
            propId => !keeper_properties[spaceId].includes(propId)
            );
        }
        if (duplicate_properties[spaceId].length === 0) {
            delete duplicate_properties[spaceId];
        }
    
    }
    
    //Write properties to keeper in appropriate spaces
    
    // The duplicate properties list from searchEntity (flattened)
    const duplicateValues = current_state_duplicate?.values?.nodes || [];
    
    // Helper to get the actual value from the node based on dataType
    function extractValue(node) {
      switch (node.property.dataType) {
        case "STRING":  return node.string;
        case "TIME":    return node.time;
        case "BOOLEAN": return node.boolean;
        case "NUMBER":  return node.number;
        case "POINT":   return node.point;
        case "UNIT":    return node.unit;
        default:        return null;
      }
    }
    
    for (const [spaceId, propertyIds] of Object.entries(duplicate_properties)) {
      // Build the `values` array for this space
      const values = propertyIds.map(propertyId => {
        const match = duplicateValues.find(
          v => v.spaceId === spaceId && v.property.id === propertyId
        );
        return match
          ? {
              property: propertyId,
              value: extractValue(match)
            }
          : null;
      }).filter(Boolean); // remove any nulls if no match found
    
      addOps = Graph.updateEntity({
        id: keeper,
        values: values,
      })
      ops.push(...(await addSpace(addOps.ops, spaceId)));
    }
    
    
    const keeper_relations = current_state_keeper?.relations?.nodes;
    const duplicate_relations = current_state_duplicate?.relations?.nodes;
    
    //Iterate through every relation from the duplicate
    //If relation type is avatar or cover, just check whether the keeper has a relation of that type at all, if not write, if so, ignore
    //Does a relation from the keeper of the same type already point to the associated toEntity
    //If not, write that relationfrom the keeper to the toEntity, re-using the relation entity and position
    //If so, skip that relation
    
    const TYPE_AVATAR = "1155beff-fad5-49b7-a2e0-da4777b8792c";
    const TYPE_COVER = "34f53507-2e6b-42c5-a844-43981a77cfa2";
    
    function relationExists(
      list: typeof keeper_relations,
      spaceId: string,
      typeId: string,
      toEntityId?: string
    ) {
      return list.some(rel =>
        rel.spaceId === spaceId &&
        rel.typeId === typeId &&
        (toEntityId ? rel.toEntityId === toEntityId : true)
      );
    }
    
    const relations_to_add = duplicate_relations.filter(rel => {
      if (rel.typeId === TYPE_AVATAR || rel.typeId === TYPE_COVER) {
        // For avatar/cover: check only spaceId + typeId
        return !relationExists(keeper_relations, rel.spaceId, rel.typeId);
      } else {
        // For all others: check spaceId + typeId + toEntityId
        return !relationExists(keeper_relations, rel.spaceId, rel.typeId, rel.toEntityId);
      }
    });
    
    // Now add them to keeper
    for (const rel of relations_to_add) {
      addOps = Graph.createRelation({
        fromEntity: keeper,
        toEntity: rel.toEntityId,
        type: rel.typeId,
        entityId: rel.entityId,
        position: rel.position
      })
      ops.push(...(await addSpace(addOps.ops, rel.spaceId)));
    }
    
    const relations_to_duplicate = current_state_duplicate?.backlinks?.nodes;
    // Now add them to keeper
    for (const rel of relations_to_duplicate) {
      addOps = Graph.createRelation({
        fromEntity: rel.fromEntityId,
        toEntity: keeper,
        type: rel.typeId,
        entityId: rel.entityId,
        position: rel.position
      })
      ops.push(...(await addSpace(addOps.ops, rel.spaceId)));
      addOps = Graph.deleteRelation({id: rel.id})
      ops.push(...(await addSpace(addOps.ops, rel.spaceId)));
    }

    addOps = await deleteEntity(duplicate);
    ops.push(...addOps);

    if (ops.length > 0) {
        let outputText;
        // Convert operations to a readable JSON format
        outputText = JSON.stringify(ops, null, 2);
        // Write to a text file
        fs.writeFileSync(`ops.txt`, outputText);
    }


        
    //publish ops by iterating each spaceId
    if ((ops.length > 0) && (true)) {
        await publishOps(ops)
    } else {
        const spaces = await getSpaces(ops);
        console.log("Spaces", spaces);
        for (const space of spaces) {
            console.log(`Number of ops published in ${space}: `, (await filterOps(ops, space)).length)
            //console.log(await filterOps(ops, space))
        }
    }
}
await main("01cb9ade-5b72-46a7-bfdb-bdeacf2ef478", "f3aeabfd-4439-427d-982f-ddb676404b37");
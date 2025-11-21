import { propertyToIdMap } from "./src/constants.ts";
import { type Op, Graph, Position, Id, SystemIds } from "@graphprotocol/grc-20";
import { normalizeToUUID, processNewRelation,  addSpace  } from "./src/functions.ts";
import * as fs from "fs";
type Value = {
  spaceId: string;
  property: string;
  value: string;
};

type Relation = {
  spaceId: string;
  type: string;
  toEntity: Entity;
  entity: Entity;
};

type Entity = {
    internal_id: string;
    id: string;
    entityOnGeo: any;
    name: string;
    values: Value[];
    relations: Relation[];
};

export async function processEntity({
  currentOps,
  processingCache,
  imageCache,
  entity,
  client,
  currSpaceId,
  geo_id,
}: {
  currentOps: Array<Op>;
  processingCache: Record<string, Entity>;
  imageCache: Record<string, Entity>;
  entity: Entity;
  client?: any;
  currSpaceId?: any,
  geo_id?: string,
}): Promise<{
    ops: Op[]; id: string;
}> {
    const cacheKey: any = entity.internal_id;
    if (processingCache[cacheKey]) {
        return { ops: [], id: processingCache[cacheKey].geoId };
    }
    const ops: Array<Op> = [];
    let addOps;
    let geoId: string;
    let searchTrigger = true;
    let entityOnGeo = entity.entityOnGeo;
    const valueExistsMap: Record<string, boolean> = {};

    if (entity.id) {
        geoId = entity.id;
    } else {
        geoId = entity.internal_id;
        searchTrigger = false;
    }

    if (searchTrigger) {
        entityOnGeo = entity.entityOnGeo
        //console.log("entity exists on geo: ", geoId)
        //console.log(entityOnGeo?.relations?.[0]?.entity)
    }
    
    
    //POST VALUES
    //The same way I publish ops by spaceId, I should filter and add ops to the ops array by spaceId using createEntity
    //If there are multiple space_ids in values, filter them out and apply `await addSpace(ops, currSpaceId)` to each individually
    //Does it even make sense to have spaceIds in my entities?
    const existing = new Set(
        entityOnGeo?.values.map(v => `${v.spaceId}:${v.propertyId}:${v.value}`)
    );

    // Step 1: group by spaceId, filtering out duplicates
    const grouped = entity.values.reduce((acc, v) => {
        const key = `${v.spaceId}:${v.property}:${v.value}`;
        if (existing.has(key)) {
            // already exists → skip
            return acc;
        }

        if (!acc[v.spaceId]) acc[v.spaceId] = [];
        const { spaceId, ...rest } = v;
        acc[v.spaceId].push(rest);
        return acc;
    }, {});

    // Step 2: iterate and create ops
    for (const [spaceId, values] of Object.entries(grouped)) {

        const addOps = Graph.createEntity({
            id: geoId,
            values: values
        });

        // push into master ops after wrapping with addSpace
        ops.push(...await addSpace(addOps.ops, spaceId));
    }
    

    //POST RELATIONS
    //Loop through relations
    //Check if it is an image property -> if so create image
    //If not create the relation like normal, using the robust createRelation function that I made
    //If to_entity is an object and has no geo_id, recursively call postEntity(), then from that, it will have the geo_id to use as the toEntityId
    //Note: if the toEntity needs to be created, I will need to re-check whether that relation already exists on Geo, because I didnt have the toEntityId before...
    let toEntityId: any;
    let relationEntity;
    let last_position = Position.generateBetween(null, null);
    let last_type = null;
    const image_types = [propertyToIdMap["avatar"], SystemIds.COVER_PROPERTY]
    for (const relation of entity.relations) {
        if (relation.type == last_type) {
            last_position = Position.generateBetween(last_position, null);
        } else {
            last_type = relation.type;
            last_position = Position.generateBetween(null, null);
        }

        //Step 1: Check if relation is an image relation
        if (image_types.includes(Id(relation?.type))) {
            const search = entityOnGeo?.relations?.find(r=>
                r.typeId === relation.type &&
                r.spaceId === relation.spaceId
            )
            if (!search) {
                //const imageCacheKey: any = relation?.toEntity?.name;
                //if (imageCache[imageCacheKey]) {
                //    toEntityId = imageCache[imageCacheKey].geoId ;
                //    console.log("Re-using image: ", toEntityId)
                //} else {
                    // Create image entity
                try {
                    const t0 = performance.now();
                    const { id: imageId, ops: createImageOps } = await Graph.createImage({
                        url: relation?.toEntity?.name,
                        network: "TESTNET"
                    });
                    const t1 = performance.now();
                    console.log(`Call to Graph.createImage took ${t1 - t0} milliseconds`);
                    ops.push(...await addSpace(createImageOps, relation.spaceId));
                    toEntityId = imageId;
                    //imageCache[imageCacheKey] = { imageId, createImageOps };

                } catch {
                    console.error("IMAGE UPLOAD FAILED", relation?.toEntity?.name)
                }
                    
                    
                    //toEntityId = undefined;
                //}
                
            } else {
                toEntityId = undefined;
            }
        } else {
            addOps = await processEntity({
                currentOps: ops,
                processingCache: processingCache,
                imageCache: imageCache,
                entity: relation?.toEntity,
            })
            ops.push(...addOps.ops)
            toEntityId = addOps?.id;
        }

        // TODO - 
        // I could check whether the relation entity exists here instead of in the initial check
        // Essentially, does a relation from this entity to the toEntity already exist on Geo, if so, what is the relation entity ID
        //CHECK WHETHER THIS WORKS CORRECTLY
        if (relation?.entity) {
            let relExists = null;
            if (entityOnGeo) {
                relExists = entityOnGeo.relations.find(r => 
                    r.typeId == relation.type &&
                    r.toEntityId == toEntityId &&
                    r.spaceId === relation.spaceId
                )
                if (relExists) {
                    relation.entity.entityOnGeo = relExists.entity ?? null;
                    relation.entity.id = relExists.entity.id ?? null;
                }
            }
            addOps = await processEntity({
                currentOps: ops,
                processingCache: processingCache,
                imageCache: imageCache,
                entity: relation?.entity,
            })
            ops.push(...addOps.ops)
            relationEntity = addOps.id;
            
        } else {
            relationEntity = undefined
        }
        
        if (toEntityId) {
            addOps = processNewRelation({
                currenOps: ops, 
                spaceId: relation.spaceId, 
                entityOnGeo: entityOnGeo, 
                fromEntityId: geoId,
                toEntityId: toEntityId,
                propertyId: relation.type,
                relationEntity: relationEntity,
                last_position: last_position
            })
            ops.push(...await addSpace(addOps.ops, relation.spaceId))
        }
    }
    
    processingCache[cacheKey] = { geoId, entity };
    return { ops: ops, id: geoId }
    //return { ops: (await addSpace(ops, currSpaceId)), id: geoId }
}



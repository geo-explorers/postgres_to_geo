import { PROD_TABLE_IDS } from "../src/teable-meta";
import { searchEntities, searchEntity, hasBeenEdited, searchOps, normalizeToUUID, propertyToIdMap, relationPropertyExistsOnGeo, valuePropertyExistsOnGeo, processNewRelation, GEO_IDS,  addSpace, propertyToTypeIdMap } from "../src/constants";

import { type DataType,  type Op } from "@graphprotocol/grc-20";
import { Graph, Position, Id, Ipfs, SystemIds } from "@graphprotocol/grc-20";
import { processAsset } from "./ethcc_post_asset";



//export async function processTag(currentOps: Array<Op>, tagName: string, tagType: string): Promise<Data> {
export async function processTag({
  currentOps,
  tag,
  tagName,
  tagType,
  tables
}: {
  currentOps: Array<Op>;
  tagName?: string;
  tag: any;
  tagType: string;
  tables: { projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any; }
}): Promise<{
    ops: Op[]; id: string;
}> {

    const ops: Array<Op> = [];
    const currSpaceId = GEO_IDS.cryptoSpace;
    let addOps;
    let geoId: string;
    let searchTrigger = true;
    let entityOnGeo;
    let just_add_type = false;

    if (tagType == propertyToTypeIdMap['related_assets']) {
        addOps = await processAsset({
            currentOps: [...ops, ...currentOps],
            asset: tag,
            tables: tables,
        });
        ops.push(...addOps.ops)

        return { ops: (await addSpace(ops, currSpaceId)), id: addOps.id }
    }

    // -----------------------------
    // ---- Organize properties ---- 
    // -----------------------------
    // fields to pull from postgres

    const valueProperties = ['name'];
    const values: { property: string; value: any }[] = [];
    //console.log(tag)
    let name;
    if (tagName) {
        name = tagName;
    } else {
        name = tag?.name;
    }
    

    if (geoId = await searchOps({
            ops: currentOps,
            property: SystemIds.NAME_PROPERTY,
            propType: "TEXT",
            searchText: name,
            typeId: normalizeToUUID(tagType)
        })) { 
        return { ops: ops, id: geoId }
    } else {
        if (tag.geo_ids_found.length > 0) {
            geoId = tag.geo_ids_found?.[0]
            just_add_type = true;
        } else {
            geoId = await searchOps({
                ops: currentOps,
                property: SystemIds.NAME_PROPERTY,
                propType: "TEXT",
                searchText: name,
            });
            if (geoId) {
                just_add_type = true;
            }
        }

        if (!geoId) {
            geoId = Id.generate();
            searchTrigger = false;
        }

        //if ((entityOnGeo) || (await hasBeenEdited(currentOps, geoId))) {
        if ((await hasBeenEdited(currentOps, geoId))) {
            return { ops: ops, id: geoId }
        } else {
            if (searchTrigger) {
                entityOnGeo = tag.geo_entities_found?.[0]
                console.log("entity exists on geo: ", geoId)
            }

            if (!just_add_type) {
                addOps = Graph.createEntity({
                    id: geoId,
                    values: [
                        {
                            property: SystemIds.NAME_PROPERTY,
                            value: name
                        }
                    ]
                })
                ops.push(...addOps.ops);
            }
            
            // Add appropriate type to tag
            addOps = processNewRelation({
                currenOps: [...ops, ...currentOps],
                spaceId: currSpaceId,
                entityOnGeo: entityOnGeo,
                fromEntityId: geoId,
                toEntityId: normalizeToUUID(tagType),
                propertyId: SystemIds.TYPES_PROPERTY,
            });
            ops.push(...addOps.ops);

            return { ops: (await addSpace(ops, currSpaceId)), id: geoId }
        }
    }
}



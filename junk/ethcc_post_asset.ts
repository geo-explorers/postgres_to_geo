import { PROD_TABLE_IDS } from "../src/teable-meta";
import { searchEntities, searchEntity, hasBeenEdited, searchOps, normalizeToUUID, propertyToIdMap, relationPropertyExistsOnGeo, valuePropertyExistsOnGeo, processNewRelation, GEO_IDS,  addSpace, addSources, propertyToTypeIdMap } from "../src/constants";

import { type DataType,  type Op } from "@graphprotocol/grc-20";
import { Graph, Position, Id, Ipfs, SystemIds } from "@graphprotocol/grc-20";
import { processTag } from "./ethcc_post_tag";


//export async function processProject(currentOps: Array<Op>, projectId: string, teableClient: any): Promise<[Op | Op[], string]> {
export async function processAsset({
  currentOps,
  asset,
  tables
}: {
  currentOps: Array<Op>;
  asset: any;
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

    const market_data = tables?.market_data.filter((item: any) => item?.asset_id === asset.__id)?.[0];
    //console.log(market_data)
    
    // -----------------------------
    // ---- Organize properties ---- 
    // -----------------------------
    // fields to pull from postgres

    const assetProperties = ['name', 'symbol', 'max_supply', 'token_address']; 
    const marketDataProperties = ['price_usd', 'percent_change_30d', 'percent_change_60d', 'market_cap_usd', 'tvl_usd', 'created_at'];  // created_at = date_updated
    const relationProperties = ['platform_id']
    
    const values: { property: string; value: any }[] = [];
    const name = asset?.name
    console.log("ASSET NAME: ", name)

    // Search ops to make sure this project has not already been processed
    if (geoId = await searchOps({
            ops: currentOps,
            property: SystemIds.NAME_PROPERTY,
            propType: "TEXT",
            searchText: name,
            typeId: propertyToTypeIdMap['related_assets']
        })) { 
        return { ops: ops, id: geoId }
    } else { // Search geo to see if this project exists on Geo
        if (asset?.geo_ids_found?.length > 0) {
            geoId = asset.geo_ids_found?.[0]
        } else {
            geoId = Id.generate();
            searchTrigger = false;
        }

        //Limit publishing to only if includes some set of property values
        //if ((!entityOnGeo) && ((name == "NONE") || ((desc == "NONE") && (avatar_url == "NONE")))) {
        //    return [ops, null]
        //}

        if (await hasBeenEdited(currentOps, geoId)) { // Exit function if this has been edited before
            return { ops: ops, id: geoId }
        } else {
            if (searchTrigger) {
                entityOnGeo = asset.geo_entities_found?.[0]
                console.log("entity exists on geo: ", geoId)
            }

            for (const property of assetProperties) {
                const value = asset?.[property];
                const includesCoincarp = typeof value === 'string' && value.toLowerCase().includes('coincarp.com');
                if ((property.includes('url')) && (includesCoincarp)) {
                    console.error(`${property} includes coincarp.com`)
                } else {
                    // Only push property if it doesnt already exist on Geo
                    if (!(await valuePropertyExistsOnGeo(currSpaceId, entityOnGeo, propertyToIdMap[property]))) {
                        if (asset?.[property]) {
                            let value;
                            if (property == "created_at") {
                                const date = new Date(asset?.[property].toString());
                                // Set to midnight UTC
                                date.setUTCHours(0, 0, 0, 0);
                                value =  date.toISOString();
                            } else {
                                value = asset?.[property].toString()
                            }
                            values.push({
                                property: normalizeToUUID(propertyToIdMap[property]),
                                value: value
                            });
                        }
                    }
                }
            }

            for (const property of marketDataProperties) {
                const value = market_data?.[property];
                const includesCoincarp = typeof value === 'string' && value.toLowerCase().includes('coincarp.com');
                if ((property.includes('url')) && (includesCoincarp)) {
                    console.error(`${property} includes coincarp.com`)
                } else {
                    // Only push property if it doesnt already exist on Geo
                    if (!(await valuePropertyExistsOnGeo(currSpaceId, entityOnGeo, propertyToIdMap[property]))) {
                        if (market_data?.[property]) {
                            let value;
                            if (property == "date_updated") {
                                const date = new Date(market_data?.[property].toString());
                                // Set to midnight UTC
                                date.setUTCHours(0, 0, 0, 0);
                                value =  date.toISOString();
                            } else {
                                value = market_data?.[property].toString()
                            }
                            values.push({
                                property: normalizeToUUID(propertyToIdMap[property]),
                                value: value
                            });
                        }
                    }
                }
            }
            // Create entity with values
            if (values.length > 0) {
                addOps = Graph.createEntity({
                    id: geoId,
                    values: values
                })
                ops.push(...addOps.ops);
            }

            //Add project type...
            addOps = await processNewRelation({
                currenOps: [...ops, ...currentOps],
                spaceId: currSpaceId,
                entityOnGeo: entityOnGeo,
                fromEntityId: geoId,
                toEntityId: propertyToTypeIdMap['related_assets'],
                propertyId: SystemIds.TYPES_PROPERTY,
            });
            ops.push(...addOps.ops);

            //TO DO - DO WE WANT TO ADD IMAGES FROM THAT DATA SET?

            //Need custom functions for networks and assets
            // relationProperties: ['related_industries', 'related_asset_categories', 'related_technologies', 'related_services_or_products', 'tags', 'related_platforms', 'related_assets']
            for (const relationProperty of relationProperties) {
                if (asset?.[relationProperty]) {
                    const rawProp = asset?.[relationProperty];
                    const propValueList = Array.isArray(rawProp) ? rawProp : rawProp ? [rawProp] : [];
                    for (const propValue of propValueList) {
                        // Need to properly process this entity and get its geoId back
                        let tagObs;
                        if (relationProperty == 'platform_id') {
                            tagObs = tables?.platforms.filter((item: any) => item?.__id === propValue.id);
                            //console.log("asset Name for platforms: ", name)
                        } else if (relationProperty == 'related_assets') {
                            tagObs = tables?.assets.filter((item: any) => item?.__id === propValue.id);
                            //console.log("asset Name for assets: ", name)
                            //console.log("Platforms PROPVALUE: ", propValue)
                        } else {
                            tagObs = tables?.tags.filter((item: any) => item?.__id === propValue.id);
                            //console.log("asset Name for tags: ", name)
                        }

                        addOps = await processTag({
                            currentOps: [...ops, ...currentOps],
                            tag: tagObs?.[0],
                            tagType: propertyToTypeIdMap[relationProperty],
                            tables: tables
                        });
                        ops.push(...addOps.ops);

                        addOps = await processNewRelation({
                            currenOps: [...ops, ...currentOps],
                            spaceId: currSpaceId,
                            entityOnGeo: entityOnGeo,
                            fromEntityId: geoId,
                            toEntityId: addOps.id,
                            propertyId: propertyToIdMap[relationProperty],
                        });
                        ops.push(...addOps.ops);
                        
                    }
                }
            }

            return { ops: (await addSpace(ops, currSpaceId)), id: geoId }
        }
    }
}



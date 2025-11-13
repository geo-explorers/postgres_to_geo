import { PROD_TABLE_IDS } from "../src/teable-meta";
import { searchEntities, searchEntity, hasBeenEdited, searchOps, normalizeToUUID, propertyToIdMap, relationPropertyExistsOnGeo, valuePropertyExistsOnGeo, processNewRelation, GEO_IDS,  addSpace, addSources, propertyToTypeIdMap } from "../src/constants";

import { type DataType,  type Op } from "@graphprotocol/grc-20";
import { Graph, Position, Id, Ipfs, SystemIds } from "@graphprotocol/grc-20";
import { processTag } from "./ethcc_post_tag";


//export async function processProject(currentOps: Array<Op>, projectId: string, teableClient: any): Promise<[Op | Op[], string]> {
export async function processApp_optimized({
  currentOps,
  project,
  client,
  tables
}: {
  currentOps: Array<Op>;
  project: any;
  client: any;
  tables: { projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any; }
}): Promise<{
    ops: Op[]; id: string;
}> {
    const ops: Array<Op> = [];
    const currSpaceId = GEO_IDS.cryptoSpace;
    let addOps;
    let geoId: string;
    let searchTrigger = true;
    let entityOnGeo: any;
    const valueExistsMap: Record<string, boolean> = {};
    
    // -----------------------------
    // ---- Organize properties ---- 
    // -----------------------------
    // fields to pull from postgres

    const valueProperties = ['name', 'description', 'website_url', 'x_url', 'github_url', 'linkedin_url', 'medium_url', 'telegram_url', 'discord_url', 'active_unique_wallets_24h', 'active_unique_wallets_7d', 'active_unique_wallets_30d',  'transaction_count_24h',  'transaction_count_7d', 'transaction_count_30d', 'total_volume_24h', 'total_volume_7d', 'total_volume_30d', 'total_balance_24h', 'total_balance_7d', 'total_balance_30d'];
    const imageProperties = ['logo']
    const relationProperties = ['related_ecosystems', 'related_industries', 'related_asset_categories',  'related_technologies', 'related_services_or_products', 'tags']
    //const relationProperties = ['related_industries', 'related_asset_categories', 'related_technologies', 'related_services_or_products', 'tags', 'related_platforms', 'related_assets', 'related_ecosystems']

    const values: { property: string; value: any }[] = [];
    const name = project?.name;

    console.log("APP NAME: ", name);


    // Search ops to make sure this project has not already been processed
    if (geoId = await searchOps({
            ops: currentOps,
            property: SystemIds.NAME_PROPERTY,
            propType: "TEXT",
            searchText: name,
            typeId: GEO_IDS.appType
        })) { 
        return { ops: ops, id: geoId }
    } else { // Search geo to see if this project exists on Geo
        if (project.geo_ids_found.length > 0) {
            geoId = project.geo_ids_found?.[0]
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
                entityOnGeo = project.geo_entities_found?.[0]
                console.log("entity exists on geo: ", geoId)
                //console.log(entityOnGeo)
            }
            const normalizedValuePropsMap = new Map<string, { propertyId: string; exists: boolean }>();

            const existenceChecks = await Promise.all(
            valueProperties.map(async (prop) => {
                const propertyId = normalizeToUUID(propertyToIdMap[prop]);
                const exists = entityOnGeo
                ? await valuePropertyExistsOnGeo(currSpaceId, entityOnGeo, propertyId)
                : false;
                return { name: prop, propertyId, exists };
            })
            );

            for (const { name, propertyId, exists } of existenceChecks) {
                normalizedValuePropsMap.set(name, { propertyId, exists });
            }

            const normalizedImagePropsMap = new Map<string, { propertyId: string; exists: boolean }>();

            const imageExistenceChecks = await Promise.all(
            imageProperties.map(async (prop) => {
                const propertyId = normalizeToUUID(propertyToIdMap[prop]);
                const exists = entityOnGeo
                ? await relationPropertyExistsOnGeo(currSpaceId, entityOnGeo, propertyId)
                : false;
                return { name: prop, propertyId, exists };
            })
            );

            for (const { name, propertyId, exists } of imageExistenceChecks) {
                normalizedImagePropsMap.set(name, { propertyId, exists });
            }

            
            for (const property of valueProperties) {
                const value = project?.[property];
                const propMeta = normalizedValuePropsMap.get(property);

                if (!propMeta) continue; // defensive check

                const { propertyId, exists } = propMeta;

                const includesCoincarp = typeof value === 'string' && value.toLowerCase().includes('coincarp.com');

                if ((property.includes('url')) && includesCoincarp) {
                    console.error(`${property} includes coincarp.com`);
                } else {
                    if (!exists && value) {
                    let formattedValue;
                    if (property === "date_founded") {
                        const date = new Date(value.toString());
                        date.setUTCHours(0, 0, 0, 0);
                        formattedValue = date.toISOString();
                    } else {
                        formattedValue = value.toString();
                    }

                    values.push({
                        property: propertyId, // ← use pre-normalized ID
                        value: formattedValue
                    });
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
            addOps = processNewRelation({
                currenOps: [...ops, ...currentOps],
                spaceId: currSpaceId,
                entityOnGeo: entityOnGeo,
                fromEntityId: geoId,
                toEntityId: GEO_IDS.appType,
                propertyId: SystemIds.TYPES_PROPERTY,
            });
            ops.push(...addOps.ops);

            if (project.top_dapp) {
                //Add project type...
                addOps = await processNewRelation({
                    currenOps: [...ops, ...currentOps],
                    spaceId: currSpaceId,
                    entityOnGeo: entityOnGeo,
                    fromEntityId: geoId,
                    toEntityId: "09d3188c-8e20-4083-a6ad-e696cc493c7a",
                    propertyId: normalizeToUUID(GEO_IDS.tagsPropertyId),
                });
                ops.push(...addOps.ops);
            }

            for (const imageProp of imageProperties) {
                const imageUrl = project?.[imageProp];
                const propMeta = normalizedImagePropsMap.get(imageProp);

                if (!imageUrl || !propMeta) continue;

                const { propertyId, exists } = propMeta;

                if (!exists) {
                    console.log("IMAGE GEN");

                    // Create image entity
                    const { id: imageId, ops: createImageOps } = await Graph.createImage({
                    url: imageUrl,
                    });
                    ops.push(...createImageOps);

                    // Link the image via relation
                    addOps = await processNewRelation({
                        currenOps: [...ops, ...currentOps],
                        spaceId: currSpaceId,
                        entityOnGeo,
                        fromEntityId: geoId,
                        toEntityId: imageId,
                        propertyId,
                    });
                    ops.push(...addOps.ops);
                }
            }


            //Need custom functions for networks and assets
            // relationProperties: ['related_industries', 'related_asset_categories', 'related_technologies', 'related_services_or_products', 'tags', 'related_platforms', 'related_assets']
            for (const relationProperty of relationProperties) {
                if (!project?.[relationProperty]) continue;

                const rawProp = project[relationProperty];
                const propValueList = Array.isArray(rawProp) ? rawProp : rawProp ? [rawProp] : [];

                const propOps = await Promise.all(
                    propValueList.map(async (propValue) => {
                    // 1. Lookup correct tag object
                    let tagObs;
                    if (relationProperty === 'related_platforms') {
                        tagObs = tables?.platforms.find((item: any) => item?.__id === propValue.id);
                    } else if (relationProperty === 'related_assets') {
                        tagObs = tables?.assets.find((item: any) => item?.__id === propValue.id);
                    } else if (relationProperty === 'related_ecosystems') {
                        tagObs = tables?.ecosystems.find((item: any) => item?.__id === propValue.id);
                    } else {
                        tagObs = tables?.tags.find((item: any) => item?.__id === propValue.id);
                    }

                    if (!tagObs) return []; // no-op if tag not found

                    // 2. Process the tag into Geo
                    const tagOps = await processTag({
                        currentOps: [...ops, ...currentOps],
                        tag: tagObs,
                        tagType: propertyToTypeIdMap[relationProperty],
                        tables,
                    });

                    // 3. Create the relation
                    const relationOps = processNewRelation({
                        currenOps: [...ops, ...currentOps, ...tagOps.ops],
                        spaceId: currSpaceId,
                        entityOnGeo,
                        fromEntityId: geoId,
                        toEntityId: tagOps.id,
                        propertyId: propertyToIdMap[relationProperty],
                    });

                    return [...tagOps.ops, ...relationOps.ops];
                    })
                );

                // Flatten and push all resulting ops from this property
                for (const singlePropOps of propOps) {
                    ops.push(...singlePropOps);
                }
            }

            return { ops: (await addSpace(ops, currSpaceId)), id: geoId }
        }
    }
}



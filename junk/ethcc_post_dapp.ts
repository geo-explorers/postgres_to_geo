import { PROD_TABLE_IDS } from "../src/teable-meta";
import { searchEntities, searchEntity, hasBeenEdited, searchOps, normalizeToUUID, propertyToIdMap, relationPropertyExistsOnGeo, valuePropertyExistsOnGeo, processNewRelation, GEO_IDS,  addSpace, addSources, propertyToTypeIdMap } from "../src/constants";

import { type DataType,  type Op } from "@graphprotocol/grc-20";
import { Graph, Position, Id, Ipfs, SystemIds } from "@graphprotocol/grc-20";
import { processTag } from "./ethcc_post_tag";


//export async function processProject(currentOps: Array<Op>, projectId: string, teableClient: any): Promise<[Op | Op[], string]> {
export async function processApp({
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
    let entityOnGeo;
    
    // -----------------------------
    // ---- Organize properties ---- 
    // -----------------------------
    // fields to pull from postgres

    const valueProperties = ['name', 'description', 'website_url', 'x_url', 'github_url', 'linkedin_url', 'medium_url', 'telegram_url', 'discord_url', 'active_unique_wallets'];
    const imageProperties = ['logo']
    const relationProperties = ['related_ecosystems']
    //const relationProperties = ['pricing_models', 'related_industries', 'related_asset_categories', 'related_technologies', 'related_services_or_products', 'tags', 'related_ecosystems']
    
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
            }
            
            for (const property of valueProperties) {
                const value = project?.[property];
                const includesCoincarp = typeof value === 'string' && value.toLowerCase().includes('coincarp.com');
                if ((property.includes('url')) && (includesCoincarp)) {
                    console.error(`${property} includes coincarp.com`)
                } else {
                    // Only push property if it doesnt already exist on Geo
                    if (!(await valuePropertyExistsOnGeo(currSpaceId, entityOnGeo, propertyToIdMap[property]))) {
                        if (project?.[property]) {
                            let value;
                            if (property == "date_founded") {
                                const date = new Date(project?.[property].toString());
                                // Set to midnight UTC
                                date.setUTCHours(0, 0, 0, 0);
                                value =  date.toISOString();
                            } else {
                                value = project?.[property].toString()
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
                toEntityId: GEO_IDS.appType,
                propertyId: SystemIds.TYPES_PROPERTY,
            });
            ops.push(...addOps.ops);

            //Write cover ops
            //imageProperties.length = 0
            for (const imageProp of imageProperties) {
                if (project?.[imageProp]) {
                    if (!(await relationPropertyExistsOnGeo(currSpaceId, entityOnGeo, propertyToIdMap[imageProp]))) {
                        // create an image
                        const { id: imageId, ops: createImageOps } = await Graph.createImage({
                            url: project?.[imageProp],
                        });
                        ops.push(...createImageOps)
                        //console.log(project?.[imageProp])
                        //console.log(imageId)
                        //console.log(`${imageProp} IMAGE NOT CREATED PROPERLY FOR `, geoId);
                        //const imageId = Id.generate()

                        addOps = await processNewRelation({
                            currenOps: [...ops, ...currentOps],
                            spaceId: currSpaceId,
                            entityOnGeo: entityOnGeo,
                            fromEntityId: geoId,
                            toEntityId: imageId,
                            propertyId: propertyToIdMap[imageProp],
                        });
                        ops.push(...addOps.ops);
                    }
                }
            }

            //Need custom functions for networks and assets
            // relationProperties: ['related_industries', 'related_asset_categories', 'related_technologies', 'related_services_or_products', 'tags', 'related_platforms', 'related_assets']
            for (const relationProperty of relationProperties) {
                if (project?.[relationProperty]) {
                    const rawProp = project?.[relationProperty];
                    const propValueList = Array.isArray(rawProp) ? rawProp : rawProp ? [rawProp] : [];
                    for (const propValue of propValueList) {
                        // Need to properly process this entity and get its geoId back

                        
                        let tagObs;
                        if (relationProperty == 'related_platforms') {
                            tagObs = tables?.platforms.filter((item: any) => item?.__id === propValue.id);
                            //console.log("Project Name for platforms: ", name)
                            //console.log("Platforms PROPVALUE: ", propValue)
                        } else if (relationProperty == 'related_assets') {
                            tagObs = tables?.assets.filter((item: any) => item?.__id === propValue.id);
                            //console.log("Project Name for assets: ", name)
                            //console.log("assets tagObs: ", tagObs)
                        } else if (relationProperty == 'related_ecosystems') {
                            tagObs = tables?.ecosystems.filter((item: any) => item?.__id === propValue.id);
                            //console.log("Project Name for ecosystems: ", name)
                            //console.log("assets tagObs: ", tagObs)
                        } else {
                            tagObs = tables?.tags.filter((item: any) => item?.__id === propValue.id);
                            //console.log("Project Name for tags: ", name)
                            //console.log("PROPVALUE: ", propValue)
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



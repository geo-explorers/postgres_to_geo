import { PROD_TABLE_IDS } from "../src/teable-meta";
import { searchEntities, searchEntity, hasBeenEdited, searchOps, normalizeToUUID, propertyToIdMap, relationPropertyExistsOnGeo, valuePropertyExistsOnGeo, processNewRelation, GEO_IDS,  addSpace, addSources, normalizeToUUID_STRING } from "../src/constants";

import { type DataType,  type Op } from "@graphprotocol/grc-20";
import { Graph, Position, Id, Ipfs, SystemIds } from "@graphprotocol/grc-20";
import { processTag } from "./ethcc_post_tag";
import { processProject } from "./ethcc_post_project";

//async function addInvestor(currentOps: Array<Op>, teableClient: any, project_geoId: string, page: any, fundingRoundEntity: string): Promise<Op | Op[]> {
async function addInvestor({
  currentOps,
  client,
  project_geoId,
  investorObs,
  fundingRoundEntity,
  tables,
  source_url,
  projectObs,
  fundingRoundObs,
  relations
}: {
  currentOps: Array<Op>;
  client: any;
  project_geoId: string;
  investorObs: any;
  fundingRoundEntity: string;
  source_url: string;
  projectObs: any;
  fundingRoundObs: any;
  relations: any[];
  tables: { projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any; }
}): Promise<{
    ops: Op[];
}> {
    //add a relation from investor to project if it doesnt already exist.
    //add investors relation back from the project, using the same relation entity
    //Whether it already exists or not, add a relatoin from that investor relation entity to the funding round entity

    const propertiesSourced = [];
    const ops: Array<Op> = [];
    const currSpaceId = GEO_IDS.cryptoSpace;
    let addOps;
    let investor_geoId: string;
    let entityOnGeo;

    addOps = await processProject({
        client: client,
        tables: tables,
        currentOps: [...ops, ...currentOps],
        project: investorObs
    });
    ops.push(...addOps.ops);
    investor_geoId = addOps.id;

    // Add investor to funding round entity
    entityOnGeo = fundingRoundObs.geo_entities_found?.[0]
    addOps = await processNewRelation({
        currenOps: [...ops, ...currentOps],
        spaceId: currSpaceId,
        entityOnGeo: entityOnGeo,
        fromEntityId: fundingRoundEntity,
        toEntityId: investor_geoId,
        propertyId: propertyToIdMap['investor'],
    });
    ops.push(...addOps.ops);

    // Add investor to properties sourced if it is added here...
    
    propertiesSourced.push('investor')
    if (propertiesSourced.length > 0) {
        let source_id = GEO_IDS.coincarp
        //let source_url = source_url

        if (source_url.includes("coincarp.com")) {
            
            addOps = await addSources({
                currentOps: [...ops, ...currentOps],
                entityId: fundingRoundEntity,
                entityOnGeo: fundingRoundObs.geo_entities_found?.[0],
                sourceEntityId: source_id,
                propertiesSourced: propertiesSourced.map(property => propertyToIdMap[property]),
                source_url: source_url,
                source_db_id: undefined,
                toEntity: investor_geoId,
                relations: relations,
            })
            ops.push(...addOps.ops);
        }
        propertiesSourced.length = 0
    }
    
    // Add investment to investor entity
    entityOnGeo = investorObs.geo_entities_found?.[0]
    addOps = await processNewRelation({
        currenOps: [...ops, ...currentOps],
        spaceId: currSpaceId,
        entityOnGeo: entityOnGeo,
        fromEntityId: investor_geoId,
        toEntityId: project_geoId,
        propertyId: propertyToIdMap['invested_in'],
    });
    ops.push(...addOps.ops);
    let relationEntity = addOps.relationEntityId;
    
    // Add investor type to investor
    //addOps = await processNewRelation({
    //    currenOps: [...ops, ...currentOps],
    //    spaceId: currSpaceId,
    //    entityOnGeo: entityOnGeo,
    //    fromEntityId: investor_geoId,
    //    toEntityId: normalizeToUUID(GEO_IDS.investorType),
    //    propertyId: SystemIds.TYPES_PROPERTY,
    //});
    //ops.push(...addOps.ops);

    // Add investors to project entity
    entityOnGeo = projectObs.geo_entities_found?.[0]
    addOps = await processNewRelation({
        currenOps: [...ops, ...currentOps],
        spaceId: currSpaceId,
        entityOnGeo: entityOnGeo,
        fromEntityId: project_geoId,
        toEntityId: investor_geoId,
        propertyId: propertyToIdMap['investor'],
        relationEntity: relationEntity,
    });
    ops.push(...addOps.ops);

    // add deals to investments relation entity
    //console.log("SEARCHING IN INVESTMENTSMENT")
    //entityOnGeo = await searchEntity({
    //    entityId: relationEntity,
    //    spaceId: currSpaceId
    //});
    entityOnGeo = relations.filter((entity: any) => entity?.id === normalizeToUUID_STRING(relationEntity))?.[0]
    addOps = await processNewRelation({
        currenOps: [...ops, ...currentOps],
        spaceId: currSpaceId,
        entityOnGeo: entityOnGeo,
        fromEntityId: relationEntity,
        toEntityId: fundingRoundEntity,
        propertyId: propertyToIdMap['funding_rounds'],
    });
    ops.push(...addOps.ops);

    return { ops };
}

//export async function processInvestment(currentOps: Array<Op>, investmentId: string, teableClient: any): Promise<[Op | Op[], string]> {
export async function processInvestment({
  currentOps,
  investment,
  client,
  tables,
  relations
}: {
  currentOps: Array<Op>;
  investment: any;
  client: any;
  relations: any[];
  tables: { projects: any; investment_rounds: any; tags: any; types: any; assets: any; platforms: any; market_data: any, ecosystems: any; }
}): Promise<{
    ops: Op[]; id: string;
}> {

    
    // I can significantly speed this up if I sort by fundraising_name and then only run the bulk of this once, then just iterate over the different investors

    const ops: Array<Op> = [];
    const currSpaceId = GEO_IDS.cryptoSpace;
    let addOps;
    let geoId: string;
    const propertiesSourced = [];
    let searchTrigger = true;
    let entityOnGeo;
    
    // -----------------------------
    // ---- Organize properties ---- 
    // -----------------------------
    // fields to pull from postgres

    const valueProperties = ['fundraising_name', 'round_date', 'raise_amount'];
    const relationProperties = ['funding_round']
    const values: { property: string; value: any }[] = [];

    const name = investment?.['fundraising_name']

    if (geoId = await searchOps({
        ops: currentOps,
        property: SystemIds.NAME_PROPERTY,
        propType: "TEXT",
        searchText: name,
        typeId: normalizeToUUID(GEO_IDS.fundingRoundType)
    })) {
        return { ops: (await addSpace(ops, currSpaceId)), id: geoId }
    } else {
        if (investment.geo_ids_found.length > 0) {
            geoId = investment.geo_ids_found?.[0]
        } else {
            geoId = Id.generate();
            searchTrigger = false;
        }

        if (await hasBeenEdited(currentOps, geoId)) {
            return { ops: ops, id: geoId }
        } else {
            if (searchTrigger) {
                entityOnGeo = investment.geo_entities_found?.[0]
                console.log("entity exists on geo: ", geoId)
            }

            for (const property of valueProperties) {
                let start_val_len = values.length;
                
                const value = investment?.[property];
                const includesCoincarp = typeof value === 'string' && value.toLowerCase().includes('coincarp.com');
                if ((property.includes('url')) && (includesCoincarp)) {
                    console.error("website incldudes coincarp.com")
                } else {
                    // Only push property if it doesnt already exist on Geo
                    if (!(await valuePropertyExistsOnGeo(currSpaceId, entityOnGeo, propertyToIdMap[property]))) {
                        
                        if (investment?.[property]) {
                            let value;
                            if (property == "round_date") {
                                const date = new Date(investment?.[property]?.toString());
                                // Set to midnight UTC
                                date.setUTCHours(0, 0, 0, 0);
                                value =  date.toISOString();
                            } else {
                                value = investment?.[property].toString()
                            }

                            values.push({
                                property: normalizeToUUID(propertyToIdMap[property]),
                                value: value,
                            });
                    }
                    }
                }
                if (values.length > start_val_len) {
                    propertiesSourced.push(property)
                }

            }
            if (values.length > 0) {
                addOps = Graph.createEntity({
                    id: geoId,
                    values: values
                })
                ops.push(...addOps.ops);

                if (propertiesSourced.length > 0) {
                    let source_id = GEO_IDS.coincarp
                    let source_url = investment?.['source'].toString()

                    if (investment?.['source'].toString().includes("coincarp.com")) {
                        addOps = await addSources({
                            currentOps: [...ops, ...currentOps],
                            entityId: geoId,
                            entityOnGeo: investment.geo_entities_found?.[0],
                            sourceEntityId: source_id,
                            propertiesSourced: propertiesSourced.map(property => propertyToIdMap[property]),
                            source_url: source_url,
                            source_db_id: undefined,
                            toEntity: undefined,
                            relations: relations,
                        })
                        ops.push(...addOps.ops);
                        
                    }
                    propertiesSourced.length = 0
                }
            }

            //Add Funding round type...
            addOps = await processNewRelation({
                currenOps: [...ops, ...currentOps],
                spaceId: currSpaceId,
                entityOnGeo: entityOnGeo,
                fromEntityId: geoId,
                toEntityId: GEO_IDS.fundingRoundType,
                propertyId: SystemIds.TYPES_PROPERTY,
            });
            ops.push(...addOps.ops);

            let toEntity;
            let projectEntityId;
            for (const property of relationProperties) {
                if (investment?.[property]) {
                    if (property == 'funding_round') {
                        addOps = await processTag({
                            currentOps: [...ops, ...currentOps],
                            tag: investment,
                            tagName: investment?.[property],
                            tagType: GEO_IDS.fundingStageType,
                            tables: tables
                        });
                    
                        ops.push(...addOps.ops);
                        toEntity = addOps.id;

                        addOps = await processNewRelation({
                            currenOps: [...ops, ...currentOps],
                            spaceId: currSpaceId,
                            entityOnGeo: entityOnGeo,
                            fromEntityId: geoId,
                            toEntityId: toEntity,
                            propertyId: propertyToIdMap[property],
                        });
                        ops.push(...addOps.ops);
                        
                        //ADD PROPERTIES SOURCED
                        propertiesSourced.push(property)
                        if (propertiesSourced.length > 0) {
                            let source_id = GEO_IDS.coincarp
                            let source_url = investment?.['source'].toString()

                            if (investment?.['source'].toString().includes("coincarp.com")) {
                                addOps = await addSources({
                                    currentOps: [...ops, ...currentOps],
                                    entityId: geoId,
                                    entityOnGeo: investment.geo_entities_found?.[0],
                                    sourceEntityId: source_id,
                                    propertiesSourced: propertiesSourced.map(property => propertyToIdMap[property]),
                                    source_url: source_url,
                                    source_db_id: undefined,
                                    toEntity: toEntity,
                                    relations: relations,
                                })
                                ops.push(...addOps.ops);
                                
                            }
                            propertiesSourced.length = 0
                        }
                    }
                }
            }

            //Handle either an array of projects or single project
            const rawProjects = investment?.['projects'];
            const projectList = Array.isArray(rawProjects) ? rawProjects : rawProjects ? [rawProjects] : [];
            for (const project of projectList) {
                const projectObs = tables?.projects.filter((item: any) => item?.__id === project.id)?.[0];
                addOps = await processProject({
                    currentOps: [...ops, ...currentOps],
                    project: projectObs,
                    client: client,
                    tables: tables
                });
                ops.push(...addOps.ops)

                projectEntityId = addOps.id
                toEntity = projectEntityId

                addOps = await processNewRelation({
                    currenOps: [...ops, ...currentOps],
                    spaceId: currSpaceId,
                    entityOnGeo: entityOnGeo,
                    fromEntityId: geoId,
                    toEntityId: toEntity,
                    propertyId: propertyToIdMap['project'],
                });
                ops.push(...addOps.ops);
                
                //ADD PROPERTIES SOURCED
                propertiesSourced.push('project')
                if (propertiesSourced.length > 0) {
                    let source_id = GEO_IDS.coincarp
                    let source_url = investment?.['source'].toString()

                    if (investment?.['source'].toString().includes("coincarp.com")) {
                        addOps = await addSources({
                            currentOps: [...ops, ...currentOps],
                            entityId: geoId,
                            entityOnGeo: investment.geo_entities_found?.[0],
                            sourceEntityId: source_id,
                            propertiesSourced: propertiesSourced.map(property => propertyToIdMap[property]),
                            source_url: source_url,
                            source_db_id: undefined,
                            toEntity: toEntity,
                            relations: relations,
                        })
                        ops.push(...addOps.ops);
                    }
                    propertiesSourced.length = 0
                }

                // Add investors
                const rawInvestors = investment?.['investors'];
                const investorList = Array.isArray(rawInvestors) ? rawInvestors : rawInvestors ? [rawInvestors] : [];
                for (const investor of investorList) {
                    addOps = await addInvestor({
                        currentOps: [...ops, ...currentOps],
                        client: client,
                        project_geoId: projectEntityId,
                        projectObs: projectObs,
                        investorObs: tables?.projects.filter((item: any) => item?.__id === investor?.id)?.[0],
                        fundingRoundEntity: geoId,
                        fundingRoundObs: investment,
                        tables: tables,
                        source_url: investment?.['source'].toString(),
                        relations: relations
                    });
                    ops.push(...addOps.ops)
                }
            }

            return { ops: (await addSpace(ops, currSpaceId)), id: geoId }
        }
    }
}



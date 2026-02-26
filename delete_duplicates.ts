import { SPACE_IDS, propertyToIdMap } from './src/constants.ts';
import { Graph, type Op, SystemIds } from "@geoprotocol/geo-sdk"
import PostgreSQLClient from "./src/postgres-client.ts";
import { loadGeoEntities_to_delete } from './src/setup_ontology.ts';
import { printOps, publishOps_w_spaces, normalizeName, addSpace } from './src/functions.ts';
import * as fs from "fs";

const SPACE_ID = SPACE_IDS.podcasts;

const pgClient = new PostgreSQLClient();

process.on('SIGINT', async () => {
    console.log('Exiting gracefully...');
    await pgClient.close();
    process.exit(0);
});

try {
    const geoEntities = await loadGeoEntities_to_delete(SPACE_ID);
    const episodes = geoEntities.episodes ?? [];
    //const episodes = (geoEntities.episodes ?? []).filter((ep: any) => ep.name === "#2458 - Matt McCusker");

    console.log(`Loaded ${episodes.length} episodes`);

    // --- Step 1: Group episodes by normalized name ---
    const nameGroups: Record<string, any[]> = {};
    for (const ep of episodes) {
        const normalized = normalizeName(ep.name);
        if (!normalized) continue;
        if (!nameGroups[normalized]) nameGroups[normalized] = [];
        nameGroups[normalized].push(ep);
    }

    // Filter to only groups with duplicates
    const duplicateGroups = Object.entries(nameGroups).filter(([_, group]) => group.length > 1);
    console.log(`Found ${duplicateGroups.length} duplicate episode groups`);

    
    const ops: Array<Op> = [];

    for (const [normalizedName, group] of duplicateGroups) {
        // --- Step 2: Pick keeper (most backlinks) ---
        group.sort((a, b) => (b.backlinks?.length ?? 0) - (a.backlinks?.length ?? 0));
        const keeper = group[0];
        const duplicates = group.slice(1);

        console.log(`\nMerging "${keeper.name}" (keeper: ${keeper.id}, ${keeper.backlinks?.length ?? 0} backlinks)`);
        for (const dup of duplicates) {
            console.log(`  Deleting duplicate: ${dup.id} (${dup.backlinks?.length ?? 0} backlinks)`);
        }

        for (const dup of duplicates) {
            // --- Step 3: Migrate backlinks from duplicate to keeper ---
            const dupBacklinks = dup.backlinks ?? [];
            for (const backlink of dupBacklinks) {
                // backlink.fromEntityId is the entity that points TO the duplicate
                // We need to delete this relation and create a new one pointing to the keeper

                // Check if the keeper already has this same backlink (same fromEntity + same type)
                const keeperAlreadyHas = (keeper.backlinks ?? []).some(
                    (kb: any) => kb.fromEntityId === backlink.fromEntityId && kb.typeId === backlink.typeId
                );

                // Delete the old backlink relation pointing to the duplicate
                const deleteOps = Graph.deleteRelation({ id: backlink.id });
                ops.push(...await addSpace(deleteOps.ops, SPACE_ID));

                // Clean up the backlink's relation entity if it exists
                if (backlink.entityId) {
                    const relEntity = backlink.entity;
                    if (relEntity) {
                        // Unset all properties
                        const relEntValues = relEntity.values ?? [];
                        const relEntPropIds = [...new Set<string>(relEntValues.map((v: any) => v.propertyId))];
                        if (relEntPropIds.length > 0) {
                            const unsetRelEntOps = Graph.updateEntity({
                                id: backlink.entityId,
                                unset: relEntPropIds.map((pid) => ({ property: pid })),
                            });
                            ops.push(...await addSpace(unsetRelEntOps.ops, SPACE_ID));
                        }
                        // Delete all relations on the relation entity
                        for (const relEntRel of (relEntity.relations ?? [])) {
                            const delRelEntRelOps = Graph.deleteRelation({ id: relEntRel.id });
                            ops.push(...await addSpace(delRelEntRelOps.ops, SPACE_ID));
                        }
                    }
                }

                if (!keeperAlreadyHas) {
                    // Create new relation pointing to the keeper
                    const createOps = Graph.createRelation({
                        fromEntity: backlink.fromEntityId,
                        toEntity: keeper.id,
                        type: backlink.typeId,
                    });
                    ops.push(...await addSpace(createOps.ops, SPACE_ID));
                }
            }

            // --- Step 4: Delete all relations on the duplicate entity ---
            const dupRelations = dup.relations ?? [];
            for (const rel of dupRelations) {
                // Delete the relation
                const deleteRelOps = Graph.deleteRelation({ id: rel.id });
                ops.push(...await addSpace(deleteRelOps.ops, SPACE_ID));

                // Clean up the relation entity if it exists
                if (rel.entityId) {
                    const relEntity = rel.entity;
                    if (relEntity) {
                        // Unset all properties
                        const relEntValues = relEntity.values ?? [];
                        const relEntPropIds = [...new Set<string>(relEntValues.map((v: any) => v.propertyId))];
                        if (relEntPropIds.length > 0) {
                            const unsetRelEntOps = Graph.updateEntity({
                                id: rel.entityId,
                                unset: relEntPropIds.map((pid) => ({ property: pid })),
                            });
                            ops.push(...await addSpace(unsetRelEntOps.ops, SPACE_ID));
                        }
                        // Delete all relations on the relation entity
                        for (const relEntRel of (relEntity.relations ?? [])) {
                            const delRelEntRelOps = Graph.deleteRelation({ id: relEntRel.id });
                            ops.push(...await addSpace(delRelEntRelOps.ops, SPACE_ID));
                        }
                    }
                }

                // --- Step 5: Check if the toEntity has other backlinks ---
                // Skip type relations (they point to type entities we don't want to delete)
                if (rel.typeId === SystemIds.TYPES_PROPERTY) continue;

                const toEntityId = rel.toEntityId;
                if (!toEntityId) continue;

                // Find the toEntity across all entity tables to check its backlinks
                let toEntity: any = null;
                for (const [tableName, entities] of Object.entries(geoEntities)) {
                    const found = (entities as any[]).find((e: any) => e.id === toEntityId);
                    if (found) {
                        toEntity = found;
                        break;
                    }
                }

                if (toEntity) {
                    // Filter out the current relation from the toEntity's backlinks
                    const otherBacklinks = (toEntity.backlinks ?? []).filter(
                        (bl: any) => bl.fromEntityId !== dup.id
                    );

                    if (otherBacklinks.length === 0) {
                        // No other entities reference this toEntity, safe to delete
                        console.log(`    Deleting orphaned entity: ${toEntity.name} (${toEntityId})`);

                        // Unset all properties on the orphaned entity
                        const toEntityValues = toEntity.values ?? [];
                        const propertyIds = [...new Set<string>(toEntityValues.map((v: any) => v.propertyId))];
                        if (propertyIds.length > 0) {
                            const unsetOps = Graph.updateEntity({
                                id: toEntityId,
                                unset: propertyIds.map((pid) => ({ property: pid })),
                            });
                            ops.push(...await addSpace(unsetOps.ops, SPACE_ID));
                        }

                        // Delete all relations on the orphaned entity
                        const toEntityRelations = toEntity.relations ?? [];
                        for (const toRel of toEntityRelations) {
                            const delToRelOps = Graph.deleteRelation({ id: toRel.id });
                            ops.push(...await addSpace(delToRelOps.ops, SPACE_ID));

                            if (toRel.entityId) {
                                const toRelEntity = toRel.entity;
                                if (toRelEntity) {
                                    // Unset all properties on the relation entity
                                    const toRelEntValues = toRelEntity.values ?? [];
                                    const toRelEntPropIds = [...new Set<string>(toRelEntValues.map((v: any) => v.propertyId))];
                                    if (toRelEntPropIds.length > 0) {
                                        const unsetToRelEntOps = Graph.updateEntity({
                                            id: toRel.entityId,
                                            unset: toRelEntPropIds.map((pid) => ({ property: pid })),
                                        });
                                        ops.push(...await addSpace(unsetToRelEntOps.ops, SPACE_ID));
                                    }
                                    // Delete all relations on the relation entity
                                    for (const toRelEntRel of (toRelEntity.relations ?? [])) {
                                        const delToRelEntRelOps = Graph.deleteRelation({ id: toRelEntRel.id });
                                        ops.push(...await addSpace(delToRelEntRelOps.ops, SPACE_ID));
                                    }
                                }
                            }
                        }

                        // Delete the orphaned entity itself
                        const deleteToEntityOps = Graph.deleteEntity({ id: toEntityId });
                        ops.push(...await addSpace(deleteToEntityOps.ops, SPACE_ID));
                    }
                }
            }

            // --- Step 6: Unset all properties on the duplicate entity ---
            const dupValues = dup.values ?? [];
            const dupPropertyIds = [...new Set<string>(dupValues.map((v: any) => v.propertyId))];
            if (dupPropertyIds.length > 0) {
                const unsetOps = Graph.updateEntity({
                    id: dup.id,
                    unset: dupPropertyIds.map((pid) => ({ property: pid })),
                });
                ops.push(...await addSpace(unsetOps.ops, SPACE_ID));
            }

            // --- Step 7: Delete the duplicate entity itself ---
            //const deleteEntityOps = Graph.deleteEntity({ id: dup.id });
            //ops.push(...await addSpace(deleteEntityOps.ops, SPACE_ID));
        }
    }

    console.log(`\nTotal ops generated: ${ops.length}`);

    // Write ops to file for review before publishing
    printOps(ops, "published_ops", "delete_duplicates_ops.txt");
    /**/
    // Uncomment to publish:
    await publishOps_w_spaces(ops);

} catch (error) {
    console.error(error);
} finally {
    await pgClient.close();
}

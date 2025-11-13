import { Graph, Id, SystemIds } from "@graphprotocol/grc-20";
import { addSpace, GEO_IDS, normalizeToUUID, propertyToIdMap } from "../src/constants";
import * as fs from "fs";
import path from 'path';

function printOps(ops: any) {
  const outputDir = path.join(__dirname, 'ethcc_testnet_ops');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);
    const usedIndices = existingFiles
      .map(name => {
        const match = name.match(/^ethcc_ops_(\d+)\.txt$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter(i => i !== null) as number[];

    // Determine next index
    const nextIndex = usedIndices.length > 0 ? Math.max(...usedIndices) + 1 : 1;

    // Create output text
    const outputText = JSON.stringify(ops, null, 2);

    // Write to file
    const filename = `ethcc_ops_${nextIndex}.txt`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, outputText);

    console.log(`OPS PRINTED to ${filename}`);
  } else {
    console.log("NO OPS TO PRINT");
  }
}

export async function linkProjectsToApps(entities: any[]): Promise<any[]> {
  const ops: any[] = [];
  let addOps;

  // Step 1: Index entities by name (lowercased) for fast lookup
  const nameMap: Map<string, any[]> = new Map();

  for (const entity of entities) {
    const name = entity.name?.trim().toLowerCase();
    if (!name) continue;
    if (!nameMap.has(name)) nameMap.set(name, []);
    nameMap.get(name)!.push(entity);
  }

  // Step 2: Iterate over each entity to find project → app links
  for (const projectEntity of entities) {
    const projectName = projectEntity.name?.trim().toLowerCase();
    if (!projectName) continue;

    const isProject =
      projectEntity.relations?.some(
        (r: any) =>
          r.typeId === SystemIds.TYPES_PROPERTY &&
          r.toId === SystemIds.PROJECT_TYPE
      );

    if (!isProject) continue;

    const potentialMatches = nameMap.get(projectName) ?? [];

    for (const appEntity of potentialMatches) {
      if (appEntity.id === projectEntity.id) continue;

      const isApp =
        appEntity.relations?.some(
          (r: any) =>
            r.typeId === SystemIds.TYPES_PROPERTY &&
            r.toId === normalizeToUUID(GEO_IDS.appType)
        );

      if (!isApp) continue;

      let relation_entity_id = Id.generate()
      // Found matching app, create relation
      addOps = Graph.createRelation({
        entityId: relation_entity_id,
        fromEntity: projectEntity.id,
        toEntity: appEntity.id,
        type: normalizeToUUID(propertyToIdMap['related_apps']),
      });

      ops.push(...addOps.ops);

      // Found matching app, create relation
      addOps = Graph.createRelation({
        entityId: relation_entity_id,
        fromEntity: appEntity.id,
        toEntity: projectEntity.id,
        type: normalizeToUUID(propertyToIdMap['related_projects']),
      });

      ops.push(...addOps.ops);
    }
  }

  return ops;
}


// Load and parse the file
const filePath = "crypto_space_api_output.json";
const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

printOps(await addSpace(await linkProjectsToApps(data), GEO_IDS.cryptoSpace))

//Note: I could also link assets to projects
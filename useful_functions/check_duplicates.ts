import * as fs from 'fs/promises';
import path from 'path';
import { type Op } from "@graphprotocol/grc-20";

async function main() {
  const filePath = path.join(__dirname, 'ethcc_testnet_ops/ethcc_ops_1.txt');
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const ops: Op[] = JSON.parse(fileContent);

  // 1. Check for duplicate property-value pairs in UPDATE_ENTITY
  const seenValueProps = new Set<string>();
  const dupValueProps: string[] = [];

  for (const op of ops) {
    
    if (op.type === 'UPDATE_ENTITY') {
      for (const val of op.entity?.values || []) {
        if (!["412ff593-e915-4012-a43d-4c27ec5c68b6", "41aa3d98-47b6-4a97-b7ec-427e575b910e", "7f6ad043-3e21-4257-a6d4-8bdad36b1d84", "f7b33e08-b76d-4190-aada-cadaa9f561e1", "16781706-dd9c-48bf-913e-cdf18b56034f", "52665f3e-fb7d-48d5-8b6b-abb21b0d36db", "32f2ea55-182a-45f1-9a86-9f87a77fc225"].includes(val.property)) {
          const key = `${val.property}::${val.value}`;
           if (seenValueProps.has(key)) {
            dupValueProps.push(key);
          } else {
            seenValueProps.add(key);
          }
        }
      }
    }
  }

  // 2. Check for duplicate CREATE_RELATIONs with same from-to-type
  const seenRelations = new Set<string>();
  const dupRelations: string[] = [];

  for (const op of ops) {
    if (op.type === 'CREATE_RELATION') {
      const rel = op.relation;
      const key = `${rel.fromEntity}::${rel.toEntity}::${rel.type}`;
      if (seenRelations.has(key)) {
        dupRelations.push(key);
      } else {
        seenRelations.add(key);
      }
    }
  }

  // Output results
  console.log('Duplicate value-property pairs:');
  console.log(dupValueProps);

  console.log('\nDuplicate CREATE_RELATION from-to-type:');
  console.log(dupRelations);
}

main().catch(console.error);



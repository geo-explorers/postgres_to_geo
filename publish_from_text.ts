import fs from 'fs';
import path from 'path';
import { filterOps, getSpaces, testnetWalletAddress } from './src/constants';
import { publish } from './src/publish';

function readOpsFromFile(dir: string, fn: string): any {
  const filePath = path.join(__dirname, dir, fn);

  if (!fs.existsSync(filePath)) {
    console.error(`File ${fn} does not exist`);
    return null;
  }

  const fileContents = fs.readFileSync(filePath, 'utf-8');

  try {
    const ops = JSON.parse(fileContents);
    console.log(`Read ${ops.length} ops from ${fn}`);
    return ops;
  } catch (err) {
    console.error(`Failed to parse JSON from file ${fn}`, err);
    return null;
  }
}
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

async function publishOps(ops: any) {
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


const index_num = 1;
const ops = readOpsFromFile("src", "test_push_quotes_and_transcript_02.txt");

if (true) {
  for (const [i, op] of ops.entries()) {
    if (op?.type === "UPDATE_ENTITY" && op.entity?.values) {
      for (const [j, v] of op.entity.values.entries()) {
        if (!('value' in v) || v.value === undefined) {
          console.error(`❌ Found invalid value at ops[${i}].entity.values[${j}]`);
          console.dir(v, { depth: null });
          console.dir(op, { depth: null });  // Show full op
        }
      }
    }
  }
}
if (true) {
  if (ops) {
      await publishOps(ops)
  }
}

console.log(ops.length)
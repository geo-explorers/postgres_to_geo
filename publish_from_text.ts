import fs from 'fs';
import path from 'path';
import {testnetWalletAddress } from './src/constants.ts';
import { publishOps, printOps } from './src/publish.ts';
import { addSpace, filterOps, getSpaces } from './src/functions';

// Pre-computed lookup: "00"->0, "01"->1, ..., "ff"->255
const HEX_TO_BYTE = new Uint8Array(65536);
for (let i = 0; i < 256; i++) {
  const hex = i.toString(16).padStart(2, "0");
  HEX_TO_BYTE[hex.charCodeAt(0) | (hex.charCodeAt(1) << 8)] = i;
  // Also handle uppercase
  const HEX = hex.toUpperCase();
  HEX_TO_BYTE[HEX.charCodeAt(0) | (HEX.charCodeAt(1) << 8)] = i;
  // Mixed case combos
  HEX_TO_BYTE[hex.charCodeAt(0) | (HEX.charCodeAt(1) << 8)] = i;
  HEX_TO_BYTE[HEX.charCodeAt(0) | (hex.charCodeAt(1) << 8)] = i;
}

function hexToId(hex: string): Uint8Array {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const j = i * 2;
    bytes[i] = HEX_TO_BYTE[hex.charCodeAt(j) | (hex.charCodeAt(j + 1) << 8)];
  }
  return bytes;
}

function convertField(op: any, key: string) {
  const v = op[key];
  if (typeof v === "string" && v.length === 32) op[key] = hexToId(v);
}

function convertOpsFromJson(ops: any[]) {
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    convertField(op, "id");

    switch (op.type) {
      case "createEntity": {
        const vals = op.values;
        if (vals) for (let j = 0; j < vals.length; j++) {
          const v = vals[j];
          convertField(v, "property");
          if (v.value) {
            convertField(v.value, "language");
            convertField(v.value, "unit");
          }
        }
        break;
      }
      case "updateEntity": {
        const set = op.set;
        if (set) for (let j = 0; j < set.length; j++) {
          const v = set[j];
          convertField(v, "property");
          if (v.value) {
            convertField(v.value, "language");
            convertField(v.value, "unit");
          }
        }
        const unset = op.unset;
        if (unset) for (let j = 0; j < unset.length; j++) {
          convertField(unset[j], "property");
        }
        break;
      }
      case "createRelation":
        convertField(op, "relationType");
        convertField(op, "from");
        convertField(op, "to");
        convertField(op, "entity");
        // falls through
      case "updateRelation":
        convertField(op, "fromSpace");
        convertField(op, "fromVersion");
        convertField(op, "toSpace");
        convertField(op, "toVersion");
        break;
    }
  }
  return ops;
}

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
    return convertOpsFromJson(ops);
  } catch (err) {
    console.error(`Failed to parse JSON from file ${fn}`, err);
    return null;
  }
}

const index_num = 1;
const ops = readOpsFromFile("podcasts_space_data", "e252f9e1d3ad44608bf154f93b02f220_ops.txt");

if (true) {
  for (const [i, op] of ops.entries()) {
    if (op?.type === "createEntity" && op.entity?.values) {
      for (const [j, v] of op.values.entries()) {
        if (!('value' in v) || v.value === undefined) {
          console.error(`❌ Found invalid value at ops[${i}].entity.values[${j}]`);
          console.dir(v, { depth: null });
          console.dir(op, { depth: null });  // Show full op
        }
      }
    }
  }
}

await printOps(ops, "published_ops", "initial_podcasts_publish.txt")

if (true) {
  if (ops) {
      await publishOps(ops, "Publish podcast data")
  }
}

console.log(ops.length)
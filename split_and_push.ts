import { readFile, writeFile } from "fs/promises";
import path from "path";
import { printOps, publishOps } from "./src/functions.ts";

async function splitAndPublish() {
  const folder = "published_ops";
  const baseName = "push_100_ep_all_claims";
  const filePath = path.join(folder, `${baseName}.txt`);

  // 1. Load the original file
  const raw = await readFile(filePath, "utf8");

  // 2. The file is a sequence of JSON objects separated by commas.
  // Wrap in brackets to convert into valid JSON array.
  const jsonText = `[${raw.trim().replace(/,$/, "")}]`;

  let ops: any[];
  try {
    ops = JSON.parse(jsonText);
  } catch (err) {
    console.error("Failed to parse ops file:", err);
    return;
  }

  const total = ops.length;
  const chunkCount = 10;
  const chunkSize = Math.ceil(total / chunkCount);

  console.log(`Total ops: ${total}, chunk size: ${chunkSize}`);

  // 3. Split into chunks of size chunkSize
  const segments: any[][] = [];
  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, total);
    segments.push(ops.slice(start, end));
  }

  // 4. Write each chunk + publish
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // skip empty trailing chunks if total < 10
    if (seg.length === 0) continue;

    const index = String(i + 1).padStart(2, "0");
    const fileName = `${baseName}_${index}.txt`;
    const outPath = path.join(folder, fileName);

    // Write JSON objects separated by commas, no enclosing array
    const textOut =
      seg.map((obj) => JSON.stringify(obj, null, 2)).join(",\n") + "\n";

    await writeFile(outPath, textOut, "utf8");
    console.log(`Wrote ${outPath}`);

    // 5. Execute your publishing workflow
    printOps(seg, folder, fileName);
    await publishOps(seg);

    console.log(`Published segment ${index}`);
  }
}

splitAndPublish().catch(console.error);

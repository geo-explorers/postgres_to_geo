import { Graph } from "@graphprotocol/grc-20";
import { addSpace, publishOps } from "./src/functions";
import { SPACE_IDS } from "./src/constants";

const ops = Graph.createRelation({
  type: "1155beff-fad5-49b7-a2e0-da4777b8792c",
  toEntity: "9b22d5ff-d537-4db0-9a3c-7909e6f69650",
  fromEntity: "41071c49-2474-6bf3-a851-31ea69b57b20"
}).ops

await publishOps(await addSpace(ops, SPACE_IDS.podcasts))
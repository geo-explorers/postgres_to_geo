import { Graph, type Op, SystemIds, IdUtils } from "@geoprotocol/geo-sdk";
import { publish } from "./src/publish";
import { addSpace, filterOps, getSpaces } from "./src/functions";

const sw_address = "0xab28066d9a7ddFF52B67dF699592BA7060e0d3b9" as `0x${string}`
const personal_space = "f3dab79cb5a3d9d1759656dd5361d1c6"

Graph.createSpace({
    governanceType: "PUBLIC",
    name: "Football",
    editorAddress: "0xf3dab79cb5a3d9d1759656dd5361d1c6"
})


import { SystemIds, type Op, Graph, Id } from "@graphprotocol/grc-20";
import { testnetWalletAddress } from "./src/constants";

const id = await Graph.createSpace({
    editorAddress: testnetWalletAddress,
    name: "Podcasts",
    network: "TESTNET"
})
console.log(id)
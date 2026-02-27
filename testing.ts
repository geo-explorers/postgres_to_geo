import { daoSpace, Graph, IdUtils, SystemIds } from "@geoprotocol/geo-sdk";
import { publishOps } from "./src/publish";



const ops = Graph.updateEntity({
  id: "1cf7c42a5d4d486c9f36e3e96940f83d",
  unset: [{property: SystemIds.NAME_PROPERTY}]
}).ops

await publishOps(ops, "Test_publish_delete", "b5a31f8182b042437ede0f84ee02f104")
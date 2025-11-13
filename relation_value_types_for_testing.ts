import { Graph, Id, Position, SystemIds, type Op } from '@graphprotocol/grc-20';
import * as fs from "fs";
//import { publish } from './src/publish';
import { addSpace, filterOps, GEO_IDS, getSpaces, normalizeToUUID, normalizeToUUID_STRING, propertyToIdMap, propertyToTypeIdMap, readAllOpsFromFolder, testnetWalletAddress } from './src/constants';
import path from 'path';
import { publish } from './src/publish';

function printOps(ops: any) {
  const outputDir = path.join(__dirname, '');
  console.log("NUMBER OF OPS: ", ops.length);

  if (ops.length > 0) {
    // Get existing filenames in the directory
    const existingFiles = fs.readdirSync(outputDir);

    // Create output text
    const outputText = JSON.stringify(ops, null, 2);

    // Write to file
    const filename = `test_function.txt`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, outputText);

    console.log(`OPS PRINTED to ${filename}`);
  } else {
    console.log("NO OPS TO PRINT");
  }
}

async function publishOps(ops: any) {
    printOps(ops)
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

// I Dont know what the following properties should point to
// GENERAL
// What should the relation value types be if a relation can point to any entity? (Collection item, Highlighted entities, etc.)
// Should image type and image renderable type be two different entities?
// Andreesen Horowitz is duplicated in SF and crypto space

// ROOT SPACE
// Data source: https://testnet.geobrowser.io/space/2df11968-9d1c-489f-91b7-bdc88b472161/8ac1c4bf-453b-44b7-9eda-5d1b527e5ea3
// Page type: https://testnet.geobrowser.io/space/2df11968-9d1c-489f-91b7-bdc88b472161/62dfabe5-282d-44a7-ba93-f2e80d20743d
// Template type: https://testnet.geobrowser.io/space/2df11968-9d1c-489f-91b7-bdc88b472161/cf37cd59-840c-4dac-a22b-9d9dde536ea7
// Data source type (1f69cc98-80d4-44ab-ad49-3df6a7b15ee4), seems like it should point to something like query data source (3b069b04-adbe-4728-917d-1283fd4ac27e), but that doesnt have a type...

//What should Data source property (link) point to?
//I don’t think this is used anywhere atm in the codebase. It might be the type that Data source type should be pointing to.
//Create data source type and remove data source property
//Remove page type

// CRYPTO SPACE
// Delete Founding stages property...
// Delete Name of the round property
// Delete Info, Categories, Parent, Contract properties
// Delete Info property

// CRYPTO NEWS
// This entity is fucked up

// REGIONS SPACE
// Neighborhood should not be both a property and a type...

// MIGRATION CODE UPDATE
// Remove to and from properties?



// product and services
//CRYPTO SPACE TO ADD - "b2565802-3118-47be-91f2-e59170735bac"
// "92770756-3573-4c29-be10-4e3e6d7556b5" // Invested in should point to project "484a18c5-030a-499c-b0f2-ef588ff16d50"
// "b4878d1a-0609-488d-b8a6-e19862d6b62f" // Raised by should point to project "484a18c5-030a-499c-b0f2-ef588ff16d50"
// "117bb4dd-fdbe-43ec-bf28-9826031aa64a" // Investments in should point to project "484a18c5-030a-499c-b0f2-ef588ff16d50"
// "9b8a610a-fa35-486e-a479-e253dbdabb4f" // Investors should point to project "484a18c5-030a-499c-b0f2-ef588ff16d50"
// "429dfd6b-1fe4-411b-8aca-1c10e7779e98" // Lead by should point to either Person ("7ed45f2b-c48b-419e-8e46-64d5ff680b0d") or Project ("484a18c5-030a-499c-b0f2-ef588ff16d50")
// "4932a5cc-f0f6-451c-affe-90de2c90b2e2" // Funding rounds should point to Funding round type "8f03f4c9-59e4-44a8-a625-c0a40b1ff330"
// "79e0543e-865f-4163-887d-a27a8be9af18" // Subsidiaries should point to Project ("484a18c5-030a-499c-b0f2-ef588ff16d50")
// "7bcf57f8-ae1d-43d2-a47e-de60be950f0e" // Related technologies should point to Technology type "cbccb349-1e90-49c3-8d1d-e58e1a00a81c"
// "808261d4-4993-472e-890a-317c2c2dcfad" // Founders should point to Person ("7ed45f2b-c48b-419e-8e46-64d5ff680b0d")
// "8afc80a2-ac8f-4d3b-b6bc-f2f41539e7df" // Digital assets should point to asset "f8780a80-c238-4a2a-96cb-567d88b1aa63"
// "943480c3-4374-494e-baab-913ce6d0cb5b" // Related ecosystems should point to Network type "fca08431-1aa1-40f2-8a4d-0743c2a59df7"
// "c59a54ef-56e8-43b5-b523-df967b65771b" // Blockchain networks should point to Network type "fca08431-1aa1-40f2-8a4d-0743c2a59df7"
// "c7f59f27-2eb6-4cce-9bff-431f6f4b73c3" // Lead investments should point to funding round "8f03f4c9-59e4-44a8-a625-c0a40b1ff330"
// "e188254b-785d-48ac-a846-1d0eb09c98f5" // Related asset categories should point to Asset categories type "fd251b40-89d3-4945-b648-647ce51ef852"
// "e278c3d4-78b9-4222-b272-5a39a8556bd2" // Funding stage should point to Funding stage type "8d35d217-3fa1-4686-b74f-fcb3e9438067"
// "156dfd37-1636-4569-9115-9267b8ca2f1e" // Pricing models should point to pricing model type "d4c7a271-7ab9-435e-aff3-62b0f33d0ccb"
let entityId = "117bb4dd-fdbe-43ec-bf28-9826031aa64a"

//ROOT SPACE - "2df11968-9d1c-489f-91b7-bdc88b472161"
// DONE Avatar should point to image type
//"49c5d5e1-679a-4dbd-bfd3-3f618f227c94" // Sources should also go to a Project ("484a18c5-030a-499c-b0f2-ef588ff16d50") in the root space
// "11b06581-20d3-41ea-b570-2ef4ee0a4ffd" // Unit in the root space as well should point to currency "9291e563-afbe-4709-8780-a52cbb0f4aa9" (Note: others may be added to this)
// "14611456-b466-4cab-920d-2245f59ce828" // Relation type in the root space should point to renderable type "5338cc28-9704-4e96-b547-7dfc58da6fc7"
// "1c5b7c0a-d187-425e-885c-2980d9db6b4b" // Continent in root space should point to continent type "3317d044-a700-4a9d-bbaf-4c16ade42f76"
// "6d8cd471-f7af-415f-9411-18b1ef106434" // Country in root space should point to country type "42a0a761-8c82-459f-ad08-34bfeb437cde"
// "34f53507-2e6b-42c5-a844-43981a77cfa2" // COver should point to image type "ba4e4146-0010-499d-a0a3-caaa7f579d0e"
// "6c49012e-21fd-4b35-b976-60210ea0ae0f" // Placeholder image should point to image type "ba4e4146-0010-499d-a0a3-caaa7f579d0e"
// "39e40cad-b23d-4f63-ab2f-aea1596436c7" // Subtopics should point to topic type "5ef5a586-0f27-4d8e-8f6c-59ae5b3e89e2"
// "458fbc07-0dbf-4c92-8f57-16f3fdde7c32" // Topics should point to topic type "5ef5a586-0f27-4d8e-8f6c-59ae5b3e89e2"
// "b35bd6d3-9fb6-4f3a-8aea-f5a9b91b5ef6" // Broader topics should point to Topic type "5ef5a586-0f27-4d8e-8f6c-59ae5b3e89e2"
// "47b55f87-c5ca-4b2d-b1ac-32296fd0c650" // State should point to State type "3df12375-8de0-4f32-8e93-b0aee1d04324"
// "4d9cba1c-4766-4698-81cd-3273891a018b" // Tabs should point to page type "480e3fc2-67f3-4993-85fb-acdf4ddeaa6b"
// "6d29d578-49bb-4959-baf7-2cc696b1671a" // Data type should point to native type "a35e058b-52d1-48d2-b02d-773933d90b7e"
// "72ba2a0f-729d-4847-925d-f3b09d46bb66" // Address should point to Address type "5c6e72fb-8340-47c0-8281-8be159ecd495"
// "73609ae8-644c-4463-a50a-90a3ee585746" // Answers should point to claim type "96f859ef-a1ca-4b22-9372-c86ad58b694b"
// "81891dec-cb6c-427e-aa1f-b917292ec2dc" // Source space should point to space type "362c1dbd-dc64-44bb-a3c4-652f38a642d7"
// "9678296f-ca60-4e17-a997-a5dbbc227d18" // Questions should point to Question type "4318a1d2-c441-455c-b765-44049c45e6cf"
// "a945fa95-d15e-42bc-b70a-43d3933048dd" // Network property should point to network type "fca08431-1aa1-40f2-8a4d-0743c2a59df7"
// "beaba5cb-a677-41a8-b353-77030613fc70" // Blocks relation should point to Data block "b8803a86-65de-412b-bb35-7e0c84adf473" or text block "76474f2f-0089-4e77-a041-0b39fb17d0bf"
// "c9ed4b4b-7294-4eda-9a03-a7975cd1651e" // Owners should point to Person ("7ed45f2b-c48b-419e-8e46-64d5ff680b0d") or Project ("484a18c5-030a-499c-b0f2-ef588ff16d50")
// "e3a96728-2b09-4af7-9af7-86ef1aa7837e" // Project should point to project "484a18c5-030a-499c-b0f2-ef588ff16d50"
// "e4047a77-0043-4ed4-a410-72139bff7f7e" // Accounts should point to Account type "cb69723f-7456-471a-a8ad-3e93ddc3edfe"
// "eb1141ae-ba35-43df-acdd-3329cccd8121" // Person should point to person type "7ed45f2b-c48b-419e-8e46-64d5ff680b0d"
// "ec39a534-e7c8-4923-90dc-c3d80e76bf46" // Related industries should point to industry "fc512a40-8b55-44dc-85b8-5aae88b51fae"
// "f9eeaf9d-9eb7-41b1-ac5d-257c6e82e526" // Quotes that support claim should point to Quote type "043a171c-6918-4dc3-a7db-b8471ca6fcc2"
// "4e6ec5d1-4292-498a-84e5-f607ca1a08ce" // Opposing arguments should point to claim type "96f859ef-a1ca-4b22-9372-c86ad58b694b"
// "1dc6a843-4588-4819-8e7a-6e672268f811" // Supporting arguments should point to claim type "96f859ef-a1ca-4b22-9372-c86ad58b694b"
// "fa8fbad0-101c-4020-8d9b-dde11a381bdb" // County should point to county type "" (County type must be created...)


//REGIONS SPACE - "aea9f05a-2797-4e7e-aeae-5059ada3b56b"
// Business owener "2c7e5442-67ad-48a3-a714-6872c94b23b4" should point to Person type "7ed45f2b-c48b-419e-8e46-64d5ff680b0d"

// EDUCATION SPACE - "0fcbc499-71e5-4505-a081-aa26edd97937"
// "7ec4a220-45a9-4f45-b134-c3b38ae17a6f" // Quarter should point to quarter type "2f37e21a-4254-47e1-ad9f-8e362ded9193"

// CRYPTO NEWS 

const ops: Array<Op> = [];
let addOps;
const rootSpaceId = "29c97d29-1c9a-41f1-a466-8a713764bc27"
const worksAt = "dac6e89e-76be-4f77-88e1-0f556ceb6869"
const teamMembers = "a09625a4-b984-4876-8f0d-a28a65e47f85"

addOps = Graph.createType({
  name: "Working relationship",
  properties: ["2d696bf0-510f-403e-985b-8cd1e73feb9b", "c3445f6b-e2c0-4f25-b73a-5eb876c4f50c", "8fcfe5ef-3d91-47bd-8322-3830a998d26b"]
})
ops.push(...addOps.ops)
const workingRelType = addOps.id;

// Create Reverse relation types property
addOps = Graph.createProperty({
  dataType: "RELATION",
  name: "Relation entity types",
  relationValueTypes: ["e7d737c5-3676-4c60-9fa1-6aa64a8c90ad"]
})
ops.push(...addOps.ops)
const relEntityTypes = addOps.id;

// Create Reverse relation types property
addOps = Graph.createProperty({
  dataType: "RELATION",
  name: "Reverse relation types",
  relationValueTypes: ["808a04ce-b21c-4d88-8ad1-2e240613e5ca"]
})
ops.push(...addOps.ops)
const reverseRelTypes = addOps.id;

// Add Reverse relation types relation from Works at to Team members
addOps = Graph.createRelation({
  fromEntity: worksAt,
  toEntity: teamMembers,
  type: reverseRelTypes
})
ops.push(...addOps.ops)

// Add Reverse relation types relation from Team members to Works at
addOps = Graph.createRelation({
  fromEntity: teamMembers,
  toEntity: worksAt,
  type: reverseRelTypes
})
ops.push(...addOps.ops)

// Add Relation entity types to Works at
addOps = Graph.createRelation({
  fromEntity: worksAt,
  toEntity: workingRelType,
  type: relEntityTypes
})
ops.push(...addOps.ops)

// Add Relation entity types to Team members
addOps = Graph.createRelation({
  fromEntity: teamMembers,
  toEntity: workingRelType,
  type: relEntityTypes
})
ops.push(...addOps.ops)

// How should we incorporate Worked at?





await publishOps(await addSpace(ops, rootSpaceId))


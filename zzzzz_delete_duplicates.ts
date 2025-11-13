import * as fs from "fs";
import { publish } from "./src/publish";
import { mainnetWalletAddress, TABLES, getConcatenatedPlainText, GEO_IDS, getSpaces, filterOps, addSpace } from './src/constants';
import { searchEntity } from "./search_entity";
import { Graph } from "@graphprotocol/grc-20";

async function deleteEntity (id: string) {
    let current_state;
    let triples;
    let relations;
    const ops: Array<Op> = [];
    let addOps;
    current_state = await searchEntity(id);

    let toProperty = "Qx8dASiTNsxxP3rJbd4Lzd";
    let fromProperty = "RERshk4JoYoMC17r1qAo9J";
    let relationTypeProperty = "3WxYoAVreE4qFhkDUs5J3q";
    let indexProperty = "WNopXUYxsSsE51gkJGWghe";
    let propertiesDeletedByDeleteRelationFunction = [toProperty, fromProperty, relationTypeProperty, indexProperty]


    if (current_state) {
        //delete all triples and relationsByFromVersionId of duplicate

        const propertyIdMapping = current_state?.values?.nodes?.reduce((acc, item) => {
            if (!acc[item.spaceId]) {
                acc[item.spaceId] = [];
            }
            acc[item.spaceId].push(item.property.id);
            return acc;
        }, {} as Record<string, string[]>);

        for (const [spaceId, propertyIds] of Object.entries(propertyIdMapping)) {
            const addOps = Graph.unsetEntityValues({
                id: id, // whatever your entity ID is
                properties: propertyIds
            });
            
            ops.push(...(await addSpace(addOps.ops, spaceId)));
        }

        relations = current_state?.relations?.nodes;
        for (const relation of relations) {
            addOps = Graph.deleteRelation({id: relation.id})
            ops.push(...(await addSpace(addOps.ops, relation.spaceId)));
            
            if (relation.typeOfId == "beaba5cb-a677-41a8-b353-77030613fc70") { //Blocks property
                //console.log(relation?.toEntity?.id);
                addOps = await deleteEntity(relation?.toEntityId);
                ops.push(...addOps);
            }

            //addOps = await deleteEntity(relation?.entityId);
            //ops.push(...addOps);

        }
    }

    return ops;

}

async function main(entity_to_keep: string, duplicates: string[]) {
    const ops: Array<Op> = [];
    let addOps;
    let current_state;
    let references;
    let triples;
    let relations;
    for (const duplicate of duplicates) {
        current_state = await searchEntity(duplicate);
        //console.log(current_state?.relationsByToVersionId?.nodes);

        //Get all relationsByToVersionId
        references = current_state?.relationsByToVersionId?.nodes;
        for (const reference of references) {
            //recreate each relation with new to_id: entity_to_keep
            //add appropriate spaceId to each ops  
            addOps = Relation.make({
                fromId: reference.fromEntityId,
                toId: entity_to_keep,
                relationTypeId: reference.typeOfId,
                position: reference.index,
            });
            ops.push(await addSpace(addOps, reference.spaceId));


            //delete old relation
            addOps = Relation.remove(reference.entityId);
            ops.push(await addSpace(addOps, reference.spaceId));

            //NOTE IN THE NEW DATA MODEL, I COULD JUST REUSE THE OLD RELATION ENTITY ID
            addOps = await deleteEntity(reference.entityId);
            ops.push(...addOps);
        }

        addOps = await deleteEntity(duplicate);
        ops.push(...addOps);
    }

    if (ops.length > 0) {
        let outputText;
        // Convert operations to a readable JSON format
        outputText = JSON.stringify(ops, null, 2);
        // Write to a text file
        fs.writeFileSync(`ops.txt`, outputText);
    }
        
    //publish ops by iterating each spaceId
    if ((ops.length > 0) && (true)) {
        const iso = new Date().toISOString();
        let txHash;
        const spaces = await getSpaces(ops);

        for (const space of spaces) {
            if (['SgjATMbm41LX6naizMqBVd', 'BDuZwkjCg3nPWMDshoYtpS'].includes(space)) {
                txHash = await publish({
                    spaceId: space,
                    author: mainnetWalletAddress,
                    editName: `Remove duplicates for ${entity_to_keep} (Duplicates: ${duplicates}) on date ${iso}`,
                    ops: await filterOps(ops, space), // An edit accepts an array of Ops
                }, "MAINNET");
                
        
                console.log(`Your transaction hash for ${space} is:`, txHash);
                console.log(`Number of ops published in ${space}: `, (await filterOps(ops, space)).length)
            }
        }   
    } else {
        const spaces = await getSpaces(ops);
        console.log("Spaces", spaces);
        for (const space of spaces) {
            console.log(`Number of ops published in ${space}: `, (await filterOps(ops, space)).length)
            //console.log(await filterOps(ops, space))
        }
    }
}


//await main("GQZqDw1TDhBwwACcXoG9MA", ["3ov7JgvRtYCNZdmbaJfKzt", "CzeCersBZ9GQDHv2TLytMN", "HGwWyNvjNxFGnvmZ9qbSTp", "Jxxaxm4hcMRa41h1kp8iqh", "KGHHMFd4ikkZmJoFkHZabt", "KHZuBQdL6iow5SYrjZ4RJq", "LeVrEheTYJ9Jbva4xkQQfU", "TmSffgpTujixwwHhpeoGbd", "UyyvcZjNLBxKErf9ub9jDE"]);
//await main("B1ZVKBgS3bj1eZ3ywPqPtE", ["3SgmCnQ3YD8qpoN6KHjamm", "4sF18bZLnu3nG2ag2KmM4C", "8kpevUZcSHP6AWLtoHw5fe", "VZwEhiJ4k5UeC8PE7KXDbB"]);
//await main("CjFgPGUctVf9kjmjUL23v6", ["92uEKUAfwoo4s5oUoggMTp", "GY5HzngGecBjN7PutU46mg", "U7DB3EYTcqkQfpxbrbpuz7"]);
//await main("CqGETLn6eRAEUyTorHWAEs", ["7tiEajAuiKc53EuHNTs1f2", "EkmJjFLA16yGbx2wzUkoPA", "UVoUHVLhL4HcBMQ4LnitPP"]);
//await main("9KfMzsiv2AdvzEx9SjF7oi", ["QaBpguoWtTUdGTYDb5gyY3", "zZtFXB22UpArQmbw9q8MR"]);
//await main("F9L7CyTijiuAsaC7wqJczo", ["RYzv2n5psUmznQQjHDdW7m"]);
//await main("6CnFQkpnycQNAdAHxGHCBg", ["RFYvvERZUf8cChLHi9pBHT"]);
//await main("ENgVNWvjzenLfCskWWqjJ8", ["AbKwpC3iJRWR9GWyAyYwyu"]);
//await main("HjqUYu6J3eCvavyUtVutGQ", ["GNjZ2zXsj84qLDVVJxUrBA"]);
//await main("Yc8yEMYsf75UAf2ofLYbMJ", ["GzAkiioxah2FsyMkDteawM"]);
//await main("TepvZUKJz1kF5t8cBznF1T", ["7o9eveVDzSsuZrCWHRdLWL"]);
//await main("W5fwQ4afNgQ3sbVHWKMfb4", ["SQgWMCxjNX4xrsZbbYiZXM"]);
//await main("HYJ8hV1iJimaXuLZttjbMm", ["Tm6qfwdPxcHj4hBWABsX7z"]);
//await main("Bq3BKuLEFQqvCmrBH3skrV", ["BnL7PCVD1BthWUaGeUuraY"]);
//await main("HbwSksFv3Uv7VPH1BzQ1Ft", ["Dp3dKBCWLvqJw3mS6iM1TC"]);
//await main("5vikGM6aB2rymrR8DG9bQQ", ["KUu6B1vyDtkgScwAuz5pg2"]);
//await main("BCp28yWXKYoJgf2g6GrEXX", ["9YX9qYVCZBePbCnAo6g9bQ", "HodJTuzEUfMjtj7FVAMgqx", "VTwC1YdvZob8LLzx9dNMAt"]);

//await main("Rn6jxbuNv8MnUGGCyCNnwY", ["4Qjfd3fa2LeQdvQAuf4ftM", "8eYTz2jsfttopSecvCTJB3", "EFFxFYVcf2VaihX5n9yKA3", "HD9zxLGHbWopwULd4URhhf", "JUF3E7q9rwpJMUwrvoFPFZ", "RYWZmWSqEwVmyfFYWms3BT"]);

// Get edits approved before pushing this last one.
//await main("T4YW4Nx2zvjZM89o8eMnSd", ["JtLF1a4fP4Tx1B194PSg4T", "GZmPsiCq4WhXtYYHRyGPMS"]);
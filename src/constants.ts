import { config } from "./config.ts";

export const testnetWalletAddress = config.W_ADDRESS;
export const mainnetWalletAddress = config.SW_ADDRESS;

export const SPACE_IDS = {
  root: "2a98e6b4-3728-44a4-9b8e-02e15f0677c8",
  podcasts: "e252f9e1-d3ad-4460-8bf1-54f93b02f220",
}

export const propertyToIdMap: Record<string, string> = {
  "name": "a126ca53-0c8e-48d5-b888-82c734c38935",
  "description": "9b1f76ff-9711-404c-861e-59dc3fa7d037",
  "avatar": "1155beff-fad5-49b7-a2e0-da4777b8792c",
  "cover": "34f53507-2e6b-42c5-a844-43981a77cfa2",
  "types": "8f151ba4-de20-4e3c-9cb4-99ddf96f48f1",
  "web_url": "eed38e74-e679-46bf-8a42-ea3e4f8fb5fb",
  "x_url": "0d625978-4b3c-4b57-a86f-de45c997c73c",
  "date_founded": "41aa3d98-47b6-4a97-b7ec-427e575b910e",
  "sources": "49c5d5e1-679a-4dbd-bfd3-3f618f227c94",
  "source_db_identifier": "5e92c8a4-1714-4ee7-9a09-389ef4336aeb",
  "propertiesSourced": "198150d0-8f4e-410a-9329-9aab3ac3c1e3",
  "relationsSourced": "2596082f-f4d3-4a61-9b6a-831e253cb345",
  "format": "396f8c72-dfd0-4b57-91ea-09c1b9321b2f",
  "topics": "458fbc07-0dbf-4c92-8f57-16f3fdde7c32",
  "roles": "8fcfe5ef-3d91-47bd-8322-3830a998d26b",
  "renderable_type": "2316bbe1-c76f-4635-83f2-3e03b4f1fe46",
  "supporting_quotes": "f9eeaf9d-9eb7-41b1-ac5d-257c6e82e526",
  "text_blocks": "beaba5cb-a677-41a8-b353-77030613fc70",
  "data_blocks": "beaba5cb-a677-41a8-b353-77030613fc70",
  "tabs": "4d9cba1c-4766-4698-81cd-3273891a018b",
  "data_source_type": "1f69cc98-80d4-44ab-ad49-3df6a7b15ee4",
  "filter": "14a46854-bfd1-4b18-8215-2785c2dab9f3",
  "markdown_content": "e3e363d1-dd29-4ccb-8e6f-f3b76d99bc33",
  "relation_entity_types": "f394b9b4-420d-4ab4-bceb-81ded11df4d5",
  "listen_on": "1367bac7-dcea-4b80-86ad-a4a4cdd7c2cb",
  "hosts": "c72d9abb-bca8-4e86-b7e8-b71e91d2b37e",
  "guests": "cb60a1a6-6fb5-48c9-b936-200c5c271330",
  "contributors": "1ff59132-2d57-4671-934a-7b662e3cf66a",
  "episode_number": "9b5eced9-5c30-473b-8404-f474a777db3a",
  "air_date": "77999397-f78d-44a7-bbc5-d93a617af47c",
  "audio_url": "87f919d5-560b-408c-be8d-318e2c5c098b",
  "duration": "76996acc-d10f-4cd5-9ac9-4a705b8e03b4",
  "rss_feed_url": "a5776138-deb8-436f-8c98-3eccd100d98f",
  "explicit": "9da6760c-22ce-4c29-ab57-a67a27f340a1",
  "podcast": "f1873bbc-381f-4604-abad-76fed4f6d73f",
  "source_database_key": "9f1e43fd-63e3-4bde-97b9-b3d88c57031b",
  "attributed_to": "a10391b7-c278-490e-82d7-a5077c5c2510",
  "targets": "98e37001-9a58-4830-a7a9-67a3f41c6bb4",
  "start_offset": "a1d1cb55-7b18-4238-ba0e-c78ba7f289fb",
  "end_offset": "79a677b5-97f8-4ca8-a1cf-24eef7837b61",
  "notable_quotes": "8d4ae49c-226d-4086-8ec3-af5d5b2a65d0",
  "notable_claims": "e1371bcd-a704-4396-adb7-ea7ecc8fe3d4",
  "broader_topics": "3f0852c8-5f52-45a1-bd25-d7a737430c01",
  "subtopics": "4b5bbddf-32b2-47ba-b0a6-dbbab27f457d"
};

/*


source_db_key: "d1fa97b3-2ab4-4f18-bd5a-91868a63a392",
attributed_to: "4c537c03-24b2-44ce-ba44-ee9e0bf406bb",
notable_quotes: "dc637db0-3066-403c-a021-1d9eeea02d61",
notable_claims: "4b298933-92e8-4b91-ac40-73d0da7834f3",
targets: "b08235e4-725f-450b-899f-913b915ff58e",
start_offset: "d2ac07e6-ea44-49b8-b1bd-d2984ebdf5c6",
end_offset: "e449e3c7-c25b-4182-b4ce-d941b64b7b79",
broader_topics: "db8481b9-ecc5-4a54-8073-dae3b6f5a8f6",
subtopics: "a093cd2e-09fa-4c91-a1c0-d0bdcc68b439",
*/

export const typeToIdMap: Record<string, string> = {
  "person": "7ed45f2b-c48b-419e-8e46-64d5ff680b0d",
  "project": "484a18c5-030a-499c-b0f2-ef588ff16d50",
  "source": "706779bf-5377-44a6-8694-ea06cf87a3a2",
  "topic": "5ef5a586-0f27-4d8e-8f6c-59ae5b3e89e2",
  "role": "e4e366e9-d555-4b68-92bf-7358e824afd2",
  "claim": "96f859ef-a1ca-4b22-9372-c86ad58b694b",
  "quote": "043a171c-6918-4dc3-a7db-b8471ca6fcc2",
  "text_block": "76474f2f-0089-4e77-a041-0b39fb17d0bf",
  "data_block": "b8803a86-65de-412b-bb35-7e0c84adf473",
  "page": "480e3fc2-67f3-4993-85fb-acdf4ddeaa6b",
  "podcast": "4c81561d-1f95-4131-9cdd-dd20ab831ba2",
  "podcast_appearance": "791b9eef-81ed-4389-a9c0-e991f38783cc",
  "selector": "813ca865-db9b-4864-90de-c6764febaab3",
  "episode": "972d201a-d780-4568-9e01-543f67b26bee"
};

//podcast: "69732974-c632-490d-81a3-12ea567b2a8e",
//episode: "11feb0f9-fb3b-442c-818a-b5e97ffde26a",
//podcast_appearance: "53841c11-19c6-473d-a093-b60968149f60",
//selector: "75e2a120-d283-4d27-a3bb-6e8e748a30c2",

export const renderableTypeToIdMap: Record<string, string> = {
  url: "283127c9-6142-4684-92ed-90b0ebc7f29a",
};


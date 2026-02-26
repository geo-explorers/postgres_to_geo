


import { personalSpace, Ipfs, type Op, daoSpace, IdUtils } from "@geoprotocol/geo-sdk";
import { createPublicClient, http, type Chain } from 'viem';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';
import { privateKeyToAccount } from 'viem/accounts';

const PIMLICO_API_KEY = 'pim_KqHm63txxhbCYjdDaWaHqH';
const TESTNET_RPC_URL = 'https://rpc-geo-test-zc16z3tcvf.t.conduit.xyz';
const TESTNET_CHAIN_ID = 19411;

// Custom Safe contract addresses deployed on Geo testnet
const TESTNET_SAFE_ADDRESSES = {
  safeModuleSetupAddress: "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47" as const,
  safe4337ModuleAddress: "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226" as const,
  safeProxyFactoryAddress: "0xd9d2Ba03a7754250FDD71333F444636471CACBC4" as const,
  safeSingletonAddress: "0x639245e8476E03e789a244f279b5843b9633b2E7" as const,
  multiSendAddress: "0x7B21BBDBdE8D01Df591fdc2dc0bE9956Dde1e16C" as const,
  multiSendCallOnlyAddress: "0x32228dDEA8b9A2bd7f2d71A958fF241D79ca5eEC" as const,
};

// Define Geo testnet chain
const geoTestnet: Chain = {
  id: TESTNET_CHAIN_ID,
  name: 'Geo Testnet',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [TESTNET_RPC_URL] },
    public: { http: [TESTNET_RPC_URL] },
  },
};

// IMPORTANT: Be careful with your private key. Don't commit it to version control.
// You can get your private key using https://www.geobrowser.io/export-wallet
const privateKey = process.env.PK_SW as `0x${string}`;

async function createSmartAccountWalletClient() {
  const account = privateKeyToAccount(privateKey);
  console.log('EOA address:', account.address);

  const publicClient = createPublicClient({
    chain: geoTestnet,
    transport: http(TESTNET_RPC_URL),
  });

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [account],
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
    version: '1.4.1',
    ...TESTNET_SAFE_ADDRESSES,
  });

  console.log('Smart account address:', safeAccount.address);

  const bundlerUrl = `https://api.pimlico.io/v2/${TESTNET_CHAIN_ID}/rpc?apikey=${PIMLICO_API_KEY}`;
  const paymasterClient = createPimlicoClient({
    transport: http(bundlerUrl),
    chain: geoTestnet,
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  });

  return createSmartAccountClient({
    chain: geoTestnet,
    account: safeAccount,
    paymaster: paymasterClient,
    bundlerTransport: http(bundlerUrl),
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await paymasterClient.getUserOperationGasPrice()).fast;
      },
    },
  });
}

let smartAccountWalletClient: Awaited<ReturnType<typeof createSmartAccountWalletClient>> | null = null;

async function getSmartAccountClient() {
  if (!smartAccountWalletClient) {
    smartAccountWalletClient = await createSmartAccountWalletClient();
  }
  return smartAccountWalletClient;
}

type PublishOptions = {
	publishSpaceId: string;
	editName: string;
	author: `0x${string}`;
	ops: Op[];
  callerSpaceId?: string;
	daoSpaceAddress?: `0x${string}`;
	spaceType?: "PERSONAL" | "PUBLIC";
	
};

export async function publish(options: PublishOptions, network: "TESTNET") {
	console.log("Options: ", options)
	console.log("Network: ", network)
	const spaceType = options.spaceType ?? "PUBLIC";

	let to: `0x${string}`;
	let calldata: `0x${string}`;
	let cid: string;
	let editId: string | undefined;

	if (spaceType === "PERSONAL") {
		// Personal spaces: use personalSpace.publishEdit (handles IPFS + calldata)
		const result = await personalSpace.publishEdit({
			name: options.editName,
			spaceId: options.publishSpaceId,
			ops: options.ops,
			author: options.author,
			network: network,
		});
		cid = result.cid;
		editId = result.editId;
		to = result.to;
		calldata = result.calldata;
	} else {
		// Public/DAO spaces: use daoSpace.proposeEdit
		if (!options.daoSpaceAddress) {
			throw new Error("daoSpaceAddress is required for PUBLIC spaces");
		}
		if (!options.callerSpaceId) {
			throw new Error("callerSpaceId is required for PUBLIC spaces");
		}

		const result = await daoSpace.proposeEdit({
			name: options.editName,
			ops: options.ops,
			author: options.author,
			network: network,
			callerSpaceId: `0x${options.callerSpaceId}` as `0x${string}`,
      daoSpaceId: `0x${options.publishSpaceId}` as `0x${string}`,
			daoSpaceAddress: options.daoSpaceAddress,
		});
		console.log(result);
		cid = result.cid;
		editId = result.editId;
		to = result.to;
		calldata = result.calldata;
	}

	console.log("CID:", cid);
	console.log("Edit ID:", editId);
	console.log("Contract:", to);

	const client = await getSmartAccountClient();
	return await client.sendTransaction({
		to,
		data: calldata,
	});
}
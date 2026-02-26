import { SpaceManagement } from "@geo/curator-utils";
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createPublicClient, type Hex, http } from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

const SPACE_REGISTRY_ADDRESS = SpaceManagement.SPACE_REGISTRY_ADDRESS as Hex;
const RPC_URL = SpaceManagement.GEO_TESTNET_RPC_URL;
const chain = SpaceManagement.GEO_TESTNET;

const DAO_SPACE_ADDRESS = '0xC417DaC68989376Ba40F0113819cf1Dd85663c45' as Hex;

async function getCommonParams() {
  const privateKey = process.env.PK_SW as `0x${string}`;
  if (!privateKey) {
    throw new Error('PK_SW environment variable is required');
  }

  const account = privateKeyToAccount(privateKey);

  const safeAccount = await toSafeSmartAccount({
    client: createPublicClient({ transport: http(RPC_URL), chain }),
    owners: [account],
    entryPoint: { address: entryPoint07Address, version: '0.7' },
    version: '1.4.1',
    safeModuleSetupAddress: '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47',
    safe4337ModuleAddress: '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226',
    safeProxyFactoryAddress: '0xd9d2Ba03a7754250FDD71333F444636471CACBC4',
    safeSingletonAddress: '0x639245e8476E03e789a244f279b5843b9633b2E7',
    multiSendAddress: '0x7B21BBDBdE8D01Df591fdc2dc0bE9956Dde1e16C',
    multiSendCallOnlyAddress: '0x32228dDEA8b9A2bd7f2d71A958fF241D79ca5eEC',
  });

  const bundlerTransport = http(`https://api.pimlico.io/v2/${chain.id}/rpc?apikey=pim_KqHm63txxhbCYjdDaWaHqH`);
  const paymasterClient = createPimlicoClient({
    transport: bundlerTransport,
    chain,
    entryPoint: { address: entryPoint07Address, version: '0.7' },
  });

  const walletClient = createSmartAccountClient({
    chain,
    account: safeAccount,
    paymaster: paymasterClient,
    bundlerTransport,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await paymasterClient.getUserOperationGasPrice()).fast;
      },
    },
  });

  const publicClient = createPublicClient({
    transport: http(RPC_URL),
    chain,
  });

  return {
    publicClient,
    smartAccountWalletClient: walletClient,
    chain,
    spaceRegistryAddress: SPACE_REGISTRY_ADDRESS,
    spaceRegistryAbi: SpaceManagement.SpaceRegistryAbi,
    daoSpaceAddress: DAO_SPACE_ADDRESS,
  };
}

export async function voteYesOnProposal(proposalId: string) {
  const commonParams = await getCommonParams();

  const voteResult = await SpaceManagement.voteOnDAOSpaceProposal({
    ...commonParams,
    proposalId: `${proposalId}` as `0x${string}`,
    vote: 'YES',
  });

  console.log('  Vote submitted!');
  console.log('  txHash:', voteResult.txHash);
  return voteResult;
}

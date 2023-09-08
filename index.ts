import { ethers } from 'ethers';

import SafeApiKit from '@safe-global/api-kit';
import Safe, {
  EthersAdapter,
  SafeFactory,
  SafeAccountConfig,
} from '@safe-global/protocol-kit';
import {
  EthAdapter,
  SafeMultisigTransactionResponse,
  SafeTransactionDataPartial,
} from '@safe-global/safe-core-sdk-types';

import TimeHelper from './utils/TimeHelper';

import 'dotenv/config';

const RPC_URL = 'https://eth-goerli.public.blastapi.io';
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

/**
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#initialize-signers-providers-and-ethadapter Initialize Signers, Providers, and EthAdapter}
 */
const initSignerAndAdapter = (): {
  ethAdapter: EthAdapter;
  signers: ethers.Wallet[];
} => {
  // Initialize signers.
  const owner1Signer = new ethers.Wallet(
    process.env.OWNER_1_PRIVATE_KEY!,
    provider,
  );
  const owner2Signer = new ethers.Wallet(
    process.env.OWNER_2_PRIVATE_KEY!,
    provider,
  );
  const owner3Signer = new ethers.Wallet(
    process.env.OWNER_3_PRIVATE_KEY!,
    provider,
  );

  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: owner1Signer,
  });

  return {
    ethAdapter: ethAdapter,
    signers: [owner1Signer, owner2Signer, owner3Signer],
  };
};

/**
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#initialize-the-api-kit Initialize the API Kit}
 */
const initApiKit = (etherAdapter: EthAdapter) => {
  const txServiceUrl = 'https://safe-transaction-goerli.safe.global';

  return new SafeApiKit({
    txServiceUrl,
    ethAdapter: etherAdapter,
  });
};

/**
 * Connect to Safe via smart account address in .env file
 */
const connectToSafe = async (
  etherAdapter: EthAdapter,
): Promise<{ safeSdk: Safe; safeAddress: string }> => {
  const safeSdk = await Safe.create({
    ethAdapter: etherAdapter,
    safeAddress: process.env.SMART_ACCOUNT_ADDRESS!,
  });
  const safeAddress = await safeSdk.getAddress();

  return { safeSdk, safeAddress };
};

/**
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#initialize-the-protocol-kit Initialize the Protocol Kit}
 *
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#deploy-a-safe Deploy a Safe}
 */
const deployNewSafe = async (
  etherAdapter: EthAdapter,
  signers: ethers.Wallet[],
): Promise<{ safeSdk: Safe; safeAddress: string }> => {
  const safeFactory = await SafeFactory.create({
    ethAdapter: etherAdapter,
  });

  const owners = await Promise.all(
    signers.map(async (wallet) => await wallet.getAddress()),
  );
  const safeAccountConfig: SafeAccountConfig = {
    owners: owners,
    threshold: owners.length > 1 ? owners.length - 1 : 1,
  };

  const safeSdk = await safeFactory.deploySafe({ safeAccountConfig });
  const safeAddress = await safeSdk.getAddress();

  console.log('Your Safe has been deployed:');
  console.log(`https://goerli.etherscan.io/address/${safeAddress}`);
  console.log(`https://app.safe.global/gor:${safeAddress}`);

  return { safeSdk, safeAddress };
};

/**
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#send-eth-to-the-safe Send ETH to the Safe}
 */
const sendEthToSmartAccount = async (
  amount: number,
  safeAddress: string,
  walletOwner: ethers.Wallet,
) => {
  const retryAmount = 120;
  const safeAmount = ethers.utils
    .parseUnits(amount.toString(), 'ether')
    .toHexString();

  const transactionParameters = {
    to: safeAddress,
    value: safeAmount,
  };

  const tx = await walletOwner.sendTransaction(transactionParameters);

  console.log('Fundraising.');
  console.log(`Deposit Transaction: https://goerli.etherscan.io/tx/${tx.hash}`);

  // Wait for the transaction to confirm.
  console.log('Wait for the transaction to confirm...');
  for (let retry = 0; retry < retryAmount; retry += 1) {
    if (await provider.getTransactionReceipt(tx.hash)) {
      console.log('Transaction confirmed.');
      break;
    }
    await TimeHelper.timer(500);
  }

  return;
};

/**
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#making-a-transaction-from-a-safe Making a transaction from a Safe}
 *
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#overview Overview}
 *
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#create-a-transaction Create a transaction}
 *
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#propose-the-transaction Propose a transaction}
 */
const proposeTransaction = async (
  transferAmount: number,
  destination: string,
  signerOne: ethers.Wallet,
  safeSdk: Safe,
  safeAddress: string,
  safeService: SafeApiKit,
) => {
  const amount = ethers.utils
    .parseUnits(transferAmount.toString(), 'ether')
    .toString();
  const safeTransactionData: SafeTransactionDataPartial = {
    to: destination,
    data: '0x',
    value: amount,
  };

  // Create a Safe transaction with the provided parameters.
  const safeTransaction = await safeSdk.createTransaction({
    safeTransactionData,
  });

  // Deterministic hash based on transaction parameters.
  const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);

  // Sign transaction to verify that the transaction is coming from owner 1.
  const senderSignature = await safeSdk.signTransactionHash(safeTxHash);

  await safeService.proposeTransaction({
    safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress: await signerOne.getAddress(),
    senderSignature: senderSignature.data,
  });

  console.log(
    `Singer 1 proposed a new transaction to send ${transferAmount} eth to ${destination}.`,
  );
};

/**
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#get-pending-transactions Get pending transactions}
 *
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#confirm-the-transaction-second-confirmation Confirm the transaction: second confirmation}
 */
const confirmTransaction = async (
  safeService: SafeApiKit,
  safeAddress: string,
  signerTwo: ethers.Wallet,
): Promise<string> => {
  const retryAmount = 120;
  let pendingTransactions: SafeMultisigTransactionResponse[] = [];

  for (let retry = 0; retry < retryAmount; retry += 1) {
    pendingTransactions = (
      await safeService.getPendingTransactions(safeAddress)
    ).results;
    if (pendingTransactions.length > 0) break;
    await TimeHelper.timer(500);
  }

  if (pendingTransactions.length > 0) {
    // Assumes that the first pending transaction is the transaction you want to confirm.
    const transaction = pendingTransactions[0];
    const safeTxHash = transaction.safeTxHash;

    const ethAdapterOwner2 = new EthersAdapter({
      ethers,
      signerOrProvider: signerTwo,
    });

    const safeSdkOwner2 = await Safe.create({
      ethAdapter: ethAdapterOwner2,
      safeAddress,
    });

    const signature = await safeSdkOwner2.signTransactionHash(safeTxHash);
    const response = await safeService.confirmTransaction(
      safeTxHash,
      signature.data,
    );

    console.log(
      `Singer 2 confirmed the proposed transaction with signature: ${response.signature}.`,
    );
    return safeTxHash;
  }

  console.log('No pending transactions.');
  return '';
};

/**
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#execute-the-transaction Execute the transaction}
 *
 * Section: {@link https://docs.safe.global/safe-core-aa-sdk/protocol-kit#confirm-that-the-transaction-was-executed Confirm that the transaction was executed}
 */
const executeTransaction = async (
  safeService: SafeApiKit,
  safeSdk: Safe,
  safeTxHash: string,
) => {
  const safeTransaction = await safeService.getTransaction(safeTxHash);
  const executeTxResponse = await safeSdk.executeTransaction(safeTransaction);
  const receipt = await executeTxResponse.transactionResponse?.wait();

  console.log('Transaction executed by signer 1:');
  console.log(`https://goerli.etherscan.io/tx/${receipt!.transactionHash}`);

  const afterBalance = await safeSdk.getBalance();

  console.log(
    `The final balance of the Safe: ${ethers.utils.formatUnits(
      afterBalance,
      'ether',
    )} ETH`,
  );
};

const main = async () => {
  const { ethAdapter, signers } = initSignerAndAdapter();
  const safeService = initApiKit(ethAdapter);

  /*
    If smart account address id is provided in .env file: create Safe via provided address.
    else: deploy a new Safe.
   */
  const { safeSdk, safeAddress } = process.env.SMART_ACCOUNT_ADDRESS
    ? await connectToSafe(ethAdapter)
    : await deployNewSafe(ethAdapter, signers);

  const owners = await safeSdk.getOwners();

  console.log('Safe connected! Safe owners:');
  console.log(owners);

  // Uncomment line below if you need to send eth to the smart account (from the first signer).
  // await sendEthToSmartAccount(0.01, safeAddress, signers[0]);

  // Propose a transaction to send 0.05 eth to the first signer.
  await proposeTransaction(
    0.005,
    owners[0],
    signers[0],
    safeSdk,
    safeAddress,
    safeService,
  );

  // Confirm proposed transaction from the second signer.
  const result = await confirmTransaction(safeService, safeAddress, signers[1]);

  // Execute the proposed transaction
  if (result !== '') {
    await executeTransaction(safeService, safeSdk, result);
  }

  return;
};

main();

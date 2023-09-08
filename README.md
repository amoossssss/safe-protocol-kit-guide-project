# Safe Protocol Kit Guide Project

A complete guide project for the tutorial and code snippets in [Protocol Kit](https://docs.safe.global/safe-core-aa-sdk/protocol-kit).

## <a name="installation">Installation</a>

Install the package with yarn:

```bash
yarn install
```

## <a name="getting-started">Getting Started</a>

The following steps show how to set up the Protocol Kit Guide Project.

### 1. Create a .env file

First of all, we need to create a .env file in the root of the project, which contains private keys of three wallets and the smart account's address if existed.

Template of the .env file:

```dotenv
OWNER_1_PRIVATE_KEY=<PRIVATE_KEY>
OWNER_2_PRIVATE_KEY=<PRIVATE_KEY>
OWNER_3_PRIVATE_KEY=<PRIVATE_KEY>

# Add this environment variable if you already have a smart account on Goerli
SMART_ACCOUNT_ADDRESS=<SMART_ACCOUNT_ADDRESS>
```

### 2. (Optional) Send eth to the smart account

The guide project will propose a transaction to send eth from the smart account to the first signer.
Uncomment the line like the code snippet below, if you need to send eth to the smart account.

**Prerequisite: You need to have eth in the first signer's account to complete the transfer.**

```js
// Uncomment line below if you need to send eth to the smart account (from the first signer).
await sendEthToSmartAccount(0.01, safeAddress, signers[0]);
```

### 3. Start the program

Start the project with yarn;

```bash
yarn start
```

Successful execution console:
```bash
yarn run v1.22.19
$ ts-node index.ts
Safe connected! Safe owners:
[
  '0x...',
  '0x...',
  '0x...',
]
Singer 1 proposed a new transaction to send 0.005 eth to 0x...
Singer 2 confirmed the proposed transaction with signature: 0x...
Transaction executed by signer 1:
https://goerli.etherscan.io/tx/0x...
The final balance of the Safe: 0.0 ETH
✨  Done in 41.51s.
```
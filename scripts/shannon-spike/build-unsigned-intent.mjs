import {
  binaryPoolWriteAbi,
  erc20WriteAbi,
  ORDER_TYPE,
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
} from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';
import { decodeFunctionData } from 'viem';

import {
  encodeExactApproval,
  exactBuyAllowance,
  verifyBuyIocCalldata,
  ZERO_ADDRESS,
} from './proof-kernel.mjs';

// Historical, public Shannon binding used only to prove SDK 0.29.0 calldata
// construction. Its expired timestamp makes this artifact impossible to submit.
const fixture = {
  account: '0x0000000000000000000000000000000000000001',
  marketId: '0x0000000000000000000000000000000000000000000000000000000000013416',
  pool: '0x267FAf943806FfC2d3b4fE7130b559440Ca4BB57',
  collateral: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E',
  outcomeToken: '0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9',
  yesId: 1037924863396533741797574475610660037213747207591076529056845867783680n,
  noId: 1037924863396533741797574475610660037213747207591076529056845867783681n,
  nonce: 22n,
  side: 'BUY_YES',
  yesPrice: 20_000n,
  quantity: 1_000_000n,
  oneCollateral: 1_000_000n,
  expireTimestampNs: 1_788_537_600_000_000_000n,
  userData: 0n,
};

// The SDK requires a wallet-shaped identity even for build-only calls. This
// object deliberately has no signing capability and throws if a send is tried.
const inertWallet = {
  account: { address: fixture.account },
  writeContract() {
    throw new Error('Shannon spike safety stop: signing and sending are disabled');
  },
};

const exchange = new SomniaMarkets({
  indexerUrl: 'https://dev.smk.somnia.host/v1/graphql',
  chain: somniaShannon,
  addresses: SOMNIA_TESTNET_ADDRESSES,
  walletClient: inertWallet,
});

try {
  const exactAllowance = exactBuyAllowance(fixture);
  const approval = encodeExactApproval({
    collateral: fixture.collateral,
    pool: fixture.pool,
    amount: exactAllowance,
  });
  const built = await exchange.trader.buildPlaceOrder({
    pool: fixture.pool,
    side: fixture.side,
    price: fixture.yesPrice,
    quantity: fixture.quantity,
    outcomeToken: fixture.outcomeToken,
    yesId: fixture.yesId,
    noId: fixture.noId,
    collateral: fixture.collateral,
    expireTimestampNs: fixture.expireTimestampNs,
    orderType: ORDER_TYPE.MARKET,
    selfMatchingOption: 0,
    autoApprove: false,
    builder: ZERO_ADDRESS,
    builderFeeBpsTimes1k: 0n,
    userData: fixture.userData,
  });
  if (built.approval !== undefined) throw new Error('SDK returned an approval despite autoApprove:false');
  verifyBuyIocCalldata(built.order.data, fixture);

  const output = {
    schema: 'market-dungeon-shannon-unsigned-intent/v1',
    safety: 'NO SIGNER; HISTORICAL EXPIRY; NOT SUBMITTED',
    sdk: '@somnia-chain/markets-sdk@0.29.0',
    marketId: fixture.marketId,
    side: fixture.side,
    exactAllowance,
    approval: {
      ...approval,
      decoded: decodeFunctionData({
        abi: erc20WriteAbi,
        data: approval.data,
      }),
    },
    order: {
      ...built.order,
      decoded: decodeFunctionData({ abi: binaryPoolWriteAbi, data: built.order.data }),
    },
    checks: {
      buyOnly: true,
      immediateOrCancel: true,
      autoApproveFalse: built.approval === undefined,
      exactAllowanceIsNotUnlimited: exactAllowance === 20_000n,
      builderAndFeeAreZero: true,
    },
  };
  console.log(JSON.stringify(output, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
} finally {
  await exchange.close();
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { createKevinWalletConnector, getConnectedKevinWallet, KEVIN_WALLET_CHAIN_ID,
  type KevinWalletProvider } from '../lib/somnia-agents/metamask-connect.ts';

const ACCOUNT = `0x${'ab'.repeat(20)}`;

test('import and existing-provider reads do not initialize a wallet connection', () => {
  assert.equal(getConnectedKevinWallet(), undefined);
  let loads = 0; let prompts = 0;
  const connector = createKevinWalletConnector({
    injected: () => undefined,
    preloadClient: async () => { throw new Error('Must not preload'); },
    loadClient: async () => { loads++; return { connect: async () => { prompts++; return { accounts: [ACCOUNT] }; }, getProvider: () => ({ request: async () => [] }) }; },
  });
  assert.equal(connector.connectedProvider(), undefined);
  connector.clear();
  assert.deepEqual({ loads, prompts }, { loads: 0, prompts: 0 });
});

test('injected wallets connect from the click stack without importing a mobile SDK or signing', async () => {
  const methods: string[] = [];
  const provider: KevinWalletProvider = { request: async ({ method }) => { methods.push(method); return [ACCOUNT]; } };
  const connector = createKevinWalletConnector({ injected: () => provider, preloadClient: async () => { throw new Error('SDK must stay unloaded'); }, loadClient: async () => { throw new Error('SDK must stay unloaded'); } });
  await connector.prewarm();
  assert.deepEqual(methods, []);
  const promise = connector.connect();
  assert.deepEqual(methods, ['eth_requestAccounts']);
  const connected = await promise;
  assert.equal(connected.provider, provider);
  assert.equal(connected.account, ACCOUNT);
  assert.equal(connector.connectedProvider(), provider);
});

test('explicit prewarm imports only; SDK initialization and Shannon permission wait for Connect', async () => {
  let loads = 0; let connects = 0; let preloads = 0;
  const requestedChains: string[][] = [];
  const provider: KevinWalletProvider = { request: async () => { throw new Error('Connection must not sign or send'); } };
  const connector = createKevinWalletConnector({
    injected: () => undefined,
    preloadClient: async () => { preloads++; },
    loadClient: async () => {
      loads++;
      return {
        connect: async ({ chainIds }) => { connects++; requestedChains.push(chainIds); return { accounts: [ACCOUNT] }; },
        getProvider: () => provider,
      };
    },
  });
  await Promise.all([connector.prewarm(), connector.prewarm()]);
  assert.deepEqual({ loads, connects, preloads }, { loads: 0, connects: 0, preloads: 1 });
  assert.equal(connector.connectedProvider(), undefined);
  const pending = connector.connect();
  const connected = await pending;
  assert.deepEqual({ loads, connects, preloads }, { loads: 1, connects: 1, preloads: 1 });
  assert.deepEqual(requestedChains, [[KEVIN_WALLET_CHAIN_ID]]);
  assert.equal(connected.provider, provider);
  assert.equal(connected.account, ACCOUNT);
});

test('double taps share one pending connection and rejected requests can be retried explicitly', async () => {
  let calls = 0;
  let rejectRequest: (error: Error) => void = () => {};
  const provider: KevinWalletProvider = { request: () => {
    calls++;
    return calls === 1 ? new Promise((_resolve, reject) => { rejectRequest = reject; }) : Promise.resolve([ACCOUNT]);
  } };
  const connector = createKevinWalletConnector({ injected: () => provider, preloadClient: async () => {}, loadClient: async () => { throw new Error('Must not load'); } });
  const first = connector.connect(); const second = connector.connect();
  assert.equal(first, second);
  assert.equal(calls, 1);
  rejectRequest(Object.assign(new Error('Rejected by user'), { code: 4001 }));
  await assert.rejects(first, (error) => error instanceof Error && 'code' in error && error.code === 4001);
  assert.equal(connector.connectedProvider(), undefined);
  assert.equal((await connector.connect()).account, ACCOUNT);
  assert.equal(calls, 2);
});

test('failed code preload can be retried without initializing SDK or requesting accounts', async () => {
  let loads = 0; let calls = 0;
  const connector = createKevinWalletConnector({
    injected: () => undefined,
    preloadClient: async () => {
      loads++;
      if (loads === 1) throw new Error('Chunk unavailable');
    },
    loadClient: async () => {
      return { connect: async () => { calls++; return { accounts: [ACCOUNT] }; }, getProvider: () => ({ request: async () => [] }) };
    },
  });
  await assert.rejects(connector.prewarm(), /Chunk unavailable/);
  await connector.prewarm();
  assert.deepEqual({ loads, calls }, { loads: 2, calls: 0 });
  await connector.connect();
  assert.equal(calls, 1);
});

test('malformed account results cannot expose a connected provider', async () => {
  for (const account of ['', '0x1234', 'not-a-wallet', undefined]) {
    const connector = createKevinWalletConnector({
      injected: () => ({ request: async () => [account] }),
      preloadClient: async () => {},
      loadClient: async () => { throw new Error('Must not load'); },
    });
    await assert.rejects(connector.connect(), /No wallet account/);
    assert.equal(connector.connectedProvider(), undefined);
  }
});

test('clearing the game connection prevents an old wallet approval from reactivating it', async () => {
  let finish: (value: unknown) => void = () => {};
  const provider: KevinWalletProvider = { request: () => new Promise((resolve) => { finish = resolve; }) };
  const connector = createKevinWalletConnector({ injected: () => provider, preloadClient: async () => {}, loadClient: async () => { throw new Error('Must not load'); } });
  const pending = connector.connect();
  connector.clear();
  finish([ACCOUNT]);
  await assert.rejects(pending, /cancelled/);
  assert.equal(connector.connectedProvider(), undefined);
});

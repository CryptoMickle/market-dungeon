import assert from 'node:assert/strict';
import test from 'node:test';
import { sendKevinRequest, validateKevinTransaction } from '../lib/somnia-agents/wallet.ts';
import { compareRival, type RivalTransaction } from '../lib/somnia-agents/types.ts';

const tx: RivalTransaction = {
  chainId: 50312, to: '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776', data: '0x12345678',
  value: '0x354a6ba7a180000', depositStt: '0.24', agentId: '12847293847561029384', payload: '0x1234',
};
const account = `0x${'ab'.repeat(20)}`;
const hash = `0x${'cd'.repeat(32)}`;
const deadline = () => Math.floor(Date.now() / 1000) + 60;

test('rival result distinguishes wins, identical wrong calls, and void without combat state', () => {
  assert.equal(compareRival('UP', 'DOWN', 'UP'), 'player');
  assert.equal(compareRival('DOWN', 'UP', 'UP'), 'kevin');
  assert.equal(compareRival('UP', 'UP', 'DOWN'), 'tie');
  assert.equal(compareRival('UP', 'DOWN', 'VOID'), 'void');
});

test('wallet boundary rejects mainnet, an unrelated recipient and excessive or malformed deposits', () => {
  validateKevinTransaction(tx);
  for (const fields of [{ chainId: 5031 }, { to: account }, { value: '0x0' }, { value: 'wat' }, { value: '0x1bc16d674ec80000' }]) {
    assert.throws(() => validateKevinTransaction({ ...tx, ...fields }));
  }
});

test('a real wallet submission is pinned to Shannon and sent only once after explicit approval', async () => {
  const calls: { method: string; params?: unknown[] }[] = [];
  const provider = { request: async (input: { method: string; params?: unknown[] }) => {
    calls.push(input);
    if (input.method === 'eth_requestAccounts') return [account];
    if (input.method === 'eth_chainId') return '0xc488';
    if (input.method === 'eth_sendTransaction') return hash;
    throw new Error('Unexpected wallet action');
  } };
  assert.equal(await sendKevinRequest(tx, deadline(), provider), hash);
  assert.deepEqual(calls.filter((call) => call.method === 'eth_sendTransaction'), [{ method: 'eth_sendTransaction', params: [{
    from: account, to: tx.to, data: tx.data, value: tx.value, chainId: '0xc488',
  }] }]);
});

test('failed network switching cannot fall through to a mainnet send', async () => {
  let sent = false;
  const provider = { request: async ({ method }: { method: string }) => {
    if (method === 'eth_requestAccounts') return [account];
    if (method === 'eth_chainId') return '0x13a7';
    if (method === 'eth_sendTransaction') sent = true;
    return null;
  } };
  await assert.rejects(sendKevinRequest(tx, deadline(), provider), /not on Shannon/);
  assert.equal(sent, false);
});

test('expired signing window makes no wallet calls', async () => {
  let calls = 0;
  await assert.rejects(sendKevinRequest(tx, Math.floor(Date.now() / 1000) - 1, { request: async () => { calls++; return null; } }), /cutoff/);
  assert.equal(calls, 0);
});

test('declining a request is not retried or silently replaced', async () => {
  let sends = 0;
  const provider = { request: async ({ method }: { method: string }) => {
    if (method === 'eth_requestAccounts') return [account];
    if (method === 'eth_chainId') return '0xc488';
    if (method === 'eth_sendTransaction') { sends++; throw new Error('User rejected the request'); }
    return null;
  } };
  await assert.rejects(sendKevinRequest(tx, deadline(), provider), /rejected/);
  assert.equal(sends, 1);
});

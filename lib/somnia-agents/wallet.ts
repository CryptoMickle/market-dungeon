import type { RivalTransaction } from './types.ts';

type InjectedWallet = { request: (input: { method: string; params?: unknown[] }) => Promise<unknown> };
const CHAIN_ID = '0xc488'; // Shannon testnet, 50312. Never mainnet.
const PLATFORM = '0x037bb9c718f3f7fe5ecbdb0b600d607b52706776';

export function validateKevinTransaction(transaction: RivalTransaction): void {
  if (transaction.chainId !== 50312 || transaction.to.toLowerCase() !== PLATFORM
    || !/^0x[0-9a-f]+$/i.test(transaction.data) || !/^0x[0-9a-f]+$/i.test(transaction.value)
    || BigInt(transaction.value) <= 0n || BigInt(transaction.value) > 1_000_000_000_000_000_000n) {
    throw new Error('Unexpected agent transaction. Kevin sits out; no request was sent.');
  }
}

// Called exclusively from an explicit Somnia-mode omen lock. Polling, restores and
// simulation never invoke this function. The wallet always asks the user to sign.
export async function sendKevinRequest(transaction: RivalTransaction, cutoff: number, provider?: InjectedWallet): Promise<string> {
  validateKevinTransaction(transaction);
  const wallet = provider ?? (typeof window !== 'undefined' ? (window as unknown as { ethereum?: InjectedWallet }).ethereum : undefined);
  if (!wallet) throw new Error('A browser wallet is needed for a real Somnia request. On iPhone, open this preview in your wallet’s built-in browser, or choose simulated Kevin in Safari for your next omen. Kevin sits out this round; your expedition continues.');
  const checkDeadline = () => {
    if (Math.floor(Date.now() / 1_000) >= cutoff) throw new Error('The rival cutoff passed. Kevin sits out; your expedition continues.');
  };
  checkDeadline();
  const accounts = await wallet.request({ method: 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !/^0x[0-9a-f]{40}$/i.test(accounts[0])) throw new Error('No wallet account selected. Kevin sits out this round.');
  if (String(await wallet.request({ method: 'eth_chainId' })).toLowerCase() !== CHAIN_ID) {
    try {
      await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
    } catch (error) {
      if ((error as { code?: number })?.code !== 4902) throw error;
      await wallet.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: CHAIN_ID, chainName: 'Somnia Shannon Testnet', nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
        rpcUrls: ['https://api.infra.testnet.somnia.network'], blockExplorerUrls: ['https://shannon-explorer.somnia.network'],
      }] });
      await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
    }
  }
  if (String(await wallet.request({ method: 'eth_chainId' })).toLowerCase() !== CHAIN_ID) throw new Error('Wallet is not on Shannon testnet. No agent transaction was requested.');
  checkDeadline();
  const txHash = await wallet.request({ method: 'eth_sendTransaction', params: [{
    from: accounts[0], to: transaction.to, data: transaction.data, value: transaction.value, chainId: CHAIN_ID,
  }] });
  if (typeof txHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(txHash)) throw new Error('Wallet did not return a transaction hash. Do not send again blindly; check your wallet activity.');
  return txHash;
}

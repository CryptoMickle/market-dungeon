import type { RivalTransaction } from './types.ts';
import { getConnectedKevinWallet, type KevinWalletProvider } from './metamask-connect.ts';

const CHAIN_ID = '0xc488'; // Shannon testnet, 50312. Never mainnet.
const PLATFORM = '0x037bb9c718f3f7fe5ecbdb0b600d607b52706776';

export function validateKevinTransaction(transaction: RivalTransaction): void {
  if (transaction.chainId !== 50312 || transaction.to.toLowerCase() !== PLATFORM
    || !/^0x[0-9a-f]+$/i.test(transaction.data) || !/^0x[0-9a-f]+$/i.test(transaction.value)
    || BigInt(transaction.value) <= 0n || BigInt(transaction.value) > 1_000_000_000_000_000_000n) {
    throw new Error('Unexpected agent transaction. Kevin sits out; no request was sent.');
  }
}

// Connection preflight and submission both verify the exact testnet.
export async function ensureKevinWalletNetwork(wallet: KevinWalletProvider): Promise<void> {
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
}

// Only an explicit Somnia-mode omen lock invokes a transaction. Restores never do.
export async function sendKevinRequest(transaction: RivalTransaction, cutoff: number, provider?: KevinWalletProvider, expectedAccount?: string): Promise<string> {
  validateKevinTransaction(transaction);
  const wallet = provider ?? getConnectedKevinWallet();
  if (!wallet) throw new Error('Connect MetaMask before locking your next omen. Kevin sits out this round; your expedition continues.');
  const checkDeadline = () => {
    if (Math.floor(Date.now() / 1_000) >= cutoff) throw new Error('The rival cutoff passed. Kevin sits out; your expedition continues.');
  };
  checkDeadline();
  await ensureKevinWalletNetwork(wallet);
  // A preconnected account is read without opening another connection prompt.
  // The optional permission path is retained for independently supplied providers.
  const accounts = await wallet.request({ method: expectedAccount ? 'eth_accounts' : 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !/^0x[0-9a-f]{40}$/i.test(accounts[0])) throw new Error('No wallet account selected. Kevin sits out this round.');
  if (expectedAccount && accounts[0].toLowerCase() !== expectedAccount.toLowerCase()) throw new Error('The connected wallet account changed. No agent transaction was requested. Connect again before your next omen.');
  if (String(await wallet.request({ method: 'eth_chainId' })).toLowerCase() !== CHAIN_ID) throw new Error('Wallet left Shannon testnet. No agent transaction was requested.');
  checkDeadline();
  const txHash = await wallet.request({ method: 'eth_sendTransaction', params: [{
    from: accounts[0], to: transaction.to, data: transaction.data, value: transaction.value, chainId: CHAIN_ID,
  }] });
  if (typeof txHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(txHash)) throw new Error('Wallet did not return a transaction hash. Do not send again blindly; check your wallet activity.');
  return txHash;
}

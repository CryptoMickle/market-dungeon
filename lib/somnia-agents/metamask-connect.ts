/** Minimal EIP-1193 surface shared by injected wallets and MetaMask Connect. */
export type KevinWalletProvider = {
  request: (input: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (...args: unknown[]) => void) => unknown;
};
export type KevinWalletConnection = { provider: KevinWalletProvider; account: string };

export const KEVIN_WALLET_CHAIN_ID = '0xc488' as const; // Shannon testnet, 50312.
const ADDRESS = /^0x[\da-f]{40}$/i;

type KevinEvmClient = {
  connect: (options: { chainIds: `0x${string}`[] }) => Promise<{ accounts: readonly string[] }>;
  getProvider: () => KevinWalletProvider;
};

type ConnectorDependencies = {
  injected: () => KevinWalletProvider | undefined;
  preloadClient: () => Promise<void>;
  loadClient: () => Promise<KevinEvmClient>;
};

/**
 * Connection is deliberately independent from a timed omen. Call prewarm ONLY after
 * the user selects real Kevin, then connect from a separate, explicit button click.
 * Merely importing this module, restoring a round or reading connectedProvider never
 * imports the SDK, contacts a relay, opens a wallet or requests wallet permissions.
 */
export function createKevinWalletConnector(dependencies: ConnectorDependencies) {
  let client: KevinEvmClient | undefined;
  let loading: Promise<KevinEvmClient> | undefined;
  let preloading: Promise<void> | undefined;
  let connection: KevinWalletConnection | undefined;
  let connecting: Promise<KevinWalletConnection> | undefined;
  let generation = 0;

  function load(): Promise<KevinEvmClient> {
    if (client) return Promise.resolve(client);
    if (!loading) {
      loading = dependencies.loadClient().then((loaded) => { client = loaded; return loaded; })
        .catch((error) => { loading = undefined; throw error; });
    }
    return loading;
  }

  function connect(): Promise<KevinWalletConnection> {
    if (connecting) return connecting;
    const startingGeneration = generation;
    const injected = dependencies.injected();
    let operation: Promise<KevinWalletConnection>;
    if (injected) {
      // Request account access synchronously from the button's call stack. No SDK is
      // needed in a wallet browser or when the desktop wallet is already injected.
      operation = injected.request({ method: 'eth_requestAccounts' }).then((accounts) => {
        const account = Array.isArray(accounts) ? accounts[0] : undefined;
        if (typeof account !== 'string' || !ADDRESS.test(account)) throw new Error('No wallet account was connected. Try Connect MetaMask again.');
        return { provider: injected, account };
      });
    } else {
      const connectClient = (loaded: KevinEvmClient) => loaded.connect({ chainIds: [KEVIN_WALLET_CHAIN_ID] }).then(({ accounts }) => {
        const account = Array.isArray(accounts) ? accounts[0] : undefined;
        if (typeof account !== 'string' || !ADDRESS.test(account)) throw new Error('MetaMask did not share an account. Try Connect MetaMask again.');
        return { provider: loaded.getProvider(), account };
      });
      // Once initialized by a previous explicit connection, use the client directly.
      // prewarm only imports code: SDK initialization itself can resume an old pending
      // permission request, so it must also remain behind this explicit Connect tap.
      operation = client ? connectClient(client) : load().then(connectClient);
    }
    connecting = operation.then((connected) => {
      if (generation !== startingGeneration) throw new Error('Wallet connection was cancelled. Connect again when you are ready.');
      connection = connected;
      return connected;
    }).finally(() => { connecting = undefined; });
    return connecting;
  }

  return {
    async prewarm(): Promise<void> {
      if (dependencies.injected()) return;
      if (!preloading) preloading = dependencies.preloadClient().catch((error) => { preloading = undefined; throw error; });
      await preloading;
    },
    connect,
    connectedProvider: () => connection?.provider,
    // This only clears the game's reference. Wallet permissions are managed by the
    // wallet, and are not revoked automatically when the user changes game modes.
    clear() { generation++; connection = undefined; },
  };
}

let metamaskModule: Promise<typeof import('@metamask/connect-evm')> | undefined;
function importMetaMask() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Open Market Dungeon in your browser to connect MetaMask.'));
  if (!metamaskModule) metamaskModule = import('@metamask/connect-evm').catch((error) => { metamaskModule = undefined; throw error; });
  return metamaskModule;
}

let openWalletLink: string | undefined;
const linkListeners = new Set<() => void>();
function setOpenWalletLink(link: string | undefined) {
  openWalletLink = link;
  for (const listener of linkListeners) listener();
}

/** The SDK-generated connection/request URI is also exposed as an explicit tap target
 * when Safari declines to open an app after asynchronous wallet initialization. */
export function getKevinWalletOpenLink(): string | undefined { return openWalletLink; }
export function subscribeKevinWalletOpenLink(listener: () => void): () => void {
  linkListeners.add(listener);
  return () => { linkListeners.delete(listener); };
}
export function clearKevinWalletOpenLink(): void { setOpenWalletLink(undefined); }

const connector = createKevinWalletConnector({
  injected: () => typeof window === 'undefined' ? undefined
    : (window as unknown as { ethereum?: KevinWalletProvider }).ethereum,
  preloadClient: async () => { await importMetaMask(); },
  loadClient: async () => {
    if (typeof window === 'undefined') throw new Error('Open Market Dungeon in your browser to connect MetaMask.');
    const { createEVMClient } = await importMetaMask();
    return createEVMClient({
      dapp: { name: 'Market Dungeon · Somnia Agent Kevin', url: `${window.location.origin}/somnia-agents` },
      api: { supportedNetworks: { [KEVIN_WALLET_CHAIN_ID]: 'https://api.infra.testnet.somnia.network' } },
      ui: { preferExtension: true, showInstallModal: false, headless: false },
      mobile: {
        useDeeplink: true,
        preferredOpenLink: (link: string) => {
          // Only the pinned SDK's native wallet protocol link may become navigation.
          // Never accept an arbitrary wallet-supplied web URL or a send/payment link.
          if (link.length > 32_768 || !/^metamask:\/\/connect\/mwp\?(?:p|id)=/.test(link)) {
            throw new Error('MetaMask returned an unsupported wallet connection link.');
          }
          setOpenWalletLink(link);
          try { window.location.href = link; }
          catch { /* The visible Open MetaMask link preserves a fresh user tap. */ }
        },
      },
      analytics: { enabled: false },
      skipAutoAnnounce: true,
    });
  },
});

export const prewarmKevinWallet = connector.prewarm;
export async function connectKevinWallet(): Promise<KevinWalletConnection> {
  clearKevinWalletOpenLink();
  try { return await connector.connect(); }
  finally { clearKevinWalletOpenLink(); }
}
export const getConnectedKevinWallet = connector.connectedProvider;
export function clearKevinWalletConnection(): void { connector.clear(); clearKevinWalletOpenLink(); }

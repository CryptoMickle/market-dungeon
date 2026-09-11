'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RivalMode, RivalResponse, RivalRound, RivalTransaction } from '../../lib/somnia-agents/types.ts';
import { ensureKevinWalletNetwork, sendKevinRequest } from '../../lib/somnia-agents/wallet.ts';
import { clearKevinWalletConnection, clearKevinWalletOpenLink, connectKevinWallet, getKevinWalletOpenLink, prewarmKevinWallet, subscribeKevinWalletOpenLink, type KevinWalletConnection } from '../../lib/somnia-agents/metamask-connect.ts';

type WalletState = { status: 'disconnected' | 'connecting' | 'connected' | 'error'; account?: string; error?: string };

const STORAGE_KEY = 'market-dungeon/local-kevin-rival/v1';
const MAX_ROUNDS = 100;
const MAX_SAVED_BYTES = 2_000_000;
const validTicket = (ticket: unknown): ticket is string => typeof ticket === 'string'
  && ticket.length >= 16 && ticket.length <= 16_384 && /^[A-Za-z0-9_.-]+$/.test(ticket);

class RivalRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function receivedRound(data: RivalResponse, previous?: RivalRound): RivalRound {
  if (data.ticket !== undefined && !validTicket(data.ticket)) throw new Error('Kevin’s saved round could not be read. No rival result is counted.');
  const ticket = data.ticket ?? previous?.ticket;
  return { ...data.round, ...(ticket ? { ticket } : {}) };
}

async function callRival(body: Record<string, unknown>): Promise<RivalResponse> {
  const response = await fetch('/api/somnia-agents/rival', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(25_000),
  });
  const data = await response.json() as RivalResponse & { error?: string };
  if (!response.ok || !data.round) throw new RivalRequestError(data.error ?? 'Kevin could not reach the agent service. Your expedition continues.', response.status);
  return data;
}

function restoreRounds(value: unknown): RivalRound[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_ROUNDS).filter((round): round is RivalRound => Boolean(round)
    && typeof round === 'object'
    && /^[a-zA-Z0-9_-]{8,128}$/.test(String(round.attemptId))
    && /^0x[0-9a-f]{64}$/i.test(String(round.marketId))
    && Number.isSafeInteger(round.expiry) && Number.isSafeInteger(round.cutoff)
    && (round.mode === 'simulation' || round.mode === 'somnia')
    && ['preparing', 'awaiting-wallet', 'pending', 'locked', 'unavailable'].includes(round.status)
    && (round.txHash === undefined || /^0x[0-9a-f]{64}$/i.test(String(round.txHash))))
    .map((round) => {
      if (round.ticket !== undefined && !validTicket(round.ticket)) return {
        ...round, ticket: undefined, status: 'unavailable', direction: undefined, finalizedAt: undefined,
        reason: 'Kevin’s saved receipt is damaged. No rival result is counted.',
      };
      // Re-read decisions from the server / chain after reload, rather than
      // treating an editable browser cache as a verified agent response.
      if (round.status === 'locked') return { ...round, status: 'pending', direction: undefined, finalizedAt: undefined };
      if (round.status === 'awaiting-wallet') return { ...round, status: 'unavailable', reason: 'The page reloaded during wallet approval. Check MetaMask activity before making another request. This request will not be sent again automatically; your expedition continues.' };
      return round;
    });
}

export function useKevinRival(enabled: boolean) {
  const [mode, setModeState] = useState<RivalMode>('simulation');
  const [wallet, setWallet] = useState<WalletState>({ status: 'disconnected' });
  const walletOpenLink = useSyncExternalStore(subscribeKevinWalletOpenLink, getKevinWalletOpenLink, () => undefined);
  const connection = useRef<KevinWalletConnection | undefined>(undefined);
  const walletBusy = useRef(false);
  const [rounds, setRounds] = useState<RivalRound[]>([]);
  const roundsRef = useRef<RivalRound[]>([]);
  const [ready, setReady] = useState(false);
  const started = useRef(new Set<string>());
  const busy = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => {
      if (enabled) {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const saved = raw && raw.length <= MAX_SAVED_BYTES ? JSON.parse(raw) as { rounds?: unknown; mode?: unknown } : null;
          const restored = restoreRounds(saved?.rounds);
          roundsRef.current = restored;
          restored.forEach(round => started.current.add(round.attemptId));
          setRounds(restored);
          if (saved?.mode === 'somnia') setModeState('somnia');
        } catch { /* Private browsing or a damaged local cache must not stop combat. */ }
      }
      setReady(true);
    }, 0);
    return () => { mounted.current = false; window.clearTimeout(timer); };
  }, [enabled]);

  const setMode = useCallback((nextMode: RivalMode) => {
    setModeState(nextMode);
    // Explicit selection preloads code only. SDK/session initialization and wallet
    // permissions stay behind the separate Connect tap, including after reload.
    if (enabled && nextMode === 'somnia') void prewarmKevinWallet().catch(() => { /* Connect displays a retryable error. */ });
  }, [enabled]);

  const connectWallet = useCallback(async () => {
    if (!enabled || walletBusy.current) return;
    walletBusy.current = true;
    setWallet({ status: 'connecting' });
    try {
      const connected = await connectKevinWallet();
      if (!mounted.current) return;
      await ensureKevinWalletNetwork(connected.provider);
      if (!mounted.current) return;
      connection.current = connected;
      setWallet({ status: 'connected', account: connected.account });
    } catch (error) {
      connection.current = undefined;
      clearKevinWalletConnection();
      if (mounted.current) setWallet({ status: 'error', error: (error as { code?: number })?.code === 4001
        ? 'Connection declined. Your omen is still unlocked. You can try again or choose simulated Kevin.'
        : error instanceof Error ? error.message : 'Could not connect MetaMask. Your omen is still unlocked. Try again.' });
    } finally { walletBusy.current = false; clearKevinWalletOpenLink(); }
  }, [enabled]);

  useEffect(() => {
    const connected = connection.current;
    if (wallet.status !== 'connected' || !connected) return;
    const invalidate = () => {
      connection.current = undefined;
      clearKevinWalletConnection();
      setWallet({ status: 'disconnected' });
    };
    const accountsChanged = (...values: unknown[]) => {
      const accounts = values[0];
      if (!Array.isArray(accounts) || typeof accounts[0] !== 'string'
        || accounts[0].toLowerCase() !== connected.account.toLowerCase()) invalidate();
    };
    const chainChanged = (...values: unknown[]) => { if (String(values[0]).toLowerCase() !== '0xc488') invalidate(); };
    connected.provider.on?.('accountsChanged', accountsChanged);
    connected.provider.on?.('chainChanged', chainChanged);
    connected.provider.on?.('disconnect', invalidate);
    return () => {
      connected.provider.removeListener?.('accountsChanged', accountsChanged);
      connected.provider.removeListener?.('chainChanged', chainChanged);
      connected.provider.removeListener?.('disconnect', invalidate);
    };
  }, [wallet.status, wallet.account]);

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);

  useEffect(() => {
    if (!ready || !enabled) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, rounds })); } catch { /* Optional local side game. */ }
  }, [enabled, mode, ready, rounds]);

  const update = useCallback((round: RivalRound) => {
    if (!mounted.current) return;
    const next = [...roundsRef.current.filter((item) => item.attemptId !== round.attemptId), round].slice(-MAX_ROUNDS);
    roundsRef.current = next;
    setRounds(next);
    // Save the receipt/hash before another page or a reload can interrupt React effects.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, rounds: next })); } catch { /* The current tab can continue. */ }
  }, [mode]);

  useEffect(() => {
    if (!enabled || !ready) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      for (const round of roundsRef.current) {
        if (!['preparing', 'pending'].includes(round.status) || busy.current.has(round.attemptId)) continue;
        busy.current.add(round.attemptId);
        try {
          const data = await callRival({ action: 'status', attemptId: round.attemptId,
            ...(round.ticket ? { ticket: round.ticket } : {}), ...(round.txHash ? { txHash: round.txHash } : {}) });
          if (!cancelled) {
            const recovered = { ...receivedRound(data, round), ...(round.txHash ? { txHash: round.txHash } : {}) };
            // A provider can return a retryable pending status rather than an HTTP
            // error. Bound that recovery too; this local side game must not poll forever.
            if (recovered.status === 'pending' && Date.now() / 1_000 > recovered.expiry + 120) {
              recovered.status = 'unavailable';
              recovered.reason = 'Kevin’s answer could not be verified within the recovery window. No rival result is counted.';
            }
            update(recovered);
          }
        } catch (error) {
          if (!cancelled) {
            // A brief read failure is retryable. After the bounded recovery window,
            // omit this rivalry; never substitute an invented agent answer.
            const terminal = Date.now() / 1_000 > round.expiry + 120
              || (error instanceof RivalRequestError && [400, 403, 404, 409, 410].includes(error.status));
            update({ ...round, status: terminal ? 'unavailable' : 'pending', reason: terminal
              ? 'Kevin’s answer could not be verified. No rival result is counted.'
              : error instanceof Error ? error.message : 'Retrying Kevin’s response…' });
          }
        } finally { busy.current.delete(round.attemptId); }
      }
    };
    const timer = window.setInterval(() => { void poll(); }, 3_000);
    const resume = () => { if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', resume);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [enabled, ready, update]);

  const start = useCallback(async (attemptId: string, marketId: string, expiry: number) => {
    if (!enabled || !ready || started.current.has(attemptId) || roundsRef.current.some(round => round.attemptId === attemptId)) return;
    const connected = connection.current;
    if (mode === 'somnia' && !connected) return;
    started.current.add(attemptId);
    busy.current.add(attemptId);
    let round: RivalRound = { attemptId, marketId, expiry, cutoff: expiry - 10, mode, status: 'preparing' };
    update(round);
    try {
      const data = await callRival({ action: 'prepare', attemptId, marketId, mode });
      round = receivedRound(data);
      update(round);
      if (mode === 'somnia' && data.transaction) {
        const transaction: RivalTransaction = data.transaction;
        round = { ...round, status: 'awaiting-wallet', reason: `Confirm in your wallet: ${transaction.depositStt} testnet STT deposit plus gas. You can decline and keep playing.` };
        update(round);
        const txHash = await sendKevinRequest(transaction, round.cutoff, connected?.provider, connected?.account);
        round = { ...round, status: 'pending', txHash, reason: undefined };
        // Persist the hash immediately so navigation cannot cause a second send.
        update(round);
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          const other = stored ? restoreRounds((JSON.parse(stored) as { rounds?: unknown }).rounds) : [];
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, rounds: [...other.filter((item) => item.attemptId !== attemptId), round].slice(-MAX_ROUNDS) }));
        } catch { /* The current tab can still poll the exact submitted hash. */ }
        const checked = await callRival({ action: 'status', attemptId, txHash, ...(round.ticket ? { ticket: round.ticket } : {}) });
        update({ ...receivedRound(checked, round), txHash });
      }
    } catch (error) {
      update({ ...round, status: round.txHash ? 'pending' : 'unavailable', reason: error instanceof Error ? error.message : 'Kevin sits out this round. Your expedition continues.' });
    } finally { busy.current.delete(attemptId); if (mode === 'somnia') clearKevinWalletOpenLink(); }
  }, [enabled, ready, mode, update]);

  return { mode, setMode, rounds, start, wallet, walletOpenLink, connectWallet, walletReady: wallet.status === 'connected' };
}

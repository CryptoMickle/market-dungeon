'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RivalMode, RivalResponse, RivalRound, RivalTransaction } from '../../lib/somnia-agents/types.ts';
import { sendKevinRequest } from '../../lib/somnia-agents/wallet.ts';

const STORAGE_KEY = 'market-dungeon/local-kevin-rival/v1';
const MAX_ROUNDS = 100;

async function callRival(body: Record<string, unknown>): Promise<RivalResponse> {
  const response = await fetch('/api/somnia-agents/rival', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(25_000),
  });
  const data = await response.json() as RivalResponse & { error?: string };
  if (!response.ok || !data.round) throw new Error(data.error ?? 'Kevin could not reach the agent service. Your expedition continues.');
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
      // Re-read decisions from the local server / chain after reload, rather than
      // treating an editable browser cache as a verified agent response.
      if (round.status === 'locked') return { ...round, status: 'pending', direction: undefined };
      if (round.status === 'awaiting-wallet') return { ...round, status: 'unavailable', reason: 'Wallet request interrupted. Kevin sits out; your expedition continues.' };
      return round;
    });
}

export function useKevinRival(enabled: boolean) {
  const [mode, setMode] = useState<RivalMode>('simulation');
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
          const saved = raw && raw.length <= 160_000 ? JSON.parse(raw) as { rounds?: unknown; mode?: unknown } : null;
          setRounds(restoreRounds(saved?.rounds));
          if (saved?.mode === 'somnia') setMode('somnia');
        } catch { /* Private browsing or a damaged local cache must not stop combat. */ }
      }
      setReady(true);
    }, 0);
    return () => { mounted.current = false; window.clearTimeout(timer); };
  }, [enabled]);

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);

  useEffect(() => {
    if (!ready || !enabled) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, rounds })); } catch { /* Optional local side game. */ }
  }, [enabled, mode, ready, rounds]);

  const update = useCallback((round: RivalRound) => {
    if (!mounted.current) return;
    setRounds((previous) => [...previous.filter((item) => item.attemptId !== round.attemptId), round].slice(-MAX_ROUNDS));
  }, []);

  useEffect(() => {
    if (!enabled || !ready) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      for (const round of roundsRef.current) {
        if (!['preparing', 'pending'].includes(round.status) || busy.current.has(round.attemptId)) continue;
        busy.current.add(round.attemptId);
        try {
          const data = await callRival({ action: 'status', attemptId: round.attemptId, ...(round.txHash ? { txHash: round.txHash } : {}) });
          if (!cancelled) {
            const recovered = { ...data.round, ...(round.txHash ? { txHash: round.txHash } : {}) };
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
            const terminal = Date.now() / 1_000 > round.expiry + 120;
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
    if (!enabled || started.current.has(attemptId)) return;
    started.current.add(attemptId);
    busy.current.add(attemptId);
    let round: RivalRound = { attemptId, marketId, expiry, cutoff: expiry - 10, mode, status: 'preparing' };
    update(round);
    try {
      const data = await callRival({ action: 'prepare', attemptId, marketId, mode });
      round = data.round;
      update(round);
      if (mode === 'somnia' && data.transaction) {
        const transaction: RivalTransaction = data.transaction;
        round = { ...round, status: 'awaiting-wallet', reason: `Confirm in your wallet: ${transaction.depositStt} testnet STT deposit plus gas. You can decline and keep playing.` };
        update(round);
        const txHash = await sendKevinRequest(transaction, round.cutoff);
        round = { ...round, status: 'pending', txHash, reason: undefined };
        // Persist the hash immediately so navigation cannot cause a second send.
        update(round);
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          const other = stored ? restoreRounds((JSON.parse(stored) as { rounds?: unknown }).rounds) : [];
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, rounds: [...other.filter((item) => item.attemptId !== attemptId), round].slice(-MAX_ROUNDS) }));
        } catch { /* The current tab can still poll the exact submitted hash. */ }
        const checked = await callRival({ action: 'status', attemptId, txHash });
        update({ ...checked.round, txHash });
      }
    } catch (error) {
      update({ ...round, status: round.txHash ? 'pending' : 'unavailable', reason: error instanceof Error ? error.message : 'Kevin sits out this round. Your expedition continues.' });
    } finally { busy.current.delete(attemptId); }
  }, [enabled, mode, update]);

  return { mode, setMode, rounds, start };
}

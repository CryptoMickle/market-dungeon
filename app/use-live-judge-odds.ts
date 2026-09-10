'use client';

import { useEffect, useState } from 'react';
import type { DreamDexClobOdds } from './clob-odds';
import type { LiveJudgeOddsResponse } from './live-judge-odds';
import { LIVE_JUDGE, type LiveJudgeMarket } from './live-judge-proof';

type QuoteState = { marketId: string; state: 'open' | 'closed' | 'unavailable'; odds: DreamDexClobOdds | null };
const QUOTED_POLL_MS = 5_000;
const EMPTY_POLL_MS = 2_000;

// Quotes are context only. They never enter the signed lock or settlement proof.
export function useLiveJudgeOdds(market: LiveJudgeMarket | null, active: boolean) {
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const marketId = market?.marketId;
  const expiry = market?.expiry;
  useEffect(() => {
    if (!marketId || !active) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function poll() {
      if (document.hidden) { timer = window.setTimeout(poll, 5_000); return; }
      let delay = QUOTED_POLL_MS;
      let closed = false;
      try {
        const response = await fetch(`/api/live-judge/odds?marketId=${encodeURIComponent(marketId!)}`, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
        });
        const data = await response.json() as LiveJudgeOddsResponse;
        if (controller.signal.aborted) return;
        if (!response.ok) {
          delay = Math.max(5, Math.min(60, Number(data.retryAfter ?? response.headers.get('retry-after')) || 10)) * 1_000;
          throw new Error('Quote service unavailable');
        }
        if (data.marketId?.toLowerCase() !== marketId!.toLowerCase()
          || data.odds?.marketId?.toLowerCase() !== marketId!.toLowerCase()
          || data.chainId !== LIVE_JUDGE.chainId || data.venueId?.toLowerCase() !== LIVE_JUDGE.venueId.toLowerCase()
          || data.intervalSec !== 60 || data.asset !== 'BTC' || data.expiry !== expiry || !['open', 'closed'].includes(data.state)) {
          throw new Error('Quotes did not match this market');
        }
        closed = data.state === 'closed';
        // A fresh one-minute book can receive its first orders between reads.
        // Recheck empty snapshots sooner; keep normal cadence once quoted and
        // preserve provider backoff on errors instead of hammering the indexer.
        if (!closed && (data.odds.upProbability == null || data.odds.downProbability == null)) delay = EMPTY_POLL_MS;
        setQuote({ marketId: marketId!, state: data.state, odds: closed ? null : data.odds });
      } catch {
        if (!controller.signal.aborted) setQuote({ marketId: marketId!, state: 'unavailable', odds: null });
      } finally {
        if (!controller.signal.aborted && !closed) timer = window.setTimeout(poll, delay);
      }
    }
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [marketId, expiry, active]);

  if (!active) return { state: market ? 'closed' as const : 'waiting' as const, odds: null };
  return quote && quote.marketId.toLowerCase() === marketId?.toLowerCase()
    ? { state: quote.state, odds: quote.odds }
    : { state: 'loading' as const, odds: null };
}

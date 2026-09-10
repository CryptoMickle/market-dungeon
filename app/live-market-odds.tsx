import { formatClobPercent, type DreamDexClobOdds } from './clob-odds';
import oddsStyles from './live-market-odds.module.css';

export function LiveMarketOdds({ odds, direction, state, networkLabel }: {
  odds: DreamDexClobOdds | null;
  direction?: 'UP' | 'DOWN';
  state?: 'waiting' | 'loading' | 'open' | 'closed' | 'unavailable';
  networkLabel?: string;
}) {
  const live = state === undefined || state === 'open';
  const available = live && odds?.upProbability != null && odds.downProbability != null;
  const source = state === 'waiting' ? 'WAITING FOR THE NEXT ONE-MINUTE MARKET'
    : state === 'loading' ? 'LOADING LIVE ODDS…'
    : state === 'closed' ? 'MARKET WINDOW CLOSED · QUOTES STOPPED'
    : state === 'unavailable' ? 'ORDER BOOK TEMPORARILY UNAVAILABLE'
    : odds?.source === 'ORDER_BOOK'
    ? `BEST BID ${formatClobPercent(odds.bestBid, 1)} · BEST ASK ${formatClobPercent(odds.bestAsk, 1)}${odds.spread == null ? '' : ` · SPREAD ${formatClobPercent(odds.spread, 1)}`}`
    : odds?.source === 'LAST_TRADE'
      ? odds.bookStatus === 'unavailable'
        ? 'ORDER BOOK TEMPORARILY UNAVAILABLE · USING LAST TRADED PRICE'
        : 'ORDER BOOK EMPTY · USING LAST TRADED PRICE'
      : state === 'open' ? 'WAITING FOR ODDS · CHECKING AGAIN' : 'LIVE ODDS UNAVAILABLE';
  const observedAt = live && odds?.observedAtIso ? `${available ? '' : 'CHECKED '}${odds.observedAtIso.slice(11, 19)} UTC`
    : state === 'loading' ? 'FETCHING…' : 'NO QUOTE';

  return (
    <div className={oddsStyles.odds} data-odds-state={state} data-odds-available={available} aria-busy={state === 'loading'} aria-live="polite" aria-label="Live dreamDEX order book odds">
      <div className={oddsStyles.heading}>
        <span className={oddsStyles.title}><i className={oddsStyles.liveDot} /> {state === 'closed' ? 'DREAMDEX CLOB · CLOSED' : 'LIVE DREAMDEX CLOB ODDS'}</span>
        <small className={oddsStyles.badge}> · {networkLabel ?? 'OFFICIAL MARKETS SDK'} · READ ONLY</small>
      </div>
      <div className={oddsStyles.grid}>
        <div className={`${oddsStyles.cell} ${oddsStyles.up} ${direction === 'UP' ? oddsStyles.selected : ''}`}>
          <span className={oddsStyles.label}>BTC UP · YES: </span>
          <strong className={oddsStyles.value}>{available ? formatClobPercent(odds!.upProbability) : state === 'loading' ? '…' : '—'}</strong>
        </div>
        <div className={`${oddsStyles.cell} ${oddsStyles.down} ${direction === 'DOWN' ? oddsStyles.selected : ''}`}>
          <span className={oddsStyles.label}>BTC DOWN · NO: </span>
          <strong className={oddsStyles.value}>{available ? formatClobPercent(odds!.downProbability) : state === 'loading' ? '…' : '—'}</strong>
        </div>
      </div>
      <div className={oddsStyles.meta}><span className={oddsStyles.source}>{source}</span><time className={oddsStyles.time}> · {observedAt}</time></div>
      <small className={oddsStyles.note}>{state === 'waiting' ? 'Odds will appear when a fresh market is available.'
        : state === 'loading' ? 'Fetching this market’s order book. You can lock your omen while it loads.'
        : state === 'unavailable' ? 'The order book could not be read. Retrying automatically. You can still lock an omen and play.'
        : state === 'closed' ? 'The trading window has ended. Your locked omen stays the same while settlement is checked.'
        : state === 'open' && !available ? 'This market has no usable quotes yet. Checking again every 2 seconds. You can still lock an omen and play.'
          : odds?.source === 'LAST_TRADE' ? 'Last traded price for this market, not a current order-book quote. Checking the book again automatically.'
          : 'Implied odds are a live order-book snapshot, not a guarantee or an order placed by this game.'}</small>
    </div>
  );
}

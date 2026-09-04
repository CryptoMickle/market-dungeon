export const MARKET_DUNGEON_PLAY_URL = 'https://market-dungeon.vercel.app';
export const MARKET_DUNGEON_CHALLENGE_URL = `${MARKET_DUNGEON_PLAY_URL}/judge?challenge=1`;
export const X_SHARE_INTENT_URL = 'https://twitter.com/intent/tweet';

export type RunShareResult = 'BLESSED' | 'CURSED' | 'VOID' | 'DEFEATED';

export type RunShareCardInput = {
  mode: 'JUDGE_REPLAY' | 'FULL_RUN';
  result: RunShareResult;
  tier: number;
  totalTiers: number;
  reachedRoom: number;
  totalRooms: number;
  enemiesDefeated: number;
  gold: number;
  lockedDirection: 'UP' | 'DOWN';
  actualOutcome?: 'UP' | 'DOWN' | 'VOID';
  verifiedOnchain: boolean;
  marketId?: string;
};

function boundedInteger(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.floor(Number.isFinite(value) ? value : minimum)));
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function resultPresentation(result: RunShareResult, mode: RunShareCardInput['mode']) {
  if (mode === 'JUDGE_REPLAY') {
    if (result === 'BLESSED') return { headline: 'JUDGE REPLAY CLEARED', accent: '#34d399', icon: 'VICTORY' };
    if (result === 'CURSED') return { headline: 'JUDGE REPLAY ENDED', accent: '#fb7185', icon: 'PREDICTION LOST' };
    if (result === 'VOID') return { headline: 'JUDGE REPLAY CLEARED', accent: '#c084fc', icon: 'MARKET VOID' };
    return { headline: 'JUDGE REPLAY ENDED', accent: '#fb923c', icon: 'FELL IN COMBAT' };
  }
  if (result === 'BLESSED') return { headline: 'DUNGEON CONQUERED', accent: '#34d399', icon: 'VICTORY' };
  if (result === 'CURSED') return { headline: 'BOSS LAST STAND', accent: '#fb7185', icon: 'PREDICTION LOST' };
  if (result === 'VOID') return { headline: 'DUNGEON CONQUERED', accent: '#c084fc', icon: 'MARKET VOID' };
  return { headline: 'EXPEDITION ENDED', accent: '#fb923c', icon: 'FELL IN COMBAT' };
}

export function runShareCardFilename(input: RunShareCardInput) {
  const marketSuffix = input.marketId && /^0x[0-9a-f]{64}$/i.test(input.marketId)
    ? `-${input.marketId.slice(-8).toLowerCase()}`
    : '';
  return `market-dungeon-run${marketSuffix}.png`;
}

export function runShareCaption(input: RunShareCardInput) {
  const room = boundedInteger(input.reachedRoom, 1, Math.max(1, input.totalRooms));
  const totalRooms = Math.max(1, boundedInteger(input.totalRooms, 1, 999));
  const judgeReplay = input.mode === 'JUDGE_REPLAY';
  const enemies = boundedInteger(input.enemiesDefeated, 0, judgeReplay ? 2 : totalRooms);
  const gold = boundedInteger(input.gold, 0, 999_999);
  const opening = judgeReplay
    ? input.result === 'BLESSED'
      ? "⚔️ I beat Market Dungeon's final-tier Judge Replay!"
      : input.result === 'CURSED'
        ? "☠️ The boss's last stand ended my final-tier Judge Replay."
        : input.result === 'VOID'
          ? "👑 I cleared Market Dungeon's final-tier Judge Replay — the market was voided."
          : '☠️ My final-tier Judge Replay ended in combat.'
    : input.result === 'BLESSED'
      ? '⚔️ I conquered Market Dungeon!'
      : input.result === 'CURSED'
        ? "☠️ The boss's last stand ended my Market Dungeon run."
        : input.result === 'VOID'
          ? '👑 I conquered Market Dungeon — the market was voided.'
          : '☠️ My Market Dungeon expedition ended in combat.';
  const progress = judgeReplay
    ? `⚔️ ${enemies} of 2 replay encounters cleared · ${gold} gold`
    : `🏰 Reached room ${room}/${totalRooms} · ${enemies} enemies defeated · ${gold} gold`;
  const prediction = input.actualOutcome
    ? `🔮 BTC ${input.lockedDirection} → BTC ${input.actualOutcome}`
    : `🔮 Locked BTC ${input.lockedDirection}`;

  return [
    opening,
    progress,
    prediction,
    input.verifiedOnchain ? '⛓️ Onchain-verified on Somnia' : '⛓️ Powered by Somnia + dreamDEX',
    '⚡ Can you beat my run?',
    '#Somnia #DreamDEX',
  ].join('\n');
}

export function runShareClipboardText(input: RunShareCardInput) {
  return `${runShareCaption(input)}\n${MARKET_DUNGEON_CHALLENGE_URL}`;
}

export function runShareXUrl(input: RunShareCardInput) {
  const url = new URL(X_SHARE_INTENT_URL);
  url.searchParams.set('text', runShareCaption(input));
  url.searchParams.set('url', MARKET_DUNGEON_CHALLENGE_URL);
  return url.toString();
}

export function isChallengeEntry(search: string) {
  return new URLSearchParams(search).get('challenge') === '1';
}

export function runShareCardSvg(input: RunShareCardInput) {
  const room = boundedInteger(input.reachedRoom, 1, Math.max(1, input.totalRooms));
  const totalRooms = Math.max(1, boundedInteger(input.totalRooms, 1, 999));
  const judgeReplay = input.mode === 'JUDGE_REPLAY';
  const enemies = boundedInteger(input.enemiesDefeated, 0, judgeReplay ? 2 : totalRooms);
  const gold = boundedInteger(input.gold, 0, 999_999);
  const tier = boundedInteger(input.tier, 1, Math.max(1, input.totalTiers));
  const totalTiers = Math.max(1, boundedInteger(input.totalTiers, 1, 99));
  const progress = judgeReplay
    ? Math.min(1, enemies / 2)
    : Math.max(0.025, Math.min(1, room / totalRooms));
  const progressWidth = Math.round(1000 * progress);
  const presentation = resultPresentation(input.result, input.mode);
  const mode = judgeReplay ? 'FINAL-TIER JUDGE REPLAY' : 'FULL EXPEDITION';
  const primaryLabel = judgeReplay ? 'REPLAY PROGRESS' : 'DUNGEON DEPTH';
  const primaryValue = judgeReplay ? `${enemies} OF 2` : `ROOM ${room}/${totalRooms}`;
  const primaryNote = judgeReplay ? 'REPLAY ENCOUNTERS' : `TIER ${tier} OF ${totalTiers}`;
  const secondaryLabel = judgeReplay ? 'REPLAY FORMAT' : 'ENEMIES DEFEATED';
  const secondaryValue = judgeReplay ? 'FINAL TIER' : String(enemies);
  const secondaryNote = judgeReplay ? 'TWO-ENCOUNTER CHECKPOINT' : 'ACROSS THIS EXPEDITION';
  const verification = input.verifiedOnchain ? 'ONCHAIN VERIFIED · SOMNIA' : 'POWERED BY SOMNIA + DREAMDEX';
  const outcome = input.actualOutcome
    ? `BTC ${input.lockedDirection}  →  BTC ${input.actualOutcome}`
    : `BTC ${input.lockedDirection} LOCKED · OUTCOME UNRESOLVED`;
  const runId = input.marketId && /^0x[0-9a-f]{64}$/i.test(input.marketId)
    ? `RUN ${input.marketId.slice(0, 8).toUpperCase()}…${input.marketId.slice(-6).toUpperCase()}`
    : 'RUN RESULT';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="Market Dungeon run result">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#09090b"/>
      <stop offset="0.56" stop-color="#170d25"/>
      <stop offset="1" stop-color="#0b0710"/>
    </linearGradient>
    <radialGradient id="glow" cx="82%" cy="16%" r="72%">
      <stop offset="0" stop-color="#7c3aed" stop-opacity="0.58"/>
      <stop offset="0.5" stop-color="#4c1d95" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#09090b" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M 34 0 L 0 0 0 34" fill="none" stroke="#a78bfa" stroke-opacity="0.07" stroke-width="1"/>
    </pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect width="1200" height="675" rx="32" fill="url(#bg)"/>
  <rect width="1200" height="675" rx="32" fill="url(#glow)"/>
  <rect width="1200" height="675" rx="32" fill="url(#grid)"/>
  <rect x="2" y="2" width="1196" height="671" rx="30" fill="none" stroke="#a855f7" stroke-opacity="0.65" stroke-width="4"/>

  <g font-family="Arial, Helvetica, sans-serif">
    <g transform="translate(58 48)">
      <rect width="58" height="58" rx="16" fill="#7c3aed" filter="url(#shadow)"/>
      <text x="29" y="39" text-anchor="middle" fill="#fff" font-size="28" font-weight="900">MD</text>
      <text x="78" y="25" fill="#fff" font-size="24" font-weight="900" letter-spacing="2">MARKET DUNGEON</text>
      <text x="78" y="50" fill="#a1a1aa" font-size="14" font-weight="700" letter-spacing="3">${escapeXml(mode)}</text>
    </g>

    <g transform="translate(805 55)">
      <rect width="337" height="44" rx="22" fill="#0f172a" stroke="${presentation.accent}" stroke-opacity="0.9"/>
      <circle cx="25" cy="22" r="6" fill="${presentation.accent}"/>
      <text x="45" y="28" fill="${presentation.accent}" font-size="14" font-weight="900" letter-spacing="1.2">${escapeXml(verification)}</text>
    </g>

    <text x="58" y="190" fill="${presentation.accent}" font-size="18" font-weight="900" letter-spacing="4">${escapeXml(presentation.icon)}</text>
    <text x="58" y="260" fill="#fff" font-size="62" font-weight="950" letter-spacing="-2">${escapeXml(presentation.headline)}</text>
    <text x="58" y="305" fill="#d8b4fe" font-size="24" font-weight="800">${escapeXml(outcome)}</text>

    <g transform="translate(58 350)" filter="url(#shadow)">
      <rect width="318" height="142" rx="20" fill="#111114" stroke="#3f3f46"/>
      <text x="24" y="35" fill="#71717a" font-size="13" font-weight="900" letter-spacing="2">${primaryLabel}</text>
      <text x="24" y="88" fill="#fff" font-size="38" font-weight="950">${primaryValue}</text>
      <text x="24" y="119" fill="#a78bfa" font-size="16" font-weight="800">${primaryNote}</text>
    </g>
    <g transform="translate(399 350)" filter="url(#shadow)">
      <rect width="318" height="142" rx="20" fill="#111114" stroke="#3f3f46"/>
      <text x="24" y="35" fill="#71717a" font-size="13" font-weight="900" letter-spacing="2">${secondaryLabel}</text>
      <text x="24" y="94" fill="#fff" font-size="${judgeReplay ? 36 : 48}" font-weight="950">${secondaryValue}</text>
      <text x="24" y="119" fill="#a1a1aa" font-size="14" font-weight="700">${secondaryNote}</text>
    </g>
    <g transform="translate(740 350)" filter="url(#shadow)">
      <rect width="402" height="142" rx="20" fill="#111114" stroke="#3f3f46"/>
      <text x="24" y="35" fill="#71717a" font-size="13" font-weight="900" letter-spacing="2">GOLD KEPT</text>
      <circle cx="50" cy="85" r="22" fill="#f59e0b" stroke="#fde68a" stroke-width="3"/>
      <text x="50" y="93" text-anchor="middle" fill="#78350f" font-size="22" font-weight="950">G</text>
      <text x="88" y="99" fill="#fff" font-size="48" font-weight="950">${gold}</text>
    </g>

    <rect x="58" y="525" width="1000" height="10" rx="5" fill="#27272a"/>
    <rect x="58" y="525" width="${progressWidth}" height="10" rx="5" fill="${presentation.accent}"/>
    <circle cx="${58 + progressWidth}" cy="530" r="9" fill="${presentation.accent}"/>

    <text x="58" y="592" fill="#a1a1aa" font-size="14" font-weight="800" letter-spacing="1.5">${escapeXml(runId)}</text>
    <text x="1142" y="592" text-anchor="end" fill="#fff" font-size="16" font-weight="900">MARKET-DUNGEON.VERCEL.APP</text>
    <text x="58" y="632" fill="#71717a" font-size="13" font-weight="700">COMBAT MEETS PREDICTION MARKETS · READ-ONLY GAMEPLAY</text>
    <text x="1142" y="632" text-anchor="end" fill="#a78bfa" font-size="13" font-weight="900">#SOMNIA · #DREAMDEX</text>
  </g>
</svg>`;
}

export function runShareCardDataUrl(input: RunShareCardInput) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(runShareCardSvg(input))}`;
}

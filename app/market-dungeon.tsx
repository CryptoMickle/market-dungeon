'use client';

import Image from 'next/image';
import { GameLogo } from './game-logo';
import { GameModeNav } from './game-mode-nav';
import { OmenGuide } from './omen-guide';
import replayStyles from './historical-judge.module.css';
import { useGameAudio } from './game-audio';
import { BossOutcomeScene } from './boss-outcome-scene';
import { DesktopNavigation, KeyboardHint } from './desktop-navigation';
import FullExpedition from './full-expedition';
import { attackLogs, stormLogs, getDelvewornPersona } from './gameplay/delveworn-personas';
import { BattleHeader, CriticalHitResult, MobileBattle, PlayerHeader } from './mobile-battle';
import { RunSharePanel } from './run-share-panel';
import { GameText, GoldIcon, LoadoutSummary } from './game-icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { replayCountdownSeconds, replayRetrySeconds } from './judge-retry';

import {
  challengeCreatedEvent,
  challengeOpenedEvent,
  challengeVerifiedEvent,
  dreamDexCtaClickedEvent,
  emitAnalyticsEvent,
  judgeDemoEntryEvent,
  judgeDemoLockedEvent,
  judgeDemoRevealAttemptedEvent,
  judgeDemoVerificationFailedEvent,
  judgeDemoVerificationNotProvableEvent,
  judgeDemoVerifiedEvent,
  shareActionEvent,
  shareEngagedEvent,
  type JudgeDemoResult,
  type MarketDungeonMode,
  type MarketSettlementResult,
  type ShareAction,
} from './analytics-events';
import type { DreamDexClobOdds } from './clob-odds';
import { LiveMarketOdds } from './live-market-odds';
import { canonicalJudgeActionLog, JUDGE_COMBAT, JUDGE_COMBAT_DOMAIN, replayJudgeCombat, seededRoll, type JudgeCombatAction } from './judge-combat';
import { dreamDexBtcEventContractUrl } from './dreamdex-link';
import {
  activeMarketRefreshDelayMs,
  eventContractIntervalLabel,
  eventContractIntervalName,
  eventContractIntervalSeconds,
} from './event-contract-interval';
import {
  liveBtcContextFromMarket,
  liveBtcContextPrice,
  liveBtcContextTime,
  type LiveBtcContext,
} from './live-btc-context';
import {
  directSettlementProofMatchesMarket,
  directSettlementProofRpcOutcome,
  isTerminalSettlementMarket,
  type DirectOnchainSettlementProof,
} from './onchain-settlement-proof';
import {
  allowsLiveDreamDexContinuation,
  judgeNetworkProfile,
  SOMNIA_MAINNET_PROFILE,
  type JudgeNetworkProfile,
  type JudgeNetworkProfileId,
} from './judge-network';
import {
  canonicalReplayProof,
  isReplayLockAttestation,
  isReplayLockPublicKey,
  REPLAY_LOCK_PUBLIC_KEY_ENDPOINT,
  replayMarketProvenanceMatches,
  replayLockAttestationMatchesProof,
  sameReplayLockAttestation,
  secondsUntilReplayReveal,
  verifyReplayLockAttestation,
  type ReplayCombatProof,
  type ReplayLockAttestation,
  type ReplayLockPublicKey,
  type ReplayProof,
} from './replay-proof';
import {
  isChallengeEntry,
  MARKET_DUNGEON_PLAY_URL,
  MARKET_DUNGEON_SLOGAN,
  type RunShareCardInput,
} from './share-run-card';
import {
  isPortableVerifiedRunSettlement,
  verifiedRunProofFilename,
  verifiedRunProofJson,
  type VerifiedRunProofInput,
} from './share-verified-run';
import {
  isStrictOnchainSettlementProof,
  isStrictReplayCombatProof,
  isStrictReplayProof,
} from './verify-proof';

type Direction = 'UP' | 'DOWN';
type Action = 'attack' | 'storm' | 'potion';
type Phase = 'SETUP' | 'JUDGE_SETUP' | 'COMBAT' | 'CLEARED' | 'MERCHANT' | 'FINAL_MERCHANT' | 'ORACLE' | 'TIER_SETUP' | 'VICTORY' | 'DEAD';
type OracleResult = 'BLESSED' | 'CURSED' | 'VOID' | null;
type DeathCause = 'COMBAT' | 'PREDICTION';
type Species = 'Zombie' | 'Goblin' | 'Orc' | 'Boss';

type ReplayStartIssue = 'rate_limited' | 'upstream_retry' | 'config_unavailable' | 'no_candidates' | 'connection' | 'invalid_lock';

function useReplayCountdown(): [number, (seconds: number) => void] {
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);
  const start = useCallback((seconds: number) => {
    deadline.current = Date.now() + Math.max(0, seconds) * 1_000;
    setRemaining(replayCountdownSeconds(deadline.current));
  }, []);
  useEffect(() => {
    const tick = () => setRemaining(replayCountdownSeconds(deadline.current));
    const timer = window.setInterval(tick, 500);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return [remaining, start];
}

type Market = {
  marketId: string; marketAddress: string; poolAddress: string; collateral: string;
  yesTokenId?: string; noTokenId?: string;
  marketType?: string; asset?: string;
  intervalSec?: string | number;
  tradeCount?: string | number; lastTradeAt?: string | number; operatorId?: string | number;
  venueId?: string; context?: string; oracleQuestionId?: string; creator?: string; createdByTx?: string;
  question: string; strikeUsd: string; tradingStart?: string; expiry: string; expiryIso: string; status: string;
  finalized: boolean; voided: boolean; winningOutcome: number | null; demoReplay?: boolean;
  replaySeal?: string; replayCommitment?: string; replayGameSeed?: string;
  replayLockedDirection?: Direction; replayRevealAfter?: number; replayExpiresAt?: number;
  replayLockAttestation?: ReplayLockAttestation; replayLockPublicKey?: ReplayLockPublicKey;
  replayProof?: ReplayProof; combatProof?: ReplayCombatProof;
  onchainSettlement?: DirectOnchainSettlementProof;
  network?: string; chainId?: number; profileId?: JudgeNetworkProfileId;
};

type Persona = {
  name: string; species: Species; image: string; flavor: string;
  baseHp: number; minDamage: number; maxDamage: number; reward: number;
};

type Monster = Persona & { room: number; hp: number };

const TOTAL_ROOMS = 10;
const TOTAL_TIERS = 4;
const START_POTIONS = 3;
const MAX_POTIONS = 5;
const PROFILE_KEY = 'market-dungeon-profile-v1';
const MERCHANT_IMAGE = '/characters/merchant-quartermaster-kevin.webp';
const STAGE_IMAGE_SIZES = '(min-width: 1216px) 691px, (min-width: 1024px) calc((100vw - 64px) * 0.6), (min-width: 552px) 520px, calc(100vw - 20px)';

const fallback: Market = {
  marketId: '0x0000000000000000000000000000000000000000000000000000000000000000',
  marketAddress: '', poolAddress: '', collateral: '',
  intervalSec: 300,
  question: 'BTC closes at or above its opening price', strikeUsd: '—',
  expiry: '0', expiryIso: '1970-01-01T00:00:00.000Z', status: 'CONNECTING',
  finalized: false, voided: false, winningOutcome: null,
};

const sealedReplay: Market = {
  marketId: 'sealed', marketAddress: '', poolAddress: '', collateral: '',
  intervalSec: 300,
  question: 'A finalized traded BTC 5-minute market is preferred after your omen is locked.',
  strikeUsd: 'SEALED', expiry: '0', expiryIso: '1970-01-01T00:00:00.000Z', status: 'READY TO LOCK',
  finalized: true, voided: false, winningOutcome: null, demoReplay: true,
};

const zombies: Persona[] = [
  { name: 'Grave Belle', species: 'Zombie', image: '/monsters/zombie-1-grave-belle.webp', flavor: 'Technically deceased. Socially still very active.', baseHp: 22, minDamage: 3, maxDamage: 7, reward: 6 },
  { name: 'Miss Morgue', species: 'Zombie', image: '/monsters/zombie-2-miss-morgue.webp', flavor: 'She wants brains, compliments, and preferably both.', baseHp: 26, minDamage: 4, maxDamage: 8, reward: 7 },
  { name: 'Velvet Rot', species: 'Zombie', image: '/monsters/zombie-3-velvet-rot.webp', flavor: 'Somewhere between a nightmare and a questionable dating decision.', baseHp: 30, minDamage: 5, maxDamage: 9, reward: 8 },
  { name: 'Lady Decomposition', species: 'Zombie', image: '/monsters/zombie-4-lady-decomposition.webp', flavor: 'Beauty fades. Apparently attitude does not.', baseHp: 34, minDamage: 5, maxDamage: 10, reward: 9 },
];

const goblins: Persona[] = [
  { name: 'Gary', species: 'Goblin', image: '/monsters/goblin-1-gary.webp', flavor: 'Gary has no plan, but he is extremely committed to it.', baseHp: 24, minDamage: 4, maxDamage: 8, reward: 8 },
  { name: 'Kevin the Unqualified', species: 'Goblin', image: '/monsters/goblin-2-kevin-the-unqualified.webp', flavor: 'Nobody knows who hired Kevin. Kevin included.', baseHp: 28, minDamage: 4, maxDamage: 9, reward: 9 },
  { name: 'Gribble', species: 'Goblin', image: '/monsters/goblin-3-gribble.webp', flavor: 'Gribble has discovered armor. Civilization may never recover.', baseHp: 33, minDamage: 5, maxDamage: 10, reward: 10 },
  { name: "Gary's Supervisor", species: 'Goblin', image: '/monsters/goblin-4-garys-supervisor.webp', flavor: 'You finally found the person responsible for Gary.', baseHp: 38, minDamage: 6, maxDamage: 11, reward: 11 },
];

const orcs: Persona[] = [
  { name: 'Thud', species: 'Orc', image: '/monsters/orc-1-thud.webp', flavor: 'Thud hits first, thinks never.', baseHp: 31, minDamage: 6, maxDamage: 10, reward: 12 },
  { name: 'Brutus', species: 'Orc', image: '/monsters/orc-2-brutus.webp', flavor: 'His tactical doctrine contains one word: harder.', baseHp: 38, minDamage: 7, maxDamage: 12, reward: 14 },
  { name: 'Gronk', species: 'Orc', image: '/monsters/orc-3-gronk.webp', flavor: 'Gronk briefly considered diplomacy. He did not enjoy it.', baseHp: 45, minDamage: 8, maxDamage: 13, reward: 16 },
  { name: 'Meatwall', species: 'Orc', image: '/monsters/orc-4-meatwall.webp', flavor: 'Less of an opponent. More of an architectural problem.', baseHp: 52, minDamage: 9, maxDamage: 14, reward: 18 },
];

const bosses: Persona[] = [
  { name: 'The Dungeon Lord', species: 'Boss', image: '/monsters/boss-1-dungeon-lord.webp', flavor: 'Runs the dungeon with absolute authority and questionable competence.', baseHp: 72, minDamage: 9, maxDamage: 14, reward: 35 },
  { name: 'The Senior Dungeon Lord', species: 'Boss', image: '/monsters/boss-2-senior-dungeon-lord.webp', flavor: 'More authority, more paperwork, exactly the same leadership skills.', baseHp: 76, minDamage: 10, maxDamage: 15, reward: 38 },
  { name: 'The Executive Overlord', species: 'Boss', image: '/monsters/boss-3-executive-overlord.webp', flavor: 'Promoted beyond competence. Unfortunately, also beyond mortality.', baseHp: 80, minDamage: 10, maxDamage: 16, reward: 40 },
  { name: 'The Chairman Below', species: 'Boss', image: '/monsters/boss-4-chairman-below.webp', flavor: 'The final authority. There is no escalation path above him.', baseHp: 84, minDamage: 11, maxDamage: 17, reward: 42 },
];

async function sha256Hex(value: string) {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}


function getRegularTier(roomNumber: number) {
  if (roomNumber <= 9) return 0;
  if (roomNumber <= 19) return 1;
  if (roomNumber <= 29) return 2;
  return 3;
}

function getBossTier(roomNumber: number) {
  if (roomNumber <= 10) return 0;
  if (roomNumber <= 20) return 1;
  if (roomNumber <= 30) return 2;
  return 3;
}

function buildRoster(chapterStartRoom = 1): Monster[] {
  const sequence: Array<typeof zombies> = [zombies, goblins, orcs, zombies, goblins, orcs, zombies, goblins, orcs];
  const regulars = sequence.map((group, index) => {
    const roomNumber = chapterStartRoom + index;
    const tier = getRegularTier(roomNumber);
    const persona = group[tier];
    return { ...persona, room: roomNumber, hp: persona.baseHp, minDamage: persona.minDamage, maxDamage: persona.maxDamage };
  });
  const bossRoom = chapterStartRoom + 9;
  const boss = bosses[getBossTier(bossRoom)];
  return [...regulars, { ...boss, room: bossRoom, hp: boss.baseHp }];
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function gateTime(expiryIso: string) {
  return new Date(expiryIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });
}

function marketPriceLabel(strikeUsd: string) {
  return Number.isFinite(Number(strikeUsd)) && Number(strikeUsd) > 0
    ? `$${strikeUsd}` : 'UNAVAILABLE';
}

function receiptUtc(timestamp: number) {
  return new Date(timestamp * 1_000).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function receiptKeyFingerprint(keyId: string) {
  const fingerprint = keyId.startsWith('ed25519:') ? keyId.slice('ed25519:'.length) : keyId;
  return `ed25519:${fingerprint.slice(0, 8)}…${fingerprint.slice(-8)}`;
}


function MarketProof({
  market,
  mode,
  profile = SOMNIA_MAINNET_PROFILE,
  open = false,
}: {
  market: Market;
  mode: 'live' | 'sealed' | 'revealed';
  profile?: JudgeNetworkProfile;
  open?: boolean;
}) {
  const [marketIdCopyStatus, setMarketIdCopyStatus] = useState('COPY MARKET ID');

  async function copyMarketId() {
    try {
      await navigator.clipboard.writeText(market.marketId);
      setMarketIdCopyStatus('MARKET ID COPIED');
    } catch {
      setMarketIdCopyStatus('COPY FAILED');
    }
  }

  if (mode === 'sealed') {
    return (
      <details className="onchain-proof proof-sealed" open={open || undefined}>
        <summary>
          <span>SEALED REPLAY PROOF</span>
          <strong>{market.replayCommitment ? 'DIRECTION LOCKED · IDENTITY ENCRYPTED' : 'CREATED AFTER OMEN LOCK'}</strong>
        </summary>
        <div className="proof-grid">
          <div className="proof-wide">
            <span>SALTED SHA-256 COMMITMENT</span>
            <code>{market.replayCommitment ?? 'Generated only after UP or DOWN is locked'}</code>
          </div>
          <div><span>MARKET ID</span><strong>NOT SENT TO THE BROWSER</strong></div>
          <div><span>OUTCOME</span><strong>ENCRYPTED IN AN AUTHENTICATED SERVER SEAL</strong></div>
          <div><span>COMBAT RANDOMNESS</span><strong>INDEPENDENT OF THE HIDDEN MARKET</strong></div>
          <div><span>NETWORK</span><strong>{profile.name.toUpperCase()} · {profile.chainId}</strong></div>
        </div>
      </details>
    );
  }

  const hasMarket = /^0x[0-9a-f]{64}$/i.test(market.marketId);
  const status = mode === 'revealed' ? 'BROWSER RPC REFETCH + ABI + DIGESTS VERIFIED' : 'LIVE READ-ONLY MARKET';

  return (
    <details className={`onchain-proof proof-${mode}`} open={open || undefined}>
      <summary>
        <span>{mode === 'live' ? 'LIVE MARKET PROOF' : 'FINALIZED REPLAY PROOF'}</span>
        <strong>{status}</strong>
      </summary>
      <div className="proof-grid">
        {mode === 'revealed' && market.combatProof && <>
          <div className="proof-wide">
            <span>✓ COMBAT VERIFIED BY SERVER</span>
            <code>{market.combatProof.transcriptDigest}</code>
          </div>
          <div><span>TRANSCRIPT</span><strong>{market.combatProof.steps} ACTIONS · GUARD + BOSS DEFEATED</strong></div>
          <div><span>RULESET</span><strong>DETERMINISTIC SEED REPLAY · V1</strong></div>
        </>}
        {mode === 'revealed' && market.replayProof && <>
          <div className="proof-wide">
            <span>✓ COMMITMENT VERIFIED IN BROWSER</span>
            <code>{market.replayProof.commitment}</code>
          </div>
          <div><span>LOCKED DIRECTION</span><strong>BTC {market.replayProof.lockedDirection}</strong></div>
          <div><span>REVEALED SALT</span><code>{market.replayProof.salt}</code></div>
          <div className="proof-wide"><span>CANONICAL COMMITMENT INPUT</span><code>{market.replayProof.canonical}</code></div>
        </>}
        {mode === 'revealed' && market.onchainSettlement && <>
          <div className="proof-wide">
            <span>✓ BROWSER REFETCHED + ABI-DECODED SOMNIA STATE</span>
            <strong>CHAIN {profile.chainId} · EIP-1898 HASH-PINNED · BOTH RAW ETH_CALL RESULTS MATCH</strong>
          </div>
          <div className="proof-wide">
            <span>✓ SETTLEMENT READ DIRECTLY FROM SOMNIA RPC</span>
            <a href={`${profile.explorer}/block/${market.onchainSettlement.blockNumber}`} target="_blank" rel="noreferrer">
              <strong>RPC VERIFICATION SNAPSHOT · BLOCK #{market.onchainSettlement.blockNumber} · BTC {market.onchainSettlement.winningOutcome === 0 ? 'UP' : market.onchainSettlement.winningOutcome === 1 ? 'DOWN' : 'VOID'} ↗</strong>
            </a>
          </div>
          <div>
            <span>PAYOUT VECTOR</span>
            <code>[{market.onchainSettlement.payoutNumerators.join(', ')}] / {market.onchainSettlement.payoutDenominator}</code>
          </div>
          <div>
            <span>MARKET KEY</span>
            <code>{market.onchainSettlement.marketKey}</code>
          </div>
          <div className="proof-wide">
            <span>RPC VERIFICATION SNAPSHOT BLOCK HASH</span>
            <code>{market.onchainSettlement.blockHash}</code>
          </div>
          <div className="proof-wide">
            <span>BINARY MODULE · MARKET BINDING</span>
            <a href={`${profile.explorer}/address/${market.onchainSettlement.moduleAddress}`} target="_blank" rel="noreferrer"><code>{market.onchainSettlement.moduleAddress}</code><b>↗</b></a>
          </div>
          <div className="proof-wide">
            <span>BINARYSETTLEMENT CONTRACT</span>
            <a href={`${profile.explorer}/address/${market.onchainSettlement.settlementAddress}`} target="_blank" rel="noreferrer"><code>{market.onchainSettlement.settlementAddress}</code><b>↗</b></a>
          </div>
          <div className="proof-wide">
            <span>MARKETS(MARKET ID) ETH_CALL · TARGET · EIP-1898 BLOCK HASH · CALLDATA</span>
            <code>{market.onchainSettlement.calls.moduleMarket.to} · {market.onchainSettlement.calls.moduleMarket.blockReference.blockHash} · {market.onchainSettlement.calls.moduleMarket.data}</code>
          </div>
          <div className="proof-wide proof-raw-result" role="group" aria-label="MARKETS market ID eth_call raw result">
            <span>MARKETS(MARKET ID) ETH_CALL · EXACT RAW RESULT</span>
            <code>{market.onchainSettlement.calls.moduleMarket.result}</code>
          </div>
          <div className="proof-wide">
            <span>GETSETTLEMENT(MARKET KEY) ETH_CALL · TARGET · EIP-1898 BLOCK HASH · CALLDATA</span>
            <code>{market.onchainSettlement.calls.settlementRecord.to} · {market.onchainSettlement.calls.settlementRecord.blockReference.blockHash} · {market.onchainSettlement.calls.settlementRecord.data}</code>
          </div>
          <div className="proof-wide proof-raw-result" role="group" aria-label="getSettlement market key eth_call raw result">
            <span>GETSETTLEMENT(MARKET KEY) ETH_CALL · EXACT RAW RESULT</span>
            <code>{market.onchainSettlement.calls.settlementRecord.result}</code>
          </div>
        </>}
        <div className="proof-wide">
          <span>FULL MARKET ID</span>
          {hasMarket ? <div className="proof-copy-value"><code>{market.marketId}</code><button type="button" onClick={() => void copyMarketId()}>{marketIdCopyStatus}</button></div> : <code>Loading…</code>}
        </div>
        <div>
          <span>MARKET ADDRESS</span>
          {market.marketAddress ? <a href={`${profile.explorer}/address/${market.marketAddress}`} target="_blank" rel="noreferrer"><code>{market.marketAddress}</code><b>↗</b></a> : <code>Loading…</code>}
        </div>
        <div>
          <span>POOL ADDRESS</span>
          {market.poolAddress ? <a href={`${profile.explorer}/address/${market.poolAddress}`} target="_blank" rel="noreferrer"><code>{market.poolAddress}</code><b>↗</b></a> : <code>Loading…</code>}
        </div>
        <div><span>NETWORK</span><strong>{profile.name.toUpperCase()} · {profile.chainId}</strong></div>
        <div><span>SAFETY</span><strong>READ ONLY · NO WALLET · NO APPROVAL · NO ORDER</strong></div>
      </div>
    </details>
  );
}

function HumanProofSummary({ verified = false }: { verified?: boolean }) {
  return (
    <section className="human-proof-summary" aria-label="Plain-language proof summary">
      <span>{verified ? 'WHAT YOUR BROWSER VERIFIED' : 'WHAT THIS RUN WILL PROVE'}</span>
      <div>
        <p><b>Choice first.</b> Your BTC direction {verified ? 'was locked' : 'locks'} before market selection.</p>
        <p><b>Signed lock.</b> Market Dungeon&apos;s environment {verified ? 'authenticated' : 'authenticates'} the commitment, direction, and lock window. This is a server receipt, not an external timestamp.</p>
        <p><b>No replacement.</b> The signed commitment {verified ? 'could not' : 'cannot'} be changed; reveal must match the original market and outcome.</p>
        <p><b>Independent result.</b> Your browser {verified ? 'independently reproduced' : 'independently reproduces'} the onchain result from one canonical Somnia block and both raw contract responses.</p>
      </div>
    </section>
  );
}

function JudgeLockReceiptEvidence({
  attestation,
  publicKey,
}: {
  attestation?: ReplayLockAttestation;
  publicKey?: ReplayLockPublicKey;
}) {
  if (!attestation || !publicKey || attestation.keyId !== publicKey.keyId) return null;

  return (
    <section className="judge-lock-receipt" aria-label="Server-authenticated lock receipt">
      <details>
        <summary className="receipt-summary">
          <div className="receipt-status">
            <span>SERVER-AUTHENTICATED LOCK RECEIPT</span>
            <strong>✓ VERIFIED IN THIS BROWSER</strong>
            <small>Not an external timestamp or endorsement</small>
          </div>
          <div><span>LOCKED OMEN</span><strong>BTC {attestation.lockedDirection}</strong></div>
          <div><span>REVEAL GATE</span><strong><time dateTime={new Date(attestation.revealAfter * 1_000).toISOString()}>{receiptUtc(attestation.revealAfter).slice(11)}</time></strong></div>
          <b>VIEW SIGNED RECEIPT</b>
        </summary>
        <div className="receipt-details">
          <div>
            <span>ALGORITHM</span>
            <strong>{attestation.algorithm}</strong>
          </div>
          <div>
            <span>KEY ID · SHA-256 FINGERPRINT</span>
            <code title={attestation.keyId}>{receiptKeyFingerprint(attestation.keyId)}</code>
          </div>
          <div>
            <span>LOCKED DIRECTION</span>
            <strong>BTC {attestation.lockedDirection}</strong>
          </div>
          <div className="receipt-window">
            <span>LOCK / REVEAL WINDOW</span>
            <strong><time dateTime={new Date(attestation.issuedAt * 1_000).toISOString()}>LOCK {receiptUtc(attestation.issuedAt)}</time></strong>
            <small><time dateTime={new Date(attestation.revealAfter * 1_000).toISOString()}>REVEAL FROM {receiptUtc(attestation.revealAfter)}</time> · <time dateTime={new Date(attestation.expiresAt * 1_000).toISOString()}>EXPIRES {receiptUtc(attestation.expiresAt)}</time></small>
          </div>
        </div>
      </details>
    </section>
  );
}

function TierTrack({ activeTier, complete = false, failed = false }: { activeTier: number; complete?: boolean; failed?: boolean }) {
  return (
    <section className="tier-track" aria-label="Dungeon tier progression">
      <div><span>FULL RUN</span><strong>{complete ? 'ALL TIERS CLEARED' : failed ? `ENDED AT TIER ${activeTier}` : `TIER ${activeTier} OF ${TOTAL_TIERS}`}</strong></div>
      <div className="tier-nodes">
        {Array.from({ length: TOTAL_TIERS }, (_, index) => {
          const number = index + 1;
          const state = complete || number < activeTier ? 'done' : failed && number === activeTier ? 'failed' : number === activeTier ? 'active' : '';
          return <span key={number} className={state}><b>{state === 'done' ? '✓' : number}</b><small>TIER {number}</small></span>;
        })}
      </div>
    </section>
  );
}

function readProfile() {
  if (typeof window === 'undefined') return { gold: 0, potions: START_POTIONS };
  try {
    const saved = JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? '{}') as { gold?: number; potions?: number };
    return {
      gold: Math.max(0, Number(saved.gold) || 0),
      potions: Math.min(MAX_POTIONS, Math.max(START_POTIONS, Number(saved.potions) || START_POTIONS)),
    };
  } catch {
    return { gold: 0, potions: START_POTIONS };
  }
}

export default function MarketDungeon(props: {
  directJudgeEntry?: boolean;
  judgeProfileId?: JudgeNetworkProfileId;
}) {
  return props.directJudgeEntry ? <LegacyMarketDungeon {...props} /> : <FullExpedition />;
}

function LegacyMarketDungeon({
  directJudgeEntry = false,
  judgeProfileId = 'somnia-mainnet',
}: {
  directJudgeEntry?: boolean;
  judgeProfileId?: JudgeNetworkProfileId;
}) {
  const router = useRouter();
  const { playCharacterIntro, playOutcome } = useGameAudio();
  const judgeProfile = judgeNetworkProfile(judgeProfileId);
  const shannonJudge = judgeProfile.id === 'shannon-testnet';
  const judgeChallengeUrl = `${MARKET_DUNGEON_PLAY_URL}${judgeProfile.judgePath}?challenge=1`;
  const [market, setMarket] = useState<Market>(() => directJudgeEntry ? sealedReplay : fallback);
  const [marketOdds, setMarketOdds] = useState<DreamDexClobOdds | null>(null);
  const [direction, setDirection] = useState<Direction>('UP');
  const [phase, setPhase] = useState<Phase>(() => directJudgeEntry ? 'JUDGE_SETUP' : 'SETUP');
  const [tier, setTier] = useState(1);
  const [roster, setRoster] = useState<Monster[]>(() => buildRoster());
  const [room, setRoom] = useState(0);
  const [turn, setTurn] = useState(0);
  const [hp, setHp] = useState(100);
  const [monsterHp, setMonsterHp] = useState(roster[0].hp);
  const [potions, setPotions] = useState(START_POTIONS);
  const [gold, setGold] = useState(0);
  const [weapon, setWeapon] = useState(1);
  const [armor, setArmor] = useState(0);
  const [combatPotionUses, setCombatPotionUses] = useState(0);
  const [lastExchange, setLastExchange] = useState<{ dealt: number; taken: number; critical?: boolean; rolledDamage?: number; quip?: string } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [marketEntryRemaining, setMarketEntryRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState(directJudgeEntry
    ? 'JUDGE DEMO · CHOOSE OMEN BEFORE MARKET SELECTION'
    : 'LIVE DREAMDEX MARKET · READ ONLY');
  const [combatLog, setCombatLog] = useState<string[]>(() => directJudgeEntry
    ? ['Choose BTC UP or DOWN first. The server will then draw a random finalized market and return an encrypted seal, commitment, and signed lock receipt.']
    : []);
  const [lastReward, setLastReward] = useState('');
  const [oracleBusy, setOracleBusy] = useState(false);
  const [oracleChecks, setOracleChecks] = useState(0);
  const [oracleResult, setOracleResult] = useState<OracleResult>(null);
  const [bandageUsed, setBandageUsed] = useState(false);
  const [merchantPotions, setMerchantPotions] = useState(2);
  const [weaponSold, setWeaponSold] = useState(false);
  const [armorSold, setArmorSold] = useState(false);
  const [judgeMode, setJudgeMode] = useState(directJudgeEntry);
  const [judgeLoading, setJudgeLoading] = useState(false);
  const [deathCause, setDeathCause] = useState<DeathCause>('COMBAT');
  const [profileReady, setProfileReady] = useState(false);
  const [mobileLogOpen, setMobileLogOpen] = useState(false);
  const [judgeActionLog, setJudgeActionLog] = useState<JudgeCombatAction[]>([]);
  const [liveBtcContext, setLiveBtcContext] = useState<LiveBtcContext | null>(null);
  const [liveBtcContextLoaded, setLiveBtcContextLoaded] = useState(false);
  const [proofStatus, setProofStatus] = useState('');
  const [challengeEntry, setChallengeEntry] = useState(false);
  const [replayRevealRemaining, setReplayRevealRemaining] = useReplayCountdown();
  const [judgeStartRetryRemaining, setJudgeStartRetryRemaining] = useReplayCountdown();
  const [replayRetryRemaining, setReplayRetryRemaining] = useReplayCountdown();
  const [judgeStartIssue, setJudgeStartIssue] = useState<ReplayStartIssue | null>(null);
  const [replayIssue, setReplayIssue] = useState<'rate_limited' | 'upstream_retry' | 'config_unavailable' | 'connection' | null>(null);
  const judgeStartBusyRef = useRef(false);
  const judgeStartControllerRef = useRef<AbortController | null>(null);
  const judgeRevealControllerRef = useRef<AbortController | null>(null);
  const oracleBusyRef = useRef(false);
  const desktopJourneyRef = useRef<HTMLDivElement>(null);
  const judgeRunStartedAtRef = useRef<number | null>(null);
  const judgeRevealAttemptTrackedRef = useRef(false);
  const judgeTerminalTrackedRef = useRef(false);
  const dreamDexCtaTrackedRef = useRef(false);
  const judgeEntryTrackedRef = useRef(false);
  const challengeCreatedTrackedRef = useRef(false);
  const challengeOpenedTrackedRef = useRef(false);
  const challengeVerifiedTrackedRef = useRef(false);
  const shareEngagedTrackedRef = useRef(false);
  const shareActionsTrackedRef = useRef<Set<ShareAction>>(new Set());

  useEffect(() => () => {
    judgeStartControllerRef.current?.abort();
    judgeRevealControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!directJudgeEntry || judgeEntryTrackedRef.current) return;
    const timer = window.setTimeout(() => {
      const challenge = isChallengeEntry(window.location.search);
      judgeEntryTrackedRef.current = true;
      setChallengeEntry(challenge);
      emitAnalyticsEvent(judgeDemoEntryEvent(challenge ? 'challenge' : 'direct'));
      if (challenge && !challengeOpenedTrackedRef.current) {
        challengeOpenedTrackedRef.current = true;
        emitAnalyticsEvent(challengeOpenedEvent());
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [directJudgeEntry]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const profile = readProfile();
      setGold(profile.gold); setPotions(profile.potions); setProfileReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (judgeMode && phase !== 'COMBAT' && window.matchMedia('(min-width: 801px)').matches) {
      const frame = requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (phase !== 'JUDGE_SETUP') desktopJourneyRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    if (phase !== 'VICTORY' && phase !== 'DEAD') return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector('.result-view')?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase, judgeMode]);

  useEffect(() => {
    if (!profileReady || judgeMode) return;
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify({
      gold: Math.max(0, gold),
      potions: Math.min(MAX_POTIONS, Math.max(START_POTIONS, potions)),
    }));
  }, [gold, potions, judgeMode, profileReady]);

  useEffect(() => {
    if (!['SETUP', 'TIER_SETUP'].includes(phase)) return;
    let cancelled = false;
    let refresh: number | undefined;
    let latestExpiry: unknown;
    const load = async () => {
      let nextExpiry: unknown;
      try {
        const response = await fetch('/api/market');
        const data = await response.json();
        nextExpiry = data.market?.expiry;
        if (nextExpiry !== undefined && nextExpiry !== null) latestExpiry = nextExpiry;
        if (!cancelled && data.market) {
          setMarket(data.market);
          setMarketOdds(data.odds?.marketId?.toLowerCase() === data.market.marketId?.toLowerCase() ? data.odds : null);
          setLiveBtcContext(liveBtcContextFromMarket(data.market));
        }
        else if (!cancelled) setNotice('DREAMDEX FEED RETRYING · NO ACTION REQUIRED');
      } catch {
        if (!cancelled) setNotice('DREAMDEX FEED RETRYING · NO ACTION REQUIRED');
      } finally {
        if (!cancelled) {
          refresh = window.setTimeout(
            () => { void load(); },
            activeMarketRefreshDelayMs(nextExpiry ?? latestExpiry, Date.now()),
          );
        }
      }
    };
    void load();
    return () => { cancelled = true; if (refresh !== undefined) window.clearTimeout(refresh); };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'JUDGE_SETUP') return;
    if (shannonJudge) return;
    let cancelled = false;
    const load = () => fetch('/api/market').then((response) => response.json()).then((data) => {
      if (!cancelled && data.market) {
        setLiveBtcContext(liveBtcContextFromMarket(data.market));
        setMarketOdds(data.odds?.marketId?.toLowerCase() === data.market.marketId?.toLowerCase() ? data.odds : null);
      }
    }).catch(() => undefined).finally(() => {
      if (!cancelled) setLiveBtcContextLoaded(true);
    });
    void load();
    const refresh = window.setInterval(() => { void load(); }, 15000);
    return () => { cancelled = true; window.clearInterval(refresh); };
  }, [phase, shannonJudge]);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Number(market.expiry) - Math.floor(Date.now() / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [market.expiry]);

  useEffect(() => {
    if (!judgeMode || !market.replayRevealAfter) return;
    setReplayRevealRemaining(secondsUntilReplayReveal(market.replayRevealAfter));
  }, [judgeMode, market.replayRevealAfter, setReplayRevealRemaining]);

  useEffect(() => {
    if (phase === 'MERCHANT' || phase === 'FINAL_MERCHANT') {
      playCharacterIntro('Quartermaster Kevin');
    }
  }, [phase, playCharacterIntro]);

  const monster = roster[room] ?? roster[0];
  const isBoss = room === TOTAL_ROOMS - 1;
  const currentRoomCleared = ['CLEARED', 'MERCHANT', 'FINAL_MERCHANT', 'ORACLE', 'TIER_SETUP', 'VICTORY'].includes(phase) || (phase === 'DEAD' && monsterHp === 0);
  const roomsCleared = phase === 'SETUP' ? 0 : room + (currentRoomCleared ? 1 : 0);
  const replaySealed = judgeMode && !market.replayProof;
  const marketCode = replaySealed
    ? market.replayCommitment?.slice(2, 10).toUpperCase() ?? 'SEALED'
    : market.marketId.slice(-4).toUpperCase();
  const marketIntervalSeconds = eventContractIntervalSeconds(market.intervalSec);
  const marketIntervalLabel = eventContractIntervalLabel(marketIntervalSeconds);
  const marketIntervalName = eventContractIntervalName(marketIntervalSeconds);
  const combatSeed = judgeMode ? market.replayGameSeed ?? 'judge-replay-awaiting-lock' : market.marketId;
  const monsterPercent = Math.max(0, Math.min(100, (monsterHp / monster.hp) * 100));
  const playerPercent = Math.max(0, Math.min(100, hp));
  const attackMin = 7 + weapon * 2;
  const attackMax = 11 + weapon * 2;
  const stormMax = 20 + weapon * 3;
  const combatPotionLimit = isBoss ? 3 : 2;
  const finalHealCost = Math.ceil((100 - hp) / 25) * 8;
  const marketReady = market.status !== 'CONNECTING' && market.marketId !== fallback.marketId && remaining > 0;
  const startIssueTitle = judgeStartIssue === 'rate_limited' ? 'Please give the dungeon a moment.'
    : judgeStartIssue === 'config_unavailable' ? 'The replay service needs attention.'
    : judgeStartIssue === 'no_candidates' ? 'No eligible replay is available yet.'
    : judgeStartIssue === 'invalid_lock' ? 'The lock receipt could not be verified.'
    : judgeStartIssue === 'connection' ? 'The replay connection was interrupted.'
    : 'The replay service is temporarily unavailable.';
  const displayedNotice = phase === 'JUDGE_SETUP' && judgeStartIssue && !judgeLoading
    ? judgeStartRetryRemaining > 0
      ? `${startIssueTitle} Retry in ${judgeStartRetryRemaining}s.`
      : `${startIssueTitle} You can try locking again.`
    : phase === 'ORACLE' && judgeMode && market.replayRevealAfter && !oracleBusy
    ? replayRevealRemaining > 0
      ? `REPLAY SEAL HOLDING · ${replayRevealRemaining}S`
      : replayRetryRemaining > 0
        ? `REPLAY SERVICE BACKOFF · RETRY IN ${replayRetryRemaining}S`
        : replayIssue ? 'VERIFICATION PAUSED · YOUR COMPLETED COMBAT IS SAVED' : 'REPLAY SEAL OPEN · READY TO VERIFY'
    : notice;
  const expiryLabel = useMemo(() => replaySealed ? 'IDENTITY SEALED' : gateTime(market.expiryIso), [market.expiryIso, replaySealed]);
  const omenName = direction === 'UP' ? 'GOLD AWAKENS' : 'SHADOWS RISE';
  const omenIcon = direction === 'UP' ? <GoldIcon /> : '🌑';
  const judgeStep = phase === 'JUDGE_SETUP'
    ? 1
    : phase === 'DEAD' && deathCause === 'COMBAT'
      ? isBoss ? 3 : 2
    : room === TOTAL_ROOMS - 2 && phase === 'COMBAT'
      ? 2
      : room === TOTAL_ROOMS - 1 && phase === 'COMBAT'
        ? 3
        : phase === 'FINAL_MERCHANT'
          ? 4
          : ['ORACLE', 'VICTORY', 'DEAD'].includes(phase)
            ? 5
            : 3;

  const subtitle = phase === 'SETUP'
    ? MARKET_DUNGEON_SLOGAN
    : phase === 'JUDGE_SETUP'
      ? 'Beat the guard and boss. Only a correct locked BTC prediction keeps the boss down.'
    : phase === 'TIER_SETUP'
      ? `Tier ${tier} cleared. Choose a fresh prediction for Tier ${tier + 1}.`
    : phase === 'MERCHANT'
      ? 'Quartermaster Kevin has found you. Regrettably.'
      : phase === 'FINAL_MERCHANT'
        ? 'One last stop before the prediction verdict.'
      : phase === 'ORACLE'
        ? 'The boss is down. The prediction decides who gets back up.'
        : phase === 'VICTORY'
          ? 'Expedition complete.'
          : `Room ${room + 1} of ${TOTAL_ROOMS} · ${monster.species} · ${omenName} · BTC ${direction}`;

  function addLog(message: string) {
    setCombatLog((previous) => [message, ...previous].slice(0, 10));
  }

  function recordJudgeAction(action: Action, actionRoom = room) {
    if (!judgeMode) return true;
    if ((actionRoom !== JUDGE_COMBAT.guard.room && actionRoom !== JUDGE_COMBAT.boss.room)
      || judgeActionLog.length >= JUDGE_COMBAT.maxSteps) {
      setNotice('COMBAT LOG LIMIT REACHED · START A NEW JUDGE DEMO');
      return false;
    }
    setJudgeActionLog((previous) => [...previous, { room: actionRoom, action }]);
    return true;
  }

  function resetShareAnalytics() {
    shareEngagedTrackedRef.current = false;
    shareActionsTrackedRef.current = new Set();
    challengeCreatedTrackedRef.current = false;
  }

  function startRun() {
    if (!marketReady) return;
    dreamDexCtaTrackedRef.current = false;
    resetShareAnalytics();
    const nextRoster = buildRoster();
    setRoster(nextRoster); setTier(1); setRoom(0); setTurn(0); setPhase('COMBAT');
    setHp(100); setMonsterHp(nextRoster[0].hp); setPotions((value) => Math.min(MAX_POTIONS, Math.max(START_POTIONS, value))); setWeapon(1); setArmor(0);
    setCombatPotionUses(0); setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
    setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false; setLastReward('');
    setJudgeMode(false); setDeathCause('COMBAT');
    setJudgeActionLog([]); setProofStatus('');
    setMarketEntryRemaining(remaining);
    setCombatLog([`${omenName} recorded: BTC ${direction} against live dreamDEX market #${market.marketId.slice(-4).toUpperCase()}. No order was sent.`]);
    setNotice(`${omenName} · DELVEWORN RUN STARTED`);
  }

  function startJudgeDemo() {
    if (judgeLoading) return;
    judgeRunStartedAtRef.current = null;
    judgeRevealAttemptTrackedRef.current = false;
    judgeTerminalTrackedRef.current = false;
    dreamDexCtaTrackedRef.current = false;
    challengeVerifiedTrackedRef.current = false;
    resetShareAnalytics();
    emitAnalyticsEvent(judgeDemoEntryEvent('home'));
    setMarket(sealedReplay); setPhase('JUDGE_SETUP'); setJudgeMode(true); setDeathCause('COMBAT');
    setJudgeActionLog([]); setProofStatus('');
    setReplayRevealRemaining(0);
    setJudgeStartRetryRemaining(0); setReplayRetryRemaining(0);
    setJudgeStartIssue(null);
    setReplayIssue(null);
    setMarketEntryRemaining(null);
    setCombatLog(['Choose BTC UP or DOWN first. The server will then draw a random finalized market and return an encrypted seal, commitment, and signed lock receipt.']);
    setNotice('JUDGE DEMO · CHOOSE OMEN BEFORE MARKET SELECTION');
  }

  async function startJudgeReplay() {
    if (phase !== 'JUDGE_SETUP' || !market.demoReplay || judgeStartBusyRef.current || judgeStartRetryRemaining > 0) return;
    judgeStartBusyRef.current = true;
    const controller = new AbortController();
    judgeStartControllerRef.current = controller;
    let failure: ReplayStartIssue = 'connection';
    setJudgeStartIssue(null);
    setJudgeLoading(true); setNotice('LOCKING OMEN · DRAWING SEALED REPLAY…');
    try {
      const response = await fetch(`${judgeProfile.apiPath}/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ direction }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      const data = await response.json().catch(() => null);
      if ([429, 503].includes(response.status)) {
        const issue = response.status === 429 ? 'rate_limited'
          : data?.retryState === 'config_unavailable' ? 'config_unavailable'
          : data?.retryState === 'no_candidates' ? 'no_candidates' : 'upstream_retry';
        const retryAfter = issue === 'config_unavailable' ? 0 : replayRetrySeconds(data?.retryAfter, response.headers.get('retry-after'));
        setJudgeStartIssue(issue);
        setJudgeStartRetryRemaining(retryAfter);
        setCombatLog(['Your omen is not locked. You can keep your choice and retry here when the replay service is ready.']);
        return;
      }
      if (!response.ok) throw new Error('Replay unavailable');
      failure = 'invalid_lock';
      if (!data?.replay) throw new Error('Invalid replay response');
      const replay = data.replay as {
        seal: string; commitment: string; gameSeed: string; lockedDirection: Direction;
        issuedAt: number; revealAfter: number; expiresAt: number;
        lockAttestation: unknown;
        publicMarket: { intervalSec: number; network: string; chainId: number; profileId?: string };
      };
      const replayIntervalSec = Number(replay.publicMarket?.intervalSec);
      if (typeof replay.seal !== 'string'
        || !(shannonJudge
          ? /^v3\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43,4000}\.[A-Za-z0-9_-]{22}$/.test(replay.seal)
          : /^v2\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43,4000}\.[A-Za-z0-9_-]{22}$/.test(replay.seal))
        || !/^0x[0-9a-f]{64}$/i.test(replay.commitment)
        || typeof replay.gameSeed !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(replay.gameSeed)
        || replay.lockedDirection !== direction
        || (replayIntervalSec !== 300 && replayIntervalSec !== 900)
        || !Number.isSafeInteger(replay.issuedAt) || replay.issuedAt <= 0
        || !Number.isSafeInteger(replay.revealAfter) || replay.revealAfter <= 0
        || !Number.isSafeInteger(replay.expiresAt)
        || replay.issuedAt >= replay.revealAfter || replay.revealAfter >= replay.expiresAt
        || replay.publicMarket.network !== judgeProfile.name
        || replay.publicMarket.chainId !== judgeProfile.chainId
        || (shannonJudge ? replay.publicMarket.profileId !== judgeProfile.id : replay.publicMarket.profileId !== undefined)
        || !isReplayLockAttestation(replay.lockAttestation)
        || !replayLockAttestationMatchesProof(replay.lockAttestation, {
          commitment: replay.commitment,
          lockedDirection: replay.lockedDirection,
          issuedAt: replay.issuedAt,
          revealAfter: replay.revealAfter,
          expiresAt: replay.expiresAt,
          ...(shannonJudge ? { profileId: judgeProfile.id, chainId: judgeProfile.chainId } : {}),
        })) {
        throw new Error('Invalid replay response');
      }
      failure = 'connection';
      const keyResponse = await fetch(shannonJudge ? `${judgeProfile.apiPath}/public-key` : REPLAY_LOCK_PUBLIC_KEY_ENDPOINT, {
        method: 'GET',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]),
      });
      if (!keyResponse.ok) throw new Error('Replay verification key unavailable');
      const trustedKey = await keyResponse.json();
      failure = 'invalid_lock';
      if (!isReplayLockPublicKey(trustedKey)
        || !await verifyReplayLockAttestation(replay.lockAttestation, trustedKey)) {
        throw new Error('Invalid replay lock attestation');
      }
      if (controller.signal.aborted) return;
      const acceptedIntervalSec = eventContractIntervalSeconds(replayIntervalSec);
      judgeRunStartedAtRef.current = window.performance.now();
      judgeRevealAttemptTrackedRef.current = false;
      judgeTerminalTrackedRef.current = false;
      challengeVerifiedTrackedRef.current = false;
      dreamDexCtaTrackedRef.current = false;
      resetShareAnalytics();
      emitAnalyticsEvent(judgeDemoLockedEvent(acceptedIntervalSec));
      const nextRoster = buildRoster((TOTAL_TIERS - 1) * TOTAL_ROOMS + 1);
      const guardRoom = TOTAL_ROOMS - 2;
      setMarket({
        ...sealedReplay,
        marketId: `sealed:${replay.commitment}`,
        status: 'OMEN LOCKED',
        intervalSec: acceptedIntervalSec,
        replaySeal: replay.seal,
        replayCommitment: replay.commitment,
        replayGameSeed: replay.gameSeed,
        replayLockedDirection: replay.lockedDirection,
        replayRevealAfter: replay.revealAfter,
        replayExpiresAt: replay.expiresAt,
        replayLockAttestation: replay.lockAttestation,
        replayLockPublicKey: trustedKey,
        network: replay.publicMarket.network,
        chainId: replay.publicMarket.chainId,
        profileId: shannonJudge ? judgeProfile.id : undefined,
      });
      setReplayRevealRemaining(secondsUntilReplayReveal(replay.revealAfter));
      setJudgeStartRetryRemaining(0); setReplayRetryRemaining(0);
      setReplayIssue(null);
      setDirection(replay.lockedDirection);
      nextRoster[guardRoom] = { ...nextRoster[guardRoom], hp: JUDGE_COMBAT.guard.hp, minDamage: JUDGE_COMBAT.guard.minDamage, maxDamage: JUDGE_COMBAT.guard.maxDamage };
      nextRoster[TOTAL_ROOMS - 1] = { ...nextRoster[TOTAL_ROOMS - 1], hp: JUDGE_COMBAT.boss.hp, minDamage: JUDGE_COMBAT.boss.minDamage, maxDamage: JUDGE_COMBAT.boss.maxDamage };
      setRoster(nextRoster); setTier(TOTAL_TIERS); setRoom(guardRoom); setTurn(0); setPhase('COMBAT');
      setHp(JUDGE_COMBAT.player.hp); setMonsterHp(JUDGE_COMBAT.guard.hp);
      setPotions(JUDGE_COMBAT.player.potions); setGold(62); setWeapon(JUDGE_COMBAT.player.weapon); setArmor(JUDGE_COMBAT.player.armor);
      setCombatPotionUses(0); setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
      setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false; setLastReward('');
      setJudgeActionLog([]); setProofStatus('');
      setCombatLog([`${omenName} locked before market selection. Commitment ${replay.commitment.slice(0, 14)}… binds the encrypted replay; combat uses an independent seed.`]);
      setNotice(`JUDGE DEMO · ${omenName} LOCKED · DEFEAT THE GUARD`);
    } catch {
      if (controller.signal.aborted) return;
      setJudgeStartIssue(failure);
      setJudgeStartRetryRemaining(3);
      setNotice('SEALED REPLAY UNAVAILABLE · YOUR OMEN WAS NOT LOCKED');
      setCombatLog(['Your omen is not locked. No combat has started. Keep your choice and try locking again.']);
    } finally {
      judgeStartBusyRef.current = false;
      judgeStartControllerRef.current = null;
      setJudgeLoading(false);
    }
  }

  function incomingDamage(action: Action, nextTurn: number) {
    const spread = monster.maxDamage - monster.minDamage + 1;
    const raw = monster.minDamage + Math.floor(seededRoll(`${combatSeed}:${room}:${nextTurn}:${action}:enemy`) * spread);
    return Math.max(1, raw - armor);
  }

  function awardRoomLoot() {
    let reward = `${monster.reward} gold`;
    setGold((value) => value + monster.reward);
    if ((room + 1) % 3 === 0 && room < 8) {
      setWeapon((value) => value + 1); reward += ' · ⚔️ weapon +1';
    } else if ((room + 1) % 2 === 0) {
      setPotions((value) => Math.min(MAX_POTIONS, value + 1)); reward += ' · 🧪 potion found';
    }
    setLastReward(reward);
    return reward;
  }

  function act(action: Action) {
    if (phase !== 'COMBAT') return;

    if (action === 'potion') {
      if (potions === 0 || hp >= 100 || combatPotionUses >= combatPotionLimit) return;
      if (!recordJudgeAction(action)) return;
      const nextTurn = turn + 1;
      setTurn(nextTurn);
      const healed = Math.min(25, 100 - hp);
      const incoming = incomingDamage(action, nextTurn);
      const nextHp = Math.max(0, hp + healed - incoming);
      setPotions((value) => value - 1); setCombatPotionUses((value) => value + 1); setHp(nextHp);
      setLastExchange({ dealt: 0, taken: incoming });
      addLog(`Potion restores ${healed} HP. ${monster.name} retaliates for ${incoming}.`);
      if (nextHp === 0) { setPhase('DEAD'); setNotice('EXPEDITION TERMINATED'); }
      return;
    }

    if (!recordJudgeAction(action)) return;
    const nextTurn = turn + 1;
    setTurn(nextTurn);
    const roll = seededRoll(`${combatSeed}:${room}:${nextTurn}:${action}:player`);
    const crit = action === 'attack' && seededRoll(`${combatSeed}:${room}:${nextTurn}:crit`) < 0.15;
    const base = action === 'attack' ? attackMin + Math.floor(roll * (attackMax - attackMin + 1)) : Math.floor(roll * (stormMax + 1));
    const damage = crit ? base * 2 : base;
    const nextMonsterHp = Math.max(0, monsterHp - damage);
    setMonsterHp(nextMonsterHp);

    if (nextMonsterHp === 0) {
      setLastExchange({ dealt: Math.min(damage, monsterHp), taken: 0, critical: crit, rolledDamage: damage });
      if (isBoss) {
        const reward = `${monster.reward} gold pending`; setLastReward(reward);
        setPhase('ORACLE'); setNotice(remaining > 0 ? 'BOSS DEFEATED · ORACLE ARMED' : 'BOSS DEFEATED · CHECKING SETTLEMENT');
        addLog(`${monster.name} is down. The ${monster.reward} gold boss reward unlocks only if the BTC prediction is correct.`);
      } else {
        const reward = awardRoomLoot();
        if (room === 4) {
        setPhase('MERCHANT'); setNotice('ROOM 5 CLEARED · TRAVELLING MERCHANT');
        addLog(`${monster.name} defeated. ${reward}. Quartermaster Kevin smells disposable income.`);
        } else {
          setPhase('CLEARED'); setNotice(`ROOM ${room + 1} CLEARED · HEAL OR CONTINUE`);
          addLog(`${monster.name} defeated. ${reward}.`);
        }
      }
      const persona = getDelvewornPersona(monster.species === 'Boss' ? 3 : monster.species === 'Orc' ? 2 : monster.species === 'Goblin' ? 1 : 0, monster.room);
      addLog(persona.killLines[nextTurn % persona.killLines.length]);
      return;
    }

    const incoming = incomingDamage(action, nextTurn);
    const nextHp = Math.max(0, hp - incoming);
    const monsterType = monster.species === 'Boss' ? 3 : monster.species === 'Orc' ? 2 : monster.species === 'Goblin' ? 1 : 0;
    const persona = getDelvewornPersona(monsterType, monster.room);
    const quip = persona.hitLines[(monster.room + damage + (action === 'storm' ? 0 : incoming)) % persona.hitLines.length];
    setLastExchange({ dealt: Math.min(damage, monsterHp), taken: incoming, critical: crit, rolledDamage: damage, quip });
    setHp(nextHp);
    const lines = action === 'storm'
      ? stormLogs(monsterType, monster.room, damage, stormMax, incoming)
      : attackLogs(monsterType, monster.room, damage, incoming, crit);
    // Cosmetic text only: never consume combat RNG or alter the proof transcript.
    addLog(lines.join(' '));
    if (nextHp === 0) { setPhase('DEAD'); setNotice('EXPEDITION TERMINATED'); }
  }

  function useBetweenRoomPotion() {
    if (!['CLEARED', 'MERCHANT', 'FINAL_MERCHANT'].includes(phase) || potions === 0 || hp >= 100) return;
    if (judgeMode && phase === 'CLEARED' && !recordJudgeAction('potion')) return;
    const healed = Math.min(25, 100 - hp);
    setPotions((value) => value - 1); setHp((value) => Math.min(100, value + 25));
    addLog(`You use a potion safely between rooms. +${healed} HP. No retaliation.`);
  }

  function merchantBuy(kind: 'bandage' | 'potion' | 'weapon' | 'armor') {
    if (phase !== 'MERCHANT') return;
    if (kind === 'bandage' && !bandageUsed && hp < 100 && gold >= 8) {
      const healed = Math.min(25, 100 - hp);
      setGold((value) => value - 8); setHp((value) => Math.min(100, value + 25)); setBandageUsed(true);
      addLog(`Kevin applies something he calls a bandage. +${healed} HP · 8 gold.`);
    } else if (kind === 'potion' && merchantPotions > 0 && potions < MAX_POTIONS && gold >= 7) {
      setGold((value) => value - 7); setPotions((value) => value + 1); setMerchantPotions((value) => value - 1);
      addLog('Kevin sells you a suspicious potion. +1 potion · 7 gold.');
    } else if (kind === 'weapon' && !weaponSold && gold >= 15) {
      setGold((value) => value - 15); setWeapon((value) => value + 1); setWeaponSold(true);
      addLog('Kevin upgrades your weapon. The warranty is verbal. · 15 gold.');
    } else if (kind === 'armor' && !armorSold && gold >= 15) {
      setGold((value) => value - 15); setArmor((value) => value + 1); setArmorSold(true);
      addLog('Kevin adds armor plating. It belonged to someone else. · 15 gold.');
    }
  }

  function visitFinalMerchant() {
    if (phase !== 'ORACLE' || oracleBusyRef.current) return;
    setPhase('FINAL_MERCHANT');
    setNotice('BOSS DEFEATED · TRAVELLING MERCHANT AVAILABLE');
    addLog('Quartermaster Kevin appears beside the fallen boss before the prediction verdict. This is probably not a coincidence.');
  }

  function finalMerchantHeal(full = false) {
    if (phase !== 'FINAL_MERCHANT' || hp >= 100) return;
    if (judgeMode) {
      setHp(100);
      addLog('Kevin offers a free rest. Health restored; your gold, potions and locked market result are unchanged.');
      return;
    }
    const cost = full ? finalHealCost : 8;
    if (gold < cost) return;
    const healed = full ? 100 - hp : Math.min(25, 100 - hp);
    setGold((value) => value - cost);
    setHp((value) => Math.min(100, value + healed));
    addLog(`Kevin patches the post-boss damage. +${healed} HP · ${cost} gold.`);
  }

  function returnToBossFate() {
    if (phase !== 'FINAL_MERCHANT') return;
    setPhase('ORACLE');
    setNotice(remaining > 0 ? 'BOSS FATE READY · ORACLE ARMED' : 'BOSS FATE READY · CHECKING SETTLEMENT');
    addLog('You leave Kevin behind and return to the fallen boss. The prediction will decide who stays down.');
  }

  function nextRoom() {
    if (!['CLEARED', 'MERCHANT'].includes(phase)) return;
    const next = room + 1;
    const nextMonsterHp = judgeMode && next === TOTAL_ROOMS - 1 ? Math.min(JUDGE_COMBAT.boss.hp, roster[next].hp) : roster[next].hp;
    setRoom(next); setTurn(0); setMonsterHp(nextMonsterHp); setCombatPotionUses(0); setPhase('COMBAT');
    setNotice(next === TOTAL_ROOMS - 1 ? 'ROOM 10 · DUNGEON MANAGEMENT' : `ROOM ${next + 1} · ${roster[next].species.toUpperCase()}`);
    addLog(`The gate opens. ${roster[next].name} is regrettably employed here.`);
  }

  function startNextTier() {
    if (phase !== 'TIER_SETUP' || tier >= TOTAL_TIERS || !marketReady) return;
    const nextTier = tier + 1;
    const nextRoster = buildRoster((nextTier - 1) * TOTAL_ROOMS + 1);
    setTier(nextTier); setRoster(nextRoster); setRoom(0); setTurn(0); setMonsterHp(nextRoster[0].hp); setPhase('COMBAT');
    setCombatPotionUses(0); setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
    setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false; setLastReward('');
    setMarketEntryRemaining(remaining);
    setCombatLog([`Tier ${nextTier} prediction recorded: BTC ${direction} on dreamDEX market #${market.marketId.slice(-4).toUpperCase()}.`, ...combatLog].slice(0, 10));
    setNotice(`TIER ${nextTier} · NEW PREDICTION LOCKED · ${omenName}`);
  }

  function trackJudgeCompletion(
    resolvedDirection: Direction,
    result: JudgeDemoResult,
    intervalSec: unknown,
  ) {
    if (!judgeMode || judgeTerminalTrackedRef.current) return;
    judgeTerminalTrackedRef.current = true;
    const elapsedMs = judgeRunStartedAtRef.current === null
      ? undefined
      : window.performance.now() - judgeRunStartedAtRef.current;
    emitAnalyticsEvent(judgeDemoVerifiedEvent(resolvedDirection, result, intervalSec, elapsedMs));
    if (challengeEntry && !challengeVerifiedTrackedRef.current) {
      challengeVerifiedTrackedRef.current = true;
      emitAnalyticsEvent(challengeVerifiedEvent());
    }
  }

  function trackJudgeFailure(reason: 'server-rejected' | 'browser-mismatch') {
    if (!judgeMode || judgeTerminalTrackedRef.current) return;
    judgeTerminalTrackedRef.current = true;
    emitAnalyticsEvent(judgeDemoVerificationFailedEvent(reason));
  }

  function trackJudgeNotProvable(reason: 'seal-expired') {
    if (!judgeMode || judgeTerminalTrackedRef.current) return;
    judgeTerminalTrackedRef.current = true;
    emitAnalyticsEvent(judgeDemoVerificationNotProvableEvent(reason));
  }

  async function checkSettlement(automatic = false) {
    if (oracleBusyRef.current || phase !== 'ORACLE' || (judgeMode && (replayRevealRemaining > 0 || replayRetryRemaining > 0))) return;
    const controller = new AbortController();
    judgeRevealControllerRef.current = controller;
    oracleBusyRef.current = true; setOracleBusy(true); setOracleChecks((value) => value + 1);
    setReplayIssue(null);
    setNotice(automatic ? 'ORACLE AUTO-CHECK IN PROGRESS…' : 'CHECKING DREAMDEX SETTLEMENT…');
    try {
      if (judgeMode && !judgeRevealAttemptTrackedRef.current) {
        judgeRevealAttemptTrackedRef.current = true;
        emitAnalyticsEvent(judgeDemoRevealAttemptedEvent(market.intervalSec));
      }
      const response = judgeMode
        ? await fetch(`${judgeProfile.apiPath}/reveal`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ seal: market.replaySeal, actions: judgeActionLog }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
          })
        : await fetch(`/api/market?marketId=${market.marketId}`, { signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 425) {
          const retryAfter = replayRetrySeconds(data?.retryAfter, response.headers.get('retry-after'));
          setReplayRevealRemaining(retryAfter);
          setNotice(`REPLAY SEAL HOLDING · ${retryAfter}S`);
          addLog('The server is enforcing its short anti-peek hold. Your direction remains cryptographically locked.');
          return;
        }
        if (judgeMode && [429, 503].includes(response.status)) {
          const issue = response.status === 429 ? 'rate_limited' : data?.retryState === 'config_unavailable' ? 'config_unavailable' : 'upstream_retry';
          setReplayIssue(issue);
          const retryAfter = issue === 'config_unavailable' ? 0 : replayRetrySeconds(data?.retryAfter, response.headers.get('retry-after'));
          setReplayRetryRemaining(retryAfter);
          setNotice(response.status === 429
            ? `REPLAY REVEAL RATE-LIMITED · RETRY IN ${retryAfter}S`
            : `SOMNIA READ TEMPORARILY BUSY · RETRY IN ${retryAfter}S`);
          addLog(issue === 'config_unavailable'
            ? 'The replay service is not configured. Your sealed replay and completed combat remain intact; retry when the service is ready.'
            : response.status === 429
            ? 'The reveal rate guard paused repeated requests. Your sealed replay and completed combat remain intact.'
            : 'Somnia RPC did not answer within its bounded read window. Your sealed replay remains intact and no outcome was applied.');
          return;
        }
        if (judgeMode && [400, 409, 410, 422].includes(response.status)) {
          if (response.status === 410) trackJudgeNotProvable('seal-expired');
          else trackJudgeFailure('server-rejected');
          setReplayRetryRemaining(0);
          setMarket(sealedReplay); setPhase('JUDGE_SETUP'); setOracleResult(null);
          setNotice(response.status === 410 ? 'REPLAY SEAL EXPIRED · LOCK A NEW OMEN' : 'REPLAY VERIFICATION FAILED · LOCK A NEW OMEN');
          setCombatLog([response.status === 410
            ? 'The encrypted replay expired. Choose and lock a fresh omen to start a new sealed replay.'
            : 'The sealed replay could not be verified, so no outcome was applied. Choose and lock a fresh omen.']);
          return;
        }
        throw new Error('Settlement unavailable');
      }
      if (!data?.market) throw new Error('Settlement unavailable');
      setReplayRetryRemaining(0);
      const result = data.market as Market;
      const terminalSettlement = isTerminalSettlementMarket(result);
      const onchainCandidate: unknown = data.onchainSettlement;
      const onchainSettlement = isStrictOnchainSettlementProof(onchainCandidate, judgeMode ? judgeProfile : SOMNIA_MAINNET_PROFILE) ? onchainCandidate : undefined;
      let localSettlementProofMatches = false;
      let resolvedDirection = direction;
      if (judgeMode) {
        if (result.voided || (result.winningOutcome !== 0 && result.winningOutcome !== 1)) {
          trackJudgeFailure('browser-mismatch');
          setReplayRetryRemaining(0);
          setMarket(sealedReplay); setPhase('JUDGE_SETUP'); setOracleResult(null);
          setNotice('REPLAY PROOF MISMATCH · LOCK A NEW OMEN');
          setCombatLog(['Judge Replay requires a finalized, non-void binary result. No outcome was applied; choose and lock a fresh omen.']);
          return;
        }
        const reconstructedCombat = market.replayGameSeed ? canonicalJudgeActionLog(market.replayGameSeed, judgeActionLog) : '';
        const replayCandidate: unknown = data.replayProof;
        const combatCandidate: unknown = data.combatProof;
        const revealAttestationCandidate: unknown = data.lockAttestation;
        const replayProof = isStrictReplayProof(replayCandidate, judgeProfile) ? replayCandidate : undefined;
        const combatProof = isStrictReplayCombatProof(combatCandidate, judgeActionLog, reconstructedCombat)
          ? combatCandidate
          : undefined;
        const reconstructedCanonical = replayProof ? canonicalReplayProof(replayProof) : '';
        const computedCommitment = reconstructedCanonical ? await sha256Hex(reconstructedCanonical) : '';
        const computedCombatDigest = reconstructedCombat ? await sha256Hex(reconstructedCombat) : '';
        const replayedCombat = market.replayGameSeed
          ? replayJudgeCombat(market.replayGameSeed, judgeActionLog)
          : null;
        try {
          localSettlementProofMatches = Boolean(onchainSettlement)
            && directSettlementProofMatchesMarket(onchainSettlement, result, judgeProfile);
        } catch {
          localSettlementProofMatches = false;
        }
        const attestationMatches = Boolean(replayProof)
          && isReplayLockAttestation(revealAttestationCandidate)
          && isReplayLockPublicKey(market.replayLockPublicKey)
          && sameReplayLockAttestation(market.replayLockAttestation, revealAttestationCandidate)
          && replayLockAttestationMatchesProof(revealAttestationCandidate, replayProof!)
          && await verifyReplayLockAttestation(revealAttestationCandidate, market.replayLockPublicKey);
        if (controller.signal.aborted) return;
        const proofMatches = terminalSettlement
          && replayProof?.verified === true
          && replayProof.algorithm === 'SHA-256'
          && combatProof?.verified === true
          && combatProof.ruleset === JUDGE_COMBAT_DOMAIN
          && replayedCombat?.verified === true
          && combatProof.guardDefeated === replayedCombat.guardDefeated
          && combatProof.bossDefeated === replayedCombat.bossDefeated
          && combatProof.playerSurvived === replayedCombat.playerSurvived
          && combatProof.finalHp === replayedCombat.finalHp
          && combatProof.steps === replayedCombat.steps
          && combatProof.transcriptDigest === computedCombatDigest
          && replayProof.canonical === reconstructedCanonical
          && computedCommitment === replayProof.commitment
          && replayProof.commitment === market.replayCommitment
          && replayProof.gameSeed === market.replayGameSeed
          && replayProof.lockedDirection === market.replayLockedDirection
          && replayProof.marketId.toLowerCase() === result.marketId.toLowerCase()
          && replayProof.committedOutcome === result.winningOutcome
          && replayMarketProvenanceMatches(replayProof, result as unknown as Record<string, unknown>)
          && attestationMatches
          && localSettlementProofMatches;
        if (!proofMatches) {
          trackJudgeFailure('browser-mismatch');
          setMarket(sealedReplay); setPhase('JUDGE_SETUP'); setOracleResult(null);
          setNotice('REPLAY PROOF MISMATCH · LOCK A NEW OMEN');
          setCombatLog(['The browser could not independently reproduce the Somnia block, raw settlement calls, combat digest, or commitment. No outcome was applied; start a fresh sealed replay.']);
          return;
        }
        resolvedDirection = replayProof.lockedDirection;
        setDirection(resolvedDirection);
      } else if (terminalSettlement) {
        try {
          localSettlementProofMatches = Boolean(onchainSettlement)
            && directSettlementProofMatchesMarket(onchainSettlement, result);
        } catch {
          localSettlementProofMatches = false;
        }
        if (!localSettlementProofMatches) throw new Error('Local Somnia settlement proof mismatch');
      }
      if (!terminalSettlement) {
        setNotice(remaining > 0 ? 'BOSS DOWN · AUTO-CHECK STARTS AT EXPIRY' : 'SETTLEMENT PENDING · NEXT CHECK IN 5S');
        if (!automatic) addLog('dreamDEX has not finalized yet. The boss remains down, but the tier is not cleared until the prediction resolves.');
        return;
      }
      const browserRpcProofOutcome = await directSettlementProofRpcOutcome(
        onchainSettlement,
        result,
        undefined,
        judgeMode ? judgeProfile : SOMNIA_MAINNET_PROFILE,
      );
      if (controller.signal.aborted) return;
      if (browserRpcProofOutcome.status === 'NOT PROVABLE') {
        setNotice(judgeMode
          ? 'REPLAY VERIFICATION UNAVAILABLE · RETRY REVEAL'
          : automatic ? 'SETTLEMENT PROOF RETRYING IN 5S' : 'SETTLEMENT PROOF UNAVAILABLE · AUTO-RETRY ARMED');
        if (judgeMode) {
          setReplayIssue('upstream_retry');
          setReplayRetryRemaining(3);
          addLog('Somnia RPC could not reproduce the proof during this attempt. Your sealed replay and completed combat remain intact; retry Reveal Boss Fate.');
        } else if (!automatic) {
          addLog('Somnia RPC could not reproduce the settlement during this attempt. No outcome was applied; automatic verification remains armed.');
        }
        return;
      }
      if (browserRpcProofOutcome.status !== 'PASS') {
        if (judgeMode) {
          trackJudgeFailure('browser-mismatch');
          setMarket(sealedReplay); setPhase('JUDGE_SETUP'); setOracleResult(null);
          setNotice('REPLAY PROOF MISMATCH · LOCK A NEW OMEN');
          setCombatLog(['The browser could not independently reproduce the canonical Somnia block or raw contract results. No outcome was applied; start a fresh sealed replay.']);
          return;
        }
        throw new Error('Independent Somnia RPC proof mismatch');
      }
      if (judgeMode) {
        setMarket((previous) => ({
          ...previous,
          ...result,
          replayProof: data.replayProof as ReplayProof,
          combatProof: data.combatProof as ReplayCombatProof,
          onchainSettlement,
        }));
      } else {
        setMarket((previous) => ({ ...previous, ...result, onchainSettlement }));
      }
      if (result.voided) {
        playOutcome('VOID');
        setOracleResult('VOID'); setGold((value) => value + monster.reward);
        setPhase(tier === TOTAL_TIERS ? 'VICTORY' : 'TIER_SETUP');
        setNotice('MARKET VOIDED · NO PREDICTION LOSS · BOSS REWARD PRESERVED');
        addLog(`The Event Contract was voided. The boss stays down and its ${monster.reward} gold base reward is preserved.`);
        return;
      }
      const resolvedOmenName = resolvedDirection === 'UP' ? 'GOLD AWAKENS' : 'SHADOWS RISE';
      const won = Number(result.winningOutcome) === (resolvedDirection === 'UP' ? 0 : 1);
      if (won) {
        playOutcome('BLESSED');
        trackJudgeCompletion(resolvedDirection, 'blessed', result.intervalSec);
        const reward = monster.reward;
        setOracleResult('BLESSED'); setGold((value) => value + reward);
        setPhase(judgeMode || tier === TOTAL_TIERS ? 'VICTORY' : 'TIER_SETUP');
        setNotice(judgeMode || tier === TOTAL_TIERS ? `FINAL BOSS DEFEATED · +${reward} GOLD` : `TIER ${tier} CLEARED · NEW BTC PREDICTION REQUIRED`);
        addLog(`${resolvedOmenName} was correct. The final boss stays down and its reward is secured.`);
      } else {
        playOutcome('CURSED');
        trackJudgeCompletion(resolvedDirection, 'cursed', result.intervalSec);
        setOracleResult('CURSED'); setHp(0); setDeathCause('PREDICTION'); setPhase('DEAD'); setNotice('PREDICTION WRONG · BOSS LAST STAND · RUN ENDED');
        addLog(`${resolvedOmenName} was wrong. The fallen boss rises for one final strike. No boss reward is awarded.`);
      }
    } catch {
      if (controller.signal.aborted) return;
      if (judgeMode) { setReplayRetryRemaining(3); setReplayIssue('connection'); }
      setNotice(judgeMode
        ? 'REPLAY VERIFICATION UNAVAILABLE · RETRY REVEAL'
        : automatic ? 'SETTLEMENT FEED RETRYING IN 5S' : 'SETTLEMENT FEED UNAVAILABLE · AUTO-RETRY ARMED');
      if (judgeMode) addLog('The verification service is temporarily unavailable. No outcome was applied; retry Reveal Boss Fate.');
    } finally {
      judgeRevealControllerRef.current = null;
      oracleBusyRef.current = false; setOracleBusy(false);
    }
  }

  useEffect(() => {
    if (phase !== 'ORACLE' || remaining > 0 || judgeMode) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      await checkSettlement(true);
      if (!cancelled) timer = window.setTimeout(poll, 5000);
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  // Poll only after the chosen Event Contract expires.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, remaining > 0, market.marketId, direction, judgeMode]);

  function reset() {
    setJudgeStartIssue(null);
    setReplayIssue(null);
    if (judgeMode) {
      const nextRoster = buildRoster();
      setMarket(sealedReplay); setRoster(nextRoster); setTier(1); setPhase('JUDGE_SETUP'); setRoom(0); setTurn(0); setHp(100); setMonsterHp(nextRoster[0].hp);
      setWeapon(1); setArmor(0); setCombatPotionUses(0); setLastReward(''); setJudgeMode(true); setJudgeLoading(false); setDeathCause('COMBAT');
      setPotions(JUDGE_COMBAT.player.potions); setGold(62); setLastExchange(null);
      setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
      setJudgeActionLog([]); setProofStatus(''); setReplayRevealRemaining(0); setJudgeStartRetryRemaining(0); setReplayRetryRemaining(0);
      setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false; setMarketEntryRemaining(null); setMarketOdds(null); setLiveBtcContext(null);
      resetShareAnalytics();
      judgeRunStartedAtRef.current = null;
      judgeRevealAttemptTrackedRef.current = false;
      judgeTerminalTrackedRef.current = false;
      dreamDexCtaTrackedRef.current = false;
      challengeVerifiedTrackedRef.current = false;
      setCombatLog(['Choose BTC UP or DOWN first. A fresh historical market will be drawn and sealed after you lock your choice.']);
      setNotice('JUDGE DEMO · CHOOSE OMEN BEFORE MARKET SELECTION');
      return;
    }
    const profile = judgeMode ? readProfile() : { gold, potions: Math.min(MAX_POTIONS, Math.max(START_POTIONS, potions)) };
    const nextRoster = buildRoster();
    setMarket(fallback); setRoster(nextRoster); setTier(1); setPhase('SETUP'); setRoom(0); setTurn(0); setHp(100); setMonsterHp(nextRoster[0].hp);
    setPotions(profile.potions); setGold(profile.gold); setWeapon(1); setArmor(0); setCombatPotionUses(0); setCombatLog([]); setLastReward('');
    setBandageUsed(false); setMerchantPotions(2); setWeaponSold(false); setArmorSold(false);
    setOracleChecks(0); setOracleResult(null); setOracleBusy(false); oracleBusyRef.current = false;
    setJudgeMode(false); setJudgeLoading(false); setDeathCause('COMBAT');
    setJudgeActionLog([]); setProofStatus('');
    setReplayRevealRemaining(0);
    setJudgeStartRetryRemaining(0); setReplayRetryRemaining(0);
    setMarketEntryRemaining(null);
    setMarketOdds(null);
    judgeRunStartedAtRef.current = null;
    judgeRevealAttemptTrackedRef.current = false;
    judgeTerminalTrackedRef.current = false;
    dreamDexCtaTrackedRef.current = false;
    challengeVerifiedTrackedRef.current = false;
    resetShareAnalytics();
    setNotice('LIVE DREAMDEX MARKET · READ ONLY');
    if (directJudgeEntry) router.replace('/');
  }

  const resultHeading = oracleResult === 'BLESSED'
    ? 'Combat and prediction conquered.'
    : oracleResult === 'CURSED'
      ? 'The boss strikes back.'
      : judgeMode
        ? 'The final-tier replay is cleared.'
        : 'Dungeon conquered.';
  const combatDefeat = phase === 'DEAD' && deathCause === 'COMBAT';
  const revealedSettlement = !combatDefeat && oracleResult && market.onchainSettlement?.verified
    ? market.onchainSettlement
    : null;
  const revealedMarketResult = revealedSettlement?.voided
    ? 'VOID'
    : revealedSettlement?.winningOutcome === 0
      ? 'UP'
      : revealedSettlement?.winningOutcome === 1
        ? 'DOWN'
        : null;
  const marketResultCopy = revealedMarketResult === 'UP' || revealedMarketResult === 'DOWN'
    ? `The market settled BTC ${revealedMarketResult}. `
    : '';
  const resultCopy = oracleResult === 'BLESSED'
    ? `You chose BTC ${direction}. ${marketResultCopy}Your prediction was correct. The final boss stays down and its reward is secured.`
    : oracleResult === 'CURSED'
      ? `You chose BTC ${direction}. ${marketResultCopy}Your prediction was wrong. You won the combat, but the boss's last stand ends the run.`
      : 'The Event Contract was voided, so the defeated boss remained down without a prediction penalty.';
  const judgeResultSummary = judgeMode ? (
    <section className={replayStyles.resultSummary} aria-label="Choice, market result and boss fate" data-outcome={combatDefeat ? 'DEFEATED' : oracleResult}>
      <div><span>YOUR CHOICE</span><strong>BTC {direction}</strong><small>Locked before the replay was drawn</small></div>
      <div><span>MARKET RESULT</span><strong>{combatDefeat ? 'NOT REVEALED' : revealedMarketResult === 'VOID' ? 'VOID' : revealedMarketResult ? `BTC ${revealedMarketResult}` : 'NOT AVAILABLE'}</strong><small>{combatDefeat ? 'Combat ended before the reveal' : revealedMarketResult === 'VOID' ? 'No winning direction' : revealedMarketResult ? 'Recorded result verified' : 'No direction can be displayed'}</small></div>
      <div><span>BOSS FATE</span><strong>{combatDefeat ? 'NOT DEFEATED' : oracleResult === 'CURSED' ? 'FINAL STRIKE' : 'STAYS DOWN'}</strong><small>{combatDefeat ? 'Run ended in combat' : oracleResult === 'CURSED' ? 'Demo ended · no boss reward' : oracleResult === 'VOID' ? 'No prediction loss · reward kept' : 'Demo won · boss reward secured'}</small></div>
    </section>
  ) : null;

  function verifiedProofInput(): VerifiedRunProofInput | null {
    if (!judgeMode || !market.replayProof || !market.combatProof
      || !isPortableVerifiedRunSettlement(market.onchainSettlement, judgeProfile)
      || !market.replayLockAttestation || !oracleResult || oracleResult === 'VOID') return null;
    return {
      result: oracleResult,
      intervalSec: market.intervalSec,
      replayProof: market.replayProof,
      combatProof: market.combatProof,
      combatActions: judgeActionLog,
      onchainSettlement: market.onchainSettlement,
      lockAttestation: market.replayLockAttestation,
    };
  }

  function currentRunShareInput(): RunShareCardInput | null {
    if (!['VICTORY', 'DEAD'].includes(phase)) return null;
    const totalDungeonRooms = TOTAL_TIERS * TOTAL_ROOMS;
    const reachedRoom = Math.min(totalDungeonRooms, ((tier - 1) * TOTAL_ROOMS) + Math.min(TOTAL_ROOMS, room + 1));
    const fullRunDefeated = Math.min(totalDungeonRooms, ((tier - 1) * TOTAL_ROOMS) + roomsCleared);
    // Local combat progress is useful on defeat, but never constitutes a market proof.
    const replayCombat = market.combatProof ?? (market.replayGameSeed ? replayJudgeCombat(market.replayGameSeed, judgeActionLog) : null);
    const replayEnemiesDefeated = Number(Boolean(replayCombat?.guardDefeated))
      + Number(Boolean(replayCombat?.bossDefeated));
    const committedOutcome = market.replayProof?.committedOutcome ?? market.winningOutcome;
    const actualOutcome = market.voided
      ? 'VOID' as const
      : committedOutcome === 0
        ? 'UP' as const
        : committedOutcome === 1
          ? 'DOWN' as const
          : undefined;
    const result = phase === 'DEAD' && deathCause === 'COMBAT'
      ? 'DEFEATED' as const
      : oracleResult ?? 'VOID';

    return {
      mode: judgeMode ? 'JUDGE_REPLAY' : 'FULL_RUN',
      result,
      tier,
      totalTiers: TOTAL_TIERS,
      reachedRoom,
      totalRooms: totalDungeonRooms,
      enemiesDefeated: judgeMode ? replayEnemiesDefeated : fullRunDefeated,
      gold,
      lockedDirection: direction,
      actualOutcome,
      verifiedOnchain: Boolean(judgeMode && verifiedProofInput()),
      marketId: market.replayProof?.marketId ?? (/^0x[0-9a-f]{64}$/i.test(market.marketId) ? market.marketId : undefined),
    };
  }

  function analyticsMode(input: RunShareCardInput): MarketDungeonMode {
    return input.mode === 'JUDGE_REPLAY' ? 'judge_demo' : 'full_run';
  }

  function trackShareAction(input: RunShareCardInput, action: ShareAction) {
    if (!shareActionsTrackedRef.current.has(action)) {
      shareActionsTrackedRef.current.add(action);
      emitAnalyticsEvent(shareActionEvent(analyticsMode(input), action));
    }
    if (!shareEngagedTrackedRef.current) {
      shareEngagedTrackedRef.current = true;
      emitAnalyticsEvent(shareEngagedEvent(analyticsMode(input)));
    }
  }

  function trackChallengeCreated(input: RunShareCardInput) {
    // The pilot's canonical challenge-created count starts from a completed,
    // independently verified Judge run. Full-run cards may still be shared,
    // but they do not satisfy that proof boundary.
    if (!input.verifiedOnchain) return;
    if (challengeCreatedTrackedRef.current) return;
    challengeCreatedTrackedRef.current = true;
    emitAnalyticsEvent(challengeCreatedEvent());
  }


  async function copyVerifiedProof() {
    const proofInput = verifiedProofInput();
    if (!proofInput) return;
    const json = verifiedRunProofJson(proofInput, undefined, judgeProfile);
    try {
      await navigator.clipboard.writeText(json);
      setProofStatus('PORTABLE PROOF JSON COPIED');
    } catch {
      setProofStatus('COPY FAILED · USE DOWNLOAD PROOF JSON');
    }
  }

  function downloadVerifiedProof() {
    const proofInput = verifiedProofInput();
    if (!proofInput) return;
    const json = verifiedRunProofJson(proofInput, undefined, judgeProfile);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = verifiedRunProofFilename(proofInput.replayProof.marketId);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setProofStatus('PORTABLE PROOF JSON DOWNLOADED');
  }

  function trackDreamDexContinue() {
    if (!oracleResult || dreamDexCtaTrackedRef.current) return;
    dreamDexCtaTrackedRef.current = true;
    emitAnalyticsEvent(dreamDexCtaClickedEvent(
      judgeMode ? 'judge_demo' : 'full_run',
      direction,
      oracleResult.toLowerCase() as MarketSettlementResult,
      market.intervalSec,
    ));
  }

  const runShareInput = currentRunShareInput();
  const portableProofAvailable = Boolean(verifiedProofInput());
  const runSharePanel = runShareInput ? <RunSharePanel
    key={JSON.stringify(runShareInput)}
    input={runShareInput}
    challengeUrl={judgeChallengeUrl}
    onAction={(action) => trackShareAction(runShareInput, action)}
    onChallenge={() => trackChallengeCreated(runShareInput)}
  /> : null;

  const portableProofPanel = portableProofAvailable ? (
    <section className="portable-proof-panel" aria-label="Portable run verification">
      <div className="portable-proof-heading">
        <span>PORTABLE PROOF · INDEPENDENT CHECK</span>
        <strong>Verify this completed replay in two steps.</strong>
        <small>First save or copy the proof. Then open the verifier, which checks the signed server receipt, deterministic combat, and recorded Somnia state without a wallet or file upload.</small>
      </div>
      <div className="portable-proof-actions">
        <button className="proof-download" type="button" onClick={downloadVerifiedProof}>1 · DOWNLOAD PROOF JSON</button>
        <button type="button" onClick={() => void copyVerifiedProof()}>COPY PROOF JSON</button>
        <Link className="proof-verifier-link" href={judgeProfile.verifierPath} target="_blank" rel="noopener noreferrer">2 · OPEN INDEPENDENT VERIFIER ↗</Link>
      </div>
      <small className="portable-proof-status" aria-live="polite">{proofStatus}</small>
    </section>
  ) : null;

  const dreamDexContinuePanel = allowsLiveDreamDexContinuation(judgeProfile) ? (
    <div className="judge-verification verified-share dreamdex-continue">
      <div>
        <span>{shannonJudge ? 'OPTIONAL · LIVE DREAMDEX · SOMNIA MAINNET' : 'NEXT STEP · LIVE DREAMDEX MARKET'}</span>
        <strong>Explore the current BTC {marketIntervalName} Event Contract.</strong>
        <small>{shannonJudge && 'This is a separate live mainnet market; your verified Shannon replay remains historical. '}Opens dreamDEX in a new tab. Wallet connection and any transaction stay on dreamDEX, outside Market Dungeon.</small>
      </div>
      <a
        className="primary-action dreamdex-continue-action"
        href={dreamDexBtcEventContractUrl(marketIntervalSeconds)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={trackDreamDexContinue}
        aria-label="Continue on dreamDEX — opens in a new tab"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
      >
        CONTINUE ON DREAMDEX ↗
      </a>
    </div>
  ) : null;

  return (
    <main className={`game-shell phase-${phase.toLowerCase()} ${['SETUP', 'JUDGE_SETUP'].includes(phase) ? 'setup-shell' : 'in-expedition'} ${judgeMode ? `judge-mode ${replayStyles.shell}` : ''} ${directJudgeEntry ? 'direct-judge-entry' : ''} ${judgeMode && phase === 'COMBAT' ? 'mobile-combat-active' : ''}`}>
      <DesktopNavigation />
      {judgeMode && <div className={replayStyles.top}>
        <GameModeNav current="replay" replayHref={judgeProfile.judgePath} />
        {phase === 'JUDGE_SETUP' && <header className={replayStyles.header}>
          <GameLogo compact />
          <div>
            <span className={replayStyles.eyebrow}>HISTORICAL JUDGE REPLAY · {shannonJudge ? 'SHANNON TESTNET' : 'SOMNIA MAINNET'}</span>
            <span className={replayStyles.subtitle} aria-label="Judge Proof Chamber">2-MINUTE PROOF CHAMBER · Two encounters · A finalized market</span>
          </div>
        </header>}
        {phase === 'JUDGE_SETUP' && <section className="judge-setup-progress" aria-label="Judge Demo progress">
          <span className="active" aria-current="step"><b>1</b> LOCK</span>
          <span><b>2</b> GUARD</span>
          <span><b>3</b> BOSS</span>
          <span><b>4</b> REST</span>
          <span><b>5</b> REVEAL</span>
        </section>}
      </div>}
      <div className="game-column">
        {judgeMode && phase === 'COMBAT' && <MobileBattle
          location={`STEP ${judgeStep}/5 · ${isBoss ? 'BOSS' : 'GUARD'}`} loadout={{ gold, weapon, armor, progress: `${judgeStep}/5 · ${isBoss ? 'BOSS' : 'GUARD'}` }}
          mode="JUDGE · COMBAT REPLAY"
          desktopSummary={<LoadoutSummary gold={gold} weapon={weapon} armor={armor} potions={`${potions}/${MAX_POTIONS}`}>Two encounters · No wallet or transactions</LoadoutSummary>}
          hp={hp} maxHp={100}
          enemy={{ name: monster.name, image: monster.image, hp: monsterHp, maxHp: monster.hp, incoming: `${Math.max(1, monster.minDamage - armor)}–${Math.max(1, monster.maxDamage - armor)}`, flavor: `“${monster.flavor}”`, isBoss }}
          omen={`BTC ${direction} · SEALED REPLAY`}
          omenDetails={<><p>Historical dreamDEX replay · {shannonJudge ? 'Shannon Testnet' : 'Somnia Mainnet'}.</p><p>Your BTC {direction} choice is locked. This short Judge walkthrough uses two balanced encounters, not the full expedition difficulty or a live prediction. Heal safely between fights; Storm trades reliability for risk.</p><JudgeLockReceiptEvidence attestation={market.replayLockAttestation} publicKey={market.replayLockPublicKey} /></>}
          gear={<><p><LoadoutSummary gold={gold} weapon={weapon} armor={armor} /></p><p>Judge loadout · shortened combat for the proof walkthrough. Full Expedition has its own equipment and relic progression.</p></>}
          log={combatLog}
          lastExchange={turn > 0 ? lastExchange : null}
          logPreview={turn > 0 ? lastExchange?.quip : undefined}
          attack={`${attackMin}–${attackMax}`} storm={`0–${stormMax}`}
          criticalChance={15}
          potions={potions} potionUses={combatPotionUses} potionLimit={combatPotionLimit}
          firstFightHint={!isBoss && turn === 0}
          onAttack={() => act('attack')} onStorm={() => act('storm')} onPotion={() => act('potion')}
        />}
        {judgeMode && !['SETUP', 'JUDGE_SETUP', 'COMBAT'].includes(phase) && <div className="desktop-stage-header">
          {['VICTORY', 'DEAD'].includes(phase) ? <BattleHeader mode="JUDGE · COMBAT REPLAY" summary={<LoadoutSummary gold={gold} weapon={weapon} armor={armor} potions={`${potions}/${MAX_POTIONS}`}>BTC {direction} · {shannonJudge ? 'Shannon Testnet' : 'Somnia Mainnet'}</LoadoutSummary>} /> :
          <PlayerHeader mode="JUDGE · COMBAT REPLAY" summary={<LoadoutSummary gold={gold} weapon={weapon} armor={armor} potions={`${potions}/${MAX_POTIONS}`}>BTC {direction} · {shannonJudge ? 'Shannon Testnet' : 'Somnia Mainnet'}</LoadoutSummary>}
            hp={hp} maxHp={100} location={`STEP ${judgeStep}/5 · ${isBoss ? 'BOSS' : 'GUARD'}`} loadout={{ gold, weapon, armor, progress: `${judgeStep}/5 · ${isBoss ? 'BOSS' : 'GUARD'}` }} potions={potions} omen={`BTC ${direction} · SEALED REPLAY`}
            omenDetails={<><p>Historical dreamDEX replay · {shannonJudge ? 'Shannon Testnet' : 'Somnia Mainnet'}.</p><p>Your BTC {direction} choice is locked. This is a sealed historical result, not a live prediction.</p><JudgeLockReceiptEvidence attestation={market.replayLockAttestation} publicKey={market.replayLockPublicKey} /></>}
            gear={<><p><LoadoutSummary gold={gold} weapon={weapon} armor={armor} /></p><p>Judge loadout · shortened combat for the proof walkthrough. Full Expedition has its own equipment and relic progression.</p></>} />}
        </div>}
        {!judgeMode && <header className="game-header">
          <p className="eyebrow">DELVEWORN · EVENT CONTRACTS EDITION</p>
          <h1><GameLogo /></h1>
          {judgeMode && <div className="judge-chamber-badge" aria-label="Judge Proof Chamber">
            <span>JUDGE MODE</span>
            <b>2-MINUTE PROOF CHAMBER</b>
            <small>2 ENCOUNTERS · 5 VERIFICATION STEPS · ONCHAIN RESULT</small>
          </div>}
          <p className="subtitle">{subtitle}</p>
          {['SETUP', 'JUDGE_SETUP'].includes(phase) && <KeyboardHint />}
          <div className="safety-line"><span className="live-dot" /> {shannonJudge ? 'SHANNON TESTNET' : 'SOMNIA MAINNET'} <i /> {judgeMode ? shannonJudge ? 'HISTORICAL DREAMDEX REPLAY' : 'HISTORICAL PROOF · LIVE CONTEXT' : 'LIVE DREAMDEX DATA'} <i /> NO TRANSACTIONS</div>
        </header>}

        <div ref={desktopJourneyRef} tabIndex={judgeMode ? -1 : undefined} className={judgeMode ? 'desktop-journey' : undefined}>
        {judgeMode && phase === 'ORACLE' ? <div className="judge-boss-scene">
          <BossOutcomeScene name={monster.name} image={monster.image} maxHp={monster.hp} outcome="pending" />
        </div> : judgeMode && !['COMBAT', 'VICTORY', 'DEAD'].includes(phase) && <div className="desktop-journey-art" data-crop={!['JUDGE_SETUP', 'MERCHANT', 'FINAL_MERCHANT'].includes(phase)}><Image src={phase === 'JUDGE_SETUP' ? '/assets/delveworn-tier2-party-hero.webp' : ['MERCHANT', 'FINAL_MERCHANT'].includes(phase) ? MERCHANT_IMAGE : monster.image} alt={phase === 'JUDGE_SETUP' ? 'Delveworn dungeon party' : ['MERCHANT', 'FINAL_MERCHANT'].includes(phase) ? 'Quartermaster Kevin' : monster.name} fill sizes="(max-width: 800px) 100vw, 55vw" />
          {phase === 'JUDGE_SETUP' && <div className={replayStyles.artCaption}><strong>The fight is yours.<br />The past holds the verdict.</strong><span>Defeat the guard and the boss. Then discover whether your locked omen keeps dungeon management down.</span></div>}
        </div>}
        <div className={judgeMode ? 'desktop-journey-details' : undefined} data-keyboard-actions data-keyboard-vertical={['CLEARED', 'MERCHANT', 'FINAL_MERCHANT', 'TIER_SETUP'].includes(phase) ? 'edges' : undefined}>
        {currentRoomCleared && turn > 0 && lastExchange?.critical && <CriticalHitResult damage={lastExchange.rolledDamage ?? lastExchange.dealt} />}

        {phase === 'SETUP' && (
          <section className="judge-first-entry" aria-label="Judge-first entry">
            <div>
              <span>JUDGES · START HERE</span>
              <strong>Prove the complete loop in under two minutes.</strong>
              <small>Choose first, manage two short fights, then let a browser-verified dreamDEX result decide whether the boss stays down.</small>
            </div>
            <button className="judge-action judge-entry-primary" onClick={startJudgeDemo} disabled={judgeLoading}>⚡ START 2-MIN JUDGE DEMO · VERIFIED RUN</button>
            <a href="#full-expedition">PLAY THE FULL FOUR-TIER EXPEDITION ↓</a>
          </section>
        )}

        {phase === 'JUDGE_SETUP' && (
          <section className="action-dock action-dock-judge_setup judge-first-lock" aria-label="Start the two-minute Judge Demo">
            {challengeEntry && (
              <div className="challenge-entry-banner" role="status" aria-label="Challenge invitation">
                <span>⚡ BOSS + MARKET CHALLENGE</span>
                <small>Defeat both encounters, then beat your own hidden market. This is a fresh, separately verified replay.</small>
              </div>
            )}
            <div className="judge-lock-intro">
              <span>STEP 1 OF 5 · HISTORICAL REPLAY</span>
              <h2>Lock your omen before the replay is drawn.</h2>
              <small>Choose BTC UP or DOWN before a historical market is drawn. Win two fights, then reveal its verified outcome.</small>
              <div className="judge-lock-context" aria-live="polite">
                <span>{shannonJudge ? 'HISTORICAL BTC REPLAY' : 'LIVE BTC CONTEXT'}</span>
                <strong>{shannonJudge ? 'NO LIVE PRICE FEED' : liveBtcContext ? liveBtcContextPrice(liveBtcContext) : liveBtcContextLoaded ? 'REFERENCE UNAVAILABLE' : 'LOADING REFERENCE…'}</strong>
                <small>{shannonJudge ? 'Predict the hidden historical outcome. The result is verified onchain; the opening price is not supplied.' : liveBtcContext ? `dreamDEX ${eventContractIntervalName(liveBtcContext.intervalSec)} opening line · context only` : 'The sealed replay remains available.'}</small>
              </div>
            </div>
            <div className="judge-quick-choice" aria-label="Choose BTC direction">
              <button disabled={judgeLoading} aria-pressed={direction === 'UP'} className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b><GoldIcon /> GOLD AWAKENS</b><small>BTC UP</small></button>
              <button disabled={judgeLoading} aria-pressed={direction === 'DOWN'} className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>🌑 SHADOWS RISE</b><small>BTC DOWN</small></button>
            </div>
            <OmenGuide mode="replay" />
            <div className="judge-lock-commit">
              <span>YOUR SELECTED OMEN · NOT LOCKED YET</span>
              <strong>{omenIcon} {omenName} · BTC {direction}</strong>
              <button className="judge-action" onClick={() => void startJudgeReplay()} disabled={judgeLoading || judgeStartRetryRemaining > 0}>{judgeLoading ? 'LOCKING + SEALING REPLAY…' : judgeStartRetryRemaining > 0 ? `RETRY LOCK IN ${judgeStartRetryRemaining}S` : 'LOCK OMEN & SEAL REPLAY'}</button>
              {(judgeLoading || judgeStartIssue) && <div className="judge-connection-status" role="status" aria-label="Replay connection status" data-state={judgeLoading ? 'loading' : judgeStartRetryRemaining > 0 ? 'waiting' : 'ready'}>
                <b>{judgeLoading ? 'Preparing your sealed replay…' : startIssueTitle}</b>
                <p>{judgeLoading ? `Your BTC ${direction} choice stays fixed while the market is sealed and its receipt is checked. This can take a few seconds.`
                  : judgeStartIssue === 'config_unavailable' ? 'Your omen is not locked. The replay service is not configured. Try again after the service is ready.'
                  : judgeStartIssue === 'no_candidates' ? 'Your omen is not locked. There are no eligible recent markets for this replay. Please try again shortly.'
                  : `Your omen is not locked. ${judgeStartRetryRemaining > 0 ? `You can retry in ${judgeStartRetryRemaining}s.` : 'Ready to retry — lock your omen when you are ready.'}`}</p>
              </div>}
              <small>No wallet, approval or order will be requested.</small>
            </div>
            <HumanProofSummary />
          </section>
        )}

        <section className="market-ribbon" aria-label="Live dreamDEX Event Contract">
          <div><span>BTC · {marketIntervalLabel.toUpperCase()}</span><strong>{market.status}</strong><small>{judgeMode ? 'FINALIZED ONCHAIN REPLAY' : marketEntryRemaining !== null ? `LOCKED WITH ${formatTime(marketEntryRemaining)} LEFT` : 'STARTS IMMEDIATELY · LIVE MARKET'}</small></div>
          <div><span>{judgeMode && phase === 'JUDGE_SETUP' ? 'LIVE CONTEXT LINE' : 'LINE'}</span><strong>{replaySealed ? 'HIDDEN' : marketPriceLabel(market.strikeUsd)}</strong></div>
          <div><span>EXPIRY</span><strong>{replaySealed ? 'FINALIZED' : formatTime(remaining)}</strong><small>{replaySealed ? expiryLabel : `${expiryLabel} UTC`}</small></div>
          <div><span>DUNGEON OMEN</span><strong className={direction === 'UP' ? 'text-up' : 'text-down'}>{omenIcon} {omenName}</strong><small>BTC {direction}</small></div>
        </section>

        {judgeMode && !['SETUP', 'JUDGE_SETUP'].includes(phase) && (
          <section className="judge-replay-banner" aria-label="Judge Demo progress">
            <div className="judge-replay-heading">
              <span>⚡ 2-MIN JUDGE DEMO</span>
              <strong>{phase === 'DEAD' && deathCause === 'COMBAT' ? 'REPLAY ENDED IN COMBAT' : market.replayProof ? `VERIFIED MARKET REPLAY · #${marketCode}` : market.replayCommitment ? `SEALED REPLAY · COMMIT ${marketCode}` : 'CRYPTOGRAPHIC REPLAY SETUP'}</strong>
              <small>{phase === 'DEAD' && deathCause === 'COMBAT' ? 'No market result was revealed. Start a new Judge Demo to try again.' : market.replayProof ? 'Combat, commitment and direct Somnia RPC settlement all verified.' : market.replayCommitment ? 'Your direction is locked. The exact market identity and outcome remain encrypted while you defeat the guard and boss.' : 'Choose UP or DOWN before the server randomly selects and seals a finalized market.'}</small>
              {market.replayCommitment && !market.replayProof && <code className="judge-replay-commitment">{market.replayCommitment}</code>}
            </div>
            <div className="judge-replay-steps">
              <span className={judgeStep === 1 ? 'active' : 'done'}><b>1</b> LOCK OMEN</span>
              <span className={judgeStep === 2 ? 'active' : judgeStep > 2 ? 'done' : ''}><b>2</b> DEFEAT GUARD</span>
              <span className={judgeStep === 3 ? 'active' : judgeStep > 3 ? 'done' : ''}><b>3</b> DEFEAT BOSS</span>
              <span className={judgeStep === 4 ? 'active' : judgeStep > 4 ? 'done' : ''}><b>4</b> REST OPTIONAL</span>
              <span className={market.replayProof ? 'done' : judgeStep === 5 ? 'active' : ''}><b>5</b> REVEAL FATE</span>
            </div>
          </section>
        )}

        {judgeMode && !market.replayProof && (
          <JudgeLockReceiptEvidence
            attestation={market.replayLockAttestation}
            publicKey={market.replayLockPublicKey}
          />
        )}

        {!judgeMode && <TierTrack activeTier={phase === 'TIER_SETUP' ? tier + 1 : tier} complete={phase === 'VICTORY'} failed={phase === 'DEAD'} />}

        {!['SETUP', 'JUDGE_SETUP'].includes(phase) && (
          <section className="sticky-hud" aria-label="Expedition status">
            <div><span>HEALTH</span><strong>❤️ {hp}/100</strong><div className="mini-bar"><i style={{ width: `${playerPercent}%` }} /></div></div>
            <div><span>POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div>
            <div><span>GOLD</span><strong><GoldIcon /> {gold}</strong></div>
            <div className="hud-wide"><span>LOADOUT</span><strong className="desktop-hud-value">⚔️ Lv {weapon} · 🛡️ Lv {armor}</strong><strong className="mobile-hud-value">⚔️ {weapon} · 🛡️ {armor}</strong></div>
            <div className="hud-wide"><span>EXPEDITION</span><strong className="desktop-hud-value">TIER {tier}/{TOTAL_TIERS} · {roomsCleared}/{TOTAL_ROOMS} · {omenIcon} {omenName}</strong><strong className="mobile-hud-value">T{tier} · R{Math.min(room + 1, TOTAL_ROOMS)}</strong></div>
          </section>
        )}

        <section id={phase === 'SETUP' ? 'full-expedition' : undefined} className={`main-card ${isBoss && !['SETUP', 'JUDGE_SETUP', 'TIER_SETUP'].includes(phase) ? 'boss-card' : ''}`}>
          {phase === 'SETUP' ? (
            <div className="setup-view">
              <div className="setup-hero">
                <Image
                  src="/assets/delveworn-tier2-party-hero.webp"
                  alt="Miss Morgue, Kevin the Unqualified and Brutus assembled in the dungeon"
                  fill
                  preload
                  sizes={STAGE_IMAGE_SIZES}
                />
              </div>
              <div className="setup-content">
                <div className="setup-intro">
                  <p className="section-kicker">THE REAL DELVEWORN LOOP · THE BITCOIN HOARD</p>
                  <h2>Defeat the boss. Predict correctly. Survive both.</h2>
                  <p className="muted">Each tier has ten combat rooms and a fresh BTC prediction. A boss victory only becomes permanent when the dreamDEX prediction is also correct; otherwise the boss delivers a fatal last strike.</p>
                  <div className="legacy-inventory"><div><span>PERSISTENT GOLD</span><strong><GoldIcon /> {gold}</strong></div><div><span>NEXT-RUN POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div><small>Gold and potions above the starting amount survive a new run. Attack and defense reset.</small></div>
                  <div className="prediction-card">
                    <span>TIER 1 PREDICTION · MARKET #{marketCode || '—'}</span><strong>{marketPriceLabel(market.strikeUsd)}</strong><p>{market.question}</p>
                    <LiveMarketOdds odds={marketOdds} direction={direction} />
                    <div className="prediction-buttons">
                      <button aria-pressed={direction === 'UP'} className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b><GoldIcon /> GOLD AWAKENS</b><small>BTC UP · finishes at or above the line</small></button>
                      <button aria-pressed={direction === 'DOWN'} className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>🌑 SHADOWS RISE</b><small>BTC DOWN · finishes below the line</small></button>
                    </div>
                  </div>
                </div>
                <div className="setup-details">
                  <div className="rule-grid">
                    <div><span>⚔️</span><b>WIN THE COMBAT</b><small>Fight normally and reduce the boss to zero HP</small></div>
                    <div><span>🔮</span><b>WIN THE PREDICTION</b><small>Correct BTC outcome keeps the defeated boss down</small></div>
                    <div><span>🧰</span><b>BUILD WITHIN THE RUN</b><small>Kevin&apos;s attack and defense upgrades last until defeat</small></div>
                    <div><span>🏰</span><b>CLIMB FOUR TIERS</b><small>Every tier brings a new roster, boss and prediction</small></div>
                  </div>
                  <div className="competition-note"><b>LIVE CONTRACT INTEGRATION:</b> Each tier prefers the active BTC 5-minute dreamDEX market, with 15m fallback. Its real market ID, expiry and Somnia settlement are preserved.</div>
                  <MarketProof market={market} mode="live" profile={SOMNIA_MAINNET_PROFILE} />
                </div>
              </div>
            </div>
          ) : phase === 'JUDGE_SETUP' ? (
            <div className="judge-setup-view">
              <p className="section-kicker">STEP 1 · CHOOSE BEFORE MARKET SELECTION</p>
              <h2>Lock your omen before the replay is drawn.</h2>
              <p className="muted">After you lock UP or DOWN, the server randomly selects a finalized, traded BTC 5-minute market. A balanced 15m pool remains the automatic fallback. The browser receives an encrypted seal, a salted commitment, an unrelated combat seed, and a signed server lock receipt—but no identifying market data.</p>
              <div className="prediction-card judge-prediction-card">
                <span>SEALED BTC 5-MIN REPLAY · 15M FALLBACK · {shannonJudge ? 'SHANNON TESTNET' : 'SOMNIA MAINNET'}</span>
                <strong>UP OR DOWN</strong>
                <p>The selected replay market ID, addresses, strike, expiry and outcome are not chosen or sent before your choice locks.</p>
                <div className="judge-live-context" aria-live="polite">
                  <span>{shannonJudge ? 'HISTORICAL BTC REPLAY' : 'BTC LIVE CONTEXT'}</span>
                  <strong>{shannonJudge ? 'NO LIVE PRICE FEED' : liveBtcContext ? liveBtcContextPrice(liveBtcContext) : liveBtcContextLoaded ? 'REFERENCE UNAVAILABLE' : 'LOADING REFERENCE…'}</strong>
                  <small>{shannonJudge
                    ? 'This testnet replay verifies a historical onchain outcome. No live feed or historical opening price is supplied.'
                    : liveBtcContext
                    ? `Separate live dreamDEX ${eventContractIntervalName(liveBtcContext.intervalSec)} opening line · ${liveBtcContextTime(liveBtcContext)} · context only · not the replay market`
                    : 'The live reference does not affect replay availability. The historical opening price is not supplied.'}</small>
                </div>
                {!shannonJudge && <LiveMarketOdds odds={marketOdds} direction={direction} />}
              </div>
              <div className="judge-seal-note"><span>CRYPTOGRAPHIC SEAL + SIGNED RECEIPT</span><strong>Your direction locks before a random historical settlement is selected.</strong><small>The official environment authenticates the commitment and lock window. This is a server receipt, not an external timestamp. Full market proof appears only at Reveal Boss Fate.</small></div>
              <MarketProof market={market} mode="sealed" profile={judgeProfile} />
            </div>
          ) : phase === 'TIER_SETUP' ? (
            <div className="tier-setup-view">
              <div className="result-icon">⚔️</div>
              <p className="section-kicker">TIER {tier} CLEARED · BOTH CONDITIONS MET</p>
              <h2>Choose a new prediction for Tier {tier + 1}.</h2>
              <p className="muted">Your gold, potions, health, attack and defense continue because this is still the same run. A defeat will reset attack and defense before the next expedition.</p>
              <div className="carry-forward"><div><span>GOLD</span><strong><GoldIcon /> {gold}</strong></div><div><span>POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div><div><span>RUN LOADOUT</span><strong>⚔️ {weapon} · 🛡️ {armor}</strong></div></div>
              <div className="prediction-card">
                <span>TIER {tier + 1} PREDICTION · NEW MARKET #{marketCode || '—'}</span><strong>{marketPriceLabel(market.strikeUsd)}</strong><p>{market.question}</p>
                <LiveMarketOdds odds={marketOdds} direction={direction} />
                <div className="prediction-buttons">
                  <button aria-pressed={direction === 'UP'} className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b><GoldIcon /> GOLD AWAKENS</b><small>BTC UP · finishes at or above the line</small></button>
                  <button aria-pressed={direction === 'DOWN'} className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>🌑 SHADOWS RISE</b><small>BTC DOWN · finishes below the line</small></button>
                </div>
              </div>
            </div>
          ) : phase === 'MERCHANT' || phase === 'FINAL_MERCHANT' ? (
            <div className="merchant-view">
              <div className="merchant-stage"><Image src={MERCHANT_IMAGE} alt="Quartermaster Kevin, Travelling Merchant" fill sizes={STAGE_IMAGE_SIZES} /><div className="stage-fade" /></div>
              <div className="merchant-copy">
                <p className="section-kicker">🧰 {phase === 'FINAL_MERCHANT' ? 'POST-BOSS' : 'ROOM 5'} · TRAVELLING MERCHANT</p>
                <h2>Quartermaster Kevin</h2>
                <p className="merchant-role">Questionable procurement · impeccable timing</p>
                <p className="flavor">“{phase === 'FINAL_MERCHANT' ? judgeMode ? 'The fighting is over. Take a seat. This one is free. I cannot negotiate with Bitcoin.' : 'The boss is down. Permanently? Ask Bitcoin. Shall we improve your odds of surviving the answer?' : 'You look terrible. Fortunately, I accept gold.'}”</p>
                <div className="merchant-stats"><div><span>HEALTH</span><strong>❤️ {hp}/100</strong></div><div><span>GOLD</span><strong><GoldIcon /> {gold}</strong></div><div><span>POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div></div>
              </div>
            </div>
          ) : phase === 'CLEARED' ? (
            <div className="result-view cleared-view">
              <div className="result-icon">🏆</div><p className="section-kicker">ROOM {room + 1} CLEARED</p>
              <h2>{judgeMode ? 'The final boss gate is open.' : 'Against all evidence, you remain alive.'}</h2>
              <p className="muted">{judgeMode ? 'The boss hits harder. Heal safely here, or save a potion for combat; drinking during a fight allows retaliation.' : 'Heal safely with a potion before opening the next gate.'}</p>
              <div className="reward-box"><span>RECOVERED</span><strong><GoldIcon /> {lastReward}</strong></div>
            </div>
          ) : phase === 'VICTORY' ? (
            <div className={`result-view ${judgeMode ? 'judge-result-view' : ''}`}>
              <div className="result-hero-grid">
                <div className="result-hero">
                  {judgeMode && (oracleResult === 'BLESSED' || oracleResult === 'VOID')
                    ? <BossOutcomeScene name={monster.name} image={monster.image} maxHp={monster.hp} outcome={oracleResult === 'VOID' ? 'void' : 'blessed'} compact />
                    : <div className="result-icon">{oracleResult === 'BLESSED' ? '✨' : oracleResult === 'CURSED' ? '📉' : '👑'}</div>}
                  <p className="section-kicker">{judgeMode ? 'JUDGE DEMO COMPLETE · ONCHAIN RESULT VERIFIED' : `TIER ${tier}/${TOTAL_TIERS} · FULL RUN COMPLETE`} · {oracleResult ?? 'SETTLED'}</p>
                  <h2>{resultHeading}</h2><p className="muted">{resultCopy}</p>
                  {judgeMode ? judgeResultSummary : <div className="victory-conditions resolved"><div><span>✓ CONDITION 1</span><strong>Boss defeated in combat</strong></div><div><span>{oracleResult === 'VOID' ? '○ VOID EXCEPTION' : '✓ CONDITION 2'}</span><strong>{oracleResult === 'VOID' ? 'Prediction voided · no loss' : 'BTC prediction correct'}</strong></div></div>}
                  {judgeMode && <div className="judge-verification"><span>✓ COMBAT + CHOICE LOCK + SOMNIA RESULT VERIFIED</span><strong>Verified end to end</strong><small>Verified means this run matches the recorded market result. Both winning and losing runs can be verified.</small></div>}
                </div>
                {judgeMode && runSharePanel}
              </div>
              {judgeMode ? <div className="judge-result-evidence">
                <HumanProofSummary verified />
                {portableProofPanel}
                {dreamDexContinuePanel}
                <MarketProof market={market} mode="revealed" profile={judgeProfile} />
              </div> : <>
                {portableProofPanel}
                {dreamDexContinuePanel}
                {runSharePanel}
              </>}
              <div className="final-stats"><div><span>{judgeMode ? 'REPLAY ENCOUNTERS' : 'TIERS CLEARED'}</span><strong>{judgeMode ? `${runShareInput?.enemiesDefeated ?? 0}/2` : `${tier}/${TOTAL_TIERS}`}</strong></div><div><span>FINAL GOLD</span><strong><GoldIcon /> {gold}</strong></div></div>
            </div>
          ) : phase === 'DEAD' ? (
            <div className={`result-view ${judgeMode ? 'judge-result-view' : ''}`}>
              <div className="result-hero-grid">
                <div className="result-hero">
                  {judgeMode && deathCause === 'PREDICTION'
                    ? <BossOutcomeScene name={monster.name} image={monster.image} maxHp={monster.hp} outcome="last-strike" compact />
                    : <div className="result-icon">☠️</div>}
                  <p className="section-kicker">{judgeMode ? deathCause === 'PREDICTION' ? 'JUDGE DEMO COMPLETE · ONCHAIN LOSS VERIFIED' : 'JUDGE RUN ENDED · COMBAT DEFEAT' : `TIER ${tier} · EXPEDITION ENDED`}</p>
                  <h2>{deathCause === 'PREDICTION' ? 'The boss strikes back.' : 'You fell in combat.'}</h2><p className="muted">{deathCause === 'PREDICTION' ? resultCopy : judgeMode ? 'The prediction cannot save a lost fight. Start a fresh Judge replay with the same balanced health, potions and equipment.' : 'The prediction cannot save a lost fight. Gold persists, potions return to at least the starting amount, and attack and defense reset for the next run.'}</p>
                  {judgeResultSummary}
                  {judgeMode && deathCause === 'COMBAT' && <p className="muted">The sealed market was not revealed. No onchain outcome was verified for this run.</p>}
                  {!judgeMode && deathCause === 'PREDICTION' && <div className="victory-conditions failed"><div><span>✓ CONDITION 1</span><strong>Boss defeated in combat</strong></div><div><span>✕ CONDITION 2</span><strong>BTC prediction incorrect</strong></div></div>}
                  {judgeMode && deathCause === 'PREDICTION' && <div className="judge-verification"><span>✓ COMBAT + CHOICE LOCK + SOMNIA RESULT VERIFIED</span><strong>Verified end to end</strong><small>Verified means this run matches the recorded market result. Both winning and losing runs can be verified.</small></div>}
                </div>
                {judgeMode && runSharePanel}
              </div>
              {judgeMode && deathCause === 'PREDICTION' ? <div className="judge-result-evidence">
                <HumanProofSummary verified />
                {portableProofPanel}
                {dreamDexContinuePanel}
                <MarketProof market={market} mode="revealed" profile={judgeProfile} />
              </div> : <>
                {deathCause === 'PREDICTION' && dreamDexContinuePanel}
                {!judgeMode && runSharePanel}
              </>}
              <div className="final-stats"><div><span>{judgeMode ? 'REPLAY ENCOUNTERS' : 'TIER / ROOMS'}</span><strong>{judgeMode ? `${runShareInput?.enemiesDefeated ?? 0}/2` : `${tier} · ${roomsCleared}/${TOTAL_ROOMS}`}</strong></div><div><span>{judgeMode ? 'FINAL GOLD' : 'GOLD KEPT'}</span><strong><GoldIcon /> {gold}</strong></div></div>
            </div>
          ) : (
            <div className="combat-view">
              <div className="room-progress">
                <div className="room-map ten-room-map" aria-label="Dungeon progress">
                  {Array.from({ length: TOTAL_ROOMS }, (_, index) => {
                    const done = index < room || (index === room && currentRoomCleared);
                    return <span key={index} className={done ? 'done' : index === room ? 'active' : ''}>{index === TOTAL_ROOMS - 1 ? '◆' : index + 1}</span>;
                  })}
                </div>
              </div>
              {!(judgeMode && phase === 'ORACLE') && <div className="monster-stage">
                <Image src={monster.image} alt={monster.name} fill sizes={STAGE_IMAGE_SIZES} />
                {judgeMode && <div className="judge-stage-label">{room === TOTAL_ROOMS - 2 ? '⚡ FINAL TIER REPLAY · ONE GUARD REMAINS BEFORE THE BOSS' : '⚡ FINAL BOSS · SHORT TACTICAL ENCOUNTER'}</div>}
                <div className="stage-fade" />
              </div>}
              <div className="monster-info">
                {isBoss && <p className="boss-label">👑 DUNGEON MANAGEMENT</p>}
                <div className="monster-heading"><div><h2>{monster.name}</h2><span>{monster.species} · Room {room + 1}</span></div><b>{monster.species === 'Boss' ? 'BOSS' : monster.species.toUpperCase()}</b></div>
                <p className="flavor">“{monster.flavor}”</p>
                <div className="hp-label"><span>ENEMY HP</span><strong>{monsterHp} / {monster.hp}</strong></div>
                <div className="enemy-bar"><i className={isBoss ? 'boss-health' : ''} style={{ width: `${monsterPercent}%` }} /></div>
                <div className="enemy-stats"><div><span>ENEMY DAMAGE</span><strong>💥 {monster.minDamage}–{monster.maxDamage}</strong></div><div><span>BASE REWARD</span><strong><GoldIcon /> {monster.reward}</strong></div></div>
                {isBoss && <div className={`victory-conditions ${phase === 'ORACLE' ? 'pending' : ''}`}><div><span>{phase === 'ORACLE' ? '✓ CONDITION 1' : 'CONDITION 1'}</span><strong>{phase === 'ORACLE' ? 'Boss defeated in combat' : 'Reduce boss HP to zero'}</strong></div><div><span>CONDITION 2</span><strong>{phase === 'ORACLE' ? 'BTC prediction awaiting result' : `${omenName} must be correct`}</strong></div></div>}
                {phase === 'ORACLE' && <div className="oracle-lock">
                  <div className="oracle-status"><span>🔮 {judgeMode ? 'FINALIZED ONCHAIN REPLAY' : 'LIVE DREAMDEX SETTLEMENT'}</span><strong aria-live="polite">{judgeMode ? replayRevealRemaining > 0 ? `SEALED · REVEAL IN ${replayRevealRemaining}S` : replayRetryRemaining > 0 ? `PROTECTED RETRY · ${replayRetryRemaining}S` : 'READY TO REVEAL' : remaining > 0 ? formatTime(remaining) : oracleBusy ? 'READING…' : `${oracleChecks} CHECK${oracleChecks === 1 ? '' : 'S'}`}</strong><small>{judgeMode ? replayRevealRemaining > 0 ? 'The server is holding the encrypted identity and outcome until the anti-peek timer reaches zero.' : replayRetryRemaining > 0 ? 'Your completed combat and sealed replay remain intact while upstream requests cool down.' : 'This fast demo uses a real finalized dreamDEX market and its recorded Somnia outcome.' : 'The boss is down, but not permanently defeated. A wrong BTC prediction triggers its fatal last strike.'}</small></div>
                  <div className="integration-proof"><span>SOMNIA CHAIN {judgeMode ? judgeProfile.chainId : SOMNIA_MAINNET_PROFILE.chainId}</span><span>{judgeMode ? `COMMIT ${marketCode}` : `MARKET #${marketCode}`}</span><span>READ-ONLY CHAIN CALL</span><span>{judgeMode ? 'IDENTITY + OUTCOME SEALED' : 'SETTLEMENT PENDING'}</span></div>
                  {judgeMode && <MarketProof market={market} mode="sealed" profile={judgeProfile} />}
                </div>}
              </div>
            </div>
          )}
        </section>

        {phase !== 'JUDGE_SETUP' && <section className={`action-dock action-dock-${phase.toLowerCase()} ${['VICTORY', 'DEAD'].includes(phase) ? 'action-dock-terminal' : ''}`}>
          {judgeMode && ['CLEARED', 'MERCHANT', 'FINAL_MERCHANT'].includes(phase) && <section className="judge-recovery-supplies" aria-label="Recovery supplies">
            <div><span>YOUR HP</span><strong>❤️ {hp}/100</strong></div>
            <div><span>POTIONS</span><strong>🧪 {potions}/{MAX_POTIONS}</strong></div>
            {phase === 'MERCHANT' && <><div><span>GOLD</span><strong><GoldIcon /> {gold}</strong></div><div><span>GEAR</span><strong>⚔️ {weapon} · 🛡️ {armor}</strong></div></>}
          </section>}
          {phase === 'SETUP' ? (
            <div className="judge-entry">
              <div className="desktop-omen-picker" aria-label="Choose BTC direction">
                <button aria-pressed={direction === 'UP'} className={direction === 'UP' ? 'up selected' : 'up'} onClick={() => setDirection('UP')}><b><GoldIcon /> BTC UP</b><small>GOLD AWAKENS</small></button>
                <button aria-pressed={direction === 'DOWN'} className={direction === 'DOWN' ? 'down selected' : 'down'} onClick={() => setDirection('DOWN')}><b>🌑 BTC DOWN</b><small>SHADOWS RISE</small></button>
              </div>
              <button className="primary-action full-run-action" onClick={startRun} disabled={!marketReady}>{marketReady ? <>BEGIN FULL EXPEDITION · {omenIcon} {omenName}</> : 'WAITING FOR ACTIVE BTC MARKET…'}</button>
              <small>Full expedition: choose a live BTC market, then fight through four ten-room tiers.</small>
            </div>
          ) : phase === 'TIER_SETUP' ? (
            <div className="tier-action">
              <button className="primary-action" onClick={startNextTier} disabled={!marketReady}>{marketReady ? <>ENTER TIER {tier + 1} · {omenIcon} {omenName}</> : 'WAITING FOR THE NEXT BTC MARKET…'}</button>
              <small>Same run: gold, potions, health, attack and defense continue into the next tier.</small>
            </div>
          ) : phase === 'COMBAT' ? (
            <>
              {judgeMode && <div className="judge-next-action"><span>JUDGE STEP {judgeStep} OF 5</span><b>{room === TOTAL_ROOMS - 2 ? 'Defeat the guard, then consider healing before the boss.' : 'Defeat the boss, then reveal its prediction fate.'}</b></div>}
              <div className="combat-actions">
                <button data-game-audio="attack" className="attack" onClick={() => act('attack')}><b>⚔️ ATTACK</b><strong>DAMAGE {attackMin}–{attackMax}</strong><small>Reliable · 15% critical</small></button>
                <button data-game-audio="storm" className="storm" onClick={() => act('storm')}><b>⚡ STORM</b><strong>DAMAGE 0–{stormMax}</strong><small>High variance · no critical</small></button>
                <button data-game-audio="potion" className="potion" onClick={() => act('potion')} disabled={potions === 0 || hp >= 100 || combatPotionUses >= combatPotionLimit}><span><b>🧪 POTION · {potions}/{MAX_POTIONS}</b><small>Heal up to 25 HP · enemy retaliates</small></span><strong>{combatPotionUses}/{combatPotionLimit}</strong></button>
              </div>
            </>
          ) : phase === 'CLEARED' ? (
            <div className="between-actions">
              <button className="heal-action" onClick={useBetweenRoomPotion} disabled={potions === 0 || hp >= 100}>🧪 HEAL +25 HP · {potions}/{MAX_POTIONS}</button>
              <button className="primary-action" onClick={nextRoom}>{judgeMode ? '👑 ENTER FINAL BOSS' : '🎲 NEXT ROOM'}</button>
            </div>
          ) : phase === 'MERCHANT' ? (
            <div className="merchant-shop">
              <div className="shop-heading"><div><span>KEVIN&apos;S SUPPLY SHOP</span><b>Prepare for Room 6</b></div><strong><GoldIcon /> {gold}</strong></div>
              <div className="shop-grid">
                <button onClick={() => merchantBuy('bandage')} disabled={bandageUsed || hp >= 100 || gold < 8}><b>❤️ BANDAGE</b><small>Heal up to 25 HP</small><strong><GoldIcon /> 8</strong></button>
                <button onClick={() => merchantBuy('potion')} disabled={merchantPotions === 0 || potions >= MAX_POTIONS || gold < 7}><b>🧪 POTION</b><small>Stock {merchantPotions}/2</small><strong><GoldIcon /> 7</strong></button>
                <button onClick={() => merchantBuy('weapon')} disabled={weaponSold || gold < 15}><b>⚔️ WEAPON +1</b><small>{weaponSold ? 'Sold' : `Current Lv ${weapon}`}</small><strong><GoldIcon /> 15</strong></button>
                <button onClick={() => merchantBuy('armor')} disabled={armorSold || gold < 15}><b>🛡️ ARMOR +1</b><small>{armorSold ? 'Sold' : `Current Lv ${armor}`}</small><strong><GoldIcon /> 15</strong></button>
              </div>
              <button className="heal-action" onClick={useBetweenRoomPotion} disabled={potions === 0 || hp >= 100}>USE OWN POTION SAFELY · {potions}/{MAX_POTIONS}</button>
              <button className="primary-action" onClick={nextRoom}>🚪 CONTINUE TO ROOM 6</button>
            </div>
          ) : phase === 'FINAL_MERCHANT' ? (
            <div className="merchant-shop">
              <div className="shop-heading"><div><span>KEVIN&apos;S AFTERCARE</span><b>Patch up before the prediction verdict</b></div><strong><GoldIcon /> {gold}</strong></div>
              {judgeMode ? <>
                <p className="judge-rest-note">Rest is optional and costs nothing. It cannot change your locked omen: a wrong prediction still ends this replay.</p>
                <button data-game-audio="potion" className="heal-action" onClick={() => finalMerchantHeal(true)} disabled={hp >= 100}>{hp >= 100 ? 'FULLY RESTED · 100/100 HP' : 'TAKE A FREE REST · RESTORE HP'}</button>
              </> : <><div className="shop-grid">
                <button onClick={() => finalMerchantHeal(false)} disabled={hp >= 100 || gold < 8}><b>❤️ FIELD DRESSING</b><small>Heal up to 25 HP</small><strong><GoldIcon /> 8</strong></button>
                <button onClick={() => finalMerchantHeal(true)} disabled={hp >= 100 || gold < finalHealCost}><b>✨ FULL TREATMENT</b><small>{hp >= 100 ? 'Already at full health' : `Restore ${100 - hp} HP`}</small><strong><GoldIcon /> {finalHealCost}</strong></button>
              </div>
              <button className="heal-action" onClick={useBetweenRoomPotion} disabled={potions === 0 || hp >= 100}>USE OWN POTION SAFELY · {potions}/{MAX_POTIONS}</button>
              </>}
              <button className="oracle-action" onClick={returnToBossFate}>🔮 RETURN TO BOSS FATE</button>
            </div>
          ) : phase === 'ORACLE' ? (
            <div className="oracle-dock" data-keyboard-action-scope={judgeMode ? '' : undefined}>
              {judgeMode && <p className="judge-reveal-summary">Boss defeated. Reveal your locked BTC result.</p>}
              <div className="between-actions">
                <button className="heal-action" onClick={visitFinalMerchant} disabled={oracleBusy}>🧰 VISIT TRAVELLING MERCHANT</button>
                <button data-keyboard-default={judgeMode ? 'true' : undefined} className={`oracle-action ${judgeMode && (replayRevealRemaining > 0 || replayRetryRemaining > 0) ? 'reveal-hold' : ''}`} onClick={() => void checkSettlement(false)} disabled={oracleBusy || (judgeMode && (replayRevealRemaining > 0 || replayRetryRemaining > 0))}>🔮 {oracleBusy ? 'VERIFYING COMBAT + SETTLEMENT…' : judgeMode && replayRevealRemaining > 0 ? `REVEAL AVAILABLE IN ${replayRevealRemaining}S` : judgeMode && replayRetryRemaining > 0 ? `RETRY REVEAL IN ${replayRetryRemaining}S` : 'REVEAL BOSS FATE'}</button>
              </div>
              {judgeMode && replayIssue && !oracleBusy && <div className="judge-connection-status" role="status" aria-label="Replay verification status">
                <b>{replayIssue === 'config_unavailable' ? 'The replay service needs attention.' : replayIssue === 'rate_limited' ? 'Please wait before checking again.' : 'Verification was interrupted.'}</b>
                <p>Your completed combat and locked omen are kept in this run. No outcome has been applied. {replayIssue === 'config_unavailable' ? 'Retry once the replay service is configured.' : replayRetryRemaining > 0 ? `You can retry in ${replayRetryRemaining}s.` : 'You can reveal the same replay again now.'}</p>
              </div>}
              <small>{judgeMode ? replayRevealRemaining > 0 ? `Anti-peek seal holding · ${judgeActionLog.length} logged actions ready for verification` : replayRetryRemaining > 0 ? `Protected retry window · ${judgeActionLog.length} logged actions remain ready` : `Finalized replay · ${judgeActionLog.length} logged actions will be server-verified before reveal` : remaining > 0 ? `Automatic checks begin in ${formatTime(remaining)}` : 'Automatic settlement checks run every 5 seconds'}</small>
            </div>
          ) : (
            <div className="new-run-action"><button className="primary-action" onClick={reset}>{judgeMode ? '↻ START NEW JUDGE DEMO' : '↻ BEGIN NEW EXPEDITION'}</button><small>{judgeMode ? 'Fresh sealed replay · same starting health, potions and equipment' : 'Keep gold and up to 5 potions · reset attack and defense'}</small></div>
          )}
        </section>}

        <section className={`dungeon-log ${mobileLogOpen ? 'mobile-open' : ''}`}>
          <div><span>DUNGEON LOG</span><b>{displayedNotice}</b><button type="button" onClick={() => setMobileLogOpen((open) => !open)} aria-expanded={mobileLogOpen}>{mobileLogOpen ? 'HIDE' : 'SHOW'}</button></div>
          <div className="dungeon-log-entries">
            {combatLog.length ? combatLog.map((entry, index) => <p key={`${entry}-${index}`} className={index === 0 ? 'latest' : ''}><GameText>{entry}</GameText></p>) : <p>The dungeon is quiet. This is almost certainly temporary.</p>}
          </div>
        </section>

        </div>
        </div>
        <footer>
          <p>DELVEWORN × DREAMDEX EVENT CONTRACTS · {shannonJudge ? 'SOMNIA SHANNON TESTNET' : 'SOMNIA'}</p>
          <span>Competition prototype · no wallet · no approval · no order submission · {replaySealed ? `sealed commitment ${marketCode}` : `market #${marketCode || '—'}`}</span>
          <span>Anonymous v2 funnel labels measure entry, verified completion and product actions; no wallet, market ID, proof, transcript, exact timing or free-form text is sent.</span>
          <nav aria-label="Project transparency"><Link href={judgeProfile.verifierPath}>VERIFY A PROOF</Link><Link href="/credits">PRIVACY · CREDITS · AI DISCLOSURE</Link></nav>
        </footer>
      </div>
    </main>
  );
}

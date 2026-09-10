'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SHANNON_TESTNET_PROFILE } from './judge-network';
import type { LiveJudgeProof } from './live-judge-proof';
import type { DirectSettlementCall } from './onchain-settlement-proof';
import styles from './live-judge-proof-details.module.css';

const EXPLORER = SHANNON_TESTNET_PROFILE.explorer;
const VERIFIER = '/shannon/live-judge/verify';

function utc(timestamp: number) {
  return `${new Date(timestamp * 1_000).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function price(value: string) {
  const [whole, fraction] = value.split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <div className={wide ? styles.wideField : styles.field}>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>;
}

function ExplorerAddress({ address }: { address: string }) {
  return <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noopener noreferrer"><code>{address}</code><span aria-hidden="true"> ↗</span></a>;
}

function CallEvidence({ label, call }: { label: string; call: DirectSettlementCall }) {
  return <details className={styles.call}>
    <summary>{label}</summary>
    <dl className={styles.fields}>
      <Field label="CONTRACT" wide><ExplorerAddress address={call.to} /></Field>
      <Field label="BLOCK HASH · REQUIRE CANONICAL" wide><code>{call.blockReference.blockHash}</code><span>{call.blockReference.requireCanonical ? 'true' : 'false'} · {call.blockTag}</span></Field>
      <Field label="CALLDATA" wide><code>{call.data}</code></Field>
      <Field label="EXACT RAW RESULT" wide><code>{call.result}</code></Field>
    </dl>
  </details>;
}

export function LiveJudgeProofDetails({ proof }: { proof: LiveJudgeProof }) {
  const [status, setStatus] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [marketCopyStatus, setMarketCopyStatus] = useState('');
  const [manualMarketCopy, setManualMarketCopy] = useState(false);
  const manualInput = useRef<HTMLTextAreaElement>(null);
  const manualId = useId();
  const { lock, lockAttestation, combatProof, onchainSettlement: settlement } = proof;
  const { market, snapshot } = lock;
  const json = JSON.stringify(proof, null, 2);
  const filename = `market-dungeon-live-proof-${market.marketId.slice(-8)}.json`;
  const secondsBeforeClose = market.expiry - lock.issuedAt;
  const winningDirection = settlement.voided ? 'VOID' : settlement.winningOutcome === 0 ? 'UP' : 'DOWN';

  useEffect(() => {
    if (manualCopy) {
      manualInput.current?.focus();
      manualInput.current?.select();
    }
  }, [manualCopy]);

  function saveProof() {
    let url: string | undefined;
    let link: HTMLAnchorElement | undefined;
    try {
      url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setStatus('Download requested. Check your browser’s downloads, then open the verifier and choose the JSON file.');
    } catch {
      setStatus('The download could not start. Select and copy the proof JSON below, then paste it into the verifier.');
      setManualCopy(true);
    } finally {
      link?.remove();
      // Leave the object URL available long enough for mobile browsers to begin the download.
      if (url) window.setTimeout(() => URL.revokeObjectURL(url!), 1_000);
    }
  }

  async function copyProof() {
    if (copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(json);
      setStatus('Proof JSON copied. Open the verifier, paste it into the proof field, and choose VERIFY LIVE PROOF.');
    } catch {
      setStatus('Automatic copy is unavailable. Select and copy the proof JSON below, then paste it into the verifier.');
      setManualCopy(true);
    } finally { setCopying(false); }
  }

  function selectJson() {
    manualInput.current?.focus();
    manualInput.current?.select();
    setStatus('Proof JSON selected. Use your device’s Copy command, then paste it into the verifier.');
  }

  async function copyMarketId() {
    try {
      await navigator.clipboard.writeText(market.marketId);
      setMarketCopyStatus('Market ID copied.');
    } catch {
      setManualMarketCopy(true);
      setMarketCopyStatus('Automatic copy is unavailable. Select and copy the market ID below.');
    }
  }

  return <section className={styles.root} aria-label="Live Judge proof and independent verification">
    <div className={styles.heading}>
      <span className={styles.eyebrow}>YOUR LIVE RUN · CHECKABLE FROM START TO SETTLEMENT</span>
      <h3>One choice. One market. A result you can verify.</h3>
      <p>Your saved proof connects the signed choice, the fight, and the final Shannon result.</p>
    </div>

    <ol className={styles.summary} aria-label="Plain-language live proof summary">
      <li><span className={styles.number} aria-hidden="true">01</span><h4>Choice before close</h4>
        <p><strong>{market.asset} {lock.direction}</strong> was locked {secondsBeforeClose} seconds before expiry. Market Dungeon’s server signed the choice and time.</p>
        <small>The choice time is server-attested, not an onchain timestamp.</small>
      </li>
      <li><span className={styles.number} aria-hidden="true">02</span><h4>A fight that replays</h4>
        <p>The saved seed and <strong>{combatProof.steps} actions</strong> reproduce victory over the guard and boss, with {combatProof.finalHp} HP left before market fate.</p>
        <small>The verifier replays these actions against the recorded combat rules.</small>
      </li>
      <li><span className={styles.number} aria-hidden="true">03</span><h4>The same market</h4>
        <p>The final settlement belongs to the <strong>exact market ID</strong> in your signed lock. The asset, exact threshold, and expiry remain bound to it.</p>
        <small>No replacement market is used to decide this run.</small>
      </li>
      <li><span className={styles.number} aria-hidden="true">04</span><h4>Settlement on Shannon</h4>
        <p>The market finalized as <strong>{market.asset} {winningDirection}</strong>. {settlement.voided ? 'VOID is a separate neutral outcome.' : `That makes your choice ${proof.result}.`}</p>
        <small>The verifier re-reads the pending snapshot and final contract state from Shannon.</small>
      </li>
    </ol>

    <section className={styles.portable} aria-label="Save and independently verify this live proof">
      <div className={styles.portableHeading}>
        <span className={styles.eyebrow}>KEEP THE PROOF</span>
        <h3>Save first. Verify in a new tab.</h3>
        <p>Save or copy the JSON, then open the verifier and choose the file or paste its contents. The file stays in your browser; verification reads public Shannon data.</p>
      </div>
      <div className={styles.actions}>
        <button className={styles.primary} type="button" onClick={saveProof}>1 · SAVE PROOF</button>
        <button className={styles.secondary} type="button" disabled={copying} onClick={() => void copyProof()}>{copying ? 'COPYING…' : 'COPY PROOF JSON'}</button>
        <a className={styles.verifier} href={VERIFIER} target="_blank" rel="noopener noreferrer">2 · OPEN INDEPENDENT VERIFIER <span aria-hidden="true">↗</span></a>
      </div>
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
      <details className={styles.manual} open={manualCopy || undefined}>
        <summary>Manual copy or inspect the full proof JSON</summary>
        <label htmlFor={manualId}>Proof JSON — copy manually</label>
        <textarea id={manualId} ref={manualInput} value={json} readOnly spellCheck={false} rows={8} />
        <button className={styles.secondary} type="button" onClick={selectJson}>SELECT ALL JSON</button>
      </details>
    </section>

    <details className={styles.evidence}>
      <summary><span>FULL LIVE PROOF EVIDENCE</span><small>Signed receipt, timestamps, contracts and raw RPC calls</small></summary>
      <div className={styles.evidenceBody}>
        <section className={styles.group} aria-label="Live server lock receipt">
          <h4>Signed server lock receipt</h4>
          <p>The signature binds the complete lock, including its original market and pending snapshot. It is a server receipt; it does not put your choice or its timestamp onchain.</p>
          <dl className={styles.fields}>
            <Field label="LOCKED CHOICE"><strong>{market.asset} {lock.direction}</strong></Field>
            <Field label="LOCKED BEFORE EXPIRY"><strong>{secondsBeforeClose} seconds</strong></Field>
            <Field label="CHOICE LOCKED · SERVER TIME"><time dateTime={new Date(lock.issuedAt * 1_000).toISOString()}>{utc(lock.issuedAt)}</time></Field>
            <Field label="SERVER SESSION EXPIRY"><time dateTime={new Date(lock.expiresAt * 1_000).toISOString()}>{utc(lock.expiresAt)}</time></Field>
            <Field label="SIGNATURE ALGORITHM"><strong>{lockAttestation.algorithm}</strong></Field>
            <Field label="SERVER ENVIRONMENT"><code>{lockAttestation.environment}</code></Field>
            <Field label="LOCK ID" wide><code>{lock.lockId}</code></Field>
            <Field label="SIGNING KEY ID" wide><code>{lockAttestation.keyId}</code></Field>
            <Field label="SERVER SIGNATURE" wide><code>{lockAttestation.signature}</code></Field>
            <Field label="PROOF SCHEMA" wide><code>{proof.schema}</code></Field>
          </dl>
        </section>

        <section className={styles.group} aria-label="Locked live market identity">
          <h4>The exact market and threshold</h4>
          <dl className={styles.fields}>
            <Field label="NETWORK"><strong>Shannon Testnet · Chain {market.chainId}</strong></Field>
            <Field label="MARKET WINDOW"><strong>{market.asset} · {market.intervalSec} seconds</strong></Field>
            <Field label="EXACT ORACLE THRESHOLD"><strong>{price(market.strikeExactUsd)}</strong></Field>
            <Field label="CHOICE MEANING"><span>{lock.direction === 'UP' ? 'Final oracle price at or above the exact threshold' : 'Final oracle price below the exact threshold'}</span></Field>
            <Field label="TRADING START"><time dateTime={new Date(market.tradingStart * 1_000).toISOString()}>{utc(market.tradingStart)}</time></Field>
            <Field label="MARKET EXPIRY"><time dateTime={new Date(market.expiry * 1_000).toISOString()}>{utc(market.expiry)}</time></Field>
            <Field label="FULL MARKET ID · UNCHANGED THROUGH SETTLEMENT" wide>
              <code>{market.marketId}</code>
              <button className={`${styles.secondary} ${styles.copyMarket}`} type="button" onClick={() => void copyMarketId()}>COPY MARKET ID</button>
              {manualMarketCopy && <input className={styles.marketIdInput} aria-label="Market ID — copy manually" readOnly value={market.marketId} onFocus={event => event.target.select()} />}
              <span className={styles.status} role="status">{marketCopyStatus}</span>
            </Field>
            <Field label="INDEXER QUESTION · THRESHOLD DISPLAYED TO TWO DECIMALS" wide><span>{market.question}</span></Field>
            <Field label="OPERATOR"><strong>{market.operatorId}</strong></Field>
            <Field label="PROFILE"><code>{lock.profileId}</code></Field>
            <Field label="VENUE ID" wide><code>{market.venueId}</code></Field>
            <Field label="ORACLE QUESTION ID" wide><code>{market.oracleQuestionId}</code></Field>
          </dl>
        </section>

        <section className={styles.group} aria-label="Reproducible combat evidence">
          <h4>Reproducible combat</h4>
          <dl className={styles.fields}>
            <Field label="COMBAT RESULT"><strong>Guard and boss defeated · {combatProof.steps} actions</strong></Field>
            <Field label="AFTER COMBAT · BEFORE MARKET FATE"><strong>{combatProof.finalHp} HP · {combatProof.remainingPotions} potions</strong></Field>
            <Field label="RULESET" wide><code>{combatProof.ruleset}</code></Field>
            <Field label="GAME SEED" wide><code>{lock.gameSeed}</code></Field>
            <Field label="SHA-256 COMBAT TRANSCRIPT DIGEST" wide><code>{combatProof.transcriptDigest}</code></Field>
          </dl>
          <details className={styles.call}><summary>Recorded combat actions · {proof.actions.length} steps</summary>
            <ol className={styles.combatActions}>{proof.actions.map((action, index) => <li key={index}><span>Room {action.room}</span><strong>{action.action.toUpperCase()}</strong></li>)}</ol>
          </details>
        </section>

        <section className={styles.group} aria-label="Shannon snapshot and settlement evidence">
          <h4>Pending snapshot and final settlement</h4>
          <p>These block hashes identify the precise chain states the verifier checks. The pending snapshot proves that the market was trading and unresolved in that block.</p>
          <dl className={styles.fields}>
            <Field label="PENDING SNAPSHOT BLOCK"><a href={`${EXPLORER}/block/${snapshot.blockNumber}`} target="_blank" rel="noopener noreferrer">BLOCK #{snapshot.blockNumber} ↗</a></Field>
            <Field label="SNAPSHOT BLOCK TIME"><time dateTime={new Date(snapshot.blockTimestamp * 1_000).toISOString()}>{utc(snapshot.blockTimestamp)}</time></Field>
            <Field label="PENDING SNAPSHOT BLOCK HASH" wide><code>{snapshot.blockHash}</code></Field>
            <Field label="FINAL SETTLEMENT SNAPSHOT BLOCK"><a href={`${EXPLORER}/block/${settlement.blockNumber}`} target="_blank" rel="noopener noreferrer">BLOCK #{settlement.blockNumber} ↗</a></Field>
            <Field label="FINALIZED RESULT"><strong>{winningDirection} · {proof.result}</strong></Field>
            <Field label="FINAL SETTLEMENT SNAPSHOT BLOCK HASH" wide><code>{settlement.blockHash}</code></Field>
            <Field label="PAYOUT VECTOR · NUMERATORS / DENOMINATOR" wide><code>[{settlement.payoutNumerators.join(', ')}] / {settlement.payoutDenominator}</code></Field>
            <Field label="SETTLEMENT MARKET KEY" wide><code>{settlement.marketKey}</code></Field>
            <Field label="POOL NONCE"><code>{settlement.nonce}</code></Field>
            <Field label="VOID STATUS"><strong>{settlement.voided ? 'VOID · neutral outcome' : 'Not voided'}</strong></Field>
            <Field label="MARKET CONTRACT" wide><ExplorerAddress address={market.marketAddress} /></Field>
            <Field label="POOL CONTRACT" wide><ExplorerAddress address={market.poolAddress} /></Field>
            <Field label="BINARY MARKETS MODULE" wide><ExplorerAddress address={settlement.moduleAddress} /></Field>
            <Field label="SETTLEMENT CONTRACT" wide><ExplorerAddress address={settlement.settlementAddress} /></Field>
            <Field label="ORACLE ADAPTER" wide><ExplorerAddress address={market.oracleAdapter} /></Field>
            <Field label="COLLATERAL TOKEN" wide><ExplorerAddress address={market.collateral} /></Field>
            <Field label="MARKET CREATOR" wide><ExplorerAddress address={market.creator} /></Field>
          </dl>
        </section>

        <section className={styles.group} aria-label="Exact live proof RPC calls">
          <h4>Exact RPC calls and responses</h4>
          <p>Each read is pinned to its recorded block hash with canonical-chain checking. The independent verifier repeats these calls against Shannon.</p>
          <div className={styles.calls}>
            <CallEvidence label="Lock snapshot · module market binding" call={snapshot.moduleMarket} />
            <CallEvidence label="Lock snapshot · trading status" call={snapshot.marketStatus} />
            <CallEvidence label="Lock snapshot · unresolved settlement" call={snapshot.settlementRecord} />
            <CallEvidence label="Lock snapshot · oracle question and exact threshold" call={snapshot.oracleQuestion} />
            <CallEvidence label="Final snapshot · module market binding" call={settlement.calls.moduleMarket} />
            <CallEvidence label="Final snapshot · settlement payouts" call={settlement.calls.settlementRecord} />
          </div>
        </section>
      </div>
    </details>
  </section>;
}

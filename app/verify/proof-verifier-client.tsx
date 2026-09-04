'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import {
  VERIFIED_PROOF_EXPLORER,
  VERIFIED_PROOF_MAX_BYTES,
  verifyProofArtifact,
  type ProofVerificationResult,
  type ProofVerificationStatus,
} from '../verify-proof';
import styles from './verify.module.css';

function statusClass(status: ProofVerificationStatus) {
  if (status === 'PASS') return styles.pass;
  if (status === 'FAIL') return styles.fail;
  return styles.unknown;
}

export default function ProofVerifierClient() {
  const [ready, setReady] = useState(false);
  const [proofText, setProofText] = useState('');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState<ProofVerificationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setResult(null);
    if (file.size > VERIFIED_PROOF_MAX_BYTES) {
      setProofText('');
      setResult({
        status: 'FAIL',
        checks: [{
          id: 'artifact',
          label: 'Proof file',
          status: 'FAIL',
          detail: `Proof exceeds the ${VERIFIED_PROOF_MAX_BYTES / 1024} KiB safety limit.`,
        }],
      });
      return;
    }
    setProofText(await file.text());
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await verifyProofArtifact(proofText));
    } catch {
      setResult({
        status: 'NOT PROVABLE',
        checks: [{
          id: 'artifact',
          label: 'Verifier',
          status: 'NOT PROVABLE',
          detail: 'The browser could not complete verification. The proof was not accepted.',
        }],
      });
    } finally {
      setBusy(false);
    }
  }

  function clearProof() {
    setProofText('');
    setFilename('');
    setResult(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="proof-verifier-title">
        <header className={styles.header}>
          <p>MARKET DUNGEON · INDEPENDENT PROOF TOOL</p>
          <h1 id="proof-verifier-title">Verify a completed run.</h1>
          <span>Load the JSON exported after a Judge Demo. This page verifies the server-authenticated lock receipt, replays combat, decodes the settlement, and re-fetches the recorded Somnia block.</span>
        </header>

        <aside className={styles.privacy} aria-label="Verification privacy and safety">
          <strong>LOCAL FILE · READ-ONLY CHAIN CHECK</strong>
          <span>The proof file is not uploaded. The page fetches only the public lock-attestation key from Market Dungeon; its recorded block reference and two read-only call inputs go to the fixed Somnia mainnet RPC. No wallet, approval, or user signature is used. Vercel may count an ordinary aggregate pageview; proof contents and verification results are never sent to analytics.</span>
        </aside>

        <form className={styles.form} onSubmit={verify}>
          <div className={styles.fileRow}>
            <label className={styles.fileButton}>
              CHOOSE PROOF JSON
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                disabled={!ready || busy}
                onChange={(event) => void chooseFile(event)}
              />
            </label>
            <span>{filename || `Maximum ${VERIFIED_PROOF_MAX_BYTES / 1024} KiB`}</span>
          </div>
          <label className={styles.textLabel} htmlFor="proof-json">OR PASTE PROOF JSON</label>
          <textarea
            id="proof-json"
            value={proofText}
            onChange={(event) => {
              setProofText(event.target.value);
              setFilename('');
              setResult(null);
            }}
            placeholder={'{\n  "schema": "market-dungeon/verified-judge-run/v2",\n  ...\n}'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div className={styles.actions}>
            <button className={styles.verifyButton} type="submit" disabled={!ready || busy || proofText.trim().length === 0}>
              {busy ? 'VERIFYING AGAINST SOMNIA…' : 'VERIFY PROOF'}
            </button>
            <button className={styles.clearButton} type="button" onClick={clearProof}>CLEAR</button>
          </div>
        </form>

        {result && (
          <section className={`${styles.result} ${statusClass(result.status)}`} aria-live="polite" aria-label="Proof verification result">
            <div className={styles.resultHeading}>
              <span>VERIFICATION RESULT</span>
              <strong>{result.status}</strong>
              <small>{result.status === 'PASS'
                ? 'The server lock receipt, every local check, and the fresh Somnia re-fetch agree.'
                : result.status === 'FAIL'
                  ? 'At least one recorded claim did not reproduce. Do not trust this artifact.'
                  : 'No mismatch was proven, but live chain verification could not finish. Retry later.'}</small>
            </div>

            {result.summary && (
              <div className={styles.summary}>
                <div><span>RUN</span><strong>{result.summary.result}</strong></div>
                <div><span>CHOICE → OUTCOME</span><strong>BTC {result.summary.lockedDirection} → BTC {result.summary.winningOutcome}</strong></div>
                <div><span>MARKET</span><strong>{result.summary.market}</strong></div>
              </div>
            )}

            <div className={styles.checks}>
              {result.checks.map((check) => (
                <article key={check.id} className={statusClass(check.status)}>
                  <span>{check.status}</span>
                  <strong>{check.label}</strong>
                  <small>{check.detail}</small>
                </article>
              ))}
            </div>

            {result.summary && (
              <details className={styles.technical}>
                <summary>INSPECT TECHNICAL REFERENCES</summary>
                <div><span>MARKET ID</span><code>{result.summary.marketId}</code></div>
                <div><span>RPC VERIFICATION SNAPSHOT</span><code>BLOCK #{result.summary.blockNumber} · {result.summary.blockHash}</code></div>
                <a
                  href={`${VERIFIED_PROOF_EXPLORER}/block/${encodeURIComponent(result.summary.blockNumber)}`}
                  target="_blank"
                  rel="noreferrer"
                >OPEN BLOCK IN SOMNIA EXPLORER ↗</a>
              </details>
            )}
          </section>
        )}

        <nav className={styles.nav} aria-label="Market Dungeon links">
          <Link href="/judge">START A NEW JUDGE RUN</Link>
          <Link href="/">MARKET DUNGEON HOME</Link>
        </nav>
      </section>
    </main>
  );
}

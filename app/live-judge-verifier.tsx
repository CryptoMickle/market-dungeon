'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { LIVE_JUDGE, LIVE_PROOF_SCHEMA, verifyLiveJudgeProof, type LiveJudgeProof } from './live-judge-proof';
import type { SettlementProofRpcOutcome } from './onchain-settlement-proof';
import styles from './live-judge.module.css';

const MAX_PROOF_BYTES = 64 * 1024;
const SIZE_ERROR = 'Choose a proof file smaller than 64 KiB, or paste its exported JSON.';

export default function LiveJudgeVerifier() {
  const [proofText, setProofText] = useState('');
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<'file' | 'verify' | null>(null);
  const [result, setResult] = useState<SettlementProofRpcOutcome | null>(null);
  const [verifiedProof, setVerifiedProof] = useState<LiveJudgeProof | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const revision = useRef(0);

  useEffect(() => () => {
    revision.current += 1;
    activeRequest.current?.abort();
  }, []);

  function resetVerification() {
    revision.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(null);
    setResult(null);
    setVerifiedProof(null);
    return revision.current;
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const currentRevision = resetVerification();
    setFilename(file.name);
    setProofText('');
    if (file.size > MAX_PROOF_BYTES) {
      setResult({ status: 'FAIL', reason: SIZE_ERROR });
      return;
    }
    setBusy('file');
    try {
      const text = await file.text();
      if (revision.current !== currentRevision) return;
      setProofText(text);
    } catch {
      if (revision.current !== currentRevision) return;
      setResult({ status: 'NOT PROVABLE', reason: 'This file could not be read. Choose it again or paste the proof JSON.' });
    } finally {
      if (revision.current === currentRevision) setBusy(null);
    }
  }

  function changeProof(text: string) {
    resetVerification();
    setFilename('');
    if (fileInput.current) fileInput.current.value = '';
    if (new TextEncoder().encode(text).byteLength > MAX_PROOF_BYTES) {
      setProofText('');
      setResult({ status: 'FAIL', reason: SIZE_ERROR });
      return;
    }
    setProofText(text);
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const currentRevision = resetVerification();
    if (new TextEncoder().encode(proofText).byteLength > MAX_PROOF_BYTES) {
      setResult({ status: 'FAIL', reason: SIZE_ERROR });
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(proofText);
    } catch {
      setResult({ status: 'FAIL', reason: 'This is not valid JSON. Choose the proof file exported after a completed live Judge run.' });
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy('verify');
    try {
      // The verifier obtains its trusted key only from LIVE_JUDGE.publicKeyPath.
      // File contents cannot choose a public key, RPC endpoint or remote URL.
      const outcome = await verifyLiveJudgeProof(value, {
        rpc: async (method, params) => {
          const response = await fetch(LIVE_JUDGE.rpc, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
          });
          const body = await response.json() as { result?: unknown; error?: unknown };
          if (!response.ok || body.error || !Object.hasOwn(body, 'result')) throw new Error('Shannon is unavailable');
          return body.result;
        },
      });
      if (revision.current !== currentRevision || controller.signal.aborted) return;
      setResult(outcome);
      if (outcome.status === 'PASS') setVerifiedProof(value as LiveJudgeProof);
    } catch {
      if (revision.current !== currentRevision || controller.signal.aborted) return;
      setResult({ status: 'NOT PROVABLE', reason: 'Verification could not finish. The proof has not been accepted. Try again when the public key and Shannon are available.' });
    } finally {
      if (revision.current === currentRevision) {
        activeRequest.current = null;
        setBusy(null);
      }
    }
  }

  function clearProof() {
    resetVerification();
    setProofText('');
    setFilename('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <main className={styles.shell}>
      <div className={styles.frame} style={{ maxWidth: 900 }}>
        <section className={styles.panel} aria-labelledby="live-verifier-title">
          <span className={styles.eyebrow}>MARKET DUNGEON · LIVE JUDGE PROOF</span>
          <h1 id="live-verifier-title">Verify a live dungeon run.</h1>
          <p>Choose the JSON exported after a completed one-minute Judge run. Your browser checks the signed choice, replays both fights, and reads the recorded market states directly from Somnia testnet.</p>
          <p id="live-proof-privacy">The file stays in your browser. This page fetches Market Dungeon’s public verification key and sends read requests to the fixed Shannon RPC. No wallet or transaction is needed.</p>

          <form onSubmit={verify} aria-busy={busy !== null}>
            <label htmlFor="live-proof-file">Choose proof JSON</label>
            <input
              ref={fileInput}
              id="live-proof-file"
              type="file"
              accept="application/json,.json"
              disabled={busy !== null}
              onChange={event => void chooseFile(event)}
              aria-describedby="live-proof-file-help live-proof-privacy"
              style={{ display: 'block', width: '100%', margin: '12px 0' }}
            />
            <p id="live-proof-file-help" style={{ overflowWrap: 'anywhere' }}>{filename || 'Maximum file size: 64 KiB.'}</p>
            <label htmlFor="live-proof-json">Or paste proof JSON</label>
            <textarea
              id="live-proof-json"
              className={styles.proofInput}
              value={proofText}
              disabled={busy !== null}
              onChange={event => changeProof(event.target.value)}
              placeholder={`{\n  "schema": "${LIVE_PROOF_SCHEMA}",\n  ...\n}`}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-describedby="live-proof-file-help"
            />
            <button className={styles.primary} type="submit" disabled={busy !== null || !proofText.trim()}>
              {busy === 'file' ? 'READING LOCAL FILE…' : busy === 'verify' ? 'VERIFYING AGAINST SHANNON…' : 'VERIFY LIVE PROOF'}
            </button>
            <button className={styles.secondary} type="button" onClick={clearProof}>
              {busy ? 'CANCEL AND CLEAR' : 'CLEAR'}
            </button>
          </form>

          <div aria-live="polite" aria-atomic="true">
            {result && (
              <section className={styles.error} aria-label="Live proof verification result" style={{
                borderColor: result.status === 'PASS' ? '#34d399' : result.status === 'FAIL' ? '#fb7185' : '#fbbf24',
                background: result.status === 'PASS' ? '#102d24' : result.status === 'FAIL' ? '#351720' : '#322315',
              }}>
                <h2 style={{ color: 'inherit', fontSize: 28 }}>{result.status}</h2>
                <p>{result.status === 'PASS'
                  ? 'The signed choice, combat and fresh chain checks agree.'
                  : result.status === 'FAIL'
                    ? 'This proof was not accepted: a recorded claim or the file itself did not validate.'
                    : 'The checks could not finish. This is not a verified result; try again.'}</p>
                <p>{result.reason}</p>
              </section>
            )}
          </div>

          {verifiedProof && (
            <section aria-label="Verified live run">
              <div className={styles.verification}>
                <div><small>RUN RESULT</small><b>{verifiedProof.result}</b></div>
                <div><small>LOCKED CHOICE</small><b>{verifiedProof.lock.market.asset} {verifiedProof.lock.direction}</b></div>
                <div><small>CHOICE RECEIPT</small><b>Server signature valid</b></div>
                <div><small>MARKET AND SETTLEMENT</small><b>Confirmed on Shannon</b></div>
              </div>
              <p>The server signs when your choice was locked. Shannon independently confirms that the recorded market was open before expiry and later finalized. Your choice is not recorded as an onchain trade.</p>
              <details className={styles.proof}>
                <summary>INSPECT VERIFIED REFERENCES</summary>
                <dl>
                  <dt>Network</dt><dd>Somnia Shannon testnet · {LIVE_JUDGE.chainId}</dd>
                  <dt>Market</dt><dd>{verifiedProof.lock.market.marketId}</dd>
                  <dt>Question</dt><dd>{verifiedProof.lock.market.question}</dd>
                  <dt>Lock block</dt><dd>{verifiedProof.lock.snapshot.blockNumber}</dd>
                  <dt>Final block</dt><dd>{verifiedProof.onchainSettlement.blockNumber}</dd>
                </dl>
                <a href={`https://shannon-explorer.somnia.network/block/${encodeURIComponent(verifiedProof.onchainSettlement.blockNumber)}`} target="_blank" rel="noreferrer">OPEN FINAL BLOCK IN EXPLORER ↗</a>
              </details>
            </section>
          )}
        </section>
        <nav className={styles.footer} aria-label="Market Dungeon links">
          <Link href="/shannon/live-judge">PLAY LIVE JUDGE</Link>
          <Link href="/shannon/verify">VERIFY A HISTORICAL REPLAY</Link>
          <Link href="/">MARKET DUNGEON HOME</Link>
        </nav>
      </div>
    </main>
  );
}

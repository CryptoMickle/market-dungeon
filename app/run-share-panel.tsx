'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { ShareAction } from './analytics-events';
import { downloadFile, renderRunCardPng } from './run-card-renderer';
import { runShareCardArtworkPath, runShareCardDataUrl, runShareCaption, runShareClipboardText, runShareXUrl, type RunShareCardInput } from './share-run-card';

type PreparedCard = { key: string; file: File; url: string };

export function RunSharePanel({ input, challengeUrl, onAction, onChallenge }: {
  input: RunShareCardInput;
  challengeUrl: string;
  onAction: (action: ShareAction) => void;
  onChallenge: () => void;
}) {
  const key = JSON.stringify(input);
  const [prepared, setPrepared] = useState<PreparedCard | null>(null);
  const [failedKey, setFailedKey] = useState('');
  const [status, setStatus] = useState('');
  const [challengeStatus, setChallengeStatus] = useState('');
  const [manualChallenge, setManualChallenge] = useState(false);
  const card = prepared?.key === key ? prepared : null;
  const caption = runShareClipboardText(input, challengeUrl);
  const encounters = Math.min(2, input.enemiesDefeated);
  const alt = input.mode === 'JUDGE_REPLAY'
    ? `Market Dungeon Judge Replay share card: ${encounters} of 2 replay encounters`
    : `Market Dungeon share card: room ${input.reachedRoom} of ${input.totalRooms}`;

  useEffect(() => {
    let disposed = false;
    let url: string | undefined;
    // Prepare the composite PNG before any share gesture. Awaiting image loads
    // inside that gesture can exhaust Safari's transient user activation.
    void renderRunCardPng(JSON.parse(key) as RunShareCardInput).then((file) => {
      if (disposed) return;
      url = URL.createObjectURL(file);
      setPrepared({ key, file, url });
    }).catch(() => { if (!disposed) setFailedKey(key); });
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  }, [key]);

  async function shareChallenge() {
    setManualChallenge(false);
    // This action shares an invitation, not the PNG. It must remain available
    // even when card rendering fails or the device cannot share image files.
    const data = { title: 'Can you beat my Market Dungeon run?', text: runShareCaption(input), url: challengeUrl };
    try {
      if (typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(data))) {
        const result = navigator.share(data);
        if (!result || typeof result.then !== 'function') throw new Error('Share menu unavailable');
        await result;
        onAction('native-completed');
        onChallenge();
        setChallengeStatus('Invitation handed to your share menu. No post or delivery is confirmed here.');
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setChallengeStatus('Invitation sharing cancelled.');
        return;
      }
      setChallengeStatus('Invitation sharing is unavailable. Select and copy the text below.');
      setManualChallenge(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(caption);
      onAction('text-copied');
      onChallenge();
      setChallengeStatus('Challenge invitation copied. Paste it into a message to another player.');
    } catch {
      setChallengeStatus('Copy is unavailable. Select and copy the invitation below.');
      setManualChallenge(true);
    }
  }

  async function saveImage() {
    if (!card) return;
    try {
      // iOS offers Save Image through its file-only system menu. Invoke it
      // directly from this gesture; opening X is always a separate action.
      const data = { files: [card.file] };
      if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || !navigator.canShare(data)) {
        downloadCard();
        return;
      }
      const result = navigator.share(data);
      if (!result || typeof result.then !== 'function') {
        setStatus('The image menu did not confirm opening. Touch and hold the card, or use More options below.');
        return;
      }
      await result;
      onAction('native-completed');
      // The API cannot tell whether the user saved, shared, or chose a target.
      // Do not claim a saved image, mark a step complete, or open X automatically.
      setStatus('Image menu closed. Check that the card was saved, then open X and attach it.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setStatus('Saving cancelled. Your card is still here.');
        return;
      }
      setStatus('Could not open the image menu. Touch and hold the card, or use More options below.');
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      onAction('text-copied');
      onChallenge();
      setStatus('Post text copied. Paste it into your draft with the image.');
    } catch {
      setStatus('Copy is unavailable. Select and copy the text below.');
    }
  }

  function downloadCard() {
    if (!card) return;
    downloadFile(card.file);
    onAction('card-downloaded');
    setStatus('Download requested. On iPhone, check Files → Downloads; this does not save to Photos.');
  }

  const image = <Image
    className="run-share-card"
    src={card?.url ?? runShareCardDataUrl(input)}
    style={card ? undefined : { backgroundImage: `url(${runShareCardArtworkPath(input)})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
    alt={alt}
    width={1200} height={675} unoptimized
  />;

  return <section className="run-share-panel" aria-label="Share your Market Dungeon result">
    <div className="run-share-heading">
      <span>YOUR MARKET DUNGEON RUN CARD</span>
      <strong>{input.mode === 'JUDGE_REPLAY' ? `FINAL-TIER JUDGE REPLAY · ${encounters}/2 REPLAY ENCOUNTERS` : `ROOM ${input.reachedRoom}/${input.totalRooms} · ${input.enemiesDefeated} ENEMIES DEFEATED`}</strong>
      <small>{input.mode === 'JUDGE_REPLAY' && input.verifiedOnchain
        ? 'A social-ready summary of this verified replay. The portable proof is available in Evidence below.'
        : input.verifiedOnchain
          ? 'A social-ready summary of the completed expedition and its verified Event Contract settlements. The card itself is not portable proof.'
          : 'A social-ready snapshot of how far this expedition reached.'}</small>
    </div>
    {image}
    <div className="run-share-actions run-share-x-steps" aria-label="Save image, then open X">
      <button className="share-primary" type="button" disabled={!card} onClick={() => void saveImage()}>1 · SAVE IMAGE</button>
      <a className="share-x" href={runShareXUrl(input, challengeUrl)} target="_blank" rel="noopener noreferrer" onClick={() => { onAction('x-intent-opened'); onChallenge(); }}>2 · OPEN X DRAFT ↗</a>
    </div>
    <p className="run-share-x-note">Save the image first, then attach it in X. The draft includes your text and link, not the image.</p>
    <p className="run-save-hint">On iPhone, choose Save Image in the menu, or touch and hold the card. Downloads go to Files, not Photos.</p>
    <p className="run-share-status" role="status">{status || (!card ? failedKey === key ? 'Image preparation failed. You can still open the X draft or send an invitation.' : 'Preparing your image…' : '')}</p>
    <div className="run-share-invitation">
      <button type="button" onClick={() => void shareChallenge()}>↗ CHALLENGE A PLAYER</button>
      <small>Send a text-and-link invitation to a fresh sealed replay.</small>
    </div>
    <small className="challenge-share-status" aria-live="polite">{challengeStatus}</small>
    {manualChallenge && <label className="share-caption-label">Challenge invitation — copy manually
      <textarea value={caption} readOnly rows={5} />
    </label>}
    <details className="run-save-options">
      <summary>More options</summary>
      <p>If saving is unavailable, download the PNG to Files. On iPhone, open the file and choose Share → Save Image if offered, then attach it from Photos in X.</p>
      <div className="run-share-actions">
        <button type="button" disabled={!card} onClick={downloadCard}>DOWNLOAD PNG TO FILES</button>
        <button type="button" onClick={() => void copyCaption()}>COPY POST TEXT</button>
      </div>
      <label className="share-caption-label" htmlFor="share-caption">Post text — copy manually if needed</label>
      <textarea id="share-caption" value={caption} readOnly rows={5} />
    </details>
  </section>;
}

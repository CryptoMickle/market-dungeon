'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
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
  const dialog = useRef<HTMLDialogElement>(null);
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

  function showOptions() { dialog.current?.showModal(); }

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

  async function shareImage() {
    if (!card) return;
    try {
      // Image-only sharing exposes image targets (including Save Image where
      // provided by iOS). Copying the caption is a separate, explicit gesture.
      const data = { files: [card.file] };
      if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || !navigator.canShare(data)) {
        setStatus('Image sharing is unavailable here. Touch and hold the image, or download it to Files.');
        return;
      }
      const result = navigator.share(data);
      if (!result || typeof result.then !== 'function') {
        setStatus('The share menu did not confirm opening. Try again or save the image below.');
        return;
      }
      await result;
      onAction('native-completed');
      setStatus('Image handed to your share menu. Check your chosen app; no post is confirmed here.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setStatus('Sharing cancelled. Your card is still here.');
        return;
      }
      setStatus('Could not share the image. Touch and hold it, or download it to Files.');
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      onAction('text-copied');
      onChallenge();
      setStatus('Challenge text copied. Paste it into your post with the image.');
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

  const image = (inDialog = false) => <Image
    className="run-share-card"
    src={card?.url ?? runShareCardDataUrl(input)}
    style={card ? undefined : { backgroundImage: `url(${runShareCardArtworkPath(input)})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
    alt={inDialog ? 'Your complete run card, ready to save or share' : alt}
    width={1200} height={675} unoptimized
  />;

  return <section className="run-share-panel" aria-label="Share your Market Dungeon result">
    <div className="run-share-heading">
      <span>YOUR MARKET DUNGEON RUN CARD</span>
      <strong>{input.mode === 'JUDGE_REPLAY' ? `FINAL-TIER JUDGE REPLAY · ${encounters}/2 REPLAY ENCOUNTERS` : `ROOM ${input.reachedRoom}/${input.totalRooms} · ${input.enemiesDefeated} ENEMIES DEFEATED`}</strong>
      <small>{input.verifiedOnchain ? 'A social-ready summary of this verified replay. The portable proof is available in Evidence below.' : 'A social-ready snapshot of how far this expedition reached.'}</small>
    </div>
    {image()}
    <div className="run-share-actions">
      <button className="share-primary" type="button" onClick={() => void shareChallenge()}>↗ CHALLENGE A PLAYER</button>
      <a className="share-x" href={runShareXUrl(input, challengeUrl)} target="_blank" rel="noopener noreferrer" onClick={() => { onAction('x-intent-opened'); onChallenge(); }}>SHARE ON X ↗</a>
      <button type="button" onClick={showOptions}>SAVE CARD</button>
    </div>
    <small className="run-share-x-note">Challenge a player shares an invitation. Share on X opens a text draft; save the card first if you want to attach its image. Every challenge starts a fresh sealed replay.</small>
    <small className="run-share-status" aria-live="polite">{challengeStatus}</small>
    {manualChallenge && <label className="share-caption-label">Challenge invitation — copy manually
      <textarea value={caption} readOnly rows={5} />
    </label>}
    <dialog className="run-share-dialog" ref={dialog} aria-labelledby="share-dialog-title">
      <div className="share-dialog-heading">
        <h2 id="share-dialog-title">Save your run card</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Close sharing options">✕</button>
      </div>
      <p>Save this image before attaching it to your X post, or share the image through your phone’s share menu.</p>
      {card ? image(true) : <p className="share-image-placeholder">{failedKey === key ? 'The image could not be prepared. Text sharing is still available.' : 'Preparing your complete run card…'}</p>}
      <div className="run-share-actions">
        <button type="button" onClick={() => void copyCaption()}>1 · COPY CHALLENGE TEXT</button>
        <button className="share-primary" type="button" disabled={!card} onClick={() => void shareImage()}>2 · SHARE / SAVE IMAGE</button>
      </div>
      <p>To save to Photos on iPhone, choose <strong>Save Image</strong> in the share menu if offered, or touch and hold the image above. The available options depend on your browser.</p>
      <details>
        <summary>Attach the card manually in X</summary>
        <p>Save the image first. Then open X and attach it from Photos. This link fills in the text only; it cannot attach this local image.</p>
        <div className="run-share-actions">
          <button type="button" disabled={!card} onClick={downloadCard}>DOWNLOAD PNG TO FILES</button>
          <a className="share-x" href={runShareXUrl(input, challengeUrl)} target="_blank" rel="noopener noreferrer" onClick={() => { onAction('x-intent-opened'); onChallenge(); }}>OPEN X WITH TEXT ↗</a>
        </div>
        <p>iPhone downloads go to Files, not Photos. In Files, open the PNG and use Share → Save Image if available.</p>
      </details>
      <label className="share-caption-label" htmlFor="share-caption">Challenge text — copy manually if needed</label>
      <textarea id="share-caption" value={caption} readOnly rows={5} />
      <p className="share-dialog-status" role="status">{status || (!card ? failedKey === key ? 'Image preparation failed. You can still copy the challenge text.' : 'Preparing your image…' : '')}</p>
    </dialog>
  </section>;
}

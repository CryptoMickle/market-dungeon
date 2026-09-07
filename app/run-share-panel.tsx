'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { ShareAction } from './analytics-events';
import { downloadFile, renderRunCardPng } from './run-card-renderer';
import { runShareCardArtworkPath, runShareCardDataUrl, runShareClipboardText, runShareXUrl, type RunShareCardInput } from './share-run-card';

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
      <button className="share-primary" type="button" onClick={showOptions}>↗ CHALLENGE A PLAYER</button>
      <button className="share-x" type="button" onClick={showOptions}>SHARE ON X ↗</button>
      <button type="button" onClick={showOptions}>SAVE CARD</button>
    </div>
    <small className="run-share-x-note">Save or share the image, then add your challenge text. Every challenge opens a fresh, separately sealed replay.</small>
    <dialog className="run-share-dialog" ref={dialog} aria-labelledby="share-dialog-title">
      <div className="share-dialog-heading">
        <h2 id="share-dialog-title">Share your run</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Close sharing options">✕</button>
      </div>
      <p>Copy the text, then share the image to X from your phone’s share menu if X is available.</p>
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

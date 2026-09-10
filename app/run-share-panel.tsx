'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { ShareAction } from './analytics-events';
import { downloadFile, renderRunCardPng } from './run-card-renderer';
import { LIVE_JUDGE_LOCAL_LINK_NOTICE, isLocalLiveJudgePreview, runShareCardArtworkPath, runShareCardDataUrl, runShareCaption, runShareChallengeUrl, runShareClipboardText, runShareSettlementVerified, runShareXUrl, type RunShareCardInput } from './share-run-card';

type SavePlatform = 'ios' | 'android' | 'desktop';
type PreparedCard = { key: string; file: File; url: string; platform: SavePlatform };

function usesIOSImageMenu() {
  // iPadOS can identify as a Mac. Touch support distinguishes it from macOS;
  // viewport width alone must not make desktop browsers open a share sheet.
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function savePlatform(): SavePlatform {
  return usesIOSImageMenu() ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop';
}

const SAVE_HINTS: Record<SavePlatform, string> = {
  android: 'On Android, Save Image downloads a PNG. Find it in your browser menu → Downloads, or Files → Downloads.',
  ios: 'On iPhone or iPad, choose Save Image if offered in the menu, or touch and hold the card. Downloads go to Files, not Photos.',
  desktop: 'Save Image downloads a PNG. Find it in your browser’s downloads or your Downloads folder.',
};

export function RunSharePanel({ input, challengeUrl, localOnly: localOnlyOverride, onAction, onChallenge }: {
  input: RunShareCardInput;
  challengeUrl?: string;
  localOnly?: boolean;
  onAction: (action: ShareAction) => void;
  onChallenge: () => void;
}) {
  const inviteUrl = runShareChallengeUrl(input, challengeUrl);
  const localOnly = localOnlyOverride ?? (input.mode === 'LIVE_JUDGE' && isLocalLiveJudgePreview(inviteUrl));
  const key = JSON.stringify({ input, challengeUrl: inviteUrl ?? undefined });
  const [prepared, setPrepared] = useState<PreparedCard | null>(null);
  const [failedKey, setFailedKey] = useState('');
  const [status, setStatus] = useState('');
  const [challengeStatus, setChallengeStatus] = useState('');
  const [manualChallenge, setManualChallenge] = useState(false);
  const card = prepared?.key === key ? prepared : null;
  const caption = runShareClipboardText(input, inviteUrl ?? undefined);
  const encounters = Math.min(2, Math.max(0, Math.floor(Number.isFinite(input.enemiesDefeated) ? input.enemiesDefeated : 0)));
  const liveJudge = input.mode === 'LIVE_JUDGE';
  const verified = runShareSettlementVerified(input);
  const alt = liveJudge
    ? `Market Dungeon Live Judge share card: ${encounters} of 2 encounters · Shannon testnet`
    : input.mode === 'JUDGE_REPLAY'
    ? `Market Dungeon Judge Replay share card: ${encounters} of 2 replay encounters`
    : `Market Dungeon share card: room ${input.reachedRoom} of ${input.totalRooms}`;

  useEffect(() => {
    let disposed = false;
    let url: string | undefined;
    // Prepare the composite PNG before any share gesture. Awaiting image loads
    // inside that gesture can exhaust Safari's transient user activation.
    const rendering = JSON.parse(key) as { input: RunShareCardInput; challengeUrl?: string };
    void renderRunCardPng(rendering.input, rendering.challengeUrl).then((file) => {
      if (disposed) return;
      url = URL.createObjectURL(file);
      // Detect only in this client-side preparation callback. Server markup and
      // the first client render use the same neutral hint; nothing is stored.
      setPrepared({ key, file, url, platform: savePlatform() });
    }).catch(() => { if (!disposed) setFailedKey(key); });
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  }, [key]);

  async function shareChallenge() {
    if (!inviteUrl) return;
    setManualChallenge(false);
    // This action shares an invitation, not the PNG. It must remain available
    // even when card rendering fails or the device cannot share image files.
    const data = { title: 'Can you defeat the boss and the market?', text: runShareCaption(input, inviteUrl), url: inviteUrl };
    try {
      if (typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(data))) {
        const result = navigator.share(data);
        if (!result || typeof result.then !== 'function') throw new Error('Share menu unavailable');
        await result;
        onAction('native-completed');
        onChallenge();
        setChallengeStatus(localOnly
          ? 'Local invitation handed to your share menu. The link only works on this Mac; no delivery is confirmed here.'
          : 'Invitation handed to your share menu. No post or delivery is confirmed here.');
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
      setChallengeStatus(localOnly
        ? 'Local invitation copied. This link only works on this Mac.'
        : 'Challenge invitation copied. Paste it into a message to another player.');
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
      if (!usesIOSImageMenu() || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || !navigator.canShare(data)) {
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
      setStatus(localOnly && inviteUrl
        ? 'Post text copied. Its invitation link only works on this Mac.'
        : 'Post text copied. Paste it into your draft with the image.');
    } catch {
      setStatus('Copy is unavailable. Select and copy the text below.');
    }
  }

  function downloadCard() {
    if (!card) return;
    downloadFile(card.file);
    onAction('card-downloaded');
    const platform = savePlatform();
    const location = platform === 'ios'
      ? 'On iPhone or iPad, check Files → Downloads; this does not save to Photos.'
      : platform === 'android'
        ? 'On Android, open your browser menu → Downloads, or Files → Downloads. Find this PNG and attach it in X.'
        : 'Check your browser’s downloads or your Downloads folder, then attach the PNG in X.';
    // A download gesture cannot confirm that the browser wrote a file.
    setStatus(`Download requested: ${card.file.name}. ${location}`);
  }

  const image = <Image
    className="run-share-card"
    src={card?.url ?? runShareCardDataUrl(input, inviteUrl ?? undefined)}
    style={card ? undefined : { backgroundImage: `url(${runShareCardArtworkPath(input)})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
    alt={alt}
    width={1200} height={675} unoptimized
  />;

  return <section className="run-share-panel" aria-label="Share your Market Dungeon result">
    <div className="run-share-heading">
      <span>YOUR MARKET DUNGEON RUN CARD</span>
      <strong>{liveJudge ? `LIVE JUDGE · ${encounters}/2 ENCOUNTERS · 1-MINUTE TESTNET` : input.mode === 'JUDGE_REPLAY' ? `FINAL-TIER JUDGE REPLAY · ${encounters}/2 REPLAY ENCOUNTERS` : `ROOM ${input.reachedRoom}/${input.totalRooms} · ${input.enemiesDefeated} ENEMIES DEFEATED`}</strong>
      <small>{liveJudge
        ? verified
          ? 'A summary of your live one-minute Shannon testnet run. The choice is server-signed and settlement is checked onchain. Save the separate live proof for independent verification.'
          : 'A snapshot of your live Judge combat. No market settlement was applied to this run.'
        : input.mode === 'JUDGE_REPLAY' && input.verifiedOnchain
        ? 'A social-ready summary of this verified replay. Use the Portable Proof panel for independent verification.'
        : input.verifiedOnchain
          ? 'A social-ready summary of the completed expedition and its verified Event Contract settlements. The card itself is not portable proof.'
          : 'A social-ready snapshot of how far this expedition reached.'}</small>
    </div>
    {image}
    <div className="run-share-actions run-share-x-steps" aria-label="Save image, then open X">
      <button className="share-primary" type="button" disabled={!card} onClick={() => void saveImage()}>1 · SAVE IMAGE</button>
      <a className="share-x" href={runShareXUrl(input, challengeUrl)} target="_blank" rel="noopener noreferrer" onClick={() => { onAction('x-intent-opened'); onChallenge(); }}>2 · OPEN X DRAFT ↗</a>
    </div>
    <p className="run-share-x-note">Save the image first, then attach it in X. The draft includes your text{inviteUrl ? ' and link' : ''}, not the image.</p>
    {localOnly && <p className="run-share-x-note" role="note">{LIVE_JUDGE_LOCAL_LINK_NOTICE} The card can be shared as a local test result.</p>}
    <p className="run-save-hint">{card ? SAVE_HINTS[card.platform] : 'Save Image prepares a PNG to attach in your post. Need help finding it? Open “Where is my image?” below.'}</p>
    <p className="run-share-status" role="status">{status || (!card ? failedKey === key ? 'Image preparation failed. You can still open the X draft or send an invitation.' : 'Preparing your image…' : '')}</p>
    <details className="run-save-options">
      <summary>Where is my image?</summary>
      <p><strong>Android:</strong> Open your browser menu → Downloads, or the Files app → Downloads. Look for the filename shown after saving, then attach that PNG to your X draft.</p>
      <p><strong>iPhone / iPad:</strong> Save Image in the sharing menu saves to Photos. A downloaded PNG is in Files → Downloads; open it and choose Share → Save Image if offered.</p>
      <p><strong>Computer:</strong> Open your browser’s downloads or your Downloads folder. Attach the PNG to your X draft.</p>
    </details>
    <div className="run-share-invitation">
      <button type="button" disabled={!inviteUrl} onClick={() => void shareChallenge()}>↗ INVITE A PLAYER</button>
      <small>{liveJudge
        ? localOnly
          ? 'A fresh live run uses the next available one-minute testnet market. This local link only opens on this Mac.'
          : 'This invitation opens a fresh live run with the next available one-minute testnet market.'
        : 'They receive a fresh, separate replay with their own hidden market and verified result.'}</small>
    </div>
    <small className="challenge-share-status" aria-live="polite">{challengeStatus}</small>
    {manualChallenge && <label className="share-caption-label">Challenge invitation — copy manually
      <textarea value={caption} readOnly rows={5} />
    </label>}
    <details className="run-save-options">
      <summary>More options</summary>
      <p>Download a PNG directly, or copy the post text. Use “Where is my image?” above to find the file on your device.</p>
      <div className="run-share-actions">
        <button type="button" disabled={!card} onClick={downloadCard}>DOWNLOAD PNG TO FILES</button>
        <button type="button" onClick={() => void copyCaption()}>COPY POST TEXT</button>
      </div>
      <label className="share-caption-label" htmlFor="share-caption">Post text — copy manually if needed</label>
      <textarea id="share-caption" value={caption} readOnly rows={5} />
    </details>
  </section>;
}

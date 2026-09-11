'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { GameAudioToggle } from '../game-audio';
import styles from './wallet-loading.module.css';

export type KevinWalletLoadingProps = {
  phase: 'connect' | 'prepare' | 'transaction';
  walletOpenLink?: string;
  depositStt?: string;
  onDismiss: () => void;
};

const SDK_MODAL_SELECTOR = 'mm-install-modal, mm-otp-modal';
const COPY = {
  connect: {
    label: 'METAMASK · CONNECTION',
    title: 'Kevin is waiting at the gate.',
    description: 'Approve the connection and Somnia Shannon testnet in MetaMask, then return to the game.',
    status: 'Waiting for your wallet connection',
    note: 'Your omen is still unlocked. No STT is sent when you connect.',
    dismissal: 'Closing this screen does not cancel the wallet connection request.',
  },
  prepare: {
    label: 'SOMNIA SHANNON · REQUEST',
    title: 'Preparing Kevin’s request.',
    description: 'Checking the agent’s testnet fee and preparing the request for your approval.',
    status: 'Reading the testnet request fee',
    note: 'Your omen is locked. You approve the STT amount in MetaMask before the paid request is sent.',
    dismissal: 'Preparation continues if you return to the game.',
  },
  transaction: {
    label: 'METAMASK · APPROVAL',
    title: 'Your approval is next.',
    description: 'Check the amount in MetaMask, approve the testnet request, then return to the game.',
    status: 'Waiting for your request approval',
    note: 'Kevin’s paid request uses Somnia Shannon testnet. You can decline and keep playing.',
    dismissal: 'Closing this screen does not cancel the wallet request. Check MetaMask to approve or decline it.',
  },
} as const;

/** A normal body portal keeps the SDK's QR dialog above this waiting screen. */
export function KevinWalletLoading({ phase, walletOpenLink, depositStt, onDismiss }: KevinWalletLoadingProps) {
  const headingId = useId();
  const descriptionId = useId();
  const card = useRef<HTMLElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [sdkModalOpen, setSdkModalOpen] = useState(false);
  const copy = COPY[phase];

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let sdkWasOpen = false;
    let focusFrame: number | undefined;
    const syncSdkModal = () => {
      const open = Boolean(document.querySelector(SDK_MODAL_SELECTOR));
      setSdkModalOpen(open);
      // Only restore our focus after the SDK removes its own modal. Never trap
      // keyboard input or move focus away from the SDK's QR/connection controls.
      if (sdkWasOpen && !open) focusFrame = requestAnimationFrame(() => {
        if (!document.querySelector(SDK_MODAL_SELECTOR)) back.current?.focus({ preventScroll: true });
      });
      sdkWasOpen = open;
    };
    const observer = new MutationObserver(syncSdkModal);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = requestAnimationFrame(() => {
      syncSdkModal();
      if (!document.querySelector(SDK_MODAL_SELECTOR)) back.current?.focus({ preventScroll: true });
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
      if (previous?.isConnected && !previous.closest('[inert]') && !document.querySelector(SDK_MODAL_SELECTOR)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (sdkModalOpen) return;
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onDismiss();
    } else if (event.key === 'Tab') {
      const controls = card.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  if (typeof document === 'undefined') return null;
  return createPortal(<div className={styles.overlay} data-testid="kevin-wallet-loading" data-phase={phase}
    inert={sdkModalOpen || undefined} aria-hidden={sdkModalOpen || undefined}>
    <section ref={card} className={styles.card} role="dialog" aria-modal={!sdkModalOpen || undefined}
      aria-labelledby={headingId} aria-describedby={descriptionId} onKeyDown={handleKey}>
      <header className={styles.header}>
        <span>SOMNIA AGENT KEVIN<small>{copy.label}</small></span>
        <GameAudioToggle inline />
      </header>
      <div className={styles.rune} aria-hidden="true"><span>◇</span></div>
      <h2 id={headingId}>{copy.title}</h2>
      <p id={descriptionId} className={styles.description}>{copy.description}</p>
      <div className={styles.progress} role="status" aria-live="polite">
        <span className={styles.statusDot} aria-hidden="true" />{copy.status}
      </div>
      {phase === 'transaction' && <p className={styles.quote}>
        <span>KEVIN’S REQUEST</span><strong>{depositStt ? `${depositStt} testnet STT` : 'Testnet STT'} <small>+ gas</small></strong>
      </p>}
      <p className={styles.note}>{copy.note}</p>
      <div className={styles.actions}>
        {walletOpenLink && phase !== 'prepare' && <a className={styles.openWallet} href={walletOpenLink}>OPEN METAMASK <span aria-hidden="true">↗</span></a>}
        <button ref={back} className={styles.back} type="button" onClick={onDismiss}>BACK TO GAME</button>
      </div>
      <p className={styles.dismissal}>{copy.dismissal}</p>
    </section>
  </div>, document.body);
}

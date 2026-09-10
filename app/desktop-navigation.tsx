'use client';

import { useEffect, useRef } from 'react';
import { useGameAudio } from './game-audio';

const controls = 'button, a[href], summary, [role="button"]';
const editable = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="textbox"]';

export function KeyboardHint() {
  return <p className="desktop-keyboard-hint">↑ ↓ ← → to navigate · Enter to select</p>;
}

/** Spatial focus only. Game rules and activation callbacks remain unchanged. */
export function DesktopNavigation() {
  const marker = useRef<HTMLSpanElement>(null);
  const { playKeyboardAction } = useGameAudio();
  useEffect(() => {
    const root = marker.current?.closest('main');
    if (!root) return;
    let enterHeld = false;
    let preferredX: number | null = null;
    const available = (element: HTMLElement) => element.tabIndex >= 0
      && !element.matches(':disabled, [aria-disabled="true"]')
      && !element.closest('[inert], [hidden]')
      && element.checkVisibility({ checkVisibilityCSS: true });
    const keydown = (event: KeyboardEvent) => {
      if (!window.matchMedia('(min-width: 801px)').matches || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest(editable)) return;
      const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
      if (dialog && !root.contains(dialog)) return;
      const scope = dialog ?? root;
      if (target && target !== document.body && !scope.contains(target)) return;
      if (event.key === 'Enter') {
        const selected = target?.closest<HTMLElement>(controls);
        if (enterHeld || event.repeat) { event.preventDefault(); return; }
        if (!selected || !scope.contains(selected) || !available(selected)) return;
        event.preventDefault();
        enterHeld = true;
        // .click() is synthetic; tie its single audio cue to this real keypress.
        playKeyboardAction(event, selected);
        selected.click();
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      // Arrow navigation belongs to the action field, never the player HUD,
      // log or footer. Native Tab/Enter remain available elsewhere. An open
      // modal keeps its own local navigation instead of escaping behind it.
      const actionScope = dialog ? scope : scope.querySelector<HTMLElement>('[data-keyboard-action-scope]') ?? scope;
      const items = Array.from(actionScope.querySelectorAll<HTMLElement>(controls))
        .filter(item => available(item) && (dialog || item.closest('[data-keyboard-actions]')));
      if (!items.length) return;
      event.preventDefault();
      const current = target?.closest<HTMLElement>(controls);
      // Edge selection is only an entry point. Once a control is focused,
      // traverse normally so middle controls (Potion, relic summary) are reachable.
      if (!dialog && (!current || !items.includes(current)) && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const betweenRoomItems = items.filter(item => item.closest('[data-keyboard-vertical="edges"]'))
          .map(item => ({ item, rect: item.getBoundingClientRect() }))
          .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
        if (betweenRoomItems.length) {
          preferredX = null;
          const index = event.key === 'ArrowUp' ? 0 : betweenRoomItems.length - 1;
          betweenRoomItems[index].item.focus();
          return;
        }
      }
      if (!current || !items.includes(current)) {
        const initial = items.find(item => item.dataset.keyboardDefault === 'true') ?? items[0];
        preferredX = null;
        initial.focus();
        return;
      }
      const rect = current.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      if (horizontal) preferredX = null;
      else if (preferredX === null || preferredX < rect.left || preferredX > rect.right) preferredX = x;
      const ranked = items.filter(item => item !== current).map(item => {
        const next = item.getBoundingClientRect();
        const nx = next.x + next.width / 2;
        const ny = next.y + next.height / 2;
        const forward = sign * (horizontal ? nx - x : ny - y);
        const lateral = Math.abs(horizontal ? ny - y : nx - (preferredX ?? x));
        const aligned = horizontal
          ? next.top < rect.bottom && next.bottom > rect.top
          : (preferredX ?? x) >= next.left && (preferredX ?? x) <= next.right;
        // A full-width control covers the navigation lane even when its
        // center differs. Do not skip it for a narrower, more distant card.
        return { item, forward, score: forward + (aligned ? 0 : lateral * 2 + 10000) };
      }).filter(item => item.forward > 1).sort((a, b) => a.score - b.score);
      ranked[0]?.item.focus();
    };
    const release = (event: KeyboardEvent) => { if (event.key === 'Enter') enterHeld = false; };
    const reset = () => { enterHeld = false; preferredX = null; };
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', release);
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset);
    root.addEventListener('pointerdown', reset);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('keyup', release);
      window.removeEventListener('blur', reset);
      window.removeEventListener('resize', reset);
      root.removeEventListener('pointerdown', reset);
    };
  }, [playKeyboardAction]);
  return <span ref={marker} hidden />;
}

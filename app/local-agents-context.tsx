'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SomniaAgentsEnvironment } from '../lib/somnia-agents/environment';

const LocalAgentsContext = createContext<SomniaAgentsEnvironment>('disabled');

/** The server decides whether this is a local adapter or an explicitly enabled hosted edition. */
export function LocalAgentsProvider({ enabled = false, environment, children }: {
  enabled?: boolean;
  environment?: SomniaAgentsEnvironment;
  children: ReactNode;
}) {
  return <LocalAgentsContext.Provider value={environment ?? (enabled ? 'local' : 'disabled')}>{children}</LocalAgentsContext.Provider>;
}

export function useLocalAgents() {
  return useContext(LocalAgentsContext) !== 'disabled';
}

export function useAgentsEnvironment() {
  return useContext(LocalAgentsContext);
}

'use client';

import { createContext, useContext, type ReactNode } from 'react';

const LocalAgentsContext = createContext(false);

/** Only the server's local feature flag enables the extra game-mode link. */
export function LocalAgentsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <LocalAgentsContext.Provider value={enabled}>{children}</LocalAgentsContext.Provider>;
}

export function useLocalAgents() {
  return useContext(LocalAgentsContext);
}

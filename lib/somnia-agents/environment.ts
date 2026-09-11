export type SomniaAgentsEnvironment = 'disabled' | 'local' | 'preview';

type AgentsEnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** Keep the local adapter and the opt-in hosted preview separate from production. */
export function somniaAgentsEnvironment(env: AgentsEnvironmentVariables): SomniaAgentsEnvironment {
  if (env.VERCEL) {
    return env.VERCEL_ENV === 'preview' && env.MARKET_DUNGEON_PREVIEW_AGENTS === '1'
      ? 'preview' : 'disabled';
  }
  return env.MARKET_DUNGEON_LOCAL_AGENTS === '1' ? 'local' : 'disabled';
}

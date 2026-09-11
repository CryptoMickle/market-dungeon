export type SomniaAgentsEnvironment = 'disabled' | 'local' | 'preview' | 'production';

type AgentsEnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** Each hosted environment must opt in separately; production never inherits a preview/local flag. */
export function somniaAgentsEnvironment(env: AgentsEnvironmentVariables): SomniaAgentsEnvironment {
  if (env.VERCEL) {
    if (env.VERCEL !== '1') return 'disabled';
    if (env.VERCEL_ENV === 'production') return env.MARKET_DUNGEON_PRODUCTION_AGENTS === '1' ? 'production' : 'disabled';
    return env.VERCEL_ENV === 'preview' && env.MARKET_DUNGEON_PREVIEW_AGENTS === '1'
      ? 'preview' : 'disabled';
  }
  return env.MARKET_DUNGEON_LOCAL_AGENTS === '1' ? 'local' : 'disabled';
}

export function hostedSomniaAgents(environment: SomniaAgentsEnvironment): boolean {
  return environment === 'preview' || environment === 'production';
}

/** Manual outcome controls belong only to the local/preview playground. */
export function somniaAgentsPlaygroundEnabled(environment: SomniaAgentsEnvironment): boolean {
  return environment === 'local' || environment === 'preview';
}

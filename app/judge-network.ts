export const DREAMDEX_BINARY_CONTRACTS = {
  binaryModule: '0x3ecC694Cef705358864a646142ac17A90E29e388',
  binarySettlement: '0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23',
} as const;

export const JUDGE_NETWORK_PROFILES = {
  'somnia-mainnet': {
    id: 'somnia-mainnet',
    name: 'Somnia mainnet',
    chainId: 5031,
    rpc: 'https://api.infra.mainnet.somnia.network',
    indexer: 'https://prd.smk.somnia.host/v1/graphql',
    explorer: 'https://explorer.somnia.network',
    collateral: '0x00000022dA000002656c64D9eA6011ea952D008A',
    originOperatorId: 2,
    originVenueId: '0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c',
    contracts: DREAMDEX_BINARY_CONTRACTS,
    judgePath: '/judge',
    verifierPath: '/verify',
    apiPath: '/api/judge-replay',
  },
  'shannon-testnet': {
    id: 'shannon-testnet',
    name: 'Somnia Shannon Testnet',
    chainId: 50312,
    rpc: 'https://api.infra.testnet.somnia.network',
    indexer: 'https://dev.smk.somnia.host/v1/graphql',
    explorer: 'https://shannon-explorer.somnia.network',
    collateral: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E',
    originOperatorId: 2,
    originVenueId: '0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c',
    contracts: DREAMDEX_BINARY_CONTRACTS,
    judgePath: '/shannon/judge',
    verifierPath: '/shannon/verify',
    apiPath: '/api/shannon/judge-replay',
  },
} as const;

export type JudgeNetworkProfileId = keyof typeof JUDGE_NETWORK_PROFILES;
export type JudgeNetworkProfile = (typeof JUDGE_NETWORK_PROFILES)[JudgeNetworkProfileId];

export const SOMNIA_MAINNET_PROFILE = JUDGE_NETWORK_PROFILES['somnia-mainnet'];
export const SHANNON_TESTNET_PROFILE = JUDGE_NETWORK_PROFILES['shannon-testnet'];

export function judgeNetworkProfile(id: JudgeNetworkProfileId): JudgeNetworkProfile {
  return JUDGE_NETWORK_PROFILES[id];
}

export function isJudgeNetworkProfileId(value: unknown): value is JudgeNetworkProfileId {
  return value === SOMNIA_MAINNET_PROFILE.id || value === SHANNON_TESTNET_PROFILE.id;
}

export function isShannonProfile(profile: JudgeNetworkProfile): profile is typeof SHANNON_TESTNET_PROFILE {
  return profile.id === SHANNON_TESTNET_PROFILE.id;
}

export function allowsLiveDreamDexContinuation(profile: JudgeNetworkProfile) {
  return profile.id === SOMNIA_MAINNET_PROFILE.id;
}

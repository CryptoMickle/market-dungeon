import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['@somnia-chain/markets-sdk'],
};

export default nextConfig;

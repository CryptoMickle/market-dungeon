import { eventContractIntervalLabel } from './event-contract-interval.ts';

export const DREAMDEX_BTC_5M_URL = 'https://app.dreamdex.io/event-contracts/WBTC:USDso/5m';

export function dreamDexBtcEventContractUrl(intervalSec: unknown) {
  return `https://app.dreamdex.io/event-contracts/WBTC:USDso/${eventContractIntervalLabel(intervalSec)}`;
}

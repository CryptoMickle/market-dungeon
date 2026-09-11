import MarketDungeon from './market-dungeon';
import FullExpedition from './full-expedition';

export default function Home() {
  const localAgents = process.env.MARKET_DUNGEON_LOCAL_AGENTS === '1' && !process.env.VERCEL;
  return localAgents ? <FullExpedition localAgents /> : <MarketDungeon />;
}

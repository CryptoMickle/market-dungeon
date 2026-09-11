#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
print 'Market Dungeon: http://localhost:3001/'
print 'Somnia Agent Kevin: http://localhost:3001/somnia-agents'
print 'Quick rival playground: http://localhost:3001/somnia-agents/playground'
exec npm run dev:agents

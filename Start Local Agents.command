#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
print 'Market Dungeon with Kevin: http://localhost:3001/'
print 'Quick rival playground: http://localhost:3001/somnia-agents'
exec npm run dev:agents

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const credits = readFileSync(new URL('../app/credits/page.tsx', import.meta.url), 'utf8');
const disclosure = readFileSync(new URL('../docs/PROVENANCE_AND_PRIVACY.md', import.meta.url), 'utf8');

test('privacy and creative provenance remain directly accessible from the game', () => {
  assert.match(page, /href="\/credits"/);
  assert.match(page, /Anonymous Vercel Analytics measures page views and three funnel checkpoints/);

  for (const content of [credits, disclosure]) {
    assert.match(content, /does not send wallet addresses, market IDs, commitments, proof contents, combat transcripts, names, or email addresses/i);
    assert.match(content, /generative-image assistance/i);
    assert.match(content, /CryptoMickle retained product direction and responsibility/i);
    assert.match(content, /DeusLower \/ Vlad Bakutov/);
    assert.match(content, /pixabay\.com\/service\/license-summary/);
    assert.match(content, /vercel\.com\/docs\/analytics\/privacy-policy/);
  }
});

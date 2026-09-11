import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/market-dungeon.tsx', import.meta.url), 'utf8');
const credits = readFileSync(new URL('../app/credits/page.tsx', import.meta.url), 'utf8');
const disclosure = readFileSync(new URL('../docs/PROVENANCE_AND_PRIVACY.md', import.meta.url), 'utf8');
const submission = readFileSync(new URL('../docs/DORAHACKS_SUBMISSION.md', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('privacy and creative provenance remain directly accessible from the game', () => {
  assert.match(page, /href="\/credits"/);
  assert.match(page, /Anonymous v2 funnel labels measure entry, verified completion and product actions/);

  for (const content of [credits, disclosure]) {
    assert.match(content, /does not send wallet addresses, market IDs, commitments, proof contents, combat transcripts, names, or email addresses/i);
    assert.match(content, /generative-image assistance/i);
    assert.match(content, /CryptoMickle retained product direction and responsibility/i);
    assert.match(content, /DeusLower \/ Vlad Bakutov/);
    assert.match(content, /pixabay\.com\/service\/license-summary/);
    assert.match(content, /vercel\.com\/docs\/analytics\/privacy-policy/);
  }
});

test('public submission identifies the Live demo, replay fallback, final film and immutable release source', () => {
  assert.match(credits, /https:\/\/github\.com\/CryptoMickle\/market-dungeon\/blob\/(?:[a-f0-9]{40}|hackathon-submission-2026-v\d+)\/docs\/PROVENANCE_AND_PRIVACY\.md/);
  for (const content of [submission, readme]) {
    assert.match(content, /https:\/\/market-dungeon\.vercel\.app\/shannon\/live-judge/);
    assert.match(content, /https:\/\/market-dungeon\.vercel\.app\/shannon\/live-judge\/verify/);
    assert.match(content, /https:\/\/market-dungeon\.vercel\.app\/shannon\/judge/);
    assert.match(content, /https:\/\/market-dungeon\.vercel\.app\/shannon\/verify/);
    assert.match(content, /hackathon-submission-2026-v16/);
    assert.match(content, /releases\/download\/hackathon-submission-2026-v16\/Market-Dungeon-Competition-V3-1-1080p\.mp4/);
    assert.match(content, /releases\/download\/hackathon-submission-2026-v16\/Market-Dungeon-Competition-V3-1-EN\.srt/);
    assert.doesNotMatch(content, /Final candidate release: pending source freeze, verification and publication approval/);
  }
  for (const content of [credits, submission, readme]) {
    assert.doesNotMatch(content, /github\.com\/CryptoMickle\/market-dungeon\/blob\/main\//);
  }
  assert.match(credits, /href="https:\/\/youtu\.be\/6IviQrMweZ4"/);
  assert.match(credits, /BASELINE V8 VIDEO/);
  assert.match(credits, /earlier version and does not demonstrate the current Live Judge/);
  assert.match(credits, /href="\/shannon\/live-judge\/verify"/);
  assert.match(credits, /href="\/shannon\/verify"/);
  assert.doesNotMatch(credits, /unreleased local candidate|local candidate&apos;s/);
});

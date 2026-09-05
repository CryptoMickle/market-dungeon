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

test('v10 integration and provenance links use the frozen submission tag', () => {
  const immutableBlobRoot = 'https://github.com/CryptoMickle/market-dungeon/blob/hackathon-submission-2026-v10';
  const disclosureUrl = `${immutableBlobRoot}/docs/PROVENANCE_AND_PRIVACY.md`;
  const integrationReportUrl = `${immutableBlobRoot}/docs/DREAMDEX_INTEGRATION_REPORT.md`;

  assert.ok(credits.includes(disclosureUrl));
  assert.equal(submission.split(integrationReportUrl).length - 1, 2);

  for (const content of [credits, submission, readme]) {
    assert.doesNotMatch(content, /github\.com\/CryptoMickle\/market-dungeon\/blob\/main\//);
  }

  assert.match(submission, /Current public baseline video \(1:52\): https:\/\/youtu\.be\/6IviQrMweZ4/);
  assert.match(submission, /releases\/tag\/hackathon-submission-2026-v10/);
  assert.match(credits, /href="https:\/\/youtu\.be\/6IviQrMweZ4"/);
  assert.match(credits, /BASELINE V8 VIDEO/);
  assert.match(readme, /\*\*Current public baseline demo \(1:52\):\*\* https:\/\/youtu\.be\/6IviQrMweZ4/);
  assert.match(readme, /releases\/tag\/hackathon-submission-2026-v10/);
  assert.match(readme, /https:\/\/market-dungeon\.vercel\.app\/verify/);
});

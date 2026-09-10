# Market Dungeon — independent validation runbook

Status: **validator instructions ready; independent results pending**

This runbook is for two people who are not contributors to Market Dungeon. It
creates reproducible technical evidence for WIN-WB-06 without asking validators
to endorse the project or reveal personal information.

## Validator qualification

A validator must not have authored code, copy, tests, designs, or video for the
release being checked. A public GitHub username may identify a voluntarily
published record, but the project must not imply employment, partnership,
sponsorship, or endorsement.

## Source verification

1. Clone `https://github.com/CryptoMickle/market-dungeon` into a new directory.
2. Fetch tags and check out the final frozen release tag supplied by the
   project.
3. Record:
   - tag;
   - full `git rev-parse HEAD` commit;
   - UTC start and end;
   - operating system;
   - Node and npm versions; and
   - whether the working tree is clean.
4. Run `npm ci`.
5. Run `npm run release:verify`.

Record the command exit status and the reported lint, typecheck, unit,
proof-kernel, build, and deterministic-browser results. Do not summarize a
failed step as a pass.

## Production proof verification

1. Use the primary Live Judge pair: `/shannon/live-judge` and
   `/shannon/live-judge/verify` on Shannon testnet. The historical fallback is
   `/shannon/judge` with `/shannon/verify`; the legacy mainnet replay is
   `/judge` with `/verify`. Record which pair you actually tested.
2. Open the final Production Judge URL in a new browser profile or private
   window.
3. Complete one fresh Judge run without coaching from the project team.
4. Download the proof JSON.
5. Record only the file's SHA-256 checksum; do not publish the proof unless the
   validator intentionally chooses to publish its public contents.
6. Open the matching fixed-profile verifier route and load the exact downloaded
   file. Keep the same deployment and matching Live or historical route;
   Preview and Production have separate signing keys.
7. Record whether the verifier returns `PASS`, `FAIL`, or `NOT PROVABLE`.
8. Confirm that `/api/build` reports the same full commit as the frozen tag.

The validator must not connect a wallet, sign a wallet message, approve tokens,
or place a transaction. None of those actions belong to this release.

## Result template

```text
Market Dungeon independent validation

Validator: <GitHub handle or anonymous validator A/B>
Relationship: no contribution to the checked release
UTC window: <start> to <end>
OS: <value>
Node/npm: <values>
Release tag: <tag>
Tag commit: <40-character SHA>
Production /api/build commit: <40-character SHA>
Fixed profile: <Somnia mainnet 5031 / Somnia Shannon Testnet 50312>
Judge/verifier routes: <exact pair>
Clean working tree before install: yes/no
npm ci: PASS/FAIL
npm run release:verify: PASS/FAIL
Production Judge result reached: yes/no
Downloaded proof SHA-256: <checksum or NOT PRODUCED>
Standalone verifier: PASS/FAIL/NOT PROVABLE/NOT REACHED
Unexpected blocker: none/<plain description>
```

## Publication rules

- Retain the complete record even when something fails.
- Resolve or disclose failures; never ask a validator to rerun silently until a
  passing record appears.
- Publish both records with the same final tag and Production identity.
- Two project-controlled machines or two automated CI jobs are useful release
  evidence but are not independent non-team validation.
- If two qualified records are unavailable by publication time, describe the
  verifier as independently reproducible, not independently validated.

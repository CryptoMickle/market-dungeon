# Market Dungeon — qualitative user feedback update

Recorded 11 September 2026 for the v17 documentation update. This summarizes feedback supplied by the project owner without publishing participant identities, screenshots of private correspondence or raw messages. It is not a controlled usability study.

## What is included

The earlier evidence pack documented three self-reported responses covering Full Expedition and Judge Demo. The owner subsequently supplied one Android/Chrome response. We retain that as **three previously documented responses plus one later response**, without claiming four verified unique participants or four tests of the latest build. The later report does not identify its build, URL or precise game mode, and there was no independently observed session.

An earlier respondent separately clarified that they used a **computer**. Their browser was not specified. That correction must not be attributed to the later Android respondent or counted as another test. Owner-recorded iPhone play and the owner's screenshots are separate product feedback, not additional recruited participants.

## Later Android/Chrome response

| Observation | Product implication | Current response and remaining uncertainty |
| --- | --- | --- |
| Reported reaching level/room 9 and dying | The player engaged with several fights but did not describe a settled boss result | This is self-reported progress, not a verified completed run or measured duration |
| Did not recognize the BTC question and did not attend to the clock | The market-based victory condition was missed | Setup explains Bitcoin, the locked target, correct/wrong predictions and that `00:00` does not stop combat; no post-fix human retest is recorded |
| Understood Attack as reliable damage and Storm as potentially stronger | The contrast between combat actions communicated successfully in this report | Buttons show ranges and Storm's zero-damage risk; this single response does not establish balance or that Storm is always optimal |
| Described switching to Attack after two weak Storm results | A personal strategy was inferred during play | This is the respondent's strategy, not evidence that previous rolls influence future Storm damage |
| Potions were initially confusing | Recovery needs visible HP, effect and retaliation context at the decision | Current HP and potion count appear beside recovery controls; combat retaliation and safe between-fight healing are explained |
| Was unsure about replaying and described repetition; reported playing few mobile games | Longer-run variety and relevance beyond Attack/Storm remain open questions | The game has equipment, relic tradeoffs, shops and boss rematches, but their existence does not prove this concern is solved; no retention improvement is claimed |

The participant's confusion about “result” and focus on clearing rooms suggest that the market consequence did not become meaningful during the reported session. This is an interpretation of the response, not evidence of which exact screen the player saw. The shared Judge flow now brings the market result, player choice and boss fate together; it still needs a human retest before claiming improved understanding.

## Owner feedback and implementation changes

Owner testing additionally identified mobile monsters that were too small, action buttons below the useful viewport, missing HP when spending potions or shopping with Kevin, an unclear Storm cue, inconsistent navigation and moving status information. Subsequent changes enlarged mobile art, kept health near recovery decisions, revised Storm's sound, moved mode selection to a neutral Home, stabilized the desktop room/status layout and aligned Live/Historical Judge presentation.

These changes were followed by project-controlled browser checks and viewport inspection. Such checks establish rendered behavior for the tested cases; they do not substitute for a new physical-device user test, MetaMask handoff test or a measured improvement in comprehension.

## Measurement limits and next questions

- No clean recruited-attempt denominator, verified session duration, completion rate, retention lift, forecasting advantage or trading conversion is established.
- Older analytics and automated sessions remain separate from these qualitative reports. See [measurement definitions](PILOT_MEASUREMENT_V2.md).
- The later response does not document use of the newly added real Somnia Agent Kevin flow; no such test attribution is supported by its answers.
- The next useful human retest is whether a player can explain the Bitcoin choice before entering, distinguish the market clock from a combat deadline, and decide when a potion is safe. Longer-run repetition remains a separate design question.

See the [judge evidence pack](JUDGE_EVIDENCE_PACK.md) and [v17 release record](RELEASE_2026-09-11_KEVIN.md) for technical checks and publication identity.

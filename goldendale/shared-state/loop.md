# Goldendale loop

## Developer

Shipped David’s full queued batch on PR #2 (`cursor/goldendale-loop-list-40cd`). Same PR. Hold merge. Do not open a second PR.

Hard gate stays: `npm run test:scorecard` hole-1 best 1G+2N = **+1** (A/B/C/D HCP 4/11/18/24, gross 5/6/7/8, Goldendale par 5 / SI 1). Unique Vercel hostname only when that holds. Co-author ColdGin87.

### P0 Vegas totaling (ASSET_V `20260826p`)

Vegas is pair numbers, not 1G+2N vs-par. 4+5=45, 10+4=104. Hole points = |A−B|. Running = sum of diffs. Flip on gross birdie/eagle+; both sides birdie+ flips both. Race OFF + Vegas ON shows Vegas numbers/points on the live card.

### Batch on this revision (ASSET_V `20260826o`, still on the PR)

1. **Team vs-par race** — setup toggle default ON. OFF hides the race. Format picker (1G+2N etc.) stays. Vegas / Wolf / Nassau / Nines / Skins run alone or stacked.
2. **Per-team totals** — hole + running sit under that team’s names on the hole list and full card. No dump at the bottom.
3. **No solo ColdGin** — create/join/add default to Team 1. No Individual option or solo card. Demo ColdGin is rostered on Team 1.
4. **Handicap = Index only** — no Course Handicap. Round at 0.5 (2.4→2, 2.5→3, 18.7→19, 1.3→1). That integer is applied by scorecard SI for every net game.
5. **OUT / IN / TOT** — after hole 9: OUT = 1–9. After 18: IN = 10–18 only. TOT = 1–18. Player and team. Race stays vs-par.
6. **Vegas flips** — birdie or eagle (or better) flips the other side high-first. Net Vegas flips only on a **gross** birdie+. Both sides birdie+ → both numbers flip (do not cancel).
7. **Birdie slots** — default ON. Each gross birdie+ is one deterministic spin. Running high score. Not money.
8. **ℹ info tips** — tap (not hover-only) beside Profile, format/team toggles, side games, Press, add-player, KPs.
9. **Game Rules** — `#rules` and `#round/:id/rules`. Plain-English house rules for team formats, Skins (one pot, no carry, pot ÷ gross+net skins), Vegas+flips, Nassau F/B/O, Wolf, Nines 5-3-1 + Blitz, presses, optional KPs, 19th hole, OUT/IN/TOT.
10. **19th hole** — when 18 are in: prominent **Go to the 19th hole**. Front / Back / Overall for every team; skins + pot if on; other side games; fun facts (gross birdies, hardest/easiest hole, most birdies, biggest team swing); optional KPs.
11. **Optional KPs** — default OFF. Designate holes, record a winner, show on the 19th.

P0 add-player bounce-out fix stays (in-place mount, Team 1/2/3 chips, no full `draw()` while the sheet is held).

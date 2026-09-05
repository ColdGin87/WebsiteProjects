# Goldendale loop

## Developer

Shipped David’s full queued batch on PR #2 (`cursor/goldendale-loop-list-40cd`). Same PR. Hold merge. Do not open a second PR.

Hard gate stays: `npm run test:scorecard` hole-1 best 1G+2N = **+1** (A/B/C/D HCP 4/11/18/24, gross 5/6/7/8, Goldendale par 5 / SI 1). Unique Vercel hostname only when that holds. Co-author ColdGin87.

### Wolf score entry + team write lock (ASSET_V `20260826y`)

Wolf live card no longer disables every gross input until sides lock. Players can type/advance scores; sides still lock before Wolf points settle. Wolf-only rows list the full roster (not team-filtered). House points: partnered ±1 each; Lone Wolf +2/−2 from each; Blind Lone +3/−3 from each; better ball; tie 0. Multi-device write lock: same-team score writes only (organizer/admin host exception; Wolf roster may write the Wolf card). Server rejects cross-team POSTs. Sunday game + 1G+1N / 1G+2N + Wyrm Coil stay.

### Sunday batch + Wyrm Coil (ASSET_V `20260826x`)

Sunday game brand and **1G+1N** / **1G+2N** stay. Birdie dragon slots now fire on the confirmed 19th: spin count is **gross birdies + net birdies**. **Wyrm Coil** is an original multi-reel overlay (not Dragon Link / Dragon Spin). Player takes those spins; each awards points; running total + saved high score. Fun only; toggle still applies.

### Sunday game + 1G+1N (ASSET_V `20260826w`)

The team vs-par race is branded **Sunday game** in setup, live title, Game Rules, and the 19th hole. Live title is `Sunday game · 1G+2N` (or `Sunday game · 1G+1N`), stacked as `Sunday game · 1G+2N + Vegas`. Format picker now includes **1G+1N** (one gross + one net) and keeps **1G+2N** as the default, plus 3G, 3N, 1G+3N, 2G+2N. Same vs-par best-combo math; 1G+1N is one gross slot + one net slot.

### Remaining queue audit (ASSET_V `20260826v`)

Items 1–14 were already on this PR (Vegas P0 through 19th). This revision closes leftovers: Wolf score inputs stay disabled until sides lock; exports no longer say Individual; create/settings hide unused handicap allowance; 19th hole waits until every rostered team player has all 18.

### Nines hole + running totals (ASSET_V `20260826u`)

Exactly 3 individual players. Each hole shows that hole’s points (5-3-1 / ties / Blitz 9-0-0) and a second row with each player’s running total through that hole.

### Nassau (NASA) segment presses (ASSET_V `20260826t`)

NASA = Nassau. Three independent bets: Front 1–9, Back 10–18, Overall 1–18. Manual Press (anyone). A press is from the tap hole through the **end of that segment only** — Front dies at 9, Back at 18, Overall tap→18. Original bets stay live. Hole 12 can press Back **and** Overall. Live-press count is per segment. No auto 2-down.

### Vegas per-hole Press (ASSET_V `20260826s`)

Big **P** under each hole starts a Vegas child press from that hole through 18 (same pair + flip + zero-sum math). Board shows Original + each press, with a live press count badge.

### Live title + Wolf sides (ASSET_V `20260826r`)

Live card title lists the games above the fold (e.g. `1G+2N + Vegas`, or `Vegas + Skins`). Wolf rotates by hole with a Wolf badge, per-hole sides (not Team 1/2), Blind Lone 3× / Lone 2× / partner 1×, and pick-or-pass after each tee.

### P0 Vegas display + Team 4+ (ASSET_V `20260826q`)

Vegas is pair numbers, not 1G+2N vs-par. 4+5=45, 10+4=104. This-hole points = |A−B|. Running TOTAL is **zero-sum**: winner adds, loser subtracts (H1 A +11 / B −11; H2 B wins 8 → A +3 / B −3). Flip on gross birdie/eagle+; both sides birdie+ flips both. Live card leads with Vegas (pair + this-hole swing + TOTAL). Vs-par is labeled **Race vs-par** when Vegas is on.

Add team button: chips stay Team 1 / 2 / 3; Add team creates Team 4, then 5…. Players assign to any existing team. Add-player bounce-out fix stays.

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

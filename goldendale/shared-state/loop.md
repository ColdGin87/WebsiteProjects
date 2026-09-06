# Goldendale loop

## Developer

Shipped David’s full queued batch on PR #2 (`cursor/goldendale-loop-list-40cd`). Same PR. Hold merge. Do not open a second PR.

### Wyrm Coil per-player fun board (ASSET_V `20260905q`)

Birdie spins are per player: own gross better-than-par + own net better-than-par. Points stay on that player (David 29 · Brian 50 · Matt 60) — not team money. 19th hole shows the fun board. Reels rotate longer (~3s, staggered) before they settle. Nassau Press stays. Same PR #2. Hold merge.

### Nassau Press pinned under the header (ASSET_V `20260905p`)

MUST-FIX: David still saw no Nassau Press. The sticky dock sat at `top: 0` / `z-index: 45` and slid under the 60px site header. Press Front / Back / Overall now live in the hole toolbar and the full-card chrome (yellow/red). That bar sticks at 60px so it stays while scores scroll. The live dock is no longer trapped inside the full-card box. RUNNING for Front, Back, Overall, and each press stays. Same PR #2. Hold merge.

### Nassau Front/Back/Overall Press + live RUNNING (ASSET_V `20260905o`)

MUST-FIX: Nassau Press is on the live card — sticky dock above the hole plus Press Front / Back / Overall on the hole chrome. All three are usable: Front dies at 9; Back from hole 1 starts at 10 and dies at 18; Overall tap→18. Originals stay live. RUNNING for Front, Back, Overall, and each press is named up/down through the hole you are on and repaints after each score. Same PR #2. Hold merge.

### Join-code Team 1 host / joiner Team 2+ (ASSET_V `20260905n`)

Host create is Team 1 with an optional nickname. A join-code user is not auto Team 1: they pick Team 2+ or Add team, optional team nickname and card name. Signed-out welcome code stashes the code, then login/register opens the picker. Live hole groups show Team N · nickname (or Team N) on every device. Same PR #2. Hold merge.

### Wolf setup toggles ±1 / ±2 / Blind ±4 (ASSET_V `20260905m`)

Wolf point values are setup toggles, not hardcoded. House defaults: partnered ±1, Lone ±2, Blind Lone ±4. Win +, lose −, same magnitude. Better ball; tie 0. Score entry on the Wolf live card stays. Same PR #2. Hold merge.

### Nines second row is the SUM (ASSET_V `20260905l`)

MUST-FIX: Nines running was still reading as this-hole points. The live card now scores 5-3-1 / 5-2-2 / 4-4-1 / 3-3-3 / Blitz from the three players’ entered scores and **adds** them. First row = this hole. Second row per player = cumulative through the hole you are on (5-2-2 then 5-3-1 → 10/5/3). Same PR #2. Hold merge.

### Nines running SUM (ASSET_V `20260905k`)

Nines hole points stay on the first row. The second row per player is the **cumulative** running total through the hole you are on (hole1 5-2-2 then hole2 5-3-1 → 10/5/3), not a reset to that hole’s points. Live card repaints after each save. Exactly 3 players. Same PR #2. Hold merge.

### Wolf score entry + 3× table (ASSET_V `20260905j`)

David can type gross on the Wolf live card now. Team write lock does not disable Wolf inputs (Wolf sides are not Team 1/2). Tap a player row to focus the score box. Points: partnered ±1, Lone 2× (±2), Blind Lone 3× (±3); better ball; tie 0. Same PR #2. Hold merge.

### 19th hole fun UI (ASSET_V `20260905i`)

19th hole: podium reveals 3rd → 2nd → 1st with short confetti on 1st; tap-to-reveal Front / Back / Overall / Skins; big Spin your birdies door into Wyrm Coil when spins > 0; share strip is one-tap summary plus a screenshot card. Sound stays off. Same PR #2. Hold merge.

### Vegas RUNNING names who is up and down (ASSET_V `20260905h`)

RUNNING is not a bare −20. After +5 then −25 it reads **Team B up 20 · Team A down 20** (through the hole you are on). This-hole line stays the signed difference after × games. Same PR #2. Hold merge.

### Vegas two-line this-hole + RUNNING (ASSET_V `20260905g`)

Vegas shows two stacked lines: this-hole difference after the games-running multiplier, then RUNNING cumulative **through the hole you are on**. Example +5 then −25 → running −20. Other team is the sign-flipped mirror. Same PR #2. Hold merge.

### Vegas games-running Press (ASSET_V `20260905e`)

CHANGE: Vegas Press is **not** independent child ledgers. One Press control on the live card shows how many games are running (starts at **1**). Tap increments the count. Badge = count. This-hole swing × games running posts to the zero-sum TOTAL (5-point hole × 3 games = +15/−15). Per-hole P row removed. Same PR #2. Hold merge.

### Gross 11+ entry (ASSET_V `20260905d`)

P0: David could save 10 but not 11/12/13+. Phone numeric pads often **replace** a lone `1` instead of appending, so 11–19 never formed (10 worked because `0` is a different key). `readGrossTyping` now recovers 10–19 from the pending first digit + the inserted key. Inputs are `type="tel"` (no native max=10). Server `validateGross` stays 1–19. Vegas 4+11 = 114 unchanged. Same PR #2. Hold merge.

Unique host (READY, SHA `42582a2`, ASSET_V `20260905d`): https://website-projects-oejgjdydl-coldgin87s-projects.vercel.app

Hard gate stays: `npm run test:scorecard` hole-1 best 1G+2N = **+1** (A/B/C/D HCP 4/11/18/24, gross 5/6/7/8, Goldendale par 5 / SI 1). Unique Vercel hostname only when that holds. Co-author ColdGin87.

### Nassau live-card Press (ASSET_V `20260905c`)

MUST-FIX: David did not see a Press button on the Nassau live card. Cause: dedicated Front/Back/Overall controls lived only inside `.hole-view` (overflow-x hidden; easy to miss / not sticky), and the generic Press control is hidden when Nassau is the only pressable game — so a missed `nassau.on` check showed **zero** Press buttons. Not organizer-only.

Now a **sticky Nassau live dock** sits on the hole scoring screen (above the hole card, not settings, not ⋯ menu, not results-only): **Press Front / Press Back / Press Overall** in one 390px row, plus RUNNING for original F/B/O and each live press. Detection uses config.on **or** `games.nassau`. Front dies at 9; Back at 18; Overall tap→18. Originals stay live. Same PR #2. Hold merge.

### Nassau live-card Press (ASSET_V `20260905b`)

MUST-FIX: hole view now shows **Press Front / Press Back / Press Overall** above the Nassau RUNNING lines (not overflow-only, not settings-only). Front enabled 1–9 (dies at 9); Back enabled 10–18; Overall always tap→18. Originals stay live; each press has its own RUNNING row. Same PR #2. Hold merge.

### Sunday queue build-everything (ASSET_V `20260905a`)

Shipped the remaining Sunday/new queue on PR #2: Down/Across score advance (default Down), gross 1–19, Vegas games-running Press + two-line named up/down, Wolf setup toggles ±1/±2/Blind ±4 with live score entry, Nines running SUM paint, 19th podium 3→2→1 + confetti + reveal F/B/O/Skins + Spin your birdies door + share strip. Birdie slots count every gross or net better than par. Team write lock stays. Join-code: host Team 1 + optional nickname; joiner picks Team 2+ or Add team (not auto Team 1); live card shows Team N · nickname on every login. Vegas no longer treats an unscored teammate (`gross: null`) as a birdie flip. Sunday game + 1G+1N / 1G+2N + Wyrm Coil stay. Hold merge.

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

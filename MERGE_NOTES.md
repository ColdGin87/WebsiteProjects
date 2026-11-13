# Goldendale Scorecard merge notes

This folder set is one working Goldendale Scorecard. It is the newest host, join, and scoring behavior (`origin/cursor/host-vegas-all-teams-f917`, commit `968d1ab`), with side games, presses, and the 19th-hole fun board turned back on. Those controls were still implemented on the server and in the scoring modules, but the Sunday-only UI commit had stubbed the screens that reach them.

The app is not one HTML file. Join codes, team locks, and the public leaderboard are the Express API plus Turso/libSQL from that newest version. A pasted page cannot share a round across phones without that server. No credentials were added. `.env.example` still has placeholders only. With no remote Turso URL, the server creates a local `file:` database.

Run it from `golf-merged/`:

```bash
cd golf-merged
npm install
cp .env.example .env
npm test
npm start
```

Open http://localhost:3000. The first account is the course admin.

## Where the code lived

| Place | What it is |
| --- | --- |
| `origin/cursor/host-vegas-all-teams-f917` | Newest Goldendale line. Contains Main and the side-games branch. |
| `origin/Main` (`bcd0180`) | PR #4 field scorecard, before the host-lane and side-game-hide commits. |
| `origin/goldendale-side-games` (`aaba62c`) | Last commit that still showed Skins, Vegas, Nassau, Wolf, Nines, and presses. |
| `origin/cursor/goldendale-security-harden-c1a5`, `goldendale-phone-fixes-e030`, `goldendale-loop-list-40cd`, `goldendale-scorecard-96a1` | Ancestors of that line. |
| `claude/new-golf-app-s1O5q` (`88794d6`) | Parallel branch off `e6b4b20`. 1v1 challenge card and signature attestation. Not an ancestor of Goldendale. |
| `origin/cursor/coldgins-yardages-814c` | Separate pinable yardage PWA under `public/yardages/`. Own local store. |
| `origin/cursor/coldgin-tasks-page-b686` | Standalone `/tasks/` page. Not the scorecard. |
| Deleted `app/` (before `d40a72b`) | First Express server. Replaced by the Vercel `api/` + `public/` layout. |

Goldendale was built on `e6b4b20` (`b3899c9`), the parent of the challenge commits. The two lines never shared a later commit.

## Iteration changelog

Deploy-only commits that only recorded a Vercel hostname in `goldendale/shared-state/loop.md` are not product changes. They are omitted below.

### Retreat site, then the Vercel app

- `f92a13d` / `ad8f955`: Bandon-style match-play retreat. Accounts, rounds, matches, leaderboard, 15-agent workflow scripts.
- `d40a72b`: Restructured for Vercel. Removed `app/server.js` and moved the UI to `public/`. Database became Turso/libSQL.
- `04e0922`, `e6b4b20`: Static hosting and mobile nav/modal fixes.
- Logo commits (`0bff420` through `1d7caa4`) stayed on the challenge branch only. Goldendale uses the wordmark header, not the crossed-clubs hero.

### Challenge card (parallel, not in the Goldendale line)

- `0c61ec5`: Player button and a stroke-index row on the early scorecard.
- `88794d6`: 1v1 challenge. Two players, hole scores, strokes from the handicap gap and stroke index, front/back status, and signature rows before the card can be completed.

### Goldendale scorecard

- `b3899c9`: Goldendale Scorecard on the Vercel app. Course seed, team rounds, join codes, guest players, public leaderboard token.
- `8b6a4b4`: HTTP scorecard tester. Locked case: handicaps 4/11/18/24, hole 1 gross 5/6/7/8, team hole 16 under the old stroke-sum rule.
- `0cfbb43` through `502bfde`: Live hole list, type-across save, visible totals, per-player team picks, add-player, 18-hole results, stroke dots, Hole/Running vs-par, combined hole view.
- `5ca60bc`: Team scoring locked to vs-par best-combo. Formats 3G, 3N, 1G+2N, 1G+3N, 2G+2N. Hole-1 best 1G+2N on the A/B/C/D fixture became **+1** and stayed the gate.
- `1d93f00`: Vs-par rule shown above the game select.
- `5105e1f`: Team 1 vs-par demo foursome (later removed from the shipped home screen; HTTP route kept behind `ALLOW_DEMO=1`).
- `7695a3a` / `999f051`: Skins, Vegas, Nassau, Wolf, Nines. One score entry. Press starts a child wager. Team chips for Team 1/2/3.
- `cb2e5a3` / `00e1485`: Vegas is zero-sum pair math (4 and 5 = 45, 10+ high-first), not the 1G+2N vs-par total.
- `bcbfa1f`: Live game title and per-hole Wolf sides.
- `703f1ce`: Per-hole Vegas press as child ledgers. Later replaced.
- `ee2d085`: Nassau segment presses with per-segment totals.
- `a8d4e66`: Nines hole points and running totals.
- `c185237` / `728b334`: Index-only handicap tip. Course handicap wording removed.
- `f26aaeb`: Sunday game name, and 1G+1N beside 1G+2N.
- `ac0ec50`: Wyrm Coil birdie spins (own gross better-than-par plus own net better-than-par). Not a casino copy.
- `b99326b`: Wolf score entry and team write lock.
- `6014223`: Join-code teams. Vegas null-gross flip fix.
- `42582a2`: Gross 11–19. Phone pads were replacing a lone `1`, so 11+ never formed. Server validates 1–19.
- `e755848`: Vegas Press becomes a games-running count (starts at 1). This-hole swing times that count. Child ledgers removed.
- `8a4ab23` / `786095a` / `47f6be6`: Vegas this-hole line plus RUNNING that names who is up and who is down, through the hole you are on.
- `9705298`: 19th-hole podium, reveal cards, Wyrm Coil door. Sound off.
- `023ac5f` then `e383719` / `cadafad`: Wolf points became setup toggles. House defaults partnered ±1, Lone ±2, Blind Lone ±4. An earlier 3× table (±1 / ±2 / ±3) does not ship.
- `4b0b22a` / `f7352d6`: Nines second row is the cumulative sum (5-2-2 then 5-3-1 → 10/5/3).
- `0771665`: Host creates Team 1. Joiners pick Team 2+ or add a team. Optional nicknames.
- `0a8fe84` through `cb7d713`: Nassau Press Front / Back / Overall pinned in the hole chrome so it stays on screen.
- `fdb6e16` through `b6b1c14`: Wyrm Coil per player, longer reel, 3-cell window, chips seeded from the fun board.
- `497641b`: `vsPar` / `formats` / `sideGames` stopped declaring a page-global `api`, so those scripts could load together.
- `45558ef`: Shipped home screen no longer opens demo rounds.
- `8510ba3`: Full card control on phones. Joiners add teammates on their own team only.
- `36a5351`: Scores locked to your team. Show other teams’ scores defaults OFF.
- `8e18eb4`: Running vs-par under each hole total.
- `e574f70`: One-time wipe of leftover practice rounds for the field test.
- `f5c1567`: Anonymous score writes rejected. Demo routes off unless `ALLOW_DEMO=1`. No magic-link URL in production responses.
- `f37258c`: Join code bar at the top of the live card, with Copy. Welcome accepts 6–12 character codes.
- `5ae7974` / `5ccc4c1` / `710dd3e`: Phone OUT/TOT, index dots, roster remove, index edit, 19th unlocks from your own finished card.
- `ff4042f`: Down advance wraps to player 1 on the next hole.
- `4e2d1ff` through `715fcc3`: Follow along (read-only) vs Scorekeeper. Personal Hide still redacts when the host is showing. Host hide still wins against a follower trying to show.
- `74ff11d` / `43e16da`: Goldendale seed stroke index and yardages force-updated to the paper card.
- `6a349dc` / `1a8e489`: Team-fill spin, Skip to the 19th, Standard scorecard (dots and OUT/IN/TOT, side games forced off). Got beer removed.
- `aaba62c`: Accepting a fill keeps the winner on the original team and the short team.
- `2a6785a`: Host can enter every team’s scores.
- `6585d90`: Create-form copy for one-phone scoring.
- `28a5219` / `8f08ddb`: Undo last press. Paper-card marks on the gross (circle birdie, square bogey). Edit presses.
- `9d7ec7a` / `19c438c` / `eb571f9`: Missed Vegas press, larger hole taps, pressed-hole chips.
- `9b8e313`: Sunday-only UI. Create, settings, the live card, the 19th, and Game Rules stopped offering side games and presses. Server routes stayed.
- `96976d5`: Host own-lane. Other-team setup stays off that card until you open that team.
- `a9c9877`: Host and Leader badges. Clearing guests does not remove the scorekeeper.
- `2b37277`: Team nicknames stay shared. Host Show-other control is on the card.
- `ad22e39`: Team 2/3 scorekeeper no longer lands on Team 1.
- `968d1ab`: Tighter hole-view test assertions. No further product change.

## Conflicts and how they were resolved

Latest behavior wins when two implementations disagree. A feature that was only hidden, and whose math was still tested, was put back.

- **Side-game screens vs Sunday-only hide.** `9b8e313` made `isVegasOn`, `isNassauOn`, `isWolfOn`, `isNinesOn`, and `pressableGames` return false or empty, and removed the create-form fields. The scoring modules and HTTP tests still ran Skins, Vegas, Nassau, Wolf, and Nines. The merged UI uses the last full screens (from `aaba62c`) again. Standard scorecard still forces side games off on the server. Sunday 1G+2N stays the default.
- **Own-lane, badges, nicknames, Team 2/3 focus.** Those landed after the hide. They stay. The race strip still limits Sunday team totals to the lane you can see, and it also shows the Vegas / side-game strip when those games are on.
- **Host scoring.** The host enters every team after opening that team’s card. The older “host walks every team on the same hole” copy does not. Game Rules uses the newer own-lane paragraph, plus the side-game rules.
- **Vegas Press.** Games-running count, not per-hole child ledgers. Undo, Edit, and missed-press stay.
- **Wolf points.** Setup toggles, defaults ±1 / ±2 / ±4. The earlier 3× table does not.
- **Gross range.** Server and the card accept 1–19. The newest README still said 1–15. The merged README says 1–19.
- **Show other teams.** Default OFF. Followers can hide even when the host is showing. They cannot reveal scores the host is hiding.
- **Register on an unchanged hash.** Creating an account while the page was already `#dashboard` set the header user and did not redraw the body, because assigning the same hash does not fire `hashchange`. `app.navigate` now calls `route()` when the hash is already the target. Found while loading the merged app in Chrome.
- **Got beer, demo buttons.** Removed on purpose for the field test. Tests still forbid them. Not restored. Demo HTTP routes remain behind `ALLOW_DEMO=1`.
- **Paper-card marks, team-fill on both teams, Follow along, join-code bar, index dots, Down wrap.** Kept as in the newest commit.

## Restored

- Create and Settings side-game fields: Skins, Vegas, Nassau (NASA), Wolf (partnered / lone / blind), Nines, birdie slots, closest-to-the-pin.
- Live-card Vegas board and Press, Nassau Front/Back/Overall, Wolf bar, Nines rows, pressed-hole chips, Edit presses, Undo last press, missed Vegas press.
- 19th hole: Skins reveal, Wyrm Coil fun board, KP list, side-game results.
- Game Rules sections for those games, including 3G, 3N, 1G+3N, and 2G+2N. The format `<select>` already listed them; the Sunday-only tooltip had stopped mentioning them.

## Not reconciled

- **Signature attestation.** The challenge branch is a 1v1 card (`challenges`, `challenge_holes`, `challenge_signatures`) built on the pre-Goldendale scorecard. Goldendale replaced that renderer with team rounds, join codes, and match play. There is no shared round id to hang a two-signature close on without a second scoring path. Match play (generate matches, tournament leaderboard) is still in this app. The signature flow is not.
- **ColdGin’s Yardages** (`public/yardages/`, branch `cursor/coldgins-yardages-814c`) and **ColdGin Tasks** (`public/tasks/`) are separate static apps. They are not part of this scorecard and were not copied in.
- **Early `app/` server** and the agent-workflow scripts are the pre-Vercel scaffold. The merged app uses `api/index.js`, `lib/`, and `public/`.
- Crossed-clubs / golf-ball header art from the challenge branch was not copied. Goldendale’s header is the wordmark.

## Verification

From `golf-merged/`:

- `npm test`: 157 tests, 46 suites, all passed. Covers scoring (vs-par, Vegas, Nassau, Wolf, Nines, presses, birdie slots), team write lock, team-fill, security-shaped UI assertions, and the restored side-game chrome.
- `npm run test:scorecard`: passed against a temporary file database. Hole-1 best 1G+2N is still +1. Side games, Wolf, Nines, join-code teams, Follow along, team-fill, Standard scorecard, host writes on every team, and the hardening checks passed.

Headless Chrome (system Chrome via puppeteer-core, phone-width viewport) against `node api/index.js` with `TURSO_DATABASE_URL=file:/tmp/goldendale-browser.db`:

1. Registered a host, opened New round, turned on Vegas and Nassau, created the round.
2. Join code **LLM7MYKU** showed on the live card.
3. Added Kurt (index 11). Closed add-player. Entered gross **5** for the host. Net showed **5**. Vegas Press and Nassau Press were on the card. Sunday game title included Vegas and Nassau.
4. A second browser profile registered Casey, opened `#join/LLM7MYKU`, chose Add team (Team 2) and Scorekeeper, and entered gross **6**. The card showed Casey, Leader, and the same join code.
5. Host opened Settings → the public-board link, then the read-only board. It listed Team 1 at E (David Host 5G) and Team 2 at +1 (Casey 6G), plus Kurt with no score. The strip included Vegas, Nassau, and Wyrm Coil.

The only console error was a missing favicon (404). No score or join request failed.

Screenshots from that run: create form with side games, host card with the 5 and Vegas Press, Casey’s Team 2 card with the 6, and the public leaderboard.

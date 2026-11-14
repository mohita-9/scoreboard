# Badminton League Live Scoring — README

This is the onboarding guide for anyone running or maintaining the league scoring system. It covers what the system is, how to set it up, how an event runs from start to finish, every ranking and qualification rule, where a person has to step in by hand, how to update the code, and when something needs fixing or rebuilding.

`SETUP.md` (same folder) has extra technical detail. Where the two differ, this README is the latest.

---

## 1. What the system is

| Part | What it is | Who uses it | Device |
|---|---|---|---|
| **Google Sheet** | The single record of everything: teams, matches, scores, tables | Referee (and admins) | Laptop |
| **Apps Script (`Code.gs`)** | The backend, attached to the sheet and published as a web app. It checks every score, ranks teams and fills the knockout | Nobody touches it during an event | — |
| `umpire.html` | Scoring app, one umpire per court | Umpires | Phone |
| `referee.html` | Main referee dashboard: live courts, matches, edits, overrides, teams, QR links | Main referee | Laptop |
| `player.html` | "My next match", live scores, results and tables | Players and audience | Phone |
| `scoreboard_yonex.html` | League tables and live courts strip | Audience | Laptop, LED, phone |
| `scoreboard_yonex_knockout.html` | Knockout bracket and champion banner | Audience | Laptop, LED, phone |
| `league-config.js` | The **one** place the web-app link is written. Every page reads it | — | — |

The pages are plain HTML files hosted on GitHub Pages. They talk only to the Apps Script web app, and the web app reads and writes the Google Sheet.

### Tabs in the Google Sheet

| Tab | What it holds | Edit by hand? |
|---|---|---|
| `Matches` | Every match: ID, stage, group, court, queue order, teams, set scores, status, winner, slots | Only through the referee page, except in emergencies |
| `Teams` | Team name and its first-round group | Through the referee page (Teams & links) |
| `Config` | One row per **round** (stage) with its scoring format and order | **Yes**, per event |
| `Settings` | League name, logos, colours, courts, refresh rates, qualifiers per group | **Yes**, per event |
| `Sheet1` | League tables, calculated automatically. The scoreboard reads it | **No**, it's overwritten |
| `Knockout` | Knockout list, calculated automatically. The knockout scoreboard reads it | **No**, it's overwritten |
| `Qualifiers` | One row per knockout side, showing who was picked and why. The **Manual Team** column is the override | **Only** the Manual Team column |
| `Log` | Every action with time, umpire and old/new values (the audit trail) | No |

PINs are **never** stored in the sheet or the pages. They live in Apps Script → Project Settings → Script Properties.

---

## 2. One-time setup (new Google account or new sheet)

1. **Create the sheet.** Open a blank Google Sheet, or the existing league sheet.
2. **Add the code.** Go to Extensions → Apps Script and replace everything in `Code.gs` with the provided `Code.gs`. Save.
3. **Run `setup`.** In the function dropdown pick `setup`, click **Run** and approve the permissions. This creates every tab with the right columns and creates `TOKEN_SECRET`.
4. **Check the rules (optional).** Run `runRuleTests`. The execution log should say all rule examples pass.
5. **Set the PINs.** Go to Apps Script → ⚙ Project Settings → Script Properties and add:
   - `REFEREE_PIN`, e.g. `482913`
   - `COURT_PIN_1`, `COURT_PIN_2`, … (one per court)
   - Leave `TOKEN_SECRET` alone. Changing it logs everyone out.
   - Run `checkPins` to confirm the script can see them. It shows names and lengths only.
6. **Deploy.** Go to Deploy → New deployment → Web app, with **Execute as: Me** and **Who has access: Anyone**. Copy the URL ending in `/exec`.
7. **Point the pages at it.** Paste that URL into `league-config.js` (`window.LEAGUE_URL = "…/exec";`).
8. **Publish the pages.** Put all the HTML files and `league-config.js` in the GitHub Pages repo and push. The pages are then at `https://<user>.github.io/<repo>/umpire.html` and so on.
9. **Set the player link.** In the Settings tab, set `PLAYER_PAGE_URL` to the full player.html link so QR codes point at it.

---

## 3. Before every event (checklist)

1. **Settings tab** (branding and basics, no code changes):

   | Key | What it does |
   |---|---|
   | `LEAGUE_NAME`, `LEAGUE_SUBTITLE` | Title on every page and browser tab |
   | `LOGO_URL`, `SPONSOR_LOGO_URL` | `LOGO_URL` = centre logo (blank: the league name is shown as text). `SPONSOR_LOGO_URL` = left logo, in place of the badminton graphic. The right-hand logo is built in. Use https image links (a file in the GitHub folder is best; a Drive share link set to "Anyone with the link" is converted automatically) |
   | `COLOR_PRIMARY`, `COLOR_SECONDARY` | The two accent colours (hex, e.g. `#dd0e23`). Background glow, highlights and ranks follow them |
   | `COURTS` | Number of courts |
   | `QUALIFIERS_PER_GROUP` | How many teams from each round 1 group go through to round 2 (default 2: winner and runner-up) |
   | `ROUND2_GROUP_SIZE` | Only when round 2 is a league: teams in each new group (default 4). Must be a multiple of `QUALIFIERS_PER_GROUP` |
   | `LEAGUE_POINTS_PER_WIN` / `_PER_LOSS` | Points shown in the table (display only; **not used for ranking**) |
   | `POLL_MS` | Umpire and referee refresh (default 5000 ms) |
   | `PLAYER_POLL_MS` | Player page refresh (20000 ms; use 30000 for a big crowd) |
   | `PLAYER_PAGE_URL` | Target of team links and QR codes |

2. **Config tab: define the rounds** in the order they're played (see §5).
3. **Start clean.** On a reused sheet, clear the data rows of `Matches`, `Teams` and `Log` (keep the header row), then run **League → Update standings & knockout now**. `clearAllData()` does the same from the editor.
4. **Teams.** Referee page → Teams & links → paste `Team Name<TAB>Group` rows → Save.
5. **Round 1 league matches.** In the sheet: **League → Create round 1 league matches (from Teams tab)**. Every team plays every other team in its group, spread over all courts (see §5a). No typing of fixtures needed. (Bulk add on the referee page still works if you want your own order.)
6. **Round 2.** Set `QUALIFIERS_PER_GROUP` (and `ROUND2_GROUP_SIZE` for a league round 2) in Settings, then **League → Create round 2 matches**. It looks at the Config tab: if the round after round 1 is a knockout it makes the 1st-group-v-last-group draw; if it is a league (e.g. `League 2`) it makes the new groups. Teams fill in by themselves when round 1 ends (see §5a and §7).
7. **Later rounds** after a league round 2: **League → Create seeded knockout draw (Seed 1 v last seed)** (see §7).
8. **Links.** Referee page → Teams & links → Generate team links → Print QR sheet for captains.
9. **Umpires.** Give each umpire their court PIN and the umpire.html link, and ask them to Add to Home Screen.
10. **Rehearse.** On a copy of the sheet, run a few matches end to end. On the real sheet, run `resetScores()` afterwards to wipe test scores and keep the fixtures.

Everything is set up **before** the event. Nothing needs to be built mid-event; teams fill in on their own as rounds finish.

---

## 4. Running the event

### Umpire (phone)
1. Open umpire.html, choose the court, enter the court PIN and their name. The login lasts 12 hours.
2. Pick the next match in the court's queue → **Start**. This needs a connection.
3. Tap + for each rally. **Undo** walks back one point at a time. If the connection drops, points queue on the phone and send later, so the umpire never waits.
4. When a set or match is decided the app shows it. **End match** marks it Done and sends the result to the tables.

### Referee (laptop)
- Live view of all courts, the schedule and every match.
- **Edit** a match: change court, queue, teams or slots. A Done match must be unlocked first.
- **Override** a score; ticking "Mark as Done" requires a decided score.
- **Unlock** a Done match: it goes back to Live with no winner, and tables are recalculated.
- **Delete** a match, add matches, and manage teams and QR links.

### Screens
- `scoreboard_yonex.html` shows the league tables, rotating 2 groups per slide every 8 s, plus live courts.
- `scoreboard_yonex_knockout.html` shows the bracket by round, with a champion banner after the Final.
- **LED wall:** add `?led=1` to the link (e.g. `…/scoreboard_yonex.html?led=1`) and press F11. This is for when the LED shows the whole laptop screen.
  - `?led=pixel` is for an LED that copies only the top-left 504 × 672 pixels (add `&ledx=…&ledy=…` if that area starts elsewhere).
  - `?led=0` turns LED mode off. It also switches on automatically when the window is about 504 × 672.

### Scoring rules (per round, from the Config tab)
Each Config row has: `Stage`, `Sets to win` (1 = single set, 2 = best of 3), `Target`, `Cap (golden)`, `Decider Target`, `Decider Cap`, `Order`.
- A set is won by reaching the **target with a 2-point lead**, or by reaching the **cap**. At cap − 1 all it's a **golden point**: next rally wins. For example, target 15 / cap 16: 15-13 wins, 15-14 continues, 15-15 is golden point, 16-15 wins.
- Default rounds: Group 15/16 single set; Pre-QF and QF 21/22 single set; SF and Final best of 3 to 15, cap 21.
- The server rejects impossible scores, such as playing on after a set is won, or editing an earlier set while a later set has points.

### Built-in protections
- Only one live match per court.
- Umpires can only score their own court; the server checks every write.
- Five wrong PINs lock that court's login for 10 minutes (`clearLoginLocks()` unlocks at once).
- A match can't start while it still shows a placeholder ("Teams not decided yet").
- Duplicate sends from a shaky connection are ignored.

---

## 5. Rounds and formats (any mix per event)

Each **round** is a row in the Config tab. Rows are played in the order of the `Order` column.

- A stage whose name **starts with "Group" or "League"** is a **league round**: everyone in a group plays each other and a table is kept.
- **Any other stage name** is a **knockout round**: the winner goes through.

Examples:
- `Group` → `Pre Quarter Final` → `Quarter Final` → `Semi Final` → `Final` (the usual)
- `Group` → `League 2` → `Semi Final` → `Final` (two league rounds, then knockout)
- `League` → `Final` (one big league, top 2 play a final)

**How to add a second (or third) league round:**
1. Add a Config row, e.g. `League 2 | 1 | 15 | 16 | 15 | 16 | 0.5`. The order must sit between the rounds around it.
2. Bulk add its matches with Stage = `League 2`, a **new group name** not used before (e.g. `R2-A`, `R2-B`), and **slots** instead of team names (e.g. `Seed 1` v `Seed 4`).
3. When the previous league round finishes, the teams fill in automatically, and the round gets its own table on Sheet1 and the LED scoreboard.

### 5a. Creating the matches automatically (League menu in the sheet)

**Create round 1 league matches (from Teams tab)**
- Reads the Teams tab. Every group plays a full round robin (a group of 5 gets a bye each turn).
- Matches are added as M1, M2, … with Stage = the first league round in Config (e.g. `Group`).
- They're spread over `COURTS` courts in turns: each turn every court gets one match (same Queue Order on every court), no team is on two courts at once, and a team that just played is rested for the next turn whenever possible. Groups are mixed so every group keeps moving.
- Run it once. If that round already has matches it refuses (delete them first).
- Adding a team later: add it to the Teams tab, delete that round's matches, run it again (before play starts), or bulk add just the new team's matches.

**Create round 2 matches**: works from the round after round 1 in the Config tab.
- **Knockout round 2** (by group number, 1st group v last group, always):
  - 2 per group, 8 groups: G1 1st v G8 2nd, G2 1st v G7 2nd, G3 1st v G6 2nd, G4 1st v G5 2nd (top half) and G8 1st v G1 2nd, G7 1st v G2 2nd, G6 1st v G3 2nd, G5 1st v G4 2nd (bottom half). A group's winner and runner-up are in different halves, so they can only meet in the Final. Next rounds: first match v last match in each half (QF1 = PQF1 v PQF4).
  - 1 per group: G1 1st v G8 1st, G2 1st v G7 1st, …
  - Works for 2, 4, 8 or 16 groups with 1 or 2 going through. Any other mix (e.g. 6 groups) can't be paired group v group without byes, so it makes the seeded draw (Seed 1 v last seed) instead and says so.
- **League round 2** (Config row named `League 2` or similar, see above):
  - Makes new groups `Pool A`, `Pool B`, … of `ROUND2_GROUP_SIZE` teams. Each pool gets the same number of winners and runners-up.
  - Winners go G1 → Pool A, G2 → Pool B, …; runners-up go from the last group first (1st group meets last group). Two teams from the same round 1 group are **never** put in the same pool.
  - Example, 8 groups, 2 through, size 4: Pool A = G1 1st, G5 1st, G8 2nd, G4 2nd; Pool B = G2 1st, G6 1st, G7 2nd, G3 2nd; …
  - Matches continue the queue after round 1 and are placeholders (`G1 1st`) until round 1 is finished; then the real teams fill in. Ties show in the Qualifiers tab for a Manual Team as usual.
  - It refuses (with the reason) if the numbers don't split evenly, e.g. 16 teams into groups of 6.

**Rules for group names:** each group name must be unique across all rounds. Round-1 groups come from the Teams tab; later rounds take their group from the match rows. A later-round league match with no Group is treated as one table named after the round.

---

## 6. Ranking and qualification rules

### League table ranking (each group, each league round)
Only **Done** matches count.
1. **Matches won**, regardless of the score.
2. **Point difference** (total rally points won − total rally points lost in that group's matches).
3. **Head-to-head**, only between teams still level on 1 and 2: whoever beat the other(s) ranks higher. With 3+ teams level, it counts wins against each other.
4. **Points scored** (total rally points won).
5. Still level → Sheet1 shows **"Tied — check"** and the system **does not guess**. The referee decides (see §8).

League points (`LEAGUE_POINTS_PER_WIN`) are shown in the table but **do not affect ranking**, so changing them can't change who qualifies. The LED scoreboard uses exactly this order (it reads Sheet1's Rank).

### Seeds across groups (`Seed 1`, `Seed 2`, …)
Seeds come from the **league round just before** the match's round, once **every** match of that league round is Done.
1. All group **1st** places come first, then all **2nd** places, and so on down to `QUALIFIERS_PER_GROUP`.
2. Teams on the same group place are compared on **wins → point difference → points scored**. Head-to-head isn't used here because they're from different groups.
3. With a single table (no groups), the seeds are simply that table's ranking.

Example: 36 teams in 6 groups, top 10 go through, `QUALIFIERS_PER_GROUP` = 2. Seeds 1–6 are the six group winners (best first), and Seeds 7–10 are the four best runners-up.

### Every slot you can use instead of a team name

| Write this | It becomes |
|---|---|
| `Seed 1`, `Seed 10` | Overall seed from the previous league round |
| `G1 1st`, `G1 Winner`, `1st G1`, `Group 1 Winner` | 1st in group G1, once every G1 match is Done |
| `G8 2nd`, `G8 Runner-up`, `Group 8 2nd` | 2nd in group G8 |
| `QF1 Winner`, `Winner of QF1` | Winner of match QF1 |
| `SF1 Loser` | Loser of SF1 (e.g. a 3rd-place match) |

---

## 7. Knockout draw (always 1st v last)

For a knockout straight after round 1, use **League → Create round 2 matches** (group v group, §5a). For a seeded draw (e.g. after a league round 2), use **League → Create seeded knockout draw (Seed 1 v last seed)**, then type how many teams go through (2 to 64).

- **First knockout round:** Seed 1 v last seed, Seed 2 v second-last, and so on.
- **Every later round:** winner of the first match v winner of the last match. For example QF1 = PQF1 v PQF8, QF2 = PQF2 v PQF7; SF1 = QF1 v QF4, SF2 = QF2 v QF3; then the Final.
- **Byes:** if the number isn't 4, 8, 16 or 32, the top seeds skip the first round.
  - 10 teams: Pre-QF is 7 v 10 and 8 v 9. QF1 = Seed 1 v the 8/9 winner, QF2 = Seed 2 v the 7/10 winner, QF3 = 3 v 6, QF4 = 4 v 5.
  - 5 teams: 4 v 5 first. SF1 = Seed 1 v the 4/5 winner, SF2 = 2 v 3.
- It uses the **last** knockout rounds in the Config tab, so 8 teams gives QF, SF and Final, and 16 teams adds Pre-QF.
- Matches are spread over the courts. Match IDs are `PQF1…`, `QF1…`, `SF1`, `SF2`, `F1`.
- Run it **once**, after the league matches are added. If those match IDs already exist, it refuses (delete them first).
- Alternative: paste `knockout-draw.tsv` (the same 16-team draw) into Bulk add.

**Things to watch:**
- With groups, Seed 1 can meet a runner-up from its own group in the first knockout round. Swap with a Manual Team (§8) if you want to avoid that.
- Group sizes that aren't equal make "wins" uneven between groups when seeding runners-up. Decide beforehand if that's acceptable.

---

## 8. When a person has to step in (manual overrides)

| Situation | What you see | What to do |
|---|---|---|
| **Teams fully tied** in a group (same wins, point diff, head-to-head, points scored) | Sheet1 Note: "Tied — check". Qualifiers tab: **TIE — needs manual** | Decide (toss or rules), then type the team in **Manual Team** in the Qualifiers tab |
| **Seeds tied** across groups | Qualifiers: "Seed N is tied — type the team in Manual Team" | Same: type the team in Manual Team |
| **Want a different pairing** than the automatic one | — | Qualifiers → **Manual Team**, or referee page → Matches → **Edit** → type a team or slot. A real team name typed in Edit "pins" it (auto-fill stops for that side) |
| **Wrong result entered** | — | Referee → **Unlock** (back to Live) → umpire rescores, or **Override** the score. Tables recalculate automatically |
| **Result changed after the next round already started** | Qualifiers status: **CONFLICT** | Teams lock once a match starts. Decide by hand: Unlock/fix the later match, or correct the team in Edit |
| **Next match won't start** | "Teams not decided yet" | The earlier round isn't finished, or a tie is waiting. Check the Qualifiers tab |
| **Court shows busy** | `COURT_BUSY` | Another match is Live on that court. End it, move it, or override it |
| **Umpire locked out** | Too many wrong PINs | Wait 10 minutes, or run `clearLoginLocks()` in the editor |
| **Manual Team no longer needed** | — | Clear the cell. It goes back to automatic |
| **Sheet edited by hand** (e.g. Config or Settings) | Pages don't show it yet | **League → Update standings & knockout now** (or wait about 20–30 s) |
| **Retired / walkover match** | — | Referee → **Override** with a decided score (e.g. 15-0) and Mark as Done |

Manual Team applies as soon as you type it. Teams only change automatically while a match is **Scheduled**.

---

## 9. How to update `Code.gs` (and the pages)

### Updating the backend
1. Open the league sheet → Extensions → Apps Script.
2. Select everything in `Code.gs`, paste the new version, and **Save**.
3. Run `setup` once if the new version adds tabs or columns. It's safe; it keeps your data.
4. Go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
   - **Always edit the existing deployment.** A *New deployment* creates a **new link**, and then every page breaks until `league-config.js` is updated.
5. Reload the sheet so the **League** menu shows any new items.
6. To roll back, paste the previous `Code.gs` (kept as e.g. `robustness/Code.previous.gs` or `robustness/Code.before-ranking-fix.gs`) and deploy a New version the same way.

**No redeploy needed** for changes in the Config or Settings tabs; use League → Update standings & knockout now.

### Updating the pages
- Replace the HTML file in the GitHub Pages repo and push. Wait a minute, then hard-refresh (Ctrl+Shift+R). Phones may need the tab closed and reopened.
- **The web-app link changed?** Edit only `league-config.js` and push.
- **Branding?** Use the Settings tab, not the HTML.

### Editor functions (Apps Script → choose function → Run)

| Function | Use |
|---|---|
| `setup` | Create or repair tabs and columns |
| `refreshCaches` | Recalculate everything now (same as the League menu item) |
| `createKnockoutDraw` | Build the knockout (same as the menu) |
| `resetScores` | **Testing only:** wipe every score, keep teams and fixtures |
| `clearAllData` | **Testing only:** delete all matches, teams and logs (keeps Config, Settings and PINs) |
| `clearLoginLocks` | Unlock courts after wrong PINs |
| `checkPins` | List which PIN properties exist (never shows the PINs) |
| `runRuleTests` | Self-check of the scoring rules |

---

## 10. When development needs a rebuild or a fix

These need someone to change the code, not just the sheet:

| Case | Why | What to change |
|---|---|---|
| **A new scoring format** that Config can't express (e.g. more than best of 3, rally caps per set beyond decider, timed games) | The rules engine only knows 1 or 2 sets to win, a target and a cap | `Rules` block in `Code.gs` **and** the identical block in umpire.html / referee.html (they must match byte for byte) |
| **New ranking or tiebreak rule** (e.g. sets won, a different head-to-head) | Ranking lives in `groupTables_` / `seedList_` | `Code.gs` → `groupTables_` and `seedList_`. Keep the agreed order (wins → point diff → head-to-head → points scored) unless the organiser changes it |
| **Different bracket logic** (e.g. avoid group-mates meeting early, re-seeding each round, 3rd-place match automatically) | The draw is fixed as 1 v last with byes | `Code.gs` → `buildKnockoutDraw_` (a 3rd-place match can already be added by hand with `SF1 Loser` v `SF2 Loser`) |
| **League round after a knockout using seeds**, or seeds from something other than the previous league round | Seeds always read the last league round before the match | `resolveSeed_` in `Code.gs` |
| **League rounds named differently** (e.g. "Round Robin", or another language) where "Group"/"League" isn't the prefix | League rounds are detected by the name prefix | `isLeague_` in `Code.gs` and `firstLeague` in referee.html |
| **Scoreboard layout or new LED size** (other than 504 × 672) | The LED layout is tuned to that panel | `scoreboard_yonex*.html` (LED block at the top of the script; `patch_led.py` re-applies it to a fresh copy) |
| **Renaming Sheet1 / Knockout columns** | The scoreboards read them by name | Don't. If you must, update both scoreboard pages too |
| **Hundreds of viewers, or several leagues at once** | Apps Script allows about 30 requests at a time per Google account | Short term: raise `PLAYER_POLL_MS`. Long term: the Supabase move in the "Scaling and robustness plan" thread |
| **Pages show "can't connect"** | Wrong or old link, or the deployment isn't "Anyone" | Check `league-config.js` against Deploy → Manage deployments. The page's **Test this link** button helps |
| **Google errors under load** (HTML error instead of data, slow pages) | Too many requests at once | Make sure the latest `Code.gs` (with the cache fix) is deployed; raise poll times; test with `testing/loadtest.mjs` |
| **A rebuilt `Code.gs` from old sources** | An October rebuild once silently undid a ranking change | After any rebuild, check `groupTables_` still ranks wins → point diff → head-to-head, and that `Seed` slots and the draw menu exist |

**Source note:** `CLAUDE.md` describes a `dev/` build (templates and `build.py`). Those sources are **not** in this project. The files in this folder are the ones to edit and deploy. If you do build from `dev/`, apply the same changes there first or a build will undo them.

### Testing a code change before the event
- `node robustness/test/test.js <new Code.gs> <old Code.gs>` runs both versions in an Apps Script simulator over a scripted match day and checks the results are the same.
- For load, follow `testing/TEST-PLAN.md` with `testing/loadtest.mjs` on a **copy** of the sheet.
- Always rehearse on a copy of the sheet, then `resetScores()`.

---

## 11. Quick troubleshooting

| Problem | Check |
|---|---|
| Table or knockout not updating | League → Update standings & knockout now; check the match is **Done**, not Live |
| Knockout team still says "Seed 3" | Is every match in the previous league round Done? Any TIE in the Qualifiers tab? |
| A team appears in the wrong round-2 group | The Group name on that match row; names must be unique per round |
| Logo not showing | Must be a direct https image link (GitHub Pages works; Drive share links usually don't) |
| Umpire can't score | Match must be Started (Live) on that umpire's court; check the PIN or court |
| LED cuts off the screen | Use `?led=1` and F11, or `?led=pixel` if the LED copies only part of the screen |
| Changes to HTML not visible | Hard refresh; wait for GitHub Pages to publish |

---

## 12. File list (this folder)

| File | Purpose |
|---|---|
| `README.md` | This guide |
| `SETUP.md` | Technical setup detail and design assumptions |
| `CLAUDE.md` | Notes for developers and AI assistants working on the code |
| `Code.gs` | Backend: paste into Apps Script |
| `umpire.html`, `referee.html`, `player.html` | Phone and laptop pages |
| `scoreboard_yonex.html`, `scoreboard_yonex_knockout.html` | Audience screens (`?led=1` for the LED) |
| `league-config.js` | The web-app link for every page |
| `knockout-draw.tsv` | Ready 16-team knockout draw for Bulk add |
| `teams.tsv`, `group-matches.tsv`, `group-schedule-times.tsv` | Example data from an earlier event |
| `apply_patches.py`, `patch_led.py` | Re-apply the league and LED changes to fresh copies of the scoreboard pages |

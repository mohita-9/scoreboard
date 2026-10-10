# Badminton League Live Scoring — Setup

One Google Sheet + one Apps Script web app is the whole backend. The five pages are plain HTML on GitHub Pages.

| File | Who uses it | Device |
|---|---|---|
| `umpire.html` | one umpire per court — logs teams on court, scores points | phone |
| `referee.html` | main referee — live court dashboard, schedule, overrides, teams, QR links | laptop |
| `player.html` | players / audience — "my next match", live score, results, group table | phone |
| `scoreboard.html` | group tables + Live Courts strip | laptop / LED / phone |
| `knockout.html` | knockout bracket (Pre QF → Final) | laptop / LED / phone |

## Assumptions (where the spec left a choice)

1. **Tokens are signed, not stored.** CacheService can hold a value for at most 6 hours, so a 12-hour token can't live there. Login returns an HMAC-signed token (role, court, umpire name, expiry) checked on every write with the secret `TOKEN_SECRET` that `setup()` creates in Script Properties. Same effect: no secrets in the browser, 12h expiry, court ownership checked server-side. Changing `TOKEN_SECRET` logs everyone out.
2. **Branding and league settings live in a `Settings` tab** (key/value) next to the `Config` tab of stage rules — see "New league" below. `GET ?view=config` returns rules + settings + branding.
3. **Knockout tab is also refreshed on live knockout scores** (startMatch / setScore on a non-Group match), not only on end/unlock/override/delete, so knockout.html shows live points. Sheet1 still only ever counts Done group matches.
4. **Duplicate sends are no-ops.** A `setScore` whose (set, a, b) already equals the stored score returns `ok` with no Version bump, even if its version is old. Any other score with a wrong version gets `STALE`.
5. **One live match per court.** `startMatch` refuses if another match on that court is Live (`COURT_BUSY`); the referee can fix that (end, move or override).
6. **Editing an earlier set** while a later set has points is rejected; the umpire's Undo walks back in order, so this only matters for direct API calls.
7. **Umpires can only score Live matches.** They must `startMatch` (which needs a connection) first; points scored offline after that are queued on the phone.
8. **"Cannot see Court 1"** is enforced in the umpire UI (it only lists its own court). The read views are public by design (player page, scoreboards). Every write checks the token's court on the server, so direct API calls to another court return `WRONG_COURT`.
9. **Unlock** sets a Done match back to `Live` with no winner, and recalculates standings.
10. **Override** with "Mark as Done" requires a decided score; overriding a Done match to an undecided score puts it back to Live.
11. **Match IDs** are auto-generated as `M1, M2, …` when left blank.
12. **Group table tie-break** is points only (as the existing scoreboard sorts).
13. `scoreboard.html` / `knockout.html` keep their own 8s refresh; the new pages use `POLL_MS` (5s).

## 1. Create the sheet and script

1. Open your existing league Google Sheet (the one with `Sheet1` and `Knockout`) — or a new blank sheet.
2. **Extensions → Apps Script**. Replace everything in `Code.gs` with the provided `Code.gs`. Save.
3. In the function dropdown pick **`setup`** → **Run**. Approve the permissions (it is your own script).
   This creates/keeps the tabs: `Matches`, `Teams`, `Log`, `Config` (stage rules), `Settings` (league values),
   and makes sure `Sheet1` and `Knockout` have the exact column names. Existing rows in `Sheet1`/`Knockout` are
   replaced by script-calculated ones on the first write.
4. Optional check: run **`runRuleTests`** → *Execution log* should say "All 14 rule examples pass".

## 2. Set the PINs (never in page code)

Apps Script → **Project Settings** (gear) → **Script Properties** → *Add script property*:

| Property | Value |
|---|---|
| `REFEREE_PIN` | e.g. `482913` |
| `COURT_PIN_1` | PIN for court 1 umpires |
| `COURT_PIN_2` | … one per court, up to `COURT_PIN_N` |

`TOKEN_SECRET` is already there (made by `setup`). Leave it alone. Five wrong PINs on a court lock that court's login for 10 minutes.

## 3. Deploy the web app

1. **Deploy → Manage deployments**. If you already have a deployment (your scoreboard uses one), click ✏️ **Edit** on it,
   set **Version: New version**, and **Deploy** — the URL stays the same, so the live scoreboard keeps working.
   Otherwise **Deploy → New deployment → Web app**.
2. **Execute as: Me**. **Who has access: Anyone**.
3. Copy the URL ending in `/exec`.

Every time you change `Code.gs`, repeat step 1 (Edit → New version). Changing the `Config` / `Settings` tabs needs no redeploy;
pages pick it up within 30 seconds (or run `refreshCaches` to apply immediately).

## 4. Point the pages at the web app

- `umpire.html`, `referee.html`, `player.html`: near the top of the `<script>` set
  `const APPS_SCRIPT_URL = "https://script.google.com/macros/s/…/exec";`
- `scoreboard.html`, `knockout.html`: run the patch (also sets the URL if it changed):

```bash
python3 apply_patches.py scoreboard.html knockout.html --url "https://script.google.com/macros/s/…/exec"
```

(Omit `--url` to keep the URL already in those files. A `.bak` of each original is kept. See `PATCHES.md`.)

## 5. Publish on GitHub Pages

Put all five HTML files in the repo root (e.g. `mohita-9/grv8_scoreboard`), commit, push.
Settings → Pages → *Deploy from branch* → `main` / root. Pages are then at
`https://mohita-9.github.io/<repo>/umpire.html` etc. Set `PLAYER_PAGE_URL` in the `Settings` tab to the full player.html URL
so the referee's QR codes point at it (otherwise they assume player.html sits next to referee.html).

## 6. Before the event

1. Referee page → **Teams & links** → paste `Team Name<TAB>Group` rows → *Save teams*.
2. **Add matches** → paste rows `Match ID | Stage | Group | Court | Queue Order | Team A | Team B` (copy straight from a sheet).
3. **Teams & links → Generate team links** → *Print QR sheet* for team captains.
4. Give each court's umpire the court PIN and the umpire.html link. Ask them to "Add to Home Screen".

## New league / new event (requirement 4)

Only the `Settings` tab changes — no code edits:

| Key | What it changes |
|---|---|
| `LEAGUE_NAME` | browser title and header on every page |
| `LEAGUE_SUBTITLE` | small line under the name (player page) |
| `LOGO_URL` | main logo (https link, e.g. a PNG in the GitHub repo). Blank = keep the logo built into scoreboard/knockout |
| `SPONSOR_LOGO_URL` | right-hand sponsor logo on scoreboard/knockout |
| `COLOR_PRIMARY` / `COLOR_SECONDARY` | the red / blue accent everywhere (hex, e.g. `#e7057e`) |
| `COURTS` | number of courts in dropdowns and the referee dashboard |
| `LEAGUE_POINTS_PER_WIN` / `_PER_LOSS` | group table points |
| `POLL_MS` | refresh rate of umpire/referee/player pages |
| `PLAYER_PAGE_URL` | target of team links and QR codes |

Scoring formats are rows in the `Config` tab (Sets to win, Target, Cap, Decider Target, Decider Cap, Order). To start fresh,
clear the data rows of `Matches`, `Teams` and `Log` (keep the header row) and run `refreshCaches`.

## Knockout teams fill in automatically

Write knockout fixtures with **slots** instead of team names. The server replaces them with the real team as soon as the result is known:

| Slot text (any of these wordings) | Becomes |
|---|---|
| `G1 1st`, `G1 Winner`, `1st G1`, `Group 1 Winner` | team ranked 1st in group G1 — once **every** G1 match is Done |
| `G8 2nd`, `G8 Runner-up`, `Group 8 2nd` | team ranked 2nd in group G8 |
| `PQ1 Winner`, `Winner of PQ1` | winner of match PQ1 |
| `SF1 Loser` | loser of match SF1 (e.g. for a 3rd-place match) |

Pairings are whatever the fixture says (e.g. `G1 1st` v `G8 2nd`, `G2 1st` v `G7 2nd`). Change the slot text to change the draw.

**Group ranking (Sheet1):** league points → point difference (rally points won minus lost in group matches) → points scored → head-to-head. If teams are still level after all of that, Sheet1 shows *Tied — check* and the slot is **not** guessed.

**Qualifiers tab** — one row per knockout side, so the referee can check everything:
`Slot` · `Auto Team` (what the server worked out) · `Manual Team` · `Using` (what the match shows) · `Status` · `Note` (why, e.g. *Rank 1 in G1 (6 pts, diff 17)*).

- **Status = Waiting** — group or match not finished yet. **Filled** — done automatically. **TIE — needs manual** — type the team in **Manual Team**.
- **Manual Team** overrides the automatic choice and is kept until you clear it. Clearing it goes back to automatic. It applies as soon as you type it (or use the **League → Update standings & knockout now** menu).
- Teams only change while the knockout match is **Scheduled**. Once it has started they are locked; if an earlier result is changed afterwards the row shows **CONFLICT** so you can sort it out by hand.
- If an earlier result is unlocked/changed before the next match starts, the next match updates (or goes back to the slot text) by itself.
- An umpire cannot start a knockout match while it still shows a slot ("Teams not decided yet").
- In the referee page, picking a real team in **Edit** pins it (auto-fill stops for that side). The slot is still in the dropdown to switch back.

**Existing sheet:** paste the new `Code.gs`, run `setup()` once (adds the `Slot A/Slot B` columns, the Sheet1 columns and the Qualifiers tab), then **Deploy → Manage deployments → Edit → New version**. Knockout matches already imported with `G1 1st` / `PQ1 Winner` as team names are picked up automatically.

## Files

- `Code.gs` — backend. The scoring rules block between `SHARED SCORING RULES` markers is byte-for-byte the same in every page.
- `apply_patches.py`, `PATCHES.md`, `existing-pages.diff` — changes to scoreboard.html / knockout.html.
- `TEST.md` — manual acceptance test script. `loadtest.js` — 100-client polling test.
- `dev/` — the automated tests used to verify this build (rules, simulated backend, browser run); not needed to run the event.

# Acceptance test script

Run once on the deployed system before the event. Use two phones (P1 = Court 1, P2 = Court 2) and a laptop (L = referee).
Prepare: teams Alpha, Bravo, Charlie (group A), Delta, Foxtrot (group B). Matches:

```
	Group	A	1	1	Alpha	Bravo
	Group	A	2	1	Charlie	Delta
	Quarter Final		1	2	Charlie	Foxtrot
	Semi Final		2	2	Bravo	Foxtrot
```

Tick each line. ✅ = pass.

## 1. Rules are identical on server and client
- [ ] Apps Script editor → run `runRuleTests` → log says all 14 examples pass.
- [ ] (optional, laptop with Node) `node dev/rules.test.js Code.gs umpire.html referee.html player.html` → `ALL RULE TESTS PASSED`.
  This runs every worked example from the spec against each file's copy of the rules.

## 2. Court isolation
- [ ] P2 logs in to Court 2. Its list shows only Court 2 matches (Charlie v Delta, Bravo v Foxtrot).
- [ ] Direct API: from L's browser console on referee.html, log in as court 2 and try to score a court 1 match:
  ```js
  Api.post({action:'login',role:'umpire',court:2,pin:'<court 2 pin>',umpire:'t'}).then(r=>Api.post({action:'setScore',token:r.token,matchId:'M1',set:1,a:1,b:0,version:1})).then(console.log)
  ```
  → `{ok:false, error:"WRONG_COURT"}`. Same for `startMatch` and `endMatch`.

## 3. Two phones never overwrite each other
- [ ] P1 starts Alpha v Bravo, P2 starts Charlie v Delta. Both tap quickly for 30 seconds.
- [ ] On L (Live courts) both cards show exactly what each phone shows. `Matches` sheet rows match.

## 4. Same setScore twice changes nothing
- [ ] Note the match's `Version` in the sheet. In the console send the current score again with that version (twice):
  `Api.post({action:'setScore',token,matchId,set:1,a:<A>,b:<B>,version:<v>})` → both `ok`, `Version` unchanged, no new Log row.
- [ ] Send a different score with an old version → `error:"STALE"` with `current` = the sheet's row.

## 5. Wi-Fi off mid-match
- [ ] On P1 turn on airplane mode. Tap +3 points. The bar turns red: **NOT SAVED — retrying (1 pending)**.
- [ ] Close and reopen the page while still offline: the score on screen is kept, bar still red.
- [ ] Turn Wi-Fi back on. Within ~15 s the bar goes green **Saved**; L and the sheet show all 3 points.
- [ ] While unsaved, tapping **End Match** says "Not saved yet" instead of ending.

## 6. Scoring formats end exactly per the rules
- [ ] Group: at 15-15 the **GOLDEN POINT** banner shows; next point (16-15) shows "Match won by …" with **End Match** only (no Next Set). + is greyed out.
- [ ] Group: 15-13 ends the game; 15-14 does not.
- [ ] Quarter Final: 21-20 continues, 21-21 golden, 22-21 ends; no Next Set.
- [ ] Semi Final: 15-13 ends set 1 → "Set 1 won by …" + **Next Set**. 20-20 golden, 21-20 ends. After 2 sets won by one side → **End Match**, no third set.
- [ ] Semi Final at 1-1: set 3 uses the decider target/cap shown in the rule line.
- [ ] End Match dialog shows every set score and the winner; after confirming the match moves to DONE and can't be changed on the phone.

## 7. Standings
- [ ] While Alpha v Bravo is Live, `Sheet1` (and scoreboard.html) do not change.
- [ ] After End Match, `Sheet1` shows Alpha 1/1/0/2, Bravo 1/0/1/0 and scoreboard.html shows it on its next refresh (≤ 8 s).
- [ ] After the Semi Final ends, `Knockout` shows Score A/B as sets won (e.g. 2–1). The Quarter Final shows points (e.g. 22–21).
- [ ] knockout.html lists Pre Quarter Final → Quarter Final → Semi Final → Final. No champion banner until the Final has a winner.

## 8. Referee reassign reaches the umpire
- [ ] L → Matches → *Court* on a Court 1 match → move to Court 2. Within one refresh (5 s) it appears on P2's list; if P1 had it open, P1 shows a red "moved to Court 2" notice and can no longer score it.
- [ ] L → *Score* (override) on a live match: P1's screen shows the new score within 5 s ("Score updated by the referee").
- [ ] If P1 taps a point at the same moment, it shows **Score changed on the server** with *Use server score* / *Keep my score*.

## 9. Unlock reverses standings
- [ ] L → Matches → *Unlock* Alpha v Bravo → status Live, Winner empty, `Sheet1` back to 0/0/0/0 for both.
- [ ] *Score* → 13-15 → tick *Mark as Done* → Bravo now 1/1/0/2, Alpha 1/0/1/0.
- [ ] *Delete* a Done group match → its results disappear from `Sheet1`.

## 10. Referee guards
- [ ] New match with Team A = Team B → refused.
- [ ] Put a team in a second Scheduled match with the same Queue Order as its existing one → refused ("already in match …").
- [ ] Bulk add: paste a row with an unknown stage → preview marks it red and nothing is sent.
- [ ] Five wrong court PINs → sixth try says "Too many wrong PINs. Wait 10 minutes."; other courts still log in.

## 11. Load: 100 clients polling every 5 s
- [ ] On a laptop with Node 18+: `node loadtest.js "<your /exec URL>" 100 60`
  → prints `PASS: p95 under 2s`. (Reads are served from a 3-second cache, so most requests never touch the sheet.
  Apps Script allows ~30 simultaneous executions per script; if p95 is high, raise `POLL_MS` in Settings to 8000.)

## 12. Branding switch
- [ ] In `Settings` set `LEAGUE_NAME` to "Test League", `COLOR_PRIMARY` to `#e7057e`, `LOGO_URL` to any PNG URL. Run `refreshCaches`.
- [ ] Reload all five pages: new name, logo and pink accent everywhere. Put the values back afterwards.

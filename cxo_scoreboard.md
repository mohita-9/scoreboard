# CXO Pickleball League — Scoreboard Guide

## Files
| File | Purpose |
|---|---|
| `scoreboard.html` | Group stage standings |
| `knockout.html` | Quarter Final / Semi Final / Final |

---

## Google Sheet Setup

### Tab 1 — `Sheet1` (Group Stage)
Exact column headers required:

| Group Name | Team Name | Total Matches | Matches Won | Matches Lost | Total Points |
|---|---|---|---|---|---|
| Group A | HDFC | 3 | 3 | 0 | 6 |
| Group A | ICICI | 3 | 2 | 1 | 4 |

**Rules:**
- Tab must be named exactly `Sheet1`
- Column headers must match exactly (case-sensitive)
- No empty rows between data rows
- Points are manually entered — not auto-calculated

---

### Tab 2 — `Knockout` (Knockout Stage)
Exact column headers required:

| Order | Stage | Match No | Team A | Team B | Score A | Score B | Winner | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Quarter Final | 1 | HDFC | ICICI | 21 | 15 | HDFC | Done |
| 1 | Quarter Final | 2 | Barclays | HSBC | 21 | 18 | Barclays | Done |
| 2 | Semi Final | 1 | HDFC | Barclays | | | | Upcoming |
| 3 | Final | 1 | TBD | TBD | | | | Upcoming |

**Rules:**
- Tab must be named exactly `Knockout`
- `Order` controls display sequence — 1 shows first, 2 second, 3 third
- `Status` must be exactly one of: `Done` / `Live` / `Upcoming` (case-sensitive)
- `Winner` — fill only when match is complete
- `Score A` / `Score B` — leave blank for Upcoming matches
- For TBD teams, type `TBD` in Team A / Team B columns
- Champion banner appears automatically when `Winner` is filled in the Final row

---

## Running Locally

```bash
cd ~/Downloads/scoreboard
python3 -m http.server 8000
```

Open in browser:
- Group stage: `http://localhost:8000/scoreboard.html`
- Knockout: `http://localhost:8000/knockout.html`

Stop server: `Ctrl + C`

---

## Pushing Updates to GitHub

```bash
cd ~/Downloads/scoreboard
git add scoreboard.html knockout.html
git commit -m "your update note"
git push
```

Netlify auto-deploys within 30 seconds of every push.

---

## Changing the Title

Open the HTML file in any text editor, find:
```html
<h1>CXO Pickleball League</h1>
```
Change the text, save, push.

---

## Updating Logos

Share the new logo as a PNG with transparent background.
- Left logo = Regalia Business Parks
- Right logo = Grav8 Sports

---

## Common Errors & Fixes

| Problem | Cause | Fix |
|---|---|---|
| "Retrying…" in red | Wrong Apps Script URL or sheet not published | Check URL in HTML, redeploy Apps Script |
| Blank table / no data | Column header mismatch | Check headers match exactly — no extra spaces |
| Only one group showing | Sheet tab name wrong | Rename tab to exactly `Sheet1` |
| Knockout not loading | Tab named wrongly | Rename tab to exactly `Knockout` |
| 404 error on localhost | Wrong folder or filename | Run `ls` in terminal to confirm file is there |
| Port already in use | Server already running | Run `lsof -ti :8000 \| xargs kill` then restart |
| Status not styling | Wrong Status value | Use exactly `Done`, `Live`, or `Upcoming` |
| Champion not showing | Winner column empty | Fill Winner column in the Final row |

---

## Apps Script URL
Both files use:
```
https://script.google.com/macros/s/AKfycbz_54_l9Ra3EVcKLt3sA4iCeVqHR9767yhS_60L7El_9qk46nPYAg-j3M_of7NTfKAH/exec
```
- `scoreboard.html` adds `?sheet=Sheet1`
- `knockout.html` adds `?sheet=Knockout`

If the URL stops working, redeploy Apps Script and update both HTML files.


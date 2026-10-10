# League live scoring — final package

Everything for the event in one place. Start here.

```
site/            → upload ALL of these to your GitHub Pages repo (same folder)
  league-config.js        the ONE place the web app link lives (all pages read it)
  umpire.html  referee.html  player.html
  scoreboard_yonex.html  scoreboard_yonex_knockout.html   (your pages, patched)
apps-script/Code.gs      → paste into Apps Script (Extensions → Apps Script in the Sheet)
docs/SETUP.md            full setup + how knockout slots work
docs/TEST.md             test checklist for the day before
fixtures/                teams.tsv + matches.tsv (the final fixture, ready to paste in the referee page)
tools/apply_patches.py   re-patch a fresh copy of the scoreboard pages if you ever need to
dev/                     source + automated tests (for Claude Code / developers)
CLAUDE.md                project notes Claude Code reads automatically
```

## Go live in 5 steps

1. **Apps Script** — open the Sheet → Extensions → Apps Script → select all in `Code.gs`, delete, paste `apps-script/Code.gs`, **Save**.
   Pick `setup` in the function dropdown → **Run** (once; keeps your data).
2. **Deploy** — Deploy → **Manage deployments** → ✏️ Edit → Version: **New version** → Deploy.
   *Execute as: Me · Who has access: Anyone.* Do **not** use "New deployment" (that makes a new link).
3. **Link** — copy the Web app URL shown there (ends in `/exec`). Open `site/league-config.js` and check the link
   matches. If it does not, paste yours between the quotes. This is the only file with the link.
4. **Upload** — copy everything in `site/` into your GitHub Pages repo and push:
   ```
   git add -A
   git commit -m "Final league pages"
   git push
   ```
5. **Check** — open `umpire.html` on a phone. If it can't connect, the screen now shows the link it is using and a
   **Test this link** button: it must show text starting `{"stages"`. A Google sign-in / error page = wrong link or
   access not "Anyone".

## Changing a knockout pairing
Referee page → **Matches** → **Edit** on the PQ/QF/SF row → in Team A / Team B type a slot (`G1 1st`, `G8 2nd`,
`PQ3 Winner`, `SF1 Loser`) or pick a team → **Save**. The real team fills in automatically when that group / match
finishes. The **Qualifiers** tab in the Sheet shows every slot, who fills it and why; type in **Manual Team** there to
override (ties are never guessed).

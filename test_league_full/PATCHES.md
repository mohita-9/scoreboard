# Changes to scoreboard.html and knockout.html

Run: `python3 apply_patches.py scoreboard.html knockout.html [--url <new /exec URL>]`
It stops with a clear message if either file differs from the version in the project, keeps a `.bak`, and is safe to run twice.
Logos, layout, slideshow, racquet animation and CSS are untouched. `existing-pages.diff` shows the exact edits.

**Both pages**
- Team, group, stage and match names go through `esc()` before `innerHTML` — a team called `<img onerror=…>` shows as text.
- On load they read `?view=config` and apply the league's `LEAGUE_NAME`, `LOGO_URL`, `SPONSOR_LOGO_URL`, `COLOR_PRIMARY`, `COLOR_SECONDARY`
  from the Settings tab. Blank values keep the built-in logos and colours. If the call fails the page looks exactly as before.

**scoreboard.html**
- New **Live Courts** strip above the group tables: one card per live court with both teams, current-set points, stage, set number and sets won.
  Uses the existing CSS variables, hides itself when nothing is live, refreshes every 5 s.
- The leftover QR-code script at the bottom (it referenced a `#qr-code` element and a QRCode library that are not on the page and threw an error) is now guarded.

**knockout.html**
- Stages sort Group → Pre Quarter Final → Quarter Final → Semi Final → Final (order from the Config tab, with this as fallback).
- Champion banner only once the **Final** has a winner. Before, the banner showed the winner of whichever stage had the highest order —
  with the new flow that would crown a Pre-QF winner as champion.

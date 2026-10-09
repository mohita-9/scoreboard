#!/usr/bin/env python3
"""
Patch the existing scoreboard.html and knockout.html for the new scoring system.

    python3 apply_patches.py path/to/scoreboard.html path/to/knockout.html [--url https://script.google.com/.../exec]

What it changes (nothing else is touched — logos, CSS and layout stay exactly as they are):
  both pages : team / group / stage names are HTML-escaped before going into innerHTML
               league branding from the Settings tab (name, logos, colours) is applied on load
  scoreboard : "Live Courts" strip above the group tables (from ?view=matches, Status = Live)
               the stray QR-code script at the bottom no longer throws an error
  knockout   : stages sort Pre Quarter Final -> Quarter Final -> Semi Final -> Final
               champion banner only appears once the Final has a winner
--url        : optionally point both pages at a new web app URL (keeps ?sheet=...)

A .bak copy of each original is written next to it. Running it twice is safe (it detects an already-patched file).
"""
import re
import sys
import shutil

MARK = "/* league-patch v1 */"

HELPERS = r"""
  /* league-patch v1 */
  // ---- added: safe text, stage order and league branding ----
  function esc(v) {
    return String(v === undefined || v === null ? "" : v).replace(/[&<>"'`]/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c];
    });
  }
  var STAGE_RANK = { "Group": 0, "Pre Quarter Final": 1, "Quarter Final": 2, "Semi Final": 3, "Final": 4 };
  function stageRank(name, fallback) {
    if (Object.prototype.hasOwnProperty.call(STAGE_RANK, name)) return STAGE_RANK[name];
    return fallback && fallback[name] !== undefined ? fallback[name] : 99;
  }
  function leagueApiBase() { return String(APPS_SCRIPT_URL).split("?")[0]; }
  function leagueRgba(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); if (!m) return null;
    var n = parseInt(m[1], 16); return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
  }
  function loadLeagueBranding() {
    fetch(leagueApiBase() + "?view=config&t=" + Date.now(), { cache: "no-store" })
      .then(function(r) { return r.json(); })
      .then(function(cfg) {
        if (!cfg) return;
        (cfg.stageOrder || []).forEach(function(s) { if (cfg.stages && cfg.stages[s]) STAGE_RANK[s] = Number(cfg.stages[s].order); });
        var b = cfg.branding || {}, root = document.documentElement.style;
        var center = document.querySelector(".logo-center"), right = document.querySelector(".logo-right");
        if (b.LEAGUE_NAME) { document.title = b.LEAGUE_NAME + (document.title.indexOf("Knockout") >= 0 ? " — Knockouts" : ""); if (center) center.alt = b.LEAGUE_NAME; }
        if (b.LOGO_URL && center) center.src = b.LOGO_URL;
        if (b.SPONSOR_LOGO_URL && right) right.src = b.SPONSOR_LOGO_URL;
        var p = leagueRgba(b.COLOR_PRIMARY, 1) && b.COLOR_PRIMARY, s = leagueRgba(b.COLOR_SECONDARY, 1) && b.COLOR_SECONDARY;
        if (p) {
          root.setProperty("--magenta", p); root.setProperty("--magenta-dim", leagueRgba(p, 0.15)); root.setProperty("--magenta-glow", leagueRgba(p, 0.35));
          ["--loss", "--leader-pts", "--rank-1"].forEach(function(k) { root.setProperty(k, p); });
        }
        if (s) {
          root.setProperty("--cyan", s); root.setProperty("--cyan-dim", leagueRgba(s, 0.12)); root.setProperty("--cyan-glow", leagueRgba(s, 0.35));
          root.setProperty("--border", leagueRgba(s, 0.12)); root.setProperty("--border-hi", leagueRgba(s, 0.28));
          ["--win", "--rank-2"].forEach(function(k) { root.setProperty(k, s); }); root.setProperty("--rank-3", leagueRgba(s, 0.55));
        }
        if (p || s) {
          var P = p || "#dd0e23", S = s || "#0b49d3";
          document.body.style.backgroundImage =
            "radial-gradient(ellipse 80% 80% at -5% 100%, " + leagueRgba(P, 0.45) + " 0%, " + leagueRgba(P, 0.15) + " 40%, transparent 65%)," +
            "radial-gradient(ellipse 70% 90% at 105% 50%, " + leagueRgba(S, 0.40) + " 0%, " + leagueRgba(S, 0.12) + " 45%, transparent 70%)," +
            "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(30,10,50,0.5) 0%, transparent 80%)";
        }
      }).catch(function() { /* keep the built-in look */ });
  }
"""

LIVE_JS = r"""
  // ---- added: Live Courts strip (matches with Status = Live) ----
  var LIVE_POLL_MS = 5000;
  function refreshLiveCourts() {
    fetch(leagueApiBase() + "?view=matches&t=" + Date.now(), { cache: "no-store" })
      .then(function(r) { return r.json(); })
      .then(function(list) {
        var box = document.getElementById("live-courts");
        if (!box || !Array.isArray(list)) return;
        var live = list.filter(function(m) { return m.Status === "Live"; })
                       .sort(function(a, b) { return Number(a.Court) - Number(b.Court); });
        box.innerHTML = live.map(function(m) {
          var s = [[+m.S1A || 0, +m.S1B || 0], [+m.S2A || 0, +m.S2B || 0], [+m.S3A || 0, +m.S3B || 0]], i = 0;
          for (var k = 2; k >= 0; k--) if (s[k][0] || s[k][1]) { i = k; break; }
          var multi = i > 0 || (+m["Sets A"] || 0) + (+m["Sets B"] || 0) > 0;
          return "<div class='lc-card'>" +
            "<div class='lc-court'><span class='live-dot'></span>Court " + esc(m.Court) + "</div>" +
            "<div class='lc-team'>" + esc(m["Team A"]) + "</div><div class='lc-pts lc-a'>" + s[i][0] + "</div>" +
            "<div class='lc-team'>" + esc(m["Team B"]) + "</div><div class='lc-pts lc-b'>" + s[i][1] + "</div>" +
            "<div class='lc-meta'>" + esc(m.Stage) + (multi ? " · Set " + (i + 1) + " · Sets " + esc(m["Sets A"]) + "–" + esc(m["Sets B"]) : "") + "</div>" +
            "</div>";
        }).join("");
      }).catch(function() { /* strip just stays as it was */ });
  }
"""

LIVE_CSS = """
/* league-patch v1: Live Courts strip */
.live-courts { display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(8px, 1vw, 14px); margin: -12px 0 clamp(16px, 2vw, 28px); }
.live-courts:empty { display: none; }
.lc-card { background: rgba(5, 0, 10, 0.60); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.1); border-top: 2px solid var(--magenta); border-radius: 12px;
  padding: 8px 14px; min-width: min(100%, 250px); max-width: 100%;
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; column-gap: 12px; align-items: center; }
.lc-court { grid-row: span 2; display: flex; align-items: center; gap: 6px; font-family: "Barlow Condensed", sans-serif; font-weight: 700;
  font-size: clamp(14px, 1.3vw, 20px); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text); white-space: nowrap; }
.lc-court .live-dot { background: var(--magenta); box-shadow: 0 0 8px var(--magenta-glow); }
.lc-team { font-size: clamp(12px, 1.1vw, 16px); font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lc-pts { font-family: "Barlow Condensed", sans-serif; font-weight: 700; font-size: clamp(18px, 1.8vw, 28px); text-align: right; font-variant-numeric: tabular-nums; line-height: 1.15; }
.lc-a { color: var(--magenta); } .lc-b { color: var(--cyan); }
.lc-meta { grid-column: 1 / -1; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-sub); margin-top: 2px; }
"""

BOOT_OLD = "  refresh();\n  setInterval(refresh, POLL_MS);\n</script>"


def rep(src, old, new, label, count=1):
    n = src.count(old)
    if n != count:
        raise SystemExit("Could not find the expected code for: %s (found %d, expected %d). "
                         "The file differs from the version this patch was written for." % (label, n, count))
    return src.replace(old, new)


def patch_scoreboard(s):
    s = rep(s, "</style>\n</head>", LIVE_CSS + "</style>\n</head>", "end of <style>")
    s = rep(s, '<div id="groups"></div>', '<div id="live-courts" class="live-courts"></div>\n\n<div id="groups"></div>', "groups container")
    s = rep(s, "bar.innerHTML = \"<span class='group-name'>\" + groupName + \"</span><span class='group-rule'></span>\";",
               "bar.innerHTML = \"<span class='group-name'>\" + esc(groupName) + \"</span><span class='group-rule'></span>\";", "group name")
    s = rep(s, "\"<td class='td-team'>\" + r.team + \"</td>\" +", "\"<td class='td-team'>\" + esc(r.team) + \"</td>\" +", "team name cell")
    s = rep(s, "  async function refresh() {", HELPERS + LIVE_JS + "\n  async function refresh() {", "refresh()")
    s = rep(s, BOOT_OLD, "  loadLeagueBranding();\n  refreshLiveCourts();\n  setInterval(refreshLiveCourts, LIVE_POLL_MS);\n" + BOOT_OLD, "start-up")
    if 'new QRCode(document.getElementById("qr-code"), {' in s:
        s = s.replace('new QRCode(document.getElementById("qr-code"), {',
                      'if (window.QRCode && document.getElementById("qr-code")) new QRCode(document.getElementById("qr-code"), {')
    return s


def patch_knockout(s):
    s = rep(s, "\"<span class='match-num'>Match \" + matchNo + \"</span>\" +",
               "\"<span class='match-num'>Match \" + esc(matchNo) + \"</span>\" +", "match number")
    s = rep(s, "(teamA === \"TBD\" ? \"<span class='tbd'>TBD</span>\" : teamA) +",
               "(teamA === \"TBD\" ? \"<span class='tbd'>TBD</span>\" : esc(teamA)) +", "team A")
    s = rep(s, "(teamB === \"TBD\" ? \"<span class='tbd'>TBD</span>\" : teamB) +",
               "(teamB === \"TBD\" ? \"<span class='tbd'>TBD</span>\" : esc(teamB)) +", "team B")
    s = rep(s, "\"'>\" + scoreA + \"</span>\"", "\"'>\" + esc(scoreA) + \"</span>\"", "score A")
    s = rep(s, "\"'>\" + scoreB + \"</span>\"", "\"'>\" + esc(scoreB) + \"</span>\"", "score B")
    s = rep(s, "\"<div class='champion-name'>\" + champion + \"</div>\";", "\"<div class='champion-name'>\" + esc(champion) + \"</div>\";", "champion name")
    s = rep(s, "\"<span class='\" + titleCls + \"'>\" + stageName + \"</span>\" +", "\"<span class='\" + titleCls + \"'>\" + esc(stageName) + \"</span>\" +", "stage title")
    s = rep(s, "\"<span class='stage-pill \" + pillCls + \"'>\" + stageName + \"</span>\" +",
               "\"<span class='stage-pill \" + pillCls + \"'>\" + esc(stageName) + \"</span>\" +", "stage pill")
    s = rep(s, ".sort(function(a,b) { return stageOrder[a] - stageOrder[b]; })",
               ".sort(function(a,b) { return stageRank(a, stageOrder) - stageRank(b, stageOrder); })", "stage sort")
    s = rep(s, "if ((stageName === \"Final\" || stageOrder[stageName] === Math.max.apply(null, Object.values(stageOrder))) && m.Winner) {",
               "if (stageName === \"Final\" && m.Winner) {", "champion rule")
    s = rep(s, "  async function refresh() {", HELPERS + "\n  async function refresh() {", "refresh()")
    s = rep(s, BOOT_OLD, "  loadLeagueBranding();\n" + BOOT_OLD, "start-up")
    return s


def set_url(s, url):
    base = url.split("?")[0]
    return re.sub(r'(const APPS_SCRIPT_URL = ")https://script\.google\.com/macros/s/[^"?]+/exec', lambda m: m.group(1) + base, s)


def main(argv):
    url = None
    if "--url" in argv:
        i = argv.index("--url"); url = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    if len(argv) != 2:
        print(__doc__); return 1
    for path, fn in ((argv[0], patch_scoreboard), (argv[1], patch_knockout)):
        src = open(path, encoding="utf-8").read()
        if MARK in src:
            out = src
            print("%s: already patched" % path)
        else:
            shutil.copyfile(path, path + ".bak")
            out = fn(src)
            print("%s: patched (backup at %s.bak)" % (path, path))
        if url:
            out = set_url(out, url)
            print("%s: APPS_SCRIPT_URL -> %s" % (path, url.split("?")[0]))
        open(path, "w", encoding="utf-8").write(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

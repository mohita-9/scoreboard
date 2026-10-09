# End-to-end browser test: pages in headless Chromium against the local Apps Script stand-in.
# Usage: python3 e2e.py <dir with umpire/referee/player html> <dir with patched scoreboard/knockout> <shots dir>
import json, os, re, subprocess, sys, time, urllib.request, threading, http.server, functools
from playwright.sync_api import sync_playwright

PAGES, PATCHED, SHOTS = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(SHOTS, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
API = "http://127.0.0.1:8765/exec"
FAKE = "https://script.google.com/macros/s/TEST/exec"

# copy pages into a served dir with the fake URL filled in
SITE = os.path.join(SHOTS, "site"); os.makedirs(SITE, exist_ok=True)
for d, names in ((PAGES, ["umpire.html", "referee.html", "player.html"]), (PATCHED, ["scoreboard.html", "knockout.html"])):
    for n in names:
        s = open(os.path.join(d, n), encoding="utf-8").read()
        s = s.replace("PASTE_YOUR_WEB_APP_URL_HERE", FAKE)
        s = re.sub(r"https://script\.google\.com/macros/s/[^/\"]+/exec", FAKE, s)
        open(os.path.join(SITE, n), "w", encoding="utf-8").write(s)

srv = subprocess.Popen(["node", os.path.join(HERE, "gas_server.js"), os.path.join(PAGES, "Code.gs"), "8765"], stdout=subprocess.PIPE)
srv.stdout.readline()
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)
httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 8080), handler)
handler.log_message = lambda *a: None
threading.Thread(target=httpd.serve_forever, daemon=True).start()

def api(body=None, **params):
    if body is not None:
        req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={"Content-Type": "text/plain"})
    else:
        req = urllib.request.Request(API + "?" + "&".join("%s=%s" % kv for kv in params.items()))
    return json.loads(urllib.request.urlopen(req).read())

OFFLINE = {"on": False}
def route(route):
    if OFFLINE["on"]:
        return route.abort()
    req = route.request
    url = req.url.replace(FAKE, API)
    data = req.post_data.encode() if req.post_data else None
    r = urllib.request.urlopen(urllib.request.Request(url, data=data, headers={"Content-Type": "text/plain"}))
    route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}, body=r.read())

results = []
def check(label, cond):
    results.append((label, bool(cond)))
    print(("PASS " if cond else "FAIL ") + label)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        errors = []
        def watch(page, name):
            page.on("pageerror", lambda e: errors.append(name + ": " + str(e)))

        # ---------- referee ----------
        ctx = b.new_context(viewport={"width": 1366, "height": 860})
        ctx.route("**/script.google.com/**", route)
        ref = ctx.new_page(); watch(ref, "referee")
        ref.goto("http://127.0.0.1:8080/referee.html")
        ref.fill("#in-pin", "9999"); ref.click("#btn-login")
        ref.wait_for_selector("#v-live:not(.hidden)")
        ref.click("[data-tab=teams]")
        ref.fill("#teams-in", "Alpha\tA\nBravo\tA\nCharlie\tA\nDelta\tB\n<img src=x onerror=alert(1)>\tB\nFoxtrot\tB")
        ref.click("#btn-teams-add"); ref.wait_for_timeout(600)
        check("referee adds teams", len(api(view="teams")) == 6)
        ref.click("[data-tab=add]")
        ref.fill("#bulk", "Match ID\tStage\tGroup\tCourt\tQueue Order\tTeam A\tTeam B\n"
                          "\tGroup\tA\t1\t1\tAlpha\tBravo\n\tGroup\tA\t2\t1\tCharlie\tDelta\n"
                          "\tGroup\tB\t1\t2\tDelta\t<img src=x onerror=alert(1)>\n\tSemi Final\t\t2\t2\tBravo\tFoxtrot\n"
                          "\tPre Quarter Final\t\t3\t3\tAlpha\tFoxtrot\n\tQuarter Final\t\t3\t4\tCharlie\tBravo")
        ref.click("#btn-bulk-add"); ref.wait_for_timeout(700)
        check("bulk add 6 matches", len(api(view="matches")) == 6)
        ref.click("[data-tab=teams]"); ref.click("#btn-gen"); ref.wait_for_timeout(500)
        check("team links + QR generated", ref.locator("#links-tbl .qr img, #links-tbl .qr canvas").count() >= 6 or ref.locator("#links-tbl .qr").count() == 6)
        ref.screenshot(path=os.path.join(SHOTS, "referee-links.png"))

        # ---------- umpire (phone) ----------
        uctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        uctx.route("**/script.google.com/**", route)
        u = uctx.new_page(); watch(u, "umpire"); u.on("dialog", lambda d: d.accept())
        u.goto("http://127.0.0.1:8080/umpire.html")
        u.fill("#in-name", "Uma"); u.select_option("#in-court", "1"); u.fill("#in-pin", "1111"); u.click("#btn-login")
        u.wait_for_selector("#v-court:not(.hidden)"); u.wait_for_timeout(400)
        check("umpire sees only court 1 matches", u.locator("#v-court .mcard").count() == 2)
        u.screenshot(path=os.path.join(SHOTS, "umpire-court.png"))
        u.locator("#list-next .mcard").first.click()
        check("start disabled until confirmed", u.is_disabled("#cf-start"))
        u.check("#cf-check"); u.click("#cf-start")
        u.wait_for_selector("#v-score:not(.hidden)")
        check("rule text shown", "To 15" in u.inner_text("#sc-rule") and "15-15" in u.inner_text("#sc-rule"))
        for _ in range(14): u.click("#plus-a")
        for _ in range(14): u.click("#plus-b")
        u.click("#plus-a"); u.click("#plus-b")  # 15-15
        check("golden point banner at 15-15", u.is_visible("#sc-golden"))
        u.screenshot(path=os.path.join(SHOTS, "umpire-golden.png"))
        u.wait_for_function("document.querySelector('#sync').textContent.indexOf('Saved') >= 0", timeout=8000)
        mid = [m for m in api(view="matches") if m["Team A"] == "Alpha" and m["Stage"] == "Group"][0]
        check("server has 15-15", mid["S1A"] == 15 and mid["S1B"] == 15)

        # offline mid-match
        OFFLINE["on"] = True
        u.click("#plus-a")  # 16-15 → set & match won
        u.wait_for_function("document.querySelector('#sync').classList.contains('error')", timeout=8000)
        check("red NOT SAVED banner when offline", "NOT SAVED" in u.inner_text("#sync"))
        check("set won banner, no Next Set in single game", u.is_visible("#sc-setwon") and not u.is_visible("#btn-nextset") and u.is_visible("#btn-end2"))
        check("plus blocked after set complete", u.is_disabled("#plus-a") and u.is_disabled("#plus-b"))
        check("minus still available after set complete", not u.is_disabled("#minus-a"))
        u.screenshot(path=os.path.join(SHOTS, "umpire-offline.png"))
        u.click("#btn-end2")
        check("end blocked while unsaved", "Not saved" in u.text_content("#md-title")); u.click("#md-actions button")
        u.reload(); u.wait_for_timeout(300)  # survives reload while offline? config is cached
        OFFLINE["on"] = False
        u.wait_for_function("document.querySelector('#sync').textContent.indexOf('Saved') >= 0", timeout=20000)
        mid = [m for m in api(view="matches") if m["Match ID"] == mid["Match ID"]][0]
        check("points synced after reconnect (16-15)", mid["S1A"] == 16 and mid["S1B"] == 15)
        u.wait_for_selector("#v-score:not(.hidden)")
        u.click("#btn-end2"); u.wait_for_timeout(200)
        check("end confirm states winner", "Alpha" in u.inner_text("#md-body") and "16–15" in u.inner_text("#md-body"))
        u.locator("#md-actions button", has_text="Confirm").click()
        u.wait_for_selector("#v-court:not(.hidden)"); u.wait_for_timeout(500)
        u.locator("#list-done .mcard").first.click(); u.wait_for_selector("#v-score:not(.hidden)")
        check("done match: no edit at all", u.is_disabled("#minus-a") and u.is_disabled("#plus-a") and u.is_disabled("#btn-undo"))
        u.click("#btn-back"); u.wait_for_timeout(200)
        st = {r["Team Name"]: r for r in api(sheet="Sheet1")}
        check("Sheet1 updated after end", st["Alpha"]["Total Points"] == 2 and st["Bravo"]["Matches Lost"] == 1)

        # referee override shows up on umpire within a poll
        u.locator("#list-next .mcard").first.click(); u.check("#cf-check"); u.click("#cf-start")
        u.wait_for_selector("#v-score:not(.hidden)")
        for _ in range(3): u.click("#plus-a")
        u.wait_for_function("document.querySelector('#sync').textContent.indexOf('Saved') >= 0", timeout=8000)
        live = [m for m in api(view="matches") if m["Status"] == "Live" and m["Court"] == 1][0]
        tok = api({"action": "login", "role": "referee", "pin": "9999"})["token"]
        api({"action": "overrideScore", "token": tok, "matchId": live["Match ID"], "sets": [[5, 2]]})
        u.wait_for_function("document.querySelector('#sc-a').textContent === '5'", timeout=12000)
        check("referee override reaches umpire", u.inner_text("#sc-b") == "2")
        # reassign to court 2 → umpire 1 told it moved
        api({"action": "reassignCourt", "token": tok, "matchId": live["Match ID"], "court": 2})
        u.wait_for_selector("#sc-moved:not(.hidden)", timeout=12000)
        check("umpire told match moved", "Court 2" in u.inner_text("#sc-moved"))
        check("escaped team name shown as text", "<img" in u.inner_text("#sc-nb"))

        # stale conflict: two phones
        u2ctx = b.new_context(viewport={"width": 390, "height": 844}); u2ctx.route("**/script.google.com/**", route)
        u2 = u2ctx.new_page(); watch(u2, "umpire2")
        u2.goto("http://127.0.0.1:8080/umpire.html")
        u2.fill("#in-name", "Raj"); u2.select_option("#in-court", "2"); u2.fill("#in-pin", "2222"); u2.click("#btn-login")
        u2.wait_for_selector("#v-court:not(.hidden)"); u2.wait_for_timeout(800)
        check("court 2 now sees the moved match", u2.locator("#list-now .mcard").count() == 1)
        u2.locator("#list-now .mcard").first.click(); u2.wait_for_selector("#v-score:not(.hidden)")
        api({"action": "overrideScore", "token": tok, "matchId": live["Match ID"], "sets": [[7, 2]]})
        u2.click("#plus-b")
        u2.wait_for_selector("#modal.show", timeout=8000)
        check("STALE asks umpire which score", "changed on the server" in u2.text_content("#md-title"))
        u2.locator("#md-actions button", has_text="Use server").click()
        u2.wait_for_function("document.querySelector('#sc-a').textContent === '7'", timeout=8000)
        check("server score adopted", u2.inner_text("#sc-b") == "2")

        # semi final best of 3 on court 2 via phone 2
        api({"action": "overrideScore", "token": tok, "matchId": live["Match ID"], "sets": [[15, 2]], "markDone": True})
        u2.click("#btn-back"); u2.wait_for_timeout(5500)
        semi = [m for m in api(view="matches") if m["Stage"] == "Semi Final"][0]
        u2.locator("#list-next .mcard[data-id='%s']" % semi["Match ID"]).click(); u2.check("#cf-check"); u2.click("#cf-start")
        u2.wait_for_selector("#v-score:not(.hidden)")
        for _ in range(15): u2.click("#plus-a")
        check("best-of-3 offers Next Set", u2.is_visible("#btn-nextset") and not u2.is_visible("#btn-end2"))
        u2.click("#btn-nextset")
        for _ in range(15): u2.click("#plus-a")
        check("best-of-3 ends at 2 sets", u2.is_visible("#btn-end2") and not u2.is_visible("#btn-nextset"))
        u2.screenshot(path=os.path.join(SHOTS, "umpire-semi.png"))
        u2.click("#btn-back"); u2.wait_for_timeout(300)
        u2.locator("#list-now .mcard").first.click(); u2.wait_for_selector("#v-score:not(.hidden)")
        check("after reopening: minus and undo available", not u2.is_disabled("#minus-a") and not u2.is_disabled("#btn-undo"))
        u2.click("#minus-a")
        check("minus reopens the won set", not u2.is_disabled("#plus-a") and u2.inner_text("#sc-a") == "14" and not u2.is_visible("#btn-end2"))
        u2.click("#plus-a"); u2.click("#btn-undo")
        check("undo works too", u2.inner_text("#sc-a") == "14")

        # ---------- referee live view ----------
        ref.click("[data-tab=live]"); ref.wait_for_timeout(5500)
        ref.screenshot(path=os.path.join(SHOTS, "referee-live.png"))
        check("referee live cards", ref.locator(".court").count() >= 4)
        ref.click("[data-tab=matches]"); ref.wait_for_timeout(300)
        ref.screenshot(path=os.path.join(SHOTS, "referee-matches.png"))
        check("no script injected via team name", ref.locator("img[src=x]").count() == 0)

        # ---------- player ----------
        pctx = b.new_context(viewport={"width": 390, "height": 844}); pctx.route("**/script.google.com/**", route)
        pl = pctx.new_page(); watch(pl, "player")
        pl.goto("http://127.0.0.1:8080/player.html?team=Bravo"); pl.wait_for_timeout(1200)
        txt = pl.text_content("#content")
        check("player shows live semi", "Live now" in txt and "Foxtrot" in txt)
        check("player shows result and group", "Results" in txt and "Group A" in txt)
        pl.screenshot(path=os.path.join(SHOTS, "player.png"), full_page=True)

        # ---------- patched scoreboard & knockout ----------
        sctx = b.new_context(viewport={"width": 1600, "height": 900}); sctx.route("**/script.google.com/**", route)
        sb = sctx.new_page(); watch(sb, "scoreboard")
        sb.goto("http://127.0.0.1:8080/scoreboard.html"); sb.wait_for_timeout(1500)
        check("scoreboard live courts strip", sb.locator(".lc-card").count() >= 1)
        check("scoreboard escapes names", sb.locator("img[src=x]").count() == 0 and "<img" in sb.inner_text("#groups"))
        sb.screenshot(path=os.path.join(SHOTS, "scoreboard.png"))
        ko = sctx.new_page(); watch(ko, "knockout")
        ko.goto("http://127.0.0.1:8080/knockout.html"); ko.wait_for_timeout(1500)
        stages = ko.locator(".stage-title span:first-child").all_inner_texts()
        check("knockout stage order", stages[:3] == ["Pre Quarter Final", "Quarter Final", "Semi Final"])
        check("no champion before Final", ko.locator(".champion-banner").count() == 0)
        ko.screenshot(path=os.path.join(SHOTS, "knockout.png"))

        # branding change applies to every page
        sh = api(view="config")
        check("errors in pages: " + "; ".join(errors[:5]), not errors)
        b.close()
finally:
    srv.terminate(); httpd.shutdown()

fails = [l for l, ok in results if not ok]
print("%d passed, %d failed" % (len(results) - len(fails), len(fails)))
sys.exit(1 if fails else 0)

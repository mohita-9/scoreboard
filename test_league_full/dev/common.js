/* ==== COMMON CLIENT HELPERS ==== */
function esc(v) {
  return String(v === undefined || v === null ? '' : v).replace(/[&<>"'`]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c];
  });
}
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

var Api = {
  base: function () { return String(APPS_SCRIPT_URL).split('?')[0]; },
  get: function (params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    // give up on a hung request after 20s so the caller can retry
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
    return fetch(Api.base() + '?' + q + '&t=' + Date.now(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) { clearTimeout(timer); return d; }, function (e) { clearTimeout(timer); throw e; });
  },
  // text/plain keeps this a "simple" request: no CORS preflight to Apps Script
  post: function (body) {
    return fetch(Api.base(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
            function (e) { var x = new Error('Network error'); x.network = true; throw x; });
  },
  // for safe-to-repeat calls (login): retry dropped requests twice before reporting "no connection"
  postRetry: function (body, tries) {
    tries = tries === undefined ? 2 : tries;
    return Api.post(body).catch(function (e) {
      if (!tries) throw e;
      return new Promise(function (r) { setTimeout(r, 1200); }).then(function () { return Api.postRetry(body, tries - 1); });
    });
  }
};

function store(key, val) {
  try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); }
  catch (e) { return null; }
}

// League config: stage rules + branding. Cached so pages still open offline.
// Google's server sometimes drops a request (cold start, many phones at once), so retry a few
// times with a short, slightly random wait before giving up. onRetry(n) lets the page say "connecting".
function loadConfig(onRetry) {
  // A phone that has opened the page before has a saved copy: if the first try fails, use it at once
  // (an umpire mid-match must never wait); only a first-time phone needs the retries.
  var waits = store('league_cfg') ? [] : [800, 1500, 2500, 4000, 6000];
  function attempt(n) {
    return Api.get({ view: 'config' }).then(function (cfg) {
      if (!cfg || !cfg.stages) throw new Error('bad config');
      store('league_cfg', cfg); applyBranding(cfg); return cfg;
    }).catch(function (e) {
      if (n < waits.length) {
        if (onRetry) onRetry(n + 1);
        return new Promise(function (res) { setTimeout(res, waits[n] * (0.75 + Math.random() * 0.5)); })
          .then(function () { return attempt(n + 1); });
      }
      var c = store('league_cfg'); if (c) { applyBranding(c); return c; } throw e;
    });
  }
  return attempt(0);
}

// Shown in place of the page when the server can't be reached even after retries.
// Keeps trying in the background and has a button, so nobody is stuck on a dead screen.
// It's an overlay, so the page underneath stays intact; call hideOffline() once boot succeeds.
function offlineBox() {
  var o = document.getElementById('offline');
  if (!o) {
    o = document.createElement('div'); o.id = 'offline';
    o.style.cssText = 'position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(7,6,12,.92)';
    document.body.appendChild(o);
  }
  return o;
}
function connecting(n) {
  offlineBox().innerHTML = '<div class="card" style="max-width:420px;text-align:center">Connecting to the league server…' +
    (n ? '<div style="color:var(--text-sub);font-size:13px;margin-top:6px">Attempt ' + (n + 1) + '</div>' : '') + '</div>';
}
function hideOffline() { var o = document.getElementById('offline'); if (o) o.remove(); }
function showOffline(boot) {
  var secs = 10, t, o = offlineBox();
  o.innerHTML = '<div class="card" style="max-width:420px;text-align:center">' +
    '<div style="font-weight:600;margin-bottom:6px">Can’t reach the league server</div>' +
    '<div style="color:var(--text-sub);font-size:14px">Check the internet connection. Retrying in <span id="off-s">' + secs + '</span>s…</div>' +
    '<button class="btn" id="off-retry" style="margin-top:14px">Try again now</button></div>';
  function go() { clearInterval(t); connecting(0); boot(); }
  document.getElementById('off-retry').onclick = go;
  t = setInterval(function () { secs--; var s = document.getElementById('off-s'); if (s) s.textContent = secs; if (secs <= 0) go(); }, 1000);
}

function hexToRgba(hex, a) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return null;
  var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
}

function applyBranding(cfg) {
  var b = (cfg && cfg.branding) || {}, root = document.documentElement.style;
  if (b.LEAGUE_NAME) {
    $all('[data-brand="name"]').forEach(function (n) { n.textContent = b.LEAGUE_NAME; });
    document.title = b.LEAGUE_NAME + ' — ' + (document.body.getAttribute('data-page') || '');
  }
  $all('[data-brand="sub"]').forEach(function (n) { n.textContent = b.LEAGUE_SUBTITLE || ''; });
  $all('[data-brand="logo"]').forEach(function (n) { if (b.LOGO_URL) { n.src = b.LOGO_URL; n.alt = b.LEAGUE_NAME || ''; } });
  $all('[data-brand="sponsor"]').forEach(function (n) { if (b.SPONSOR_LOGO_URL) n.src = b.SPONSOR_LOGO_URL; });
  [['COLOR_PRIMARY', 'magenta'], ['COLOR_SECONDARY', 'cyan']].forEach(function (p) {
    var hex = b[p[0]]; if (!hexToRgba(hex, 1)) return;
    root.setProperty('--' + p[1], hex);
    root.setProperty('--' + p[1] + '-dim', hexToRgba(hex, p[1] === 'cyan' ? 0.12 : 0.15));
    root.setProperty('--' + p[1] + '-glow', hexToRgba(hex, 0.35));
    if (p[1] === 'cyan') { root.setProperty('--border', hexToRgba(hex, 0.12)); root.setProperty('--border-hi', hexToRgba(hex, 0.28)); }
  });
}

function setsOf(m) { return [[+m.S1A || 0, +m.S1B || 0], [+m.S2A || 0, +m.S2B || 0], [+m.S3A || 0, +m.S3B || 0]]; }

function relTime(iso) {
  if (!iso) return '—';
  var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

var toastTimer;
function toast(msg, isErr) {
  var t = $('#toast'); if (!t) return;
  t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, isErr ? 6000 : 2500);
}

function byQueue(a, b) { return (+a['Queue Order'] || 0) - (+b['Queue Order'] || 0) || String(a['Match ID']).localeCompare(String(b['Match ID']), undefined, { numeric: true }); }

// Score text for a match: completed sets plus the current set.
function scoreLine(m, rule) {
  var sets = setsOf(m), n = rule ? Rules.maxSets(rule) : 3, parts = [];
  for (var i = 0; i < n; i++) if (sets[i][0] || sets[i][1] || i === 0) parts.push(sets[i][0] + '–' + sets[i][1]);
  return parts.join(', ');
}
// Repeat fn every ms, but skip while the page is in the background (saves server load), and run at once on return.
function every(ms, fn) {
  var t = setInterval(function () { if (!document.hidden) fn(); }, ms);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) fn(); });
  return t;
}
/* ==== END COMMON CLIENT HELPERS ==== */

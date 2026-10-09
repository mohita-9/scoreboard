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
    return fetch(Api.base() + '?' + q + '&t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  },
  // text/plain keeps this a "simple" request: no CORS preflight to Apps Script
  post: function (body) {
    return fetch(Api.base(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
            function (e) { var x = new Error('Network error'); x.network = true; throw x; });
  }
};

function store(key, val) {
  try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); }
  catch (e) { return null; }
}

// League config: stage rules + branding. Cached so pages still open offline.
function loadConfig() {
  return Api.get({ view: 'config' }).then(function (cfg) {
    if (!cfg || !cfg.stages) throw new Error('bad config');
    store('league_cfg', cfg); applyBranding(cfg); return cfg;
  }).catch(function (e) {
    var c = store('league_cfg'); if (c) { applyBranding(c); return c; } throw e;
  });
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

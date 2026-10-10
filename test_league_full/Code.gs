/**
 * Badminton League — live scoring backend (Google Apps Script web app)
 * Deploy: Execute as "Me", Who has access "Anyone".
 * Secrets live in Script Properties only: REFEREE_PIN, COURT_PIN_1..COURT_PIN_N, TOKEN_SECRET.
 */

/* ==== SHARED SCORING RULES (identical copy on server and every page) ==== */
var Rules = (function () {
  // stageRule: { stage, setsToWin, target, cap, deciderTarget, deciderCap }
  function maxSets(rule) { return rule.setsToWin * 2 - 1; }

  function setLimits(rule, setNo) { // setNo is 1-based
    var isDecider = rule.setsToWin > 1 && setNo === maxSets(rule);
    return isDecider ? { T: rule.deciderTarget, C: rule.deciderCap, decider: true }
                     : { T: rule.target, C: rule.cap, decider: false };
  }

  function isComplete(a, b, T, C) {
    var m = Math.max(a, b);
    return m === C || (m >= T && Math.abs(a - b) >= 2);
  }

  // Status of a single set score under target T / cap C.
  function setStatus(a, b, T, C) {
    var bad = { valid: false, complete: false, winner: null, golden: false };
    if (!isInt(a) || !isInt(b) || a < 0 || b < 0 || a > C || b > C) return bad;
    if (isComplete(a, b, T, C)) {
      if (a === b) return bad;
      var W = Math.max(a, b), L = Math.min(a, b);
      if (isComplete(W - 1, L, T, C)) return bad; // set would already have ended earlier
      return { valid: true, complete: true, winner: a > b ? 'A' : 'B', golden: false };
    }
    return { valid: true, complete: false, winner: null, golden: a === b && a === C - 1 };
  }

  // sets: [[a,b],[a,b],[a,b]] (missing entries treated as 0-0)
  function matchStatus(rule, sets) {
    var n = maxSets(rule), setsA = 0, setsB = 0, winner = null, current = null;
    var per = [];
    for (var i = 0; i < 3; i++) {
      var s = sets[i] || [0, 0], a = Number(s[0]) || 0, b = Number(s[1]) || 0;
      var played = a > 0 || b > 0;
      if (i >= n) {
        if (played) return fail('Set ' + (i + 1) + ' is not used in ' + rule.stage);
        continue;
      }
      var lim = setLimits(rule, i + 1);
      var st = setStatus(a, b, lim.T, lim.C);
      if (!st.valid) return fail('Set ' + (i + 1) + ' score ' + a + '-' + b + ' is not possible (to ' + lim.T + ', cap ' + lim.C + ')');
      if (winner && played) return fail('Set ' + (i + 1) + ' played after the match was decided');
      if (current !== null && played) return fail('Set ' + (i + 1) + ' started before set ' + (current + 1) + ' finished');
      per.push({ a: a, b: b, T: lim.T, C: lim.C, decider: lim.decider, complete: st.complete, winner: st.winner, golden: st.golden });
      if (winner) continue;
      if (st.complete) {
        if (st.winner === 'A') setsA++; else setsB++;
        if (setsA === rule.setsToWin) winner = 'A';
        else if (setsB === rule.setsToWin) winner = 'B';
      } else if (current === null) {
        current = i;
      }
    }
    if (winner) current = lastPlayed(per);
    return { valid: true, error: null, setsA: setsA, setsB: setsB, decided: !!winner, winner: winner,
             currentSet: current === null ? 0 : current, sets: per };
  }

  function lastPlayed(per) {
    for (var i = per.length - 1; i >= 0; i--) if (per[i].a > 0 || per[i].b > 0) return i;
    return 0;
  }
  function fail(msg) { return { valid: false, error: msg }; }
  function isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }

  function describe(rule, setNo) {
    var lim = setLimits(rule, setNo);
    var txt = 'To ' + lim.T + (lim.C > lim.T + 1 ? ', win by 2, cap ' + lim.C : ', win by 2') +
              ', golden point at ' + (lim.C - 1) + '-' + (lim.C - 1);
    return (rule.setsToWin > 1 ? 'Best of 3. ' : 'Single game. ') + txt;
  }

  return { maxSets: maxSets, setLimits: setLimits, isComplete: isComplete, setStatus: setStatus,
           matchStatus: matchStatus, describe: describe };
})();
/* ==== END SHARED SCORING RULES ==== */


var TAB = { MATCHES: 'Matches', TEAMS: 'Teams', LOG: 'Log', CONFIG: 'Config', SETTINGS: 'Settings',
            STANDINGS: 'Sheet1', KNOCKOUT: 'Knockout', QUALIFIERS: 'Qualifiers' };

var MATCH_HEADERS = ['Match ID', 'Stage', 'Group', 'Court', 'Queue Order', 'Team A', 'Team B',
  'S1A', 'S1B', 'S2A', 'S2B', 'S3A', 'S3B', 'Sets A', 'Sets B', 'Status', 'Winner', 'Umpire', 'Updated At', 'Version',
  'Slot A', 'Slot B']; // Slot = where a knockout team comes from ("G1 1st", "PQ1 Winner"); filled in automatically
var TEAM_HEADERS = ['Team Name', 'Group'];
var LOG_HEADERS = ['Timestamp', 'Match ID', 'Action', 'Court', 'Umpire', 'Old Value', 'New Value', 'Version'];
var CONFIG_HEADERS = ['Stage', 'Sets to win', 'Target', 'Cap (golden)', 'Decider Target', 'Decider Cap', 'Order'];
var SETTINGS_HEADERS = ['Key', 'Value', 'Notes'];
var STANDINGS_HEADERS = ['Group Name', 'Team Name', 'Total Matches', 'Matches Won', 'Matches Lost', 'Total Points',
  'Points For', 'Points Against', 'Point Diff', 'Rank', 'Note'];
var QUALIFIER_HEADERS = ['Match ID', 'Stage', 'Side', 'Slot', 'Auto Team', 'Manual Team', 'Using', 'Status', 'Note'];
var KNOCKOUT_HEADERS = ['Match No', 'Stage', 'Order', 'Team A', 'Team B', 'Score A', 'Score B', 'Status', 'Winner'];

var DEFAULT_STAGES = [
  ['Group', 1, 15, 16, 15, 16, 0],
  ['Pre Quarter Final', 1, 21, 22, 21, 22, 1],
  ['Quarter Final', 1, 21, 22, 21, 22, 2],
  ['Semi Final', 2, 15, 21, 15, 21, 3],
  ['Final', 2, 15, 21, 15, 21, 4]
];

// Everything a new league usually changes lives here (Settings tab), not in code.
var DEFAULT_SETTINGS = [
  ['LEAGUE_POINTS_PER_WIN', 2, 'Group points for a win'],
  ['LEAGUE_POINTS_PER_LOSS', 0, 'Group points for a loss'],
  ['POLL_MS', 5000, 'How often umpire/referee pages refresh (ms)'],
  ['PLAYER_POLL_MS', 15000, 'How often player.html refreshes (ms) — keep higher when many players watch'],
  ['COURTS', 4, 'Number of courts'],
  ['LEAGUE_NAME', 'CXO Baddy League', 'Shown as page title / header on every page'],
  ['LEAGUE_SUBTITLE', '', 'Optional line under the title'],
  ['LOGO_URL', '', 'Main league logo (https URL). Blank = keep the logo built into the page'],
  ['SPONSOR_LOGO_URL', '', 'Right-hand / sponsor logo (https URL). Blank = keep built-in'],
  ['COLOR_PRIMARY', '#dd0e23', 'Team A / accent colour (replaces the red)'],
  ['COLOR_SECONDARY', '#0b49d3', 'Team B / accent colour (replaces the blue)'],
  ['PLAYER_PAGE_URL', '', 'Full URL of player.html, used for team links / QR codes']
];

var STATUS = { SCHEDULED: 'Scheduled', LIVE: 'Live', DONE: 'Done' };
var TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
var VIEW_CACHE_S = 3;

/* ------------------------------------------------------------------ setup */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTab_(ss, TAB.MATCHES, MATCH_HEADERS);
  ensureTab_(ss, TAB.TEAMS, TEAM_HEADERS);
  ensureTab_(ss, TAB.LOG, LOG_HEADERS);
  ensureTab_(ss, TAB.STANDINGS, STANDINGS_HEADERS);
  ensureTab_(ss, TAB.KNOCKOUT, KNOCKOUT_HEADERS);
  ensureTab_(ss, TAB.QUALIFIERS, QUALIFIER_HEADERS);
  ensureHeaders_(ss.getSheetByName(TAB.MATCHES), MATCH_HEADERS);
  ensureHeaders_(ss.getSheetByName(TAB.QUALIFIERS), QUALIFIER_HEADERS);
  var cfg = ensureTab_(ss, TAB.CONFIG, CONFIG_HEADERS);
  if (cfg.getLastRow() < 2) cfg.getRange(2, 1, DEFAULT_STAGES.length, CONFIG_HEADERS.length).setValues(DEFAULT_STAGES);
  var set = ensureTab_(ss, TAB.SETTINGS, SETTINGS_HEADERS);
  var have = {};
  if (set.getLastRow() > 1) set.getRange(2, 1, set.getLastRow() - 1, 1).getValues().forEach(function (r) { have[r[0]] = true; });
  var add = DEFAULT_SETTINGS.filter(function (r) { return !have[r[0]]; });
  if (add.length) set.getRange(set.getLastRow() + 1, 1, add.length, 3).setValues(add);
  // keep IDs / team names as plain text so "001" or "10-2" never become numbers or dates
  ss.getSheetByName(TAB.MATCHES).getRange('A:C').setNumberFormat('@');
  ss.getSheetByName(TAB.MATCHES).getRange('F:G').setNumberFormat('@');
  ss.getSheetByName(TAB.MATCHES).getRange('Q:S').setNumberFormat('@');
  ss.getSheetByName(TAB.MATCHES).getRange('U:V').setNumberFormat('@');
  ss.getSheetByName(TAB.QUALIFIERS).getRange('A:I').setNumberFormat('@');
  ss.getSheetByName(TAB.TEAMS).getRange('A:B').setNumberFormat('@');
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN_SECRET')) props.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  clearCaches_(true);
  recompute_();
  clearCaches_();
  Logger.log('Setup done. Now add REFEREE_PIN and COURT_PIN_1..N in Project Settings > Script Properties.');
}

function ensureTab_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var first = sh.getLastColumn() ? sh.getRange(1, 1, 1, headers.length).getValues()[0] : [];
  var empty = first.every(function (v) { return v === '' || v === null; });
  if (!sh.getLastRow() || empty) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Add any missing header cells (e.g. new columns on a sheet made by an older version).
function ensureHeaders_(sh, headers) {
  var have = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some(function (h, i) { return have[i] !== h; })) sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
}

// Spreadsheet menu + manual overrides typed into the Qualifiers tab take effect straight away.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('League')
    .addItem('Update standings & knockout now', 'refreshCaches')
    .addToUi();
}
// Manual Team typed into the Qualifiers tab takes effect straight away.
function onEdit(e) {
  try {
    var r = e && e.range, sh = r && r.getSheet();
    if (!sh || sh.getName() !== TAB.QUALIFIERS || r.getRow() < 2) return;
    if (r.getColumn() <= 6 && r.getLastColumn() >= 6) withLock_(function () { recompute_(); clearCaches_(); });
  } catch (err) { /* never block the person editing */ }
}

/* ------------------------------------------------------------- HTTP entry */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.view === 'matches') return json_(cached_('view:matches', function () { return readMatches_().objs.map(publicMatch_); }));
    if (p.view === 'config') return json_(cached_('view:config', publicConfig_, 30));
    // One combined, slightly longer-cached view for the public (player.html): a single request per refresh,
    // and however many players are watching, the sheet is read at most once every 5 seconds.
    if (p.view === 'public') return json_(cached_('view:public', function () {
      return { matches: readMatches_().objs.map(publicMatch_), standings: sheetObjects_(TAB.STANDINGS), at: new Date().toISOString() };
    }, 5));
    if (p.view === 'teams') return json_(cached_('view:teams', function () { return readTeams_(); }));
    if (p.sheet) {
      var allowed = [TAB.STANDINGS, TAB.KNOCKOUT, TAB.TEAMS, TAB.MATCHES];
      if (allowed.indexOf(p.sheet) < 0) return json_({ ok: false, error: 'UNKNOWN_SHEET' });
      return json_(cached_('sheet:' + p.sheet, function () { return sheetObjects_(p.sheet); }));
    }
    return json_({ ok: true, service: 'badminton-league', time: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', message: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'BAD_JSON' }); }
  try {
    return json_(handle_(body));
  } catch (err) {
    if (err && err.code) return json_({ ok: false, error: err.code, message: err.message, current: err.current });
    return json_({ ok: false, error: 'SERVER', message: String(err && err.message || err) });
  }
}

var UMPIRE_ACTIONS = { startMatch: startMatch_, setScore: setScore_, endMatch: endMatch_ };
var REFEREE_ACTIONS = { assignMatch: assignMatch_, bulkAdd: bulkAdd_, addTeams: addTeams_, removeTeam: removeTeam_,
  reassignCourt: reassignCourt_, reorderQueue: reorderQueue_, overrideScore: overrideScore_,
  unlockMatch: unlockMatch_, deleteMatch: deleteMatch_, standardPairings: standardPairings_ };

function handle_(b) {
  if (b.action === 'login') return login_(b);
  var tok = verifyToken_(b.token);
  if (b.action === 'whoami') return { ok: true, role: tok.r, court: tok.c, umpire: tok.u };
  var fn = UMPIRE_ACTIONS[b.action] || REFEREE_ACTIONS[b.action];
  if (!fn) throw err_('UNKNOWN_ACTION', 'Unknown action ' + b.action);
  if (REFEREE_ACTIONS[b.action] && tok.r !== 'referee') throw err_('FORBIDDEN', 'Referee only');
  return withLock_(function () {
    var res = fn(b, tok);
    clearCaches_();
    return res;
  });
}

/* ------------------------------------------------------------------- auth */

function login_(b) {
  var props = PropertiesService.getScriptProperties();
  var role = b.role === 'referee' ? 'referee' : 'umpire';
  var court = role === 'umpire' ? String(parseInt(b.court, 10) || '') : '';
  if (role === 'umpire' && !court) throw err_('BAD_REQUEST', 'Pick a court');
  var cache = CacheService.getScriptCache();
  var failKey = 'loginfail:' + (role === 'referee' ? 'ref' : court);
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw err_('RATE_LIMITED', 'Too many wrong PINs. Wait 10 minutes.');
  var expected = role === 'referee' ? props.getProperty('REFEREE_PIN') : props.getProperty('COURT_PIN_' + court);
  if (!expected || String(b.pin || '').trim() !== String(expected).trim()) {
    cache.put(failKey, String(fails + 1), 600);
    throw err_('BAD_PIN', 'Wrong PIN');
  }
  cache.remove(failKey);
  var umpire = String(b.umpire || (role === 'referee' ? 'Referee' : '')).trim().slice(0, 40);
  if (role === 'umpire' && !umpire) throw err_('BAD_REQUEST', 'Enter umpire name');
  var payload = { r: role, c: court, u: umpire, e: Date.now() + TOKEN_TTL_MS };
  return { ok: true, token: signToken_(payload), role: role, court: court, umpire: umpire, expires: payload.e };
}

// Signed token (HMAC-SHA256). Stateless so it can live 12h (CacheService caps at 6h).
function signToken_(payload) {
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  return body + '.' + hmac_(body);
}
function verifyToken_(token) {
  if (!token || String(token).indexOf('.') < 0) throw err_('AUTH', 'Please log in');
  var parts = String(token).split('.');
  if (hmac_(parts[0]) !== parts[1]) throw err_('AUTH', 'Please log in again');
  var p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (!p.e || p.e < Date.now()) throw err_('AUTH', 'Session expired, log in again');
  return p;
}
function hmac_(s) {
  var secret = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
  if (!secret) throw err_('SERVER', 'Run setup() first');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret));
}

/* -------------------------------------------------------- umpire actions */

function startMatch_(b, tok) {
  var db = readMatches_(), m = mustFind_(db, b.matchId);
  checkCourt_(m, tok);
  if (m['Status'] === STATUS.DONE) throw err_('DONE', 'Match already finished', m);
  if (m['Status'] === STATUS.LIVE) return ok_(m);
  var waiting = unresolvedSlots_(m, db);
  if (waiting.length) throw err_('NOT_READY', 'Teams not decided yet: ' + waiting.join(' / ') + '. The referee can set them in the Qualifiers tab.', m);
  var busy = db.objs.filter(function (x) { return x['Status'] === STATUS.LIVE && String(x['Court']) === String(m['Court']) && x['Match ID'] !== m['Match ID']; });
  if (busy.length) throw err_('COURT_BUSY', 'Match ' + busy[0]['Match ID'] + ' is still live on this court');
  var old = snapshot_(m);
  m['Status'] = STATUS.LIVE;
  m['Umpire'] = tok.r === 'umpire' ? tok.u : (m['Umpire'] || 'Referee');
  saveMatch_(db, m, 'startMatch', old, tok);
  if (m['Stage'] !== 'Group') updateKnockoutRow_(db, m);
  return ok_(m);
}

function setScore_(b, tok) {
  var db = readMatches_(), m = mustFind_(db, b.matchId);
  checkCourt_(m, tok);
  if (m['Status'] === STATUS.DONE) throw err_('DONE', 'Match is finished and locked', m);
  if (m['Status'] !== STATUS.LIVE) throw err_('NOT_STARTED', 'Start the match first', m);
  var rule = stageRule_(m['Stage']);
  var setNo = b.set, a = b.a, bb = b.b;
  if (!isInt_(setNo) || setNo < 1 || setNo > Rules.maxSets(rule)) throw err_('INVALID', 'Set ' + setNo + ' is not valid for ' + m['Stage'], m);
  if (!isInt_(a) || !isInt_(bb)) throw err_('INVALID', 'Scores must be whole numbers', m);
  var sets = setsOf_(m);
  if (sets[setNo - 1][0] === a && sets[setNo - 1][1] === bb) return ok_(m); // duplicate send: no change
  if (Number(b.version) !== Number(m['Version'])) throw err_('STALE', 'Score changed elsewhere', m);
  for (var i = setNo; i < 3; i++) if (sets[i][0] || sets[i][1]) throw err_('INVALID', 'Set ' + (i + 1) + ' already has points; undo it first', m);
  sets[setNo - 1] = [a, bb];
  var st = Rules.matchStatus(rule, sets);
  if (!st.valid) throw err_('INVALID', st.error, m);
  var old = snapshot_(m);
  applySets_(m, sets, st);
  saveMatch_(db, m, 'setScore S' + setNo, old, tok);
  if (m['Stage'] !== 'Group') updateKnockoutRow_(db, m);
  return ok_(m);
}

function endMatch_(b, tok) {
  var db = readMatches_(), m = mustFind_(db, b.matchId);
  checkCourt_(m, tok);
  if (m['Status'] === STATUS.DONE) return ok_(m);
  if (m['Status'] !== STATUS.LIVE) throw err_('NOT_STARTED', 'Match is not live', m);
  if (Number(b.version) !== Number(m['Version'])) throw err_('STALE', 'Score changed elsewhere', m);
  // The umpire's phone sends its final score with End Match, so unsent points don't block ending.
  var sets = setsOf_(m);
  if (b.sets) {
    sets = [0, 1, 2].map(function (i) { var x = b.sets[i] || [0, 0]; return [x[0], x[1]]; });
    if (!sets.every(function (x) { return isInt_(x[0]) && isInt_(x[1]); })) throw err_('INVALID', 'Scores must be whole numbers', m);
  }
  var st = Rules.matchStatus(stageRule_(m['Stage']), sets);
  if (!st.valid) throw err_('INVALID', st.error, m);
  if (!st.decided) throw err_('NOT_DECIDED', 'Nobody has won enough sets yet', m);
  var old = snapshot_(m);
  applySets_(m, sets, st);
  m['Status'] = STATUS.DONE;
  m['Winner'] = st.winner === 'A' ? m['Team A'] : m['Team B'];
  saveMatch_(db, m, 'endMatch', old, tok);
  recompute_(db);
  return ok_(m);
}

/* ------------------------------------------------------- referee actions */

function assignMatch_(b, tok) {
  var db = readMatches_();
  var res = upsertMatch_(db, b.match || b, tok);
  recompute_(db);
  return ok_(res);
}

function bulkAdd_(b, tok) {
  var db = readMatches_();
  var list = b.matches || [], errors = [], added = [];
  list.forEach(function (row, i) {
    try { added.push(upsertMatch_(db, row, tok, true)); }
    catch (e) { errors.push('Row ' + (i + 1) + ': ' + (e.message || e)); }
  });
  if (errors.length && b.allOrNothing) {
    // roll back the rows appended in this call
    added.slice().reverse().forEach(function (m) { deleteRowById_(db, m['Match ID']); });
    throw err_('INVALID', errors.join('\n'));
  }
  recompute_(db);
  return { ok: true, added: added.length, errors: errors };
}

function upsertMatch_(db, d, tok, isBulk) {
  var stages = getConfig_().stages;
  var stage = String(d.stage || d['Stage'] || '').trim();
  if (!stages[stage]) throw err_('INVALID', 'Unknown stage "' + stage + '"');
  var teamA = String(d.teamA || d['Team A'] || '').trim(), teamB = String(d.teamB || d['Team B'] || '').trim();
  if (!teamA || !teamB) throw err_('INVALID', 'Both teams are required');
  if (teamA.toLowerCase() === teamB.toLowerCase()) throw err_('INVALID', 'Team A and Team B cannot be the same team');
  var court = parseInt(d.court || d['Court'], 10);
  var courts = Number(getConfig_().settings.COURTS) || 99;
  if (!(court >= 1 && court <= courts)) throw err_('INVALID', 'Court must be 1-' + courts);
  var id = String(d.matchId || d['Match ID'] || '').trim();
  var existing = id ? find_(db, id) : null;
  if (existing && isBulk && !d.allowUpdate) throw err_('INVALID', 'Match ID ' + id + ' already exists');
  if (existing && existing['Status'] === STATUS.DONE) throw err_('DONE', 'Unlock the match before editing it');
  var q = parseInt(d.queueOrder || d['Queue Order'], 10);
  if (!(q >= 1)) q = nextQueue_(db, court, existing && existing['Match ID']);
  var m = existing || blankMatch_(id || nextId_(db));
  var old = existing ? snapshot_(m) : '';
  m['Stage'] = stage; m['Group'] = String(d.group || d['Group'] || '').trim();
  m['Court'] = court; m['Queue Order'] = q;
  // Knockout teams written as "G1 1st" / "PQ1 Winner" are slots the server fills in later.
  // Typing a real name over an auto-filled team pins it (stops auto-fill for that side).
  [['A', teamA], ['B', teamB]].forEach(function (p) {
    var side = p[0], name = p[1], prevTeam = existing ? String(existing['Team ' + side]) : null;
    if (stage === 'Group') m['Slot ' + side] = '';
    else if (isSlotRef_(name, db)) m['Slot ' + side] = name;
    else if (!(existing && name === prevTeam)) m['Slot ' + side] = '';
    m['Team ' + side] = name;
  });
  var st = Rules.matchStatus(stages[stage], setsOf_(m));
  if (!st.valid) throw err_('INVALID', 'Existing scores do not fit ' + stage + ': ' + st.error);
  applySets_(m, setsOf_(m), st);
  checkClash_(db, m);
  if (existing) saveMatch_(db, m, 'assignMatch (edit)', old, tok);
  else appendMatch_(db, m, 'assignMatch (new)', tok);
  return m;
}

// Standard draw for 2N groups: group 1 v group 2N, 2 v 2N-1, … (1st of one group plays 2nd of the other, both ways).
// Bracket halves keep the 1st and 2nd of the same group apart until the Final:
//   PQ1 G1 1st v G8 2nd · PQ2 G8 1st v G1 2nd · PQ3 G2 1st v G7 2nd · PQ4 G7 1st v G2 2nd · … PQ8 G5 1st v G4 2nd
//   QF1 PQ1 v PQ3 · QF2 PQ2 v PQ4 · QF3 PQ5 v PQ7 · QF4 PQ6 v PQ8 · SF1 QF1 v QF3 · SF2 QF2 v QF4 · Final SF1 v SF2
// Only matches that have not started are changed. dryRun:true returns the plan without saving.
function standardPairings_(b, tok) {
  var db = readMatches_(), byNum = function (x, y) { return String(x['Match ID']).localeCompare(String(y['Match ID']), undefined, { numeric: true }); };
  var groups = {};
  readTeams_().forEach(function (t) { if (t['Group']) groups[t['Group']] = 1; });
  groups = Object.keys(groups).sort(function (x, y) { return x.localeCompare(y, undefined, { numeric: true }); });
  var stage = function (n) { return db.objs.filter(function (m) { return m['Stage'] === n; }).sort(byNum); };
  var pq = stage('Pre Quarter Final'), qf = stage('Quarter Final'), sf = stage('Semi Final'), fi = stage('Final');
  var n = groups.length;
  if (n < 2 || n % 2) throw err_('INVALID', 'Needs an even number of groups (found ' + n + ')');
  if (pq.length !== n) throw err_('INVALID', 'Needs ' + n + ' Pre Quarter Final matches for ' + n + ' groups (found ' + pq.length + ')');
  var plan = [];
  for (var i = 0; i < n / 2; i++) {
    var g1 = groups[i], g2 = groups[n - 1 - i];
    plan.push([pq[2 * i], g1 + ' 1st', g2 + ' 2nd'], [pq[2 * i + 1], g2 + ' 1st', g1 + ' 2nd']);
  }
  var W = function (m) { return m['Match ID'] + ' Winner'; };
  if (n === 8 && qf.length === 4) {
    plan.push([qf[0], W(pq[0]), W(pq[2])], [qf[1], W(pq[1]), W(pq[3])], [qf[2], W(pq[4]), W(pq[6])], [qf[3], W(pq[5]), W(pq[7])]);
    if (sf.length === 2) plan.push([sf[0], W(qf[0]), W(qf[2])], [sf[1], W(qf[1]), W(qf[3])]);
    if (sf.length === 2 && fi.length === 1) plan.push([fi[0], W(sf[0]), W(sf[1])]);
  }
  var changed = [], skipped = [];
  plan.forEach(function (p) {
    var m = p[0];
    if (m['Status'] !== STATUS.SCHEDULED) { skipped.push(m['Match ID'] + ' (' + m['Status'] + ')'); return; }
    if (b.dryRun) { changed.push(m['Match ID'] + ': ' + p[1] + ' v ' + p[2]); return; }
    var old = snapshot_(m);
    m['Team A'] = m['Slot A'] = p[1]; m['Team B'] = m['Slot B'] = p[2];
    saveMatch_(db, m, 'standardPairings', old, tok);
    changed.push(m['Match ID'] + ': ' + p[1] + ' v ' + p[2]);
  });
  if (!b.dryRun) recompute_(db);
  return { ok: true, changed: changed, skipped: skipped };
}

function addTeams_(b, tok) {
  var sh = sheet_(TAB.TEAMS), teams = readTeams_(), byName = {};
  teams.forEach(function (t, i) { byName[t['Team Name'].toLowerCase()] = i; });
  (b.teams || []).forEach(function (t) {
    var name = String(t.name || t['Team Name'] || '').trim(), group = String(t.group || t['Group'] || '').trim();
    if (!name) return;
    var k = name.toLowerCase();
    if (k in byName) teams[byName[k]]['Group'] = group;
    else { byName[k] = teams.length; teams.push({ 'Team Name': name, 'Group': group }); }
  });
  writeTable_(sh, TEAM_HEADERS, teams.map(function (t) { return [t['Team Name'], t['Group']]; }));
  log_('', 'addTeams', '', tok.u, '', JSON.stringify(b.teams || []).slice(0, 4000), '');
  recompute_();
  return { ok: true, teams: teams };
}

function removeTeam_(b, tok) {
  var sh = sheet_(TAB.TEAMS), name = String(b.name || '').trim().toLowerCase();
  var teams = readTeams_().filter(function (t) { return t['Team Name'].toLowerCase() !== name; });
  writeTable_(sh, TEAM_HEADERS, teams.map(function (t) { return [t['Team Name'], t['Group']]; }));
  log_('', 'removeTeam', '', tok.u, b.name, '', '');
  recompute_();
  return { ok: true, teams: teams };
}

function reassignCourt_(b, tok) {
  var db = readMatches_(), m = mustFind_(db, b.matchId);
  if (m['Status'] === STATUS.DONE) throw err_('DONE', 'Unlock the match first');
  var court = parseInt(b.court, 10), courts = Number(getConfig_().settings.COURTS) || 99;
  if (!(court >= 1 && court <= courts)) throw err_('INVALID', 'Court must be 1-' + courts);
  var old = snapshot_(m);
  m['Court'] = court;
  m['Queue Order'] = parseInt(b.queueOrder, 10) >= 1 ? parseInt(b.queueOrder, 10) : nextQueue_(db, court, m['Match ID']);
  checkClash_(db, m);
  saveMatch_(db, m, 'reassignCourt', old, tok);
  return ok_(m);
}

function reorderQueue_(b, tok) {
  var db = readMatches_(), court = String(parseInt(b.court, 10));
  var ids = b.order || [];
  var ms = ids.map(function (id) {
    var m = mustFind_(db, id);
    if (String(m['Court']) !== court) throw err_('INVALID', id + ' is not on court ' + court);
    return m;
  });
  var olds = ms.map(snapshot_);
  ms.forEach(function (m, i) { m['Queue Order'] = i + 1; });
  ms.forEach(function (m) { checkClash_(db, m); });
  ms.forEach(function (m, i) { if (olds[i] !== snapshot_(m)) saveMatch_(db, m, 'reorderQueue', olds[i], tok); });
  return { ok: true, matches: ms.map(publicMatch_) };
}

function overrideScore_(b, tok) {
  var db = readMatches_(), m = mustFind_(db, b.matchId);
  var sets = [0, 1, 2].map(function (i) {
    var s = (b.sets || [])[i] || [0, 0];
    return [parseInt(s[0], 10) || 0, parseInt(s[1], 10) || 0];
  });
  var st = Rules.matchStatus(stageRule_(m['Stage']), sets);
  if (!st.valid) throw err_('INVALID', st.error);
  if (b.markDone && !st.decided) throw err_('NOT_DECIDED', 'Cannot mark Done: no side has won enough sets');
  var old = snapshot_(m);
  applySets_(m, sets, st);
  if (b.markDone || (m['Status'] === STATUS.DONE && st.decided)) {
    m['Status'] = STATUS.DONE;
    m['Winner'] = st.winner === 'A' ? m['Team A'] : m['Team B'];
  } else {
    if (m['Status'] === STATUS.DONE || (m['Status'] === STATUS.SCHEDULED && (st.setsA || st.setsB || sets[0][0] || sets[0][1]))) m['Status'] = STATUS.LIVE;
    m['Winner'] = '';
  }
  saveMatch_(db, m, 'overrideScore', old, tok);
  recompute_(db);
  return ok_(m);
}

function unlockMatch_(b, tok) {
  var db = readMatches_(), m = mustFind_(db, b.matchId);
  if (m['Status'] !== STATUS.DONE) return ok_(m);
  var old = snapshot_(m);
  m['Status'] = STATUS.LIVE; m['Winner'] = '';
  saveMatch_(db, m, 'unlockMatch', old, tok);
  recompute_(db);
  return ok_(m);
}

function deleteMatch_(b, tok) {
  var db = readMatches_(), m = mustFind_(db, b.matchId);
  var old = snapshot_(m);
  deleteRowById_(db, m['Match ID']);
  log_(m['Match ID'], 'deleteMatch', m['Court'], tok.u, old, '', Number(m['Version']) + 1);
  recompute_(db);
  return { ok: true, deleted: m['Match ID'] };
}

/* ------------------------------------------------------------- standings */

// Sheet1 = group table from Done group matches only (with point difference and rank).
// Then knockout slots ("G1 1st", "PQ1 Winner") are filled in, then the Knockout tab is rebuilt.
function recompute_(db, opts) {
  db = db || readMatches_();
  var cfg = getConfig_(), stages = cfg.stages;
  if (!(opts && opts.knockoutOnly)) {
    var tables = groupTables_(db, cfg);
    var rows = [];
    tables.order.forEach(function (g) {
      tables.groups[g].forEach(function (t) {
        rows.push([t.group, t.name, t.p, t.w, t.l, t.pts, t.pf, t.pa, t.pf - t.pa, t.rank,
                   t.tied ? 'Tied — check (same points, point diff and points scored)' : '']);
      });
    });
    writeTable_(sheet_(TAB.STANDINGS), STANDINGS_HEADERS, rows);
    fillSlots_(db, tables);
  }
  var ko = db.objs.filter(function (m) { return m['Stage'] !== 'Group'; }).map(function (m) {
    var r = stages[m['Stage']] || { setsToWin: 1, order: 9 };
    var single = r.setsToWin === 1;
    return [m['Match ID'], m['Stage'], r.order, m['Team A'], m['Team B'],
            single ? num_(m['S1A']) : num_(m['Sets A']), single ? num_(m['S1B']) : num_(m['Sets B']),
            m['Status'], m['Winner'] || '', Number(m['Queue Order']) || 0];
  }).sort(function (x, y) { return x[2] - y[2] || x[9] - y[9] || String(x[0]).localeCompare(String(y[0]), undefined, { numeric: true }); })
    .map(function (r) { return r.slice(0, 9); });
  writeTable_(sheet_(TAB.KNOCKOUT), KNOCKOUT_HEADERS, ko);
}

// "Group 1", "G1", "g 1" -> "1";  "Group A" -> "a"
function groupKey_(g) {
  var k = String(g || '').toLowerCase().replace(/^group\s*/, '').replace(/\s+/g, '');
  return /^g\d+$/.test(k) ? k.slice(1) : k;
}

// Ranking: league points, then point difference, then points scored, then head-to-head.
// Teams still level after all that are marked tied (never silently guessed).
function groupTables_(db, cfg) {
  var win = Number(cfg.settings.LEAGUE_POINTS_PER_WIN), loss = Number(cfg.settings.LEAGUE_POINTS_PER_LOSS);
  var table = {}, order = [];
  function team(name, group) {
    var k = String(name).toLowerCase();
    if (!table[k]) { table[k] = { group: group || '', name: String(name), p: 0, w: 0, l: 0, pf: 0, pa: 0, beat: {} }; order.push(k); }
    if (!table[k].group && group) table[k].group = group;
    return table[k];
  }
  readTeams_().forEach(function (t) { team(t['Team Name'], t['Group']); });
  var played = {}, total = {};
  db.objs.forEach(function (m) {
    if (m['Stage'] !== 'Group') return;
    var gk = groupKey_(m['Group'] || (table[String(m['Team A']).toLowerCase()] || {}).group);
    total[gk] = (total[gk] || 0) + 1;
    if (m['Status'] !== STATUS.DONE || !m['Winner']) return;
    played[gk] = (played[gk] || 0) + 1;
    var a = team(m['Team A'], m['Group']), b = team(m['Team B'], m['Group']);
    var aWon = String(m['Winner']) === String(m['Team A']);
    a.p++; b.p++;
    if (aWon) { a.w++; b.l++; a.beat[b.name.toLowerCase()] = 1; } else { b.w++; a.l++; b.beat[a.name.toLowerCase()] = 1; }
    setsOf_(m).forEach(function (s) { a.pf += s[0]; a.pa += s[1]; b.pf += s[1]; b.pa += s[0]; });
  });
  var groups = {}, names = {};
  order.forEach(function (k) {
    var t = table[k]; t.pts = t.w * win + t.l * loss;
    var gk = groupKey_(t.group); (groups[gk] = groups[gk] || []).push(t); names[gk] = names[gk] || t.group;
  });
  function key(t) { return [t.pts, t.pf - t.pa, t.pf].join('|'); }
  Object.keys(groups).forEach(function (gk) {
    var list = groups[gk].sort(function (x, y) {
      return y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf || x.name.localeCompare(y.name);
    });
    var out = [];
    for (var i = 0; i < list.length;) {
      var j = i; while (j < list.length && key(list[j]) === key(list[i])) j++;
      var block = list.slice(i, j);
      if (block.length > 1) {
        // head-to-head among the level teams: wins against each other
        block.forEach(function (t) { t.h2h = block.filter(function (o) { return t.beat[o.name.toLowerCase()]; }).length; });
        block.sort(function (x, y) { return y.h2h - x.h2h || x.name.localeCompare(y.name); });
        block.forEach(function (t) { t.tied = block.filter(function (o) { return o.h2h === t.h2h; }).length > 1 && t.p > 0; });
      } else block[0].tied = false;
      out = out.concat(block); i = j;
    }
    out.forEach(function (t, i) { t.rank = i + 1; });
    groups[gk] = out;
  });
  var ord = Object.keys(groups).sort(function (a, b) { return String(names[a]).localeCompare(String(names[b]), undefined, { numeric: true }); });
  return { groups: groups, order: ord, names: names, played: played, total: total };
}

var RANK_WORDS_ = { '1st': 1, first: 1, winner: 1, winners: 1, topper: 1, '2nd': 2, second: 2, 'runner up': 2,
  'runners up': 2, 'runner-up': 2, 'runners-up': 2, '3rd': 3, third: 3, '4th': 4, fourth: 4, loser: 'L', losers: 'L' };
// "G1 1st", "1st G1", "Group 2 Runner-up", "PQ1 Winner", "Winner of PQ1", "SF1 Loser" -> { ref, word }
function parseSlot_(text) {
  var t = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  var words = Object.keys(RANK_WORDS_).sort(function (a, b) { return b.length - a.length; }).map(function (w) { return w.replace('-', '\\-'); }).join('|');
  var m = new RegExp('^(.+?)[ ]*(?:-|:)?[ ]+(' + words + ')$').exec(t);
  if (m) return { ref: m[1].trim(), word: m[2] };
  m = new RegExp('^(' + words + ')[ ]+(?:of |in |from )?(.+)$').exec(t);
  if (m) return { ref: m[2].trim(), word: m[1] };
  return null;
}

// What a slot currently stands for: { team } when known, else { wait } / { tie } / { bad } with a reason.
function resolveSlot_(text, db, tables) {
  var p = parseSlot_(text); if (!p) return { bad: 'Not a slot' };
  var rank = RANK_WORDS_[p.word];
  var src = null;
  db.objs.forEach(function (m) { if (String(m['Match ID']).toLowerCase() === p.ref) src = m; });
  if (src && (rank === 1 || rank === 'L')) {
    if (src['Status'] !== STATUS.DONE || !src['Winner']) return { wait: 'Waiting for ' + src['Match ID'] + ' to finish' };
    var w = String(src['Winner']), other = w === String(src['Team A']) ? src['Team B'] : src['Team A'];
    return { team: rank === 1 ? w : String(other), why: src['Match ID'] + ' ' + (rank === 1 ? 'winner' : 'loser') };
  }
  var gk = groupKey_(p.ref), list = tables.groups[gk];
  if (!list || rank === 'L') return { bad: 'No match or group called "' + p.ref + '"' };
  var total = tables.total[gk] || 0, done = tables.played[gk] || 0;
  if (!total || done < total) return { wait: 'Group ' + (tables.names[gk] || p.ref) + ': ' + done + ' of ' + total + ' matches done' };
  var t = list[rank - 1];
  if (!t) return { bad: 'Group ' + tables.names[gk] + ' has only ' + list.length + ' teams' };
  if (t.tied) return { tie: 'Tie in group ' + tables.names[gk] + ' — type the team in Manual Team' };
  return { team: t.name, why: 'Rank ' + rank + ' in ' + tables.names[gk] + ' (' + t.pts + ' pts, diff ' + (t.pf - t.pa) + ')' };
}

// True only when the text points at a real match ID or group, so a team called "Top Gun" stays a team.
function isSlotRef_(text, db) {
  var p = parseSlot_(text); if (!p) return false;
  var rank = RANK_WORDS_[p.word];
  if ((rank === 1 || rank === 'L') && db.objs.some(function (m) { return String(m['Match ID']).toLowerCase() === p.ref; })) return true;
  if (rank === 'L') return false;
  if (!db._gkeys) {   // group names, worked out once per request
    db._gkeys = {};
    readTeams_().forEach(function (t) { db._gkeys[groupKey_(t['Group'])] = 1; });
    db.objs.forEach(function (m) { if (m['Stage'] === 'Group') db._gkeys[groupKey_(m['Group'])] = 1; });
  }
  return !!db._gkeys[groupKey_(p.ref)];
}

// Slots still showing their placeholder (used to stop a match starting before its teams are known).
function unresolvedSlots_(m, db) {
  return ['A', 'B'].filter(function (s) {
    var slot = String(m['Slot ' + s] || '');
    return slot && String(m['Team ' + s]) === slot && isSlotRef_(slot, db);
  }).map(function (s) { return m['Slot ' + s]; });
}

// Fill knockout teams from their slots and write the Qualifiers tab (keeping any Manual Team typed there).
// Only matches that have not started are changed; a started match that disagrees is reported as a conflict.
function fillSlots_(db, tables) {
  var qsh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.QUALIFIERS);
  if (!qsh) qsh = ensureTab_(SpreadsheetApp.getActiveSpreadsheet(), TAB.QUALIFIERS, QUALIFIER_HEADERS);
  ensureHeaders_(db.sheet, MATCH_HEADERS);
  var manual = {};
  sheetObjects_(TAB.QUALIFIERS).forEach(function (r) {
    if (String(r['Manual Team'] || '').trim()) manual[r['Match ID'] + '|' + r['Side']] = String(r['Manual Team']).trim();
  });
  var rows = [], auto = { u: 'auto' };
  db.objs.forEach(function (m) {
    if (m['Stage'] === 'Group') return;
    var changed = false, old = snapshot_(m);
    ['A', 'B'].forEach(function (s) {
      // older sheets: adopt a placeholder already typed as the team name
      if (!m['Slot ' + s] && m['Status'] === STATUS.SCHEDULED && isSlotRef_(m['Team ' + s], db)) { m['Slot ' + s] = String(m['Team ' + s]); changed = true; }
      var slot = String(m['Slot ' + s] || ''); if (!slot) return;
      var r = resolveSlot_(slot, db, tables), man = manual[m['Match ID'] + '|' + s] || '';
      var use = man || r.team || slot, status, note = r.why || r.wait || r.tie || r.bad || '';
      if (m['Status'] === STATUS.SCHEDULED) {
        if (String(m['Team ' + s]) !== use) { m['Team ' + s] = use; changed = true; }
        status = man ? 'Manual' : r.team ? 'Filled' : r.tie ? 'TIE — needs manual' : r.bad ? 'Check slot text' : 'Waiting';
      } else if ((man || r.team) && String(m['Team ' + s]) !== use) {
        status = 'CONFLICT'; note = 'Match already ' + m['Status'] + ' with ' + m['Team ' + s] + ', but slot now gives ' + use;
      } else status = 'Locked (' + m['Status'] + ')';
      rows.push([m['Match ID'], m['Stage'], s, slot, r.team || '', man, String(m['Team ' + s]), status, note]);
    });
    if (changed) saveMatch_(db, m, 'autoFill', old, auto);
  });
  var stg = getConfig_().stages;
  rows.sort(function (x, y) { return ((stg[x[1]] || {}).order || 9) - ((stg[y[1]] || {}).order || 9) || String(x[0]).localeCompare(String(y[0]), undefined, { numeric: true }) || (x[2] < y[2] ? -1 : 1); });
  writeTable_(qsh, QUALIFIER_HEADERS, rows);
}

// Live knockout scores: rewrite just this match's Score A / Score B / Status cells.
function updateKnockoutRow_(db, m) {
  var sh = sheet_(TAB.KNOCKOUT), n = sh.getLastRow() - 1;
  var ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues() : [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(m['Match ID'])) {
      var single = (stageRule_(m['Stage']).setsToWin || 1) === 1;
      sh.getRange(i + 2, 6, 1, 3).setValues([[single ? num_(m['S1A']) : num_(m['Sets A']), single ? num_(m['S1B']) : num_(m['Sets B']), m['Status']]]);
      return;
    }
  }
  recompute_(db, { knockoutOnly: true }); // not in the table yet
}

/* --------------------------------------------------------------- helpers */

function readMatches_() {
  var sh = sheet_(TAB.MATCHES);
  var n = sh.getLastRow() - 1;
  var vals = n > 0 ? sh.getRange(2, 1, n, MATCH_HEADERS.length).getValues() : [];
  var objs = [];
  vals.forEach(function (r, idx) {
    if (r[0] === '' || r[0] === null) return;
    var o = { _row: idx + 2 };
    MATCH_HEADERS.forEach(function (h, i) { o[h] = r[i]; });
    o['Match ID'] = String(o['Match ID']);
    ['S1A', 'S1B', 'S2A', 'S2B', 'S3A', 'S3B', 'Sets A', 'Sets B', 'Version'].forEach(function (k) { o[k] = num_(o[k]); });
    o['Status'] = o['Status'] || STATUS.SCHEDULED;
    if (o['Updated At'] instanceof Date) o['Updated At'] = o['Updated At'].toISOString();
    objs.push(o);
  });
  return { sheet: sh, objs: objs };
}

function find_(db, id) {
  id = String(id || '').trim().toLowerCase();
  for (var i = 0; i < db.objs.length; i++) if (db.objs[i]['Match ID'].toLowerCase() === id) return db.objs[i];
  return null;
}
function mustFind_(db, id) { var m = find_(db, id); if (!m) throw err_('NOT_FOUND', 'Match ' + id + ' not found'); return m; }

function rowIndex_(db, id) {
  var known = find_(db, id);
  if (known && known._row) return known._row;
  // fallback: look it up in the ID column
  var ids = db.sheet.getRange(2, 1, Math.max(db.sheet.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  throw err_('NOT_FOUND', 'Match ' + id + ' not found');
}

function saveMatch_(db, m, action, old, tok) {
  m['Version'] = num_(m['Version']) + 1;
  m['Updated At'] = new Date().toISOString();
  db.sheet.getRange(rowIndex_(db, m['Match ID']), 1, 1, MATCH_HEADERS.length).setValues([toRow_(m)]);
  log_(m['Match ID'], action, m['Court'], tok.u, old, snapshot_(m), m['Version']);
}

function appendMatch_(db, m, action, tok) {
  m['Version'] = 1;
  m['Updated At'] = new Date().toISOString();
  var last = db.sheet.getLastRow();
  db.sheet.getRange(last + 1, 1, 1, MATCH_HEADERS.length).setValues([toRow_(m)]);
  m._row = last + 1;
  db.objs.push(m);
  log_(m['Match ID'], action, m['Court'], tok.u, '', snapshot_(m), 1);
}

function deleteRowById_(db, id) {
  var row = rowIndex_(db, id);
  db.sheet.deleteRow(row);
  db.objs = db.objs.filter(function (x) { return x['Match ID'] !== id; });
  db.objs.forEach(function (x) { if (x._row > row) x._row--; });
}

function toRow_(m) { return MATCH_HEADERS.map(function (h) { return m[h] === undefined || m[h] === null ? '' : m[h]; }); }

function blankMatch_(id) {
  var m = {}; MATCH_HEADERS.forEach(function (h) { m[h] = ''; });
  m['Match ID'] = id; m['Status'] = STATUS.SCHEDULED; m['Version'] = 0;
  ['S1A', 'S1B', 'S2A', 'S2B', 'S3A', 'S3B', 'Sets A', 'Sets B'].forEach(function (k) { m[k] = 0; });
  return m;
}

function nextId_(db) {
  var max = 0;
  db.objs.forEach(function (m) { var n = parseInt(String(m['Match ID']).replace(/\D+/g, ''), 10); if (n > max) max = n; });
  return 'M' + (max + 1);
}

function nextQueue_(db, court, exceptId) {
  var max = 0;
  db.objs.forEach(function (m) {
    if (String(m['Court']) === String(court) && m['Match ID'] !== exceptId) max = Math.max(max, Number(m['Queue Order']) || 0);
  });
  return max + 1;
}

// A team may not be in two Live/Scheduled matches with the same Queue Order (they'd be due at the same time).
function checkClash_(db, m) {
  if (m['Status'] === STATUS.DONE) return;
  var teams = [String(m['Team A']).toLowerCase(), String(m['Team B']).toLowerCase()];
  db.objs.forEach(function (x) {
    if (x['Match ID'] === m['Match ID'] || x['Status'] === STATUS.DONE) return;
    if (Number(x['Queue Order']) !== Number(m['Queue Order'])) return;
    var t = [String(x['Team A']).toLowerCase(), String(x['Team B']).toLowerCase()];
    var clash = teams.filter(function (k) { return t.indexOf(k) >= 0; });
    if (clash.length) throw err_('TEAM_CLASH', 'Team "' + clash[0] + '" is already in match ' + x['Match ID'] +
      ' (court ' + x['Court'] + ') at queue position ' + x['Queue Order']);
  });
}

function checkCourt_(m, tok) {
  if (tok.r === 'referee') return;
  if (String(m['Court']) !== String(tok.c)) throw err_('WRONG_COURT', 'This match is on court ' + m['Court'] + ', not your court');
}

function setsOf_(m) { return [[num_(m['S1A']), num_(m['S1B'])], [num_(m['S2A']), num_(m['S2B'])], [num_(m['S3A']), num_(m['S3B'])]]; }

function applySets_(m, sets, st) {
  m['S1A'] = sets[0][0]; m['S1B'] = sets[0][1]; m['S2A'] = sets[1][0]; m['S2B'] = sets[1][1];
  m['S3A'] = sets[2][0]; m['S3B'] = sets[2][1];
  m['Sets A'] = st.setsA; m['Sets B'] = st.setsB; // always computed here, never from the client
}

function snapshot_(m) {
  return m['Status'] + ' ' + m['Team A'] + ' v ' + m['Team B'] + ' C' + m['Court'] + '#' + m['Queue Order'] + ' ' +
    [m['S1A'] + '-' + m['S1B'], m['S2A'] + '-' + m['S2B'], m['S3A'] + '-' + m['S3B']].join(',') +
    (m['Winner'] ? ' W:' + m['Winner'] : '');
}

function publicMatch_(m) {
  var o = {}; MATCH_HEADERS.forEach(function (h) { o[h] = m[h]; });
  o['Court'] = num_(o['Court']); o['Queue Order'] = num_(o['Queue Order']);
  return o;
}

function ok_(m) { return { ok: true, match: publicMatch_(m) }; }

function stageRule_(stage) {
  var r = getConfig_().stages[stage];
  if (!r) throw err_('INVALID', 'Unknown stage ' + stage);
  return r;
}

function getConfig_() {
  if (getConfig_.memo) return getConfig_.memo;
  // Config + Settings rarely change: keep them in the script cache so a score update doesn't re-read two tabs.
  var hit = CacheService.getScriptCache().get('cfg:all');
  if (hit) { getConfig_.memo = JSON.parse(hit); return getConfig_.memo; }
  var stages = {}, order = [];
  var c = sheet_(TAB.CONFIG), n = c.getLastRow() - 1;
  (n > 0 ? c.getRange(2, 1, n, 7).getValues() : DEFAULT_STAGES).forEach(function (r, i) {
    if (!r[0]) return;
    var s = { stage: String(r[0]).trim(), setsToWin: num_(r[1]) || 1, target: num_(r[2]), cap: num_(r[3]),
              deciderTarget: num_(r[4]) || num_(r[2]), deciderCap: num_(r[5]) || num_(r[3]),
              order: r[6] === '' || r[6] === null ? i : num_(r[6]) };
    stages[s.stage] = s; order.push(s.stage);
  });
  order.sort(function (a, b) { return stages[a].order - stages[b].order; });
  var settings = {}, branding = {};
  DEFAULT_SETTINGS.forEach(function (r) { settings[r[0]] = r[1]; });
  var s = sheet_(TAB.SETTINGS), m = s.getLastRow() - 1;
  if (m > 0) s.getRange(2, 1, m, 2).getValues().forEach(function (r) { if (r[0]) settings[String(r[0]).trim()] = r[1]; });
  ['LEAGUE_NAME', 'LEAGUE_SUBTITLE', 'LOGO_URL', 'SPONSOR_LOGO_URL', 'COLOR_PRIMARY', 'COLOR_SECONDARY', 'PLAYER_PAGE_URL']
    .forEach(function (k) { branding[k] = String(settings[k] || ''); });
  getConfig_.memo = { stages: stages, stageOrder: order, settings: settings, branding: branding };
  try { CacheService.getScriptCache().put('cfg:all', JSON.stringify(getConfig_.memo), 60); } catch (e) {}
  return getConfig_.memo;
}

function publicConfig_() {
  var c = getConfig_();
  return { stages: c.stages, stageOrder: c.stageOrder, branding: c.branding,
           settings: { LEAGUE_POINTS_PER_WIN: num_(c.settings.LEAGUE_POINTS_PER_WIN), LEAGUE_POINTS_PER_LOSS: num_(c.settings.LEAGUE_POINTS_PER_LOSS),
                       POLL_MS: num_(c.settings.POLL_MS) || 5000, PLAYER_POLL_MS: num_(c.settings.PLAYER_POLL_MS) || 15000, COURTS: num_(c.settings.COURTS) || 4 } };
}

function readTeams_() {
  var sh = sheet_(TAB.TEAMS), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 2).getValues().filter(function (r) { return r[0] !== ''; })
    .map(function (r) { return { 'Team Name': String(r[0]).trim(), 'Group': String(r[1]).trim() }; });
}

function sheetObjects_(name) {
  var sh = sheet_(name), vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var h = vals[0];
  return vals.slice(1).filter(function (r) { return r.some(function (v) { return v !== ''; }); }).map(function (r) {
    var o = {}; h.forEach(function (k, i) { if (k !== '') o[k] = r[i] instanceof Date ? r[i].toISOString() : r[i]; }); return o;
  });
}

function writeTable_(sh, headers, rows) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), headers.length)).clearContent();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function log_(id, action, court, who, oldV, newV, version) {
  sheet_(TAB.LOG).appendRow([new Date(), id, action, court, who || '', oldV || '', newV || '', version || '']);
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw err_('SERVER', 'Missing tab "' + name + '" — run setup()');
  return sh;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { throw err_('BUSY', 'Server busy, retrying'); }
  try { return fn(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}

function cached_(key, fn, seconds) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var val = fn();
  try { cache.put(key, JSON.stringify(val), seconds || VIEW_CACHE_S); } catch (e) { /* >100KB: serve uncached */ }
  return val;
}

function clearCaches_(withConfig) {
  if (withConfig) { getConfig_.memo = null; CacheService.getScriptCache().removeAll(['cfg:all', 'view:config']); }
  CacheService.getScriptCache().removeAll(['view:matches', 'view:teams', 'view:public',
    'sheet:' + TAB.STANDINGS, 'sheet:' + TAB.KNOCKOUT, 'sheet:' + TAB.TEAMS, 'sheet:' + TAB.MATCHES]);
}

/* --------------------------------------------------------- test resets */

// TESTING: keeps all teams and fixtures, wipes every score.
// Every match goes back to Scheduled at 0-0, Log is cleared, Sheet1/Knockout recalculated, login locks cleared.
function resetScores() {
  withLock_(function () {
    var db = readMatches_();
    db.objs.forEach(function (m) {
      ['S1A', 'S1B', 'S2A', 'S2B', 'S3A', 'S3B', 'Sets A', 'Sets B'].forEach(function (k) { m[k] = 0; });
      m['Status'] = STATUS.SCHEDULED; m['Winner'] = ''; m['Umpire'] = '';
      m['Version'] = num_(m['Version']) + 1; m['Updated At'] = new Date().toISOString();
    });
    writeTable_(db.sheet, MATCH_HEADERS, db.objs.map(toRow_));
    writeTable_(sheet_(TAB.LOG), LOG_HEADERS, []);
    recompute_(db);
    clearCaches_();
  });
  clearLoginLocks();
  Logger.log('All scores reset. Ask umpires to Log out and log in again (or reload the page).');
}

// TESTING: empty start — deletes all matches, teams and log rows. Config, Settings and PINs are kept.
function clearAllData() {
  withLock_(function () {
    writeTable_(sheet_(TAB.MATCHES), MATCH_HEADERS, []);
    writeTable_(sheet_(TAB.TEAMS), TEAM_HEADERS, []);
    writeTable_(sheet_(TAB.LOG), LOG_HEADERS, []);
    recompute_();
    clearCaches_();
  });
  clearLoginLocks();
  Logger.log('All matches, teams and log cleared.');
}

// Run from the editor to unlock logins at once after too many wrong PINs (normally a 10-minute wait).
function clearLoginLocks() {
  var keys = ['loginfail:ref'];
  for (var i = 1; i <= 50; i++) keys.push('loginfail:' + i);
  CacheService.getScriptCache().removeAll(keys);
  Logger.log('Login locks cleared');
}

// Run from the editor to see which PIN properties this script can see (shows names and lengths, never the PINs).
function checkPins() {
  var p = PropertiesService.getScriptProperties().getProperties();
  var names = Object.keys(p).filter(function (k) { return /PIN|TOKEN/.test(k); }).sort();
  if (!names.length) { Logger.log('No PIN properties found in THIS script. Add them under Project Settings > Script Properties and click Save.'); return; }
  names.forEach(function (k) { Logger.log(k + ' is set (' + String(p[k]).length + ' characters' + (p[k] !== String(p[k]).trim() ? ', HAS SPACES' : '') + ')'); });
  if (!p.REFEREE_PIN) Logger.log('REFEREE_PIN is missing — check the spelling.');
}

// Run from the editor after changing the Config or Settings tab so pages pick it up at once.
function refreshCaches() { clearCaches_(true); recompute_(); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(code, message, match) { var e = new Error(message); e.code = code; if (match) e.current = publicMatch_(match); return e; }
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function isInt_(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }

/* ------------------------------------------------------------ self-tests */

// Run from the Apps Script editor: checks the server copy of the rules against the spec examples.
function runRuleTests() {
  var R = { 'Group': [15, 16], 'Quarter Final': [21, 22], 'Semi Final': [15, 21] };
  var cases = [['Group', 15, 13, 'complete'], ['Group', 15, 14, 'not'], ['Group', 15, 15, 'golden'], ['Group', 16, 15, 'complete'],
    ['Group', 16, 14, 'complete'], ['Quarter Final', 21, 19, 'complete'], ['Quarter Final', 21, 20, 'not'],
    ['Quarter Final', 21, 21, 'golden'], ['Quarter Final', 22, 21, 'complete'], ['Semi Final', 15, 13, 'complete'],
    ['Semi Final', 16, 14, 'complete'], ['Semi Final', 20, 20, 'golden'], ['Semi Final', 21, 20, 'complete'], ['Semi Final', 21, 19, 'complete']];
  var fails = cases.filter(function (c) {
    var s = Rules.setStatus(c[1], c[2], R[c[0]][0], R[c[0]][1]);
    var got = !s.valid ? 'invalid' : s.complete ? 'complete' : s.golden ? 'golden' : 'not';
    return got !== c[3];
  });
  Logger.log(fails.length ? 'FAILED: ' + JSON.stringify(fails) : 'All ' + cases.length + ' rule examples pass');
  return fails.length === 0;
}

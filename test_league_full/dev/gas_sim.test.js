// Runs Code.gs inside a mock of the Apps Script services and walks through the acceptance scenarios.
// Usage: node gas_sim.test.js path/to/Code.gs
const fs = require('fs');
const code = fs.readFileSync(process.argv[2], 'utf8');
const G = require('./gas_mock.js').load(code);
const { ctx, sheets, props } = G;

/* ---------- helpers ---------- */
let pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL:', label, extra !== undefined ? JSON.stringify(extra) : ''); } }
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).content);
const get = p => JSON.parse(ctx.doGet({ parameter: p }).content);
const rows = name => sheets[name].data.slice(1, sheets[name].getLastRow());
const standing = team => { const r = rows('Sheet1').find(x => x[1] === team); return r && r.slice(2, 6).join('/'); };

/* ---------- scenario ---------- */
ctx.setup();
props.REFEREE_PIN = '9999'; props.COURT_PIN_1 = '1111'; props.COURT_PIN_2 = '2222';
check('runRuleTests on server copy', ctx.runRuleTests() === true);

const cfg = get({ view: 'config' });
check('config has 5 stages in order', cfg.stageOrder.join('|') === 'Group|Pre Quarter Final|Quarter Final|Semi Final|Final', cfg.stageOrder);
check('config has branding', cfg.branding.LEAGUE_NAME === 'CXO Baddy League');
check('config POLL_MS', cfg.settings.POLL_MS === 5000);

check('bad referee pin', post({ action: 'login', role: 'referee', pin: 'x' }).error === 'BAD_PIN');
const ref = post({ action: 'login', role: 'referee', pin: '9999' }).token;
check('referee token', !!ref);
check('write without token', post({ action: 'deleteMatch', matchId: 'M1' }).error === 'AUTH');
check('tampered token', post({ action: 'deleteMatch', token: ref.slice(0, -2) + 'xx', matchId: 'M1' }).error === 'AUTH');

let r = post({ action: 'addTeams', token: ref, teams: [{ name: 'Alpha', group: 'A' }, { name: 'Bravo', group: 'A' }, { name: 'Charlie', group: 'A' }, { name: 'Delta', group: 'B' }, { name: '<b>Echo</b>', group: 'B' }] });
check('addTeams', r.ok && r.teams.length === 5, r);

r = post({ action: 'bulkAdd', token: ref, matches: [
  { stage: 'Group', group: 'A', court: 1, teamA: 'Alpha', teamB: 'Bravo' },
  { stage: 'Group', group: 'A', court: 2, teamA: 'Charlie', teamB: 'Delta' },
  { stage: 'Group', group: 'A', court: 1, teamA: 'Alpha', teamB: 'Charlie' },
  { stage: 'Group', group: 'A', court: 1, teamA: 'Alpha', teamB: 'Alpha' },
  { stage: 'Semi Final', court: 2, queueOrder: 5, teamA: 'Bravo', teamB: 'Delta' },
  { stage: 'Quarter Final', court: 1, queueOrder: 9, teamA: 'Charlie', teamB: '<b>Echo</b>' },
  { stage: 'Pre Quarter Final', court: 2, queueOrder: 9, teamA: 'Alpha', teamB: 'Delta' },
] });
check('bulkAdd adds valid rows, reports bad', r.ok && r.added === 6 && r.errors.length === 1, r);
let ms = get({ view: 'matches' });
check('matches view has 6', ms.length === 6, ms.length);
const id = (a, b) => ms.find(m => m['Team A'] === a && m['Team B'] === b)['Match ID'];
const G1 = id('Alpha', 'Bravo'), G2 = id('Charlie', 'Delta'), SF = id('Bravo', 'Delta'), QF = id('Charlie', '<b>Echo</b>');
check('auto queue order', ms.find(m => m['Match ID'] === id('Alpha', 'Charlie'))['Queue Order'] === 2);

// clash: Alpha already at queue 1 on court 1; put another Alpha match at queue 1 on court 2
r = post({ action: 'assignMatch', token: ref, match: { stage: 'Group', group: 'A', court: 2, queueOrder: 1, teamA: 'Alpha', teamB: 'Delta' } });
check('team clash blocked', r.error === 'TEAM_CLASH', r);
r = post({ action: 'assignMatch', token: ref, match: { stage: 'Group', court: 2, teamA: 'Bravo', teamB: 'bravo' } });
check('same team blocked', r.error === 'INVALID', r);

// umpires
check('umpire bad pin', post({ action: 'login', role: 'umpire', court: 2, pin: '1111', umpire: 'X' }).error === 'BAD_PIN');
const u1 = post({ action: 'login', role: 'umpire', court: 1, pin: '1111', umpire: 'Uma' }).token;
const u2 = post({ action: 'login', role: 'umpire', court: 2, pin: '2222', umpire: 'Raj' }).token;
check('umpire cannot use referee actions', post({ action: 'deleteMatch', token: u1, matchId: G1 }).error === 'FORBIDDEN');
check('court 2 cannot start court 1 match', post({ action: 'startMatch', token: u2, matchId: G1 }).error === 'WRONG_COURT');
check('court 2 cannot score court 1 match', post({ action: 'setScore', token: u2, matchId: G1, set: 1, a: 1, b: 0, version: 1 }).error === 'WRONG_COURT');
check('cannot score before start', post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: 1, b: 0, version: 1 }).error === 'NOT_STARTED');

r = post({ action: 'startMatch', token: u1, matchId: G1 });
check('start match', r.ok && r.match.Status === 'Live' && r.match.Umpire === 'Uma', r);
check('second live match on same court blocked', post({ action: 'startMatch', token: u1, matchId: id('Alpha', 'Charlie') }).error === 'COURT_BUSY');
let v = r.match.Version;
const g2 = post({ action: 'startMatch', token: u2, matchId: G2 }); let v2 = g2.match.Version;

// interleaved scoring on two courts never clobbers
for (let i = 1; i <= 14; i++) {
  r = post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: i, b: Math.min(i, 13), version: v }); v = r.match.Version;
  const r2 = post({ action: 'setScore', token: u2, matchId: G2, set: 1, a: i - 1, b: i, version: v2 }); v2 = r2.match.Version;
  if (!r.ok || !r2.ok) { check('interleaved scoring ' + i, false, [r, r2]); break; }
}
ms = get({ view: 'matches' });
const m1 = ms.find(m => m['Match ID'] === G1), m2 = ms.find(m => m['Match ID'] === G2);
check('court 1 score intact', m1.S1A === 14 && m1.S1B === 13, [m1.S1A, m1.S1B]);
check('court 2 score intact', m2.S1A === 13 && m2.S1B === 14, [m2.S1A, m2.S1B]);
check('cache invalidated on write', m1.Version === v);

// idempotent duplicate
r = post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: 14, b: 13, version: v });
check('duplicate send changes nothing', r.ok && r.match.Version === v, r);
r = post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: 14, b: 13, version: v - 5 });
check('duplicate with old version still harmless', r.ok && r.match.Version === v, r);
check('stale version rejected', (r = post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: 15, b: 13, version: v - 1 })).error === 'STALE' && r.current.S1A === 14, r);
check('beyond cap rejected', post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: 17, b: 13, version: v }).error === 'INVALID');
check('beyond completed score rejected', post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: 16, b: 13, version: v }).error === 'INVALID');
check('set 2 in single-game stage rejected', post({ action: 'setScore', token: u1, matchId: G1, set: 2, a: 1, b: 0, version: v }).error === 'INVALID');
check('non-integer rejected', post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: 14.5, b: 13, version: v }).error === 'INVALID');
check('end before decided', post({ action: 'endMatch', token: u1, matchId: G1, version: v }).error === 'NOT_DECIDED');

check('live match does not change Sheet1', standing('Alpha') === '0/0/0/0', standing('Alpha'));
r = post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: 15, b: 13, version: v }); v = r.match.Version;
check('15-13 completes group set', r.ok && r.match['Sets A'] === 1, r);
check('still not in Sheet1 until endMatch', standing('Alpha') === '0/0/0/0');
check('endMatch stale', post({ action: 'endMatch', token: u1, matchId: G1, version: v - 1 }).error === 'STALE');
r = post({ action: 'endMatch', token: u1, matchId: G1, version: v }); v = r.match.Version;
check('endMatch', r.ok && r.match.Status === 'Done' && r.match.Winner === 'Alpha', r);
check('Sheet1 winner 1/1/0/2', standing('Alpha') === '1/1/0/2', standing('Alpha'));
check('Sheet1 loser 1/0/1/0', standing('Bravo') === '1/0/1/0', standing('Bravo'));
check('done match is locked for umpire', post({ action: 'setScore', token: u1, matchId: G1, set: 1, a: 15, b: 12, version: v }).error === 'DONE');
check('endMatch twice is harmless', post({ action: 'endMatch', token: u1, matchId: G1, version: v }).ok);
const s1 = get({ sheet: 'Sheet1' });
check('Sheet1 view keeps column names', Object.keys(s1[0]).join('|') === 'Group Name|Team Name|Total Matches|Matches Won|Matches Lost|Total Points', Object.keys(s1[0]));

// golden point in group: 15-15 then 16-15
r = post({ action: 'setScore', token: u2, matchId: G2, set: 1, a: 15, b: 15, version: v2 });
check('14-? to 15-15 jump rejected? (absolute scores allowed if valid)', r.ok, r); v2 = r.match.Version;
r = post({ action: 'setScore', token: u2, matchId: G2, set: 1, a: 15, b: 16, version: v2 }); v2 = r.match.Version;
check('golden point 15-16 wins', r.ok && r.match['Sets B'] === 1, r);
r = post({ action: 'endMatch', token: u2, matchId: G2, version: v2 });
check('Delta wins G2', r.ok && r.match.Winner === 'Delta');

// unlock reverses standings
r = post({ action: 'unlockMatch', token: ref, matchId: G1 });
check('unlock → Live', r.ok && r.match.Status === 'Live' && !r.match.Winner, r);
check('unlock reverses Sheet1', standing('Alpha') === '0/0/0/0' && standing('Bravo') === '0/0/0/0', [standing('Alpha'), standing('Bravo')]);
r = post({ action: 'overrideScore', token: ref, matchId: G1, sets: [[13, 15]], markDone: true });
check('override + markDone flips winner', r.ok && r.match.Winner === 'Bravo' && r.match.Status === 'Done', r);
check('Sheet1 after override', standing('Bravo') === '1/1/0/2' && standing('Alpha') === '1/0/1/0');
check('override invalid score rejected', post({ action: 'overrideScore', token: ref, matchId: G1, sets: [[16, 13]] }).error === 'INVALID');

// best of 3 semi on court 2
r = post({ action: 'startMatch', token: u2, matchId: SF }); let vs = r.match.Version;
const sc = (set, a, b) => { const x = post({ action: 'setScore', token: u2, matchId: SF, set, a, b, version: vs }); if (x.ok) vs = x.match.Version; return x; };
check('set 2 before set 1 done rejected', sc(2, 1, 0).error === 'INVALID');
check('semi 21-20', sc(1, 20, 20).ok && sc(1, 21, 20).ok);
check('semi 22-20 impossible', post({ action: 'setScore', token: u2, matchId: SF, set: 1, a: 22, b: 20, version: vs }).error === 'INVALID');
check('editing set 1 while set 2 has points rejected', sc(2, 3, 0).ok && sc(1, 21, 19).error === 'INVALID');
check('set 2 to 13-15', sc(2, 13, 15).ok);
check('not decided at 1-1', post({ action: 'endMatch', token: u2, matchId: SF, version: vs }).error === 'NOT_DECIDED');
check('decider 15-10', sc(3, 15, 10).ok);
r = post({ action: 'endMatch', token: u2, matchId: SF, version: vs });
check('semi won 2-1', r.ok && r.match['Sets A'] === 2 && r.match['Sets B'] === 1 && r.match.Winner === 'Bravo', r);
let ko = get({ sheet: 'Knockout' });
const koSF = ko.find(k => k['Match No'] === SF);
check('Knockout bo3 uses sets', koSF['Score A'] === 2 && koSF['Score B'] === 1, koSF);
check('Knockout order Pre QF before QF before SF', ko.map(k => k.Stage).join('|') === 'Pre Quarter Final|Quarter Final|Semi Final', ko.map(k => k.Stage));
check('Knockout keeps column names', Object.keys(ko[0]).join('|') === 'Match No|Stage|Order|Team A|Team B|Score A|Score B|Status|Winner');

// quarter final 22-21 single-set, recorded as points in Knockout
let rq = post({ action: 'startMatch', token: u1, matchId: QF });
check('court 1 busy with unlocked G1? (G1 is Done again)', rq.ok, rq);
let vq = rq.match.Version;
rq = post({ action: 'setScore', token: u1, matchId: QF, set: 1, a: 21, b: 21, version: vq }); vq = rq.match.Version;
rq = post({ action: 'setScore', token: u1, matchId: QF, set: 1, a: 22, b: 21, version: vq }); vq = rq.match.Version;
check('QF 22-21 decided', rq.ok && rq.match['Sets A'] === 1);
ko = get({ sheet: 'Knockout' });
check('Knockout live single-set shows points', ko.find(k => k['Match No'] === QF)['Score A'] === 22);

// reassign: match moves to court 2 and court-1 umpire can no longer touch it
const AC = id('Alpha', 'Charlie');
r = post({ action: 'reassignCourt', token: ref, matchId: AC, court: 2 });
check('reassign', r.ok && r.match.Court === 2, r);
ms = get({ view: 'matches' });
check('reassigned match visible on court 2 list', ms.find(m => m['Match ID'] === AC).Court === 2);
check('old court umpire blocked', post({ action: 'startMatch', token: u1, matchId: AC }).error === 'WRONG_COURT');

// reorder
const c2 = ms.filter(m => m.Court === 2).sort((a, b) => a['Queue Order'] - b['Queue Order']).map(m => m['Match ID']);
r = post({ action: 'reorderQueue', token: ref, court: 2, order: c2.slice().reverse() });
check('reorder', r.ok, r);

// delete recomputes
r = post({ action: 'deleteMatch', token: ref, matchId: G1 });
check('delete', r.ok);
check('delete recomputes Sheet1', standing('Bravo') === '0/0/0/0', standing('Bravo'));
check('Log has rows', sheets.Log.getLastRow() > 30, sheets.Log.getLastRow());

// rate limit: 5 wrong PINs locks the court for 10 minutes
for (let i = 0; i < 5; i++) post({ action: 'login', role: 'umpire', court: 1, pin: '0000', umpire: 'x' });
check('rate limited', post({ action: 'login', role: 'umpire', court: 1, pin: '1111', umpire: 'x' }).error === 'RATE_LIMITED');
check('other court not affected', post({ action: 'login', role: 'umpire', court: 2, pin: '2222', umpire: 'x' }).ok);
G.advance(11 * 60 * 1000);
check('lock lifts after 10 min', post({ action: 'login', role: 'umpire', court: 1, pin: '1111', umpire: 'x' }).ok);
G.advance(13 * 60 * 60 * 1000);
check('token expires after 12h', post({ action: 'whoami', token: ref }).error === 'AUTH');

// escaping is a client concern, but the raw value must survive the round trip
check('team names stored raw', get({ view: 'teams' }).some(t => t['Team Name'] === '<b>Echo</b>'));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

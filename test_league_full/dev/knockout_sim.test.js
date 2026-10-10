// Knockout auto-fill test on the real fixture (33 teams, 8 groups, PQF → QF → SF → Final).
// Usage: node knockout_sim.test.js path/to/Code.gs path/to/teams.tsv path/to/matches.tsv
const fs = require('fs');
const G = require('./gas_mock.js').load(fs.readFileSync(process.argv[2], 'utf8'));
const { ctx, sheets, props } = G;
let pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL:', label, extra !== undefined ? JSON.stringify(extra) : ''); } }
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).content);
const get = p => JSON.parse(ctx.doGet({ parameter: p }).content);
const tsv = f => { const [h, ...rs] = fs.readFileSync(f, 'utf8').trim().split('\n').map(l => l.split('\t')); return rs.map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] || '').trim()]))); };
const matches = () => get({ view: 'matches' });
const M = id => matches().find(m => m['Match ID'] === id);
const quals = () => ctx.sheetObjects_('Qualifiers');
const Q = (id, side) => quals().find(q => q['Match ID'] === id && q.Side === side);
const sheet1 = () => ctx.sheetObjects_('Sheet1');

ctx.setup();
props.REFEREE_PIN = '9999'; props.COURT_PIN_1 = '1111';
const ref = post({ action: 'login', role: 'referee', pin: '9999' }).token;
const ump = post({ action: 'login', role: 'umpire', court: '1', pin: '1111', umpire: 'U' }).token;

const teams = tsv(process.argv[3]), fixture = tsv(process.argv[4]);
check('teams added', post({ action: 'addTeams', token: ref, teams: teams.map(t => ({ name: t['Team Name'], group: t.Group })) }).ok);
let r = post({ action: 'bulkAdd', token: ref, matches: fixture });
check('fixture imported', r.ok && r.added === fixture.length && !r.errors.length, r.errors);

// ---- before any results
check('PQ1 still shows placeholders', M('PQ1')['Team A'] === 'G1 1st' && M('PQ1')['Team B'] === 'G2 2nd', M('PQ1'));
check('slots recorded', M('QF1')['Slot A'] === 'PQ1 Winner' && M('FINAL')['Slot B'] === 'SF2 Winner');
check('Qualifiers tab lists every knockout side', quals().length === 30, quals().length);
check('group slot waits with progress note', Q('PQ1', 'A').Status === 'Waiting' && /0 of \d+ matches done/.test(Q('PQ1', 'A').Note), Q('PQ1', 'A'));
check('match slot waits for source match', Q('QF1', 'A').Note === 'Waiting for PQ1 to finish', Q('QF1', 'A'));
r = post({ action: 'startMatch', token: ump, matchId: 'PQ1' });
check('cannot start a knockout match before teams are known', r.error === 'NOT_READY' && /G1 1st/.test(r.message), r);

// ---- play every group match (deterministic, varied scores)
const groupMs = matches().filter(m => m.Stage === 'Group');
let k = 0;
function finish(id, aWins, loserPts, target) {
  const sets = aWins ? [[target, loserPts], [0, 0], [0, 0]] : [[loserPts, target], [0, 0], [0, 0]];
  return post({ action: 'overrideScore', token: ref, matchId: id, sets, markDone: true });
}
groupMs.slice(0, -1).forEach(m => { k++; check('group result ' + m['Match ID'], finish(m['Match ID'], (k * 7) % 3 !== 0, (k * 5) % 14, 15).ok); });
const lastG = groupMs[groupMs.length - 1], lastGroup = lastG.Group;
const pqWaiting = fixture.filter(f => f.Stage === 'Pre Quarter Final' && (f['Team A'].startsWith(lastGroup + ' ') || f['Team B'].startsWith(lastGroup + ' ')));
check('one group unfinished → its slots still wait', pqWaiting.every(f => { const m = M(f['Match ID']); return m['Team A'].startsWith(lastGroup + ' ') || m['Team B'].startsWith(lastGroup + ' '); }));
check('finished groups already filled', quals().filter(q => q.Stage === 'Pre Quarter Final' && q.Status === 'Filled').length >= 12, quals().filter(q => q.Stage === 'Pre Quarter Final').map(q => q.Status));
check('last group result', finish(lastG['Match ID'], true, 9, 15).ok);

// ---- standings: independent check of order (points, then point diff, then points scored)
const s1 = sheet1();
check('Sheet1 has point difference and rank', 'Point Diff' in s1[0] && 'Rank' in s1[0]);
const byGroup = {};
s1.forEach(r => (byGroup[r['Group Name']] = byGroup[r['Group Name']] || []).push(r));
let orderOk = true, pdOk = true;
Object.values(byGroup).forEach(list => list.forEach((t, i) => {
  if (t.Rank !== i + 1) orderOk = false;
  if (i && !t.Note) { const p = list[i - 1];
    if (p['Total Points'] < t['Total Points'] || (p['Total Points'] === t['Total Points'] && p['Point Diff'] < t['Point Diff'])) orderOk = false; }
}));
// recompute point diff from the raw matches
const pf = {}, pa = {};
matches().filter(m => m.Stage === 'Group').forEach(m => [[m.S1A, m.S1B], [m.S2A, m.S2B], [m.S3A, m.S3B]].forEach(([a, b]) => {
  pf[m['Team A']] = (pf[m['Team A']] || 0) + a; pa[m['Team A']] = (pa[m['Team A']] || 0) + b;
  pf[m['Team B']] = (pf[m['Team B']] || 0) + b; pa[m['Team B']] = (pa[m['Team B']] || 0) + a; }));
s1.forEach(t => { if (t['Total Matches'] && t['Point Diff'] !== pf[t['Team Name']] - pa[t['Team Name']]) pdOk = false; });
check('Sheet1 ranked by points then point difference', orderOk, byGroup);
check('point difference matches the scores', pdOk);
check('scoreboard view keeps the 6 original columns first', Object.keys(get({ sheet: 'Sheet1' })[0]).slice(0, 6).join('|') === 'Group Name|Team Name|Total Matches|Matches Won|Matches Lost|Total Points');

// ---- every PQF slot filled with the right team
const rankOf = (g, n) => (byGroup[g] || []).find(t => t.Rank === n);
let fillOk = true;
fixture.filter(f => f.Stage === 'Pre Quarter Final').forEach(f => {
  const m = M(f['Match ID']);
  [['A', f['Team A']], ['B', f['Team B']]].forEach(([s, slot]) => {
    const [g, pos] = slot.split(' '), want = rankOf(g, pos === '1st' ? 1 : 2);
    const q = Q(f['Match ID'], s);
    if (want.Note) { if (q.Status !== 'TIE — needs manual') fillOk = false; }
    else if (m['Team ' + s] !== want['Team Name'] || q.Status !== 'Filled') fillOk = false;
  });
});
check('all Pre Quarter Final teams filled from group ranks', fillOk, quals().filter(q => q.Stage === 'Pre Quarter Final'));
check('Knockout tab shows real names', ctx.sheetObjects_('Knockout').find(x => x['Match No'] === 'PQ1')['Team A'] === M('PQ1')['Team A']);

// ---- winners flow forward, and back if a result is undone
const pq1 = M('PQ1');
check('PQ1 can start now', post({ action: 'startMatch', token: ump, matchId: 'PQ1' }).ok);
check('PQ1 ends', finish('PQ1', true, 12, 21).ok);
check('QF1 Team A = PQ1 winner', M('QF1')['Team A'] === pq1['Team A'] && Q('QF1', 'A').Status === 'Filled');
check('unlock PQ1', post({ action: 'unlockMatch', token: ref, matchId: 'PQ1' }).ok);
check('QF1 goes back to "PQ1 Winner"', M('QF1')['Team A'] === 'PQ1 Winner');
check('PQ1 re-ended with other winner', finish('PQ1', false, 18, 21).ok);
check('QF1 Team A = new winner', M('QF1')['Team A'] === pq1['Team B']);
check('Log records autoFill', rows('Log').some(l => l[1] === 'QF1' && l[2] === 'autoFill'));

// ---- started match is never changed; a conflict is reported instead
['PQ2'].forEach(id => finish(id, true, 3, 21));
check('QF1 starts', post({ action: 'startMatch', token: ref, matchId: 'QF1' }).ok);
const qfA = M('QF1')['Team A'];
check('referee changes PQ1 result after QF1 started', finish('PQ1', true, 5, 21).ok);
check('QF1 team unchanged once started', M('QF1')['Team A'] === qfA);
check('Qualifiers tab shows CONFLICT', Q('QF1', 'A').Status === 'CONFLICT', Q('QF1', 'A'));

// ---- manual override typed in the Qualifiers sheet
const qsh = sheets['Qualifiers'];
const rowIdx = qsh.data.findIndex(r => r[0] === 'QF2' && r[2] === 'A');
qsh.data[rowIdx][5] = 'Hand Picked';
ctx.onEdit({ range: { getSheet: () => qsh, getRow: () => rowIdx + 1, getColumn: () => 6, getLastColumn: () => 6 } });
check('Manual Team in sheet fills the match', M('QF2')['Team A'] === 'Hand Picked' && Q('QF2', 'A').Status === 'Manual', Q('QF2', 'A'));
check('Manual Team survives later updates', finish('PQ4', true, 1, 21).ok && M('QF2')['Team A'] === 'Hand Picked' && Q('QF2', 'A')['Manual Team'] === 'Hand Picked');
qsh.data[qsh.data.findIndex(r => r[0] === 'QF2' && r[2] === 'A')][5] = '';
ctx.refreshCaches();
check('clearing Manual Team returns to auto', M('QF2')['Team A'] === 'PQ3 Winner');

// ---- referee typing a real name in the page pins it
const sf1 = M('SF1');
r = post({ action: 'assignMatch', token: ref, match: { matchId: 'SF1', stage: sf1.Stage, court: sf1.Court, queueOrder: sf1['Queue Order'], teamA: 'Pinned Team', teamB: sf1['Team B'] } });
check('referee edit with a real name pins it', r.ok && M('SF1')['Team A'] === 'Pinned Team' && M('SF1')['Slot A'] === '' && M('SF1')['Slot B'] === 'QF2 Winner', M('SF1'));

// ---- tie that point difference cannot break → flagged, not guessed
const G2 = require('./gas_mock.js').load(fs.readFileSync(process.argv[2], 'utf8'));
G2.ctx.setup(); G2.props.REFEREE_PIN = '9999';
const post2 = b => JSON.parse(G2.ctx.doPost({ postData: { contents: JSON.stringify(b) } }).content);
const ref2 = post2({ action: 'login', role: 'referee', pin: '9999' }).token;
post2({ action: 'addTeams', token: ref2, teams: ['X', 'Y', 'Z'].map(n => ({ name: n, group: 'Group 9' })).concat(['P', 'Q'].map(n => ({ name: n, group: 'Group 10' }))) });
r = post2({ action: 'bulkAdd', token: ref2, matches: [
  { matchId: 'T1', stage: 'Group', group: 'Group 9', court: 1, queueOrder: 1, teamA: 'X', teamB: 'Y' },
  { matchId: 'T2', stage: 'Group', group: 'Group 9', court: 1, queueOrder: 2, teamA: 'Y', teamB: 'Z' },
  { matchId: 'T3', stage: 'Group', group: 'Group 9', court: 1, queueOrder: 3, teamA: 'Z', teamB: 'X' },
  { matchId: 'T4', stage: 'Group', group: 'Group 10', court: 2, queueOrder: 1, teamA: 'P', teamB: 'Q' },
  { matchId: 'K1', stage: 'Quarter Final', court: 1, queueOrder: 9, teamA: 'Winner of Group 9', teamB: 'Group 10 Runner-up' },
  { matchId: 'K2', stage: 'Quarter Final', court: 2, queueOrder: 9, teamA: 'Top Gun', teamB: 'K1 Loser' }] });
check('second league imported (other slot wordings)', r.ok && !r.errors.length, r.errors);
const fin2 = (id, a) => post2({ action: 'overrideScore', token: ref2, matchId: id, sets: a ? [[15, 10], [0, 0], [0, 0]] : [[10, 15], [0, 0], [0, 0]], markDone: true });
['T1', 'T2', 'T3'].forEach(id => fin2(id, true)); fin2('T4', false);  // X>Y, Y>Z, Z>X all 15-10 → perfect 3-way tie
const q2 = id => G2.ctx.sheetObjects_('Qualifiers').find(q => q['Match ID'] === 'K1' && q.Side === id);
const m2 = id => JSON.parse(G2.ctx.doGet({ parameter: { view: 'matches' } }).content).find(m => m['Match ID'] === id);
check('3-way tie flagged in Sheet1', G2.ctx.sheetObjects_('Sheet1').filter(t => /Tied/.test(t.Note)).length === 3);
check('tied slot not guessed', q2('A').Status === 'TIE — needs manual' && m2('K1')['Team A'] === 'Winner of Group 9', q2('A'));
check('"Group 10 Runner-up" resolves', m2('K1')['Team B'] === 'P', m2('K1'));
check('team named "Top Gun" is not treated as a slot', m2('K2')['Slot A'] === '' && m2('K2')['Team A'] === 'Top Gun');
check('"K1 Loser" is a slot', m2('K2')['Slot B'] === 'K1 Loser');

// ---- reset puts placeholders back
ctx.resetScores();
check('resetScores restores placeholders', M('PQ1')['Team A'] === 'G1 1st' && M('QF1')['Team A'] === 'PQ1 Winner');

function rows(name) { return sheets[name].data.slice(1, sheets[name].getLastRow()); }
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// Usage: node rules.test.js <file containing the shared rules block> [more files...]
// Extracts the block between the SHARED SCORING RULES markers and runs the worked examples.
const fs = require('fs');
const files = process.argv.slice(2);
if (!files.length) files.push(__dirname + '/rules.js');

const STAGES = {
  'Group':             { stage: 'Group', setsToWin: 1, target: 15, cap: 16, deciderTarget: 15, deciderCap: 16 },
  'Pre Quarter Final': { stage: 'Pre Quarter Final', setsToWin: 1, target: 21, cap: 22, deciderTarget: 21, deciderCap: 22 },
  'Quarter Final':     { stage: 'Quarter Final', setsToWin: 1, target: 21, cap: 22, deciderTarget: 21, deciderCap: 22 },
  'Semi Final':        { stage: 'Semi Final', setsToWin: 2, target: 15, cap: 21, deciderTarget: 15, deciderCap: 21 },
  'Final':             { stage: 'Final', setsToWin: 2, target: 15, cap: 21, deciderTarget: 15, deciderCap: 21 },
};

// [stage, a, b, expected: 'complete' | 'not' | 'golden' | 'invalid']
const CASES = [
  ['Group', 15, 13, 'complete'], ['Group', 15, 14, 'not'], ['Group', 15, 15, 'golden'],
  ['Group', 16, 15, 'complete'], ['Group', 16, 14, 'complete'],
  ['Quarter Final', 21, 19, 'complete'], ['Quarter Final', 21, 20, 'not'],
  ['Quarter Final', 21, 21, 'golden'], ['Quarter Final', 22, 21, 'complete'],
  ['Semi Final', 15, 13, 'complete'], ['Semi Final', 16, 14, 'complete'], ['Semi Final', 20, 20, 'golden'],
  ['Semi Final', 21, 20, 'complete'], ['Semi Final', 21, 19, 'complete'],
  // extra guards
  ['Group', 17, 15, 'invalid'], ['Group', 16, 13, 'invalid'], ['Group', 16, 16, 'invalid'],
  ['Quarter Final', 23, 21, 'invalid'], ['Semi Final', 22, 20, 'invalid'], ['Final', 18, 10, 'invalid'],
  ['Final', 14, 14, 'not'], ['Group', -1, 3, 'invalid'],
];

let failures = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const m = src.match(/\/\* ==== SHARED SCORING RULES[\s\S]*?\/\* ==== END SHARED SCORING RULES ==== \*\//);
  if (!m) { console.log('FAIL', f, ': rules block not found'); failures++; continue; }
  const Rules = new Function(m[0] + '\nreturn Rules;')();
  let ok = 0;
  for (const [stage, a, b, exp] of CASES) {
    const r = STAGES[stage]; const lim = Rules.setLimits(r, 1);
    const s = Rules.setStatus(a, b, lim.T, lim.C);
    const got = !s.valid ? 'invalid' : s.complete ? 'complete' : s.golden ? 'golden' : 'not';
    if (got !== exp) { failures++; console.log(`FAIL ${f}: ${stage} ${a}-${b} expected ${exp} got ${got}`); } else ok++;
  }
  // match-level checks
  const mt = [
    ['Group', [[15, 10]], true, 'A', 'single set decides a group match'],
    ['Quarter Final', [[22, 21]], true, 'A', 'quarter decided in one game'],
    ['Semi Final', [[15, 10], [10, 15]], false, null, 'semi 1-1 goes to decider'],
    ['Semi Final', [[15, 10], [15, 12]], true, 'A', 'semi ends at 2 sets'],
    ['Final', [[13, 15], [21, 20], [19, 21]], true, 'B', 'final decided in set 3'],
  ];
  for (const [stage, sets, decided, winner, label] of mt) {
    const s = Rules.matchStatus(STAGES[stage], sets);
    if (!s.valid || s.decided !== decided || s.winner !== winner) { failures++; console.log(`FAIL ${f}: ${label}`, s); } else ok++;
  }
  const bad = [
    ['Group', [[15, 10], [3, 0]], 'second set in single-game stage'],
    ['Semi Final', [[15, 10], [15, 12], [1, 0]], 'third set after match decided'],
    ['Semi Final', [[14, 10], [1, 0]], 'set 2 before set 1 finished'],
  ];
  for (const [stage, sets, label] of bad) {
    const s = Rules.matchStatus(STAGES[stage], sets);
    if (s.valid) { failures++; console.log(`FAIL ${f}: should reject ${label}`); } else ok++;
  }
  console.log(`${f}: ${ok} checks passed`);
}
if (failures) { console.log(failures + ' FAILURES'); process.exit(1); } else console.log('ALL RULE TESTS PASSED');

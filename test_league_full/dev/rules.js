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

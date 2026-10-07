// Team matcher: splits students into teams of 2-4 so teammates answered as alike
// as possible, then works out how much each person had to be adjusted under
// both nudge models. Pure functions, no DOM, so the final version can reuse it.
(function () {
  const MIN = 2, MAX = 4;

  function dist(a, b) {
    let d = 0;
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) d++;
    return d;
  }

  // Sum over members of their mean distance to teammates. Using the mean (not
  // the sum) keeps the score neutral between pairs, threes and fours.
  function teamCost(team, D) {
    const k = team.length;
    if (k < 2) return 0;
    let s = 0;
    for (let x = 0; x < k; x++) for (let y = x + 1; y < k; y++) s += D[team[x]][team[y]];
    return (2 * s) / (k - 1);
  }

  function anneal(n, T, D, r, iters) {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const teams = [];
    const base = Math.floor(n / T), extra = n % T;
    let p = 0;
    for (let t = 0; t < T; t++) { const size = base + (t < extra ? 1 : 0); teams.push(idx.slice(p, p + size)); p += size; }

    const costs = teams.map((t) => teamCost(t, D));
    let total = costs.reduce((a, b) => a + b, 0);
    let best = { total, teams: teams.map((t) => t.slice()) };
    const t0 = 1.5, t1 = 0.01;

    for (let it = 0; it < iters; it++) {
      const temp = t0 * Math.pow(t1 / t0, it / iters);
      const a = Math.floor(r() * T);
      let b = Math.floor(r() * (T - 1));
      if (b >= a) b++;
      if (T < 2) break;
      const A = teams[a], B = teams[b];
      let nA, nB;
      if (r() < 0.6) {
        // swap one member each way
        const i = Math.floor(r() * A.length), j = Math.floor(r() * B.length);
        nA = A.slice(); nB = B.slice();
        [nA[i], nB[j]] = [B[j], A[i]];
      } else {
        // move one member from A to B, if sizes allow
        if (A.length <= MIN || B.length >= MAX) continue;
        const i = Math.floor(r() * A.length);
        nA = A.slice(); nB = B.slice();
        nB.push(nA.splice(i, 1)[0]);
      }
      const cA = teamCost(nA, D), cB = teamCost(nB, D);
      const delta = cA + cB - costs[a] - costs[b];
      if (delta <= 0 || r() < Math.exp(-delta / temp)) {
        teams[a] = nA; teams[b] = nB; costs[a] = cA; costs[b] = cB;
        total += delta;
        if (total < best.total - 1e-9) best = { total, teams: teams.map((t) => t.slice()) };
      }
    }
    return best;
  }

  // Put teams in a left-to-right order where neighbours are similar, so the
  // bins next to each other in the tower hold similar people.
  function orderTeams(teams, answers) {
    const Q = answers[0].length;
    const cent = teams.map((t) => Array.from({ length: Q }, (_, k) => t.reduce((s, i) => s + answers[i][k], 0) / t.length));
    const all = Array.from({ length: Q }, (_, k) => answers.reduce((s, a) => s + a[k], 0) / answers.length);
    const cd = (x, y) => x.reduce((s, v, k) => s + Math.abs(v - y[k]), 0);
    let cur = cent.reduce((bi, c, i) => (cd(c, all) > cd(cent[bi], all) ? i : bi), 0);
    const seen = new Set([cur]), out = [cur];
    while (out.length < teams.length) {
      let nx = -1;
      for (let i = 0; i < teams.length; i++) if (!seen.has(i) && (nx < 0 || cd(cent[cur], cent[i]) < cd(cent[cur], cent[nx]))) nx = i;
      seen.add(nx); out.push(nx); cur = nx;
    }
    return out.map((i) => teams[i]);
  }

  function match(students, opts = {}) {
    const n = students.length;
    const answers = students.map((s) => s.answers);
    const Q = answers[0]?.length || 10;
    const D = answers.map((a) => answers.map((b) => dist(a, b)));
    const r = (window.Fake && Fake.rng(opts.seed || 12345)) || Math.random;

    let teams;
    if (n < 2) teams = [students.map((_, i) => i)];
    else {
      let best = null;
      const tLo = Math.ceil(n / MAX), tHi = Math.floor(n / MIN);
      for (let T = tLo; T <= tHi; T++) {
        for (let rep = 0; rep < (opts.restarts || 3); rep++) {
          const res = anneal(n, T, D, r, opts.iters || 15000);
          if (!best || res.total < best.total - 1e-9) best = res;
        }
      }
      teams = orderTeams(best.teams, answers);
    }

    const teamOf = new Array(n);
    teams.forEach((t, ti) => t.forEach((i) => (teamOf[i] = ti)));

    const people = students.map((s, i) => {
      const mates = teams[teamOf[i]].filter((j) => j !== i);
      const teamSim = mates.length ? mates.reduce((acc, j) => acc + (Q - D[i][j]), 0) / mates.length : Q;
      let bestSim = -1, bestMates = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const sim = Q - D[i][j];
        if (sim > bestSim) { bestSim = sim; bestMates = [j]; }
        else if (sim === bestSim) bestMates.push(j);
      }
      if (bestSim < 0) bestSim = Q;

      // Model A, "only forced moves": you get nudged only if the algorithm
      // split you from every one of your best possible matches.
      const keptBest = bestMates.some((j) => teamOf[j] === teamOf[i]);
      let ghostTeam = teamOf[i];
      if (!keptBest && bestMates.length) {
        ghostTeam = bestMates.map((j) => teamOf[j]).sort((x, y) => Math.abs(x - teamOf[i]) - Math.abs(y - teamOf[i]))[0];
      }

      // Model B, "every disagreement": per question, the share of teammates
      // who answered differently. >0.5 is a nudge, exactly 0.5 is a split.
      const qSplit = Array.from({ length: Q }, (_, k) =>
        mates.length ? mates.filter((j) => answers[j][k] !== answers[i][k]).length / mates.length : 0);

      return {
        id: s.id, name: s.name, answers: s.answers, team: teamOf[i], mates,
        teamSim, bestSim, bestMates,
        A: { nudged: !keptBest && bestMates.length > 0, ghostTeam, adjust: Math.max(0, bestSim - teamSim) },
        B: { qSplit, nudges: qSplit.filter((f) => f > 0.5).length, splits: qSplit.filter((f) => f === 0.5).length, adjust: Q - teamSim },
      };
    });

    return { teams, people, D, Q };
  }

  // Average teammate similarity if teams were drawn at random, for comparison.
  function randomBaseline(students, trials = 200) {
    const n = students.length, Q = students[0] ? students[0].answers.length : 10;
    if (n < 2) return Q;
    const r = Fake.rng(999);
    const D = students.map((a) => students.map((b) => dist(a.answers, b.answers)));
    let acc = 0;
    for (let t = 0; t < trials; t++) {
      const T = Math.max(1, Math.round(n / 3));
      const res = anneal(n, T, D, r, 0);
      acc += res.teams.reduce((s, tm) => s + tm.length * Q - teamCost(tm, D), 0) / n;
    }
    return acc / trials;
  }

  window.Matcher = { match, dist, randomBaseline };
})();

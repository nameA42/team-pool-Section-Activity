// Magnets: balls drop in with no magnetism; each question then charges every
// ball in its answer's colour and alike balls attract / opposites repel based on
// the answers revealed so far. Then repulsion slowly ramps inside big groups
// until the crowd splits into settled natural groups of 4 or fewer. Finally the
// 2–4 team rule switches on; anyone who has to leave their natural group gets a
// visible nudge.
(function () {
  const W = 900, H = 900, CX = 450, CY = 470, RAD = 410;
  const REVEAL = 1.7, RAMP_RATE = 0.28, RAMP_MAX = 4;
  let S, repel = 2.2, buildUp = true, grouping = "ramp";

  Modes.magnets = {
    name: "Magnets",
    icon: "🧲",
    blurb: "Answers charge each ball. Alike attract, opposites repel, big groups split, then teams snap together.",
    explain: `Balls drop in with no magnetism. Each question charges every ball <span style="color:var(--a)">A</span> or <span style="color:var(--b)">B</span>; alike balls attract and opposites repel. Then repulsion slowly rises inside big groups until everyone sits in a natural group of 4 or fewer (white rings). Finally teams of 2–4 are enforced, and anyone who has to leave their natural group gets a <span style="color:var(--nudge)">nudge</span>.`,
    options: [
      { key: "build", label: "Magnetism", def: "build", choices: [["build", "Builds per question"], ["all", "All at once"]] },
      { key: "grouping", label: "Grouping", def: "ramp", choices: [["ramp", "Ramp until groups form"], ["timer", "Fixed timer"]] },
      { key: "repel", label: "Opposites", def: "2.2", choices: [["0", "Off"], ["1", "Gentle"], ["2.2", "Strong"]] },
    ],
    nudged: (p) => (grouping === "ramp" ? !!(S && S.moved && S.moved[p.id]) : p.A.nudged),

    reset(V) {
      buildUp = (V.opts.build || "build") === "build";
      grouping = V.opts.grouping || "ramp";
      repel = +(V.opts.repel ?? 2.2);
      V.size(W, H);
      const P = V.match.people, n = P.length;
      const R = Math.max(10, Math.min(18, 200 / Math.sqrt(n)));
      const world = new Physics.World({ g: 0, substeps: 3 });
      world.ballRest = 0.3; world.wallRest = 0.4;
      const N = 72;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        world.addSeg(CX + Math.cos(a0) * RAD, CY + Math.sin(a0) * RAD, CX + Math.cos(a1) * RAD, CY + Math.sin(a1) * RAD);
      }
      S = { world, R, P, balls: [], lambda: 0, phase: "idle", tethers: [], fx: [],
        qk: buildUp ? 0 : V.q, mag: buildUp ? 0 : 1, ramp: 0, comps: [], natural: null, moved: null };
      S.sim = (i, j) => S.simM[i][j];
      computeSim();
      // timer mode: a tether to the best match on another team, which snaps when the rule splits them
      if (grouping !== "ramp") P.forEach((p, i) => { if (p.A.nudged) S.tethers.push({ i, j: p.bestMates[0], broken: false }); });
      world.force = (b) => force(V, b);
    },

    drop() {
      S.P.forEach((p, i) => {
        const ang = -Math.PI / 2 + (i / S.P.length - 0.5) * 2.4 + (Math.random() - 0.5) * 0.2;
        S.balls.push({ p, i, r: S.R, x: CX + Math.cos(ang) * (RAD - 40), y: CY + Math.sin(ang) * (RAD - 40), vx: 0, vy: 0, inAt: 0.1 + i * 0.12, live: false });
      });
      S.phase = "cluster";
      S.nextReveal = S.balls[S.balls.length - 1].inAt + 1.4;
    },

    update(V, dt) {
      for (const b of S.balls) if (!b.live && V.t >= b.inAt) {
        b.live = true; S.world.addBall(b);
        const dx = CX - b.x, dy = CY - b.y, d = Math.hypot(dx, dy); b.vx = dx / d * 380; b.vy = dy / d * 380;
      }
      const allIn = S.balls.every((b) => b.live), lastIn = S.balls[S.balls.length - 1].inAt;
      // reveal the next question; every ball gets charged by its answer
      if (buildUp && S.phase === "cluster" && allIn && S.qk < V.q && V.t >= S.nextReveal) {
        S.qk++; computeSim(); S.lastReveal = V.t; S.nextReveal = V.t + REVEAL;
        for (const b of S.balls) S.fx.push({ kind: "charge", b, a: b.p.answers[S.qk - 1], t: 0, life: 0.9 });
      }
      // magnetism grows with each answer revealed, eased so it never jumps
      const magTarget = !buildUp ? 1 : S.qk ? 0.35 + 0.65 * (S.qk / V.q) : 0;
      S.mag += (magTarget - S.mag) * Math.min(1, dt * 2.5);
      const ready = buildUp ? S.qk === V.q && V.t > S.lastReveal + 3.5 : allIn && V.t > lastIn + 3.5;
      if (S.phase === "cluster" && ready) {
        if (grouping === "ramp") { S.phase = "ramp"; S.calmSince = null; S.nextComp = 0; S.balls.forEach((b) => { b.ramp = 0; b.growing = true; }); }
        else { S.phase = "teams"; S.teamT = V.t; }
      }
      // turn repulsion up (only in groups that still need splitting) until groups settle
      if (S.phase === "ramp") {
        for (const b of S.balls) if (b.growing) b.ramp = Math.min(RAMP_MAX, (b.ramp || 0) + RAMP_RATE * dt);
        S.ramp = Math.max(...S.balls.map((b) => b.ramp || 0));
        if (V.t >= S.nextComp) {
          S.nextComp = V.t + 0.2;
          S.comps = components();
          const speed = S.balls.reduce((a, b) => a + Math.hypot(b.vx, b.vy), 0) / S.balls.length;
          // a group is done once it's 4 or fewer, or so alike inside it can never split
          const unsplittable = (c) => c.every((a) => c.every((b) => a === b || S.sim(a, b) >= 0.9));
          const done = (c) => c.length <= 4 || unsplittable(c);
          S.comps.forEach((c) => c.forEach((i) => (S.balls[i].growing = !done(c))));
          const small = S.comps.every(done);
          if ((small || S.ramp >= RAMP_MAX) && speed < 22) {
            if (S.calmSince == null) S.calmSince = V.t;
            else if (V.t - S.calmSince > 1) { S.phase = "formed"; S.formedT = V.t; S.natural = snapshot(S.comps); }
          } else S.calmSince = null;
        }
      }
      if (S.phase === "formed" && V.t - S.formedT > 2) startTeams(V);
      if (S.phase === "teams") {
        S.lambda = Math.min(1, (V.t - S.teamT) / 2.5);
        for (const t of S.tethers) {
          if (t.broken) continue;
          const a = S.balls[t.i], b = S.balls[t.j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (S.lambda > 0.35 && (d > 150 || S.lambda >= 1)) {
            t.broken = true;
            const p = S.P[t.i], adj = p.bestSim - p.teamSim;
            S.fx.push({ b: a, ang: Math.atan2(a.y - b.y, a.x - b.x), t: 0, life: 1.8, text: `split from ${S.P[t.j].name}${adj > 0.05 ? ` · −${adj.toFixed(1)}` : ""}` });
            S.fx.push({ kind: "snap", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: 0, life: 0.6 });
            V.arrive(p.id);
          }
        }
        if (S.lambda >= 1 && V.t - S.teamT > 4) {
          S.tethers.forEach((t) => { if (!t.broken) { t.broken = true; V.arrive(S.P[t.i].id); } });
          S.P.forEach((p) => V.arrive(p.id));
          S.phase = "done";
        }
      }
      if (S.phase === "done") S.lambda = 1;
      S.world.step(dt);
      S.fx.forEach((f) => (f.t += dt)); S.fx = S.fx.filter((f) => f.t < f.life);
    },

    draw(V, ctx) {
      V.bg();
      ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.beginPath(); ctx.arc(CX, CY, RAD, 0, 7); ctx.fill();
      ctx.strokeStyle = "#6a72c8"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(CX, CY, RAD, 0, 7); ctx.stroke();
      const live = S.balls.filter((b) => b.live);
      // similarity links while clustering: lavender = attract, red dotted = repel
      if (S.phase === "cluster" || (S.phase === "teams" && grouping !== "ramp" && S.lambda < 1)) {
        ctx.globalAlpha = 0.85 * (1 - S.lambda);
        for (let a = 0; a < live.length; a++) for (let c = a + 1; c < live.length; c++) {
          const s = S.sim(live[a].i, live[c].i), A = live[a], C = live[c];
          if (s >= 0.66) {
            ctx.strokeStyle = "rgba(201,198,242,0.5)"; ctx.lineWidth = 1 + 3 * (s - 0.66) * 3;
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(C.x, C.y); ctx.stroke();
          } else if (s < 0.5 && repel > 0) {
            const d = Math.hypot(C.x - A.x, C.y - A.y), str = (0.5 - s) * 2 * Math.exp(-d / 900);
            if (str < 0.1) continue;
            ctx.strokeStyle = `rgba(255,107,129,${Math.min(0.95, 0.35 + 0.6 * str)})`; ctx.lineWidth = 1.5 + 2.5 * str; ctx.setLineDash([3, 5]);
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(C.x, C.y); ctx.stroke(); ctx.setLineDash([]);
          }
        }
        ctx.globalAlpha = 1;
      }
      // natural groups: live while repulsion ramps, frozen once formed, fading as teams take over
      const ringSet = S.phase === "ramp" ? snapshot(S.comps) : S.natural;
      const fading = S.phase === "teams" || S.phase === "done";
      if (ringSet && (!fading || V.t - S.teamT < 4)) {
        ctx.globalAlpha = fading ? Math.max(0, 1 - (V.t - S.teamT) / 4) : S.phase === "formed" ? 1 : 0.6;
        ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
        for (const g of ringSet) { ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 7); ctx.stroke(); }
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      // team rings
      if (S.lambda > 0.5) {
        ctx.globalAlpha = Math.min(1, (S.lambda - 0.5) * 2);
        V.match.teams.forEach((t, ti) => {
          const bs = t.map((i) => S.balls[i]).filter((b) => b && b.live);
          if (!bs.length) return;
          const cx = bs.reduce((s, b) => s + b.x, 0) / bs.length, cy = bs.reduce((s, b) => s + b.y, 0) / bs.length;
          const r = Math.max(...bs.map((b) => Math.hypot(b.x - cx, b.y - cy))) + S.R + 10;
          ctx.strokeStyle = "rgba(255,204,51,0.6)"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          V.label(`Team ${ti + 1}`, cx, cy - r - 10, "rgba(18,20,43,.85)", V.COL.accent, 12);
        });
        ctx.globalAlpha = 1;
      }
      // tethers: stretch from grey to orange as tension rises
      for (const t of S.tethers) {
        if (t.broken || S.qk < V.q) continue;
        const a = S.balls[t.i], b = S.balls[t.j];
        if (!a || !b || !a.live || !b.live) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y), k = Math.min(1, Math.max(0, (d - 50) / 100));
        ctx.strokeStyle = `rgba(255,${Math.round(220 - 66 * k)},${Math.round(220 - 160 * k)},${0.4 + 0.5 * k})`;
        ctx.lineWidth = 3 - 1.5 * k; ctx.setLineDash(k > 0.6 ? [6, 4] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      }
      // charge halo: one segment per question, coloured once that answer is revealed
      if (buildUp && S.lambda < 1) {
        ctx.globalAlpha = 1 - 0.8 * S.lambda;
        const seg = (Math.PI * 2) / V.q, gap = Math.min(0.12, seg * 0.25);
        for (const b of live) for (let k = 0; k < V.q; k++) {
          ctx.strokeStyle = k < S.qk ? (b.p.answers[k] ? V.COL.b : V.COL.a) : "rgba(255,255,255,0.12)";
          ctx.lineWidth = 3.5;
          ctx.beginPath(); ctx.arc(b.x, b.y, S.R + 5, -Math.PI / 2 + k * seg + gap / 2, -Math.PI / 2 + (k + 1) * seg - gap / 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      for (const f of S.fx) if (f.kind === "charge") {
        const k = f.t / f.life, col = f.a ? V.COL.b : V.COL.a;
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = col; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.b.x, f.b.y, S.R + 6 + 22 * k, 0, 7); ctx.stroke();
        ctx.fillStyle = col; ctx.globalAlpha = 0.35 * (1 - k);
        ctx.beginPath(); ctx.arc(f.b.x, f.b.y, S.R + 4, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
      for (const b of live) V.ball(b.p, b.x, b.y, S.R, { shadow: true });
      if (S.balls.length <= 16) for (const b of live) V.label(b.p.name, b.x, b.y - S.R - 12, "rgba(18,20,43,.75)", V.COL.text, 11);
      for (const f of S.fx) {
        if (f.kind === "charge") {
          const k = f.t / f.life;
          if (S.balls.length <= 14) { ctx.globalAlpha = Math.min(1, (1 - k) * 2); V.label(f.a ? "B" : "A", f.b.x + S.R + 12, f.b.y - S.R - 4 - 10 * k, f.a ? V.COL.b : V.COL.a, "#111", 12); ctx.globalAlpha = 1; }
        } else if (f.kind === "snap") { ctx.globalAlpha = 1 - f.t / f.life; ctx.fillStyle = V.COL.nudge; ctx.font = "26px sans-serif"; ctx.textAlign = "center"; ctx.fillText("✂", f.x, f.y + 8); ctx.globalAlpha = 1; }
        else V.hand(f.b.x, f.b.y, f.ang, f.t / f.life, f.text, S.R);
      }
      const Qtext = window.QUESTIONS && QUESTIONS[S.qk - 1];
      if (S.phase === "cluster" && buildUp && S.qk < V.q) V.banner(S.qk ? `Q${S.qk}: ${Qtext ? Qtext.q : ""}` : "Dropping in · no magnetism yet");
      else if (S.phase === "cluster" && buildUp && S.qk === V.q && Qtext) V.banner(`Q${S.qk}: ${Qtext.q}`);
      else if (S.phase === "cluster") V.banner("Like attracts like");
      else if (S.phase === "ramp") V.banner(`Turning up repulsion in big groups… ${S.comps.length} group${S.comps.length === 1 ? "" : "s"} so far`);
      else if (S.phase === "formed") V.banner(`${S.natural.length} natural groups formed`);
      else if (S.phase === "teams") V.banner("Enforcing teams of 2–4");
      else V.banner("Your teams!");
    },
  };

  // natural groups = balls touching (or nearly), via union-find
  function components() {
    const bs = S.balls.filter((b) => b.live), par = bs.map((_, i) => i);
    const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    for (let a = 0; a < bs.length; a++) for (let c = a + 1; c < bs.length; c++)
      if (Math.hypot(bs[a].x - bs[c].x, bs[a].y - bs[c].y) < 2 * S.R + 18) par[find(a)] = find(c);
    const groups = {};
    bs.forEach((b, i) => (groups[find(i)] ||= []).push(b.i));
    return Object.values(groups);
  }
  function snapshot(comps) {
    return comps.map((c) => {
      const bs = c.map((i) => S.balls[i]);
      const x = bs.reduce((s, b) => s + b.x, 0) / bs.length, y = bs.reduce((s, b) => s + b.y, 0) / bs.length;
      return { members: c, x, y, r: Math.max(...bs.map((b) => Math.hypot(b.x - x, b.y - y))) + S.R + 7 };
    });
  }
  // anyone whose team mostly lives in a different natural group has to move, visibly
  function startTeams(V) {
    S.phase = "teams"; S.teamT = V.t; S.moved = {};
    const groupOf = {};
    S.natural.forEach((g, gi) => g.members.forEach((i) => (groupOf[i] = gi)));
    V.match.teams.forEach((t) => {
      const cnt = {};
      t.forEach((i) => (cnt[groupOf[i]] = (cnt[groupOf[i]] || 0) + 1));
      const home = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      t.forEach((i) => {
        if (groupOf[i] === home) return;
        const b = S.balls[i], p = S.P[i], mates = t.filter((j) => j !== i).map((j) => S.balls[j]);
        const tx = mates.reduce((s, m) => s + m.x, 0) / mates.length, ty = mates.reduce((s, m) => s + m.y, 0) / mates.length;
        S.moved[p.id] = true;
        const adj = p.bestSim - p.teamSim;
        S.fx.push({ b, ang: Math.atan2(ty - b.y, tx - b.x), t: 0, life: 2, text: `to Team ${p.team + 1}${adj > 0.05 ? ` · −${adj.toFixed(1)}` : ""}` });
      });
    });
    V.refresh();
  }
  // similarity on the questions revealed so far (all neutral before the first)
  function computeSim() {
    const P = S.P, k = S.qk;
    S.simM = P.map((a) => P.map((b) => {
      if (!k) return 0.5;
      let m = 0;
      for (let q = 0; q < k; q++) if (a.answers[q] === b.answers[q]) m++;
      return m / k;
    }));
  }
  function force(V, b) {
    if (!b.live) return null;
    const P = S.P, L = S.lambda;
    let ax = 0, ay = 0;
    for (const o of S.balls) {
      if (o === b || !o.live) continue;
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const w = S.sim(b.i, o.i) - 0.5;
      let f = (w > 0 ? 520 * w * Math.min(1, d / 60) : 520 * w * repel * Math.exp(-d / 420)) * S.mag * (1 - 0.8 * L);
      f -= Math.min(b.ramp || 0, o.ramp || 0) * (1 - S.sim(b.i, o.i)) * 420 * Math.exp(-d / 220) * (1 - L);
      if (P[b.i].team === P[o.i].team) f += L * 9 * (d - 2.4 * S.R);
      else if (d < 170) f -= L * 900 * (1 - d / 170);
      ax += ux * f; ay += uy * f;
    }
    for (const t of S.tethers) {
      if (t.broken || S.qk < V.q || (t.i !== b.i && t.j !== b.i)) continue;
      const o = S.balls[t.i === b.i ? t.j : t.i];
      if (!o.live) continue;
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy) || 1, k = 2.5 * (1 - 0.6 * S.lambda);
      ax += (dx / d) * k * Math.max(0, d - 2.4 * S.R); ay += (dy / d) * k * Math.max(0, d - 2.4 * S.R);
    }
    const pull = 0.5 * (1 + 0.8 * (b.ramp || 0) * (1 - L));
    ax += -pull * (b.x - CX) - 2.6 * b.vx; ay += -pull * (b.y - CY) - 2.6 * b.vy;
    return { ax, ay };
  }
})();

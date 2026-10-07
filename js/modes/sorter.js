// Marble sorter: each question is a fork in a track (A rolls left, B right).
// Tracks never merge, so every distinct answer set gets its own tip. Only forks
// someone actually used are built. Each tip's chute drops straight into the bin
// below it; a marble whose team bin is elsewhere gets visibly flicked across,
// and a dashed ghost rolls on to where it would have gone.
(function () {
  const W = 1000, H = 1010, TOP = 150, BOT = 640, BIN_TOP = 800, FLOOR = 975, G = 1400;
  let S;

  Modes.sorter = {
    name: "Marble sorter",
    icon: "🛤️",
    blurb: "Every question is a fork in the track. Marbles that agree ride together; strays get flicked to their team.",
    explain: `Each question is a fork: <span style="color:var(--a)">A</span> rolls left, <span style="color:var(--b)">B</span> rolls right. The longer two marbles share a track, the more questions they agree on (in this order). Chutes drop straight down; a marble whose team bin isn't the one below gets a <span style="color:var(--nudge)">flick</span>, and a dashed ghost shows where it would have gone.`,
    options: [
      { key: "order", label: "Fork order", def: "asked", choices: [["asked", "As asked"], ["agree", "Most-agreed first"]] },
    ],
    nudged: (p) => !!S && p.team !== S.leafTeam[S.key(p)],

    reset(V) {
      V.size(W, H);
      const P = V.match.people, q = V.q;
      let qo = [...Array(q).keys()];
      if ((V.opts.order || "asked") === "agree") {
        const lop = (k) => Math.abs(P.reduce((s, p) => s + (p.answers[k] ? 1 : -1), 0));
        qo.sort((a, b) => lop(b) - lop(a) || a - b);
      }
      const key = (p) => qo.map((k) => p.answers[k]).join("");
      const leaves = [...new Set(P.map(key))].sort();
      const m = 70, L = leaves.length;
      const leafX = (i) => m + (i + 0.5) * (W - 2 * m) / L;
      const levelY = (k) => TOP + (k * (BOT - TOP)) / q;
      const nodeX = {};
      const xOf = (pre) => {
        if (nodeX[pre] == null) { const xs = leaves.map((l, i) => (l.startsWith(pre) ? leafX(i) : null)).filter((x) => x != null); nodeX[pre] = xs.reduce((a, b) => a + b, 0) / xs.length; }
        return nodeX[pre];
      };
      const nodes = new Set([""]);
      for (const l of leaves) for (let k = 1; k <= q; k++) nodes.add(l.slice(0, k));

      // team bins ordered left-to-right by where their members' tips are
      const T = V.match.teams.length;
      const meanLeaf = (ti) => V.match.teams[ti].reduce((s, i) => s + leaves.indexOf(key(P[i])), 0) / V.match.teams[ti].length;
      V.teamOrder = [...Array(T).keys()].sort((a, b) => meanLeaf(a) - meanLeaf(b));
      const binW = (W - 80) / T, binX = (ti) => 40 + (V.teamOrder.indexOf(ti) + 0.5) * binW;
      // each tip's chute drops straight down: its natural bin is the one underneath
      const leafTeam = {};
      for (const l of leaves) leafTeam[l] = V.teamOrder[Math.max(0, Math.min(T - 1, Math.floor((xOf(l) - 40) / binW)))];
      const R = Math.max(7, Math.min(14, binW / 4.6, (W - 2 * m) / L / 2.6));

      S = { qo, key, leaves, levelY, xOf, nodes, binW, binX, leafTeam, R, T, gates: {}, balls: [], ghosts: [], fx: [], slots: {} };
      S.balls = P.map((p) => {
        const k0 = key(p), pts = [[xOf(""), -20], [xOf(""), TOP]];
        for (let k = 1; k <= q; k++) pts.push([xOf(k0.slice(0, k)), levelY(k)]);
        const chuteStart = pts.length - 1;
        pts.push([xOf(k0), BIN_TOP]);
        return { p, pts: rail(pts), chuteStart, s: 0, v: 160, st: "wait", rel: 0, x: pts[0][0], y: pts[0][1], nodeHit: 1 };
      });
    },

    drop() {
      const order = S.balls.map((_, i) => i).sort(() => Math.random() - 0.5);
      order.forEach((i, k) => { S.balls[i].rel = 0.3 + k * 0.6; S.balls[i].st = "wait"; });
    },

    update(V, dt) {
      for (const g of Object.values(S.gates)) g.ang += (g.target - g.ang) * Math.min(1, dt * 18);
      for (const b of S.balls) step(V, b, dt);
      for (const g of S.ghosts) { g.t += dt; if (g.s < g.rail.len) { g.s = Math.min(g.rail.len, g.s + g.v * dt); const [x, y] = at(g.rail, g.s); g.x = x; g.y = y; } }
      S.ghosts = S.ghosts.filter((g) => g.t < 4.5);
      S.fx.forEach((f) => (f.t += dt)); S.fx = S.fx.filter((f) => f.t < f.life);
    },

    draw(V, ctx) {
      V.bg();
      const R = S.R, qo = S.qo;
      const segs = [[[S.xOf(""), 0], [S.xOf(""), TOP]]];
      for (const pre of S.nodes) for (const c of ["0", "1"]) if (S.nodes.has(pre + c)) segs.push([[S.xOf(pre), S.levelY(pre.length)], [S.xOf(pre + c), S.levelY(pre.length + 1)]]);
      const chutes = S.leaves.map((l) => [[S.xOf(l), BOT], [S.xOf(l), BIN_TOP]]);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const [w, c] of [[2 * R + 12, "#3a4080"], [2 * R + 4, "#1a1c3a"]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        for (const s of segs.concat(chutes)) { ctx.beginPath(); ctx.moveTo(...s[0]); ctx.lineTo(...s[1]); ctx.stroke(); }
      }
      ctx.textAlign = "left"; ctx.font = "600 15px Fredoka";
      for (let k = 0; k < V.q; k++) { ctx.fillStyle = V.COL.muted; ctx.fillText(`Q${qo[k] + 1}`, 10, S.levelY(k) + 5); }
      ctx.font = "700 12px Fredoka"; ctx.textAlign = "center";
      for (const pre of S.nodes) {
        if (pre.length >= V.q) continue;
        const x = S.xOf(pre), y = S.levelY(pre.length);
        for (const c of ["0", "1"]) {
          if (!S.nodes.has(pre + c)) continue;
          const cx = S.xOf(pre + c), cy = S.levelY(pre.length + 1), d = Math.hypot(cx - x, cy - y);
          const lx = x + (cx - x) / d * (R + 22), ly = y + (cy - y) / d * (R + 22);
          ctx.fillStyle = c === "0" ? V.COL.a : V.COL.b; ctx.fillText(c === "0" ? "A" : "B", lx + (c === "0" ? -14 : 14), ly + 4);
        }
        const g = S.gates[pre] || (S.gates[pre] = { ang: 0, target: 0 });
        ctx.save(); ctx.translate(x, y); ctx.rotate(g.ang);
        ctx.strokeStyle = V.COL.accent; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, R * 1.9); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = V.COL.accent; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      }
      if (S.leaves.length <= 24) {
        ctx.font = "600 12px ui-monospace, monospace";
        for (const l of S.leaves) { ctx.fillStyle = V.COL.muted; ctx.fillText([...l].map((c) => (c === "0" ? "A" : "B")).join(""), S.xOf(l), BOT + R + 22); }
      }
      ctx.strokeStyle = "#6a72c8"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(40, FLOOR); ctx.lineTo(W - 40, FLOOR); ctx.stroke();
      for (let i = 0; i <= S.T; i++) { const x = 40 + i * S.binW; ctx.beginPath(); ctx.moveTo(x, BIN_TOP + 20); ctx.lineTo(x, FLOOR); ctx.stroke(); }
      ctx.font = "600 14px Fredoka"; ctx.fillStyle = V.COL.muted; ctx.textAlign = "center";
      for (let d = 0; d < S.T; d++) ctx.fillText(S.T > 9 ? `${d + 1}` : `Team ${d + 1}`, 40 + (d + 0.5) * S.binW, FLOOR + 20);

      for (const g of S.ghosts) {
        if (g.s >= g.rail.len && g.doneT == null) g.doneT = g.t;
        const fade = g.doneT != null ? Math.max(0, 1 - (g.t - g.doneT) / 2.5) : 1;
        V.ball(g.p, g.x, g.y, R, { ghost: true, alpha: 0.6 * fade });
        if (g.doneT != null) { ctx.globalAlpha = fade; V.label("would've been here", g.x, g.y + R + 18, "rgba(18,20,43,.85)", V.COL.text, 12); ctx.globalAlpha = 1; }
      }
      for (const b of S.balls) if (b.st !== "wait") V.ball(b.p, b.x, b.y, R);
      for (const b of S.balls) if (b.st === "rail" || b.st === "fly") V.label(b.p.name, b.x, b.y - R - 14, "rgba(18,20,43,.8)", V.COL.text, 12);
      for (const f of S.fx) V.hand(f.b.x, f.b.y, f.ang, f.t / f.life, f.text, R);
      if (V.allArrived()) V.banner("Your teams!");
    },
  };

  // ---- rail helpers: a polyline with cumulative lengths ----
  function rail(pts) {
    const seg = [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], l = Math.hypot(x1 - x0, y1 - y0);
      seg.push({ x0, y0, x1, y1, l, s0: len, sin: (y1 - y0) / (l || 1) });
      len += l;
    }
    return { pts, seg, len };
  }
  function segAt(r, s) { for (const g of r.seg) if (s <= g.s0 + g.l) return g; return r.seg[r.seg.length - 1]; }
  function at(r, s) { const g = segAt(r, s), u = Math.min(1, Math.max(0, (s - g.s0) / (g.l || 1))); return [g.x0 + (g.x1 - g.x0) * u, g.y0 + (g.y1 - g.y0) * u]; }

  function slotFor(V, ti) {
    const d = V.teamOrder.indexOf(ti), k = (S.slots[d] = (S.slots[d] || 0) + 1) - 1, R = S.R;
    const cols = Math.max(1, Math.floor((S.binW - 8) / (2 * R + 2)));
    const cx = 40 + (d + 0.5) * S.binW;
    return [cx - ((cols - 1) * (2 * R + 2)) / 2 + (k % cols) * (2 * R + 2), FLOOR - R - 3 - Math.floor(k / cols) * (2 * R + 1)];
  }
  const slotPreview = (V, ti) => [40 + (V.teamOrder.indexOf(ti) + 0.5) * S.binW, FLOOR - S.R - 3];

  function step(V, b, dt) {
    const p = b.p, r = b.pts;
    if (b.st === "wait") { if (V.t >= b.rel) b.st = "rail"; else return; }
    if (b.st === "rail") {
      // rolling on a rail: gravity along the slope, rolling resistance, never stalls
      const g = segAt(r, b.s);
      b.v += G * g.sin * 0.55 * dt; b.v *= 1 - 0.8 * dt; b.v = Math.max(140, b.v);
      b.s += b.v * dt;
      // arriving at a fork: the gate clacks over to this marble's side
      const nodeS = r.seg[b.nodeHit] && r.seg[b.nodeHit].s0;
      if (b.nodeHit <= V.q && b.s >= nodeS) {
        const depth = b.nodeHit - 1, pre = S.key(p).slice(0, depth);
        if (depth < V.q) { const gt = S.gates[pre] || (S.gates[pre] = { ang: 0, target: 0 }); gt.target = S.key(p)[depth] === "0" ? -0.55 : 0.55; b.v *= 0.7; }
        b.nodeHit++;
      }
      const chute = r.seg[b.chuteStart];
      if (p.team !== S.leafTeam[S.key(p)] && b.s >= chute.s0 + chute.l * 0.45) {
        // the flick: a real ballistic hop that lands in the assigned bin
        const [x, y] = at(r, b.s); b.x = x; b.y = y;
        const tx = S.binX(p.team), ty = BIN_TOP, vy0 = -320, dy = ty - y;
        const t = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * G * dy)) / G;
        Object.assign(b, { st: "fly", vx: (tx - x) / t, vy: vy0, ft: t });
        const adj = p.bestSim - p.teamSim;
        S.fx.push({ b, ang: Math.atan2(-0.4, Math.sign(tx - x) || 1), t: 0, life: 1.6, text: `to Team ${V.teamLabel(p.team)}${adj > 0.05 ? ` · −${adj.toFixed(1)}` : ""}` });
        S.ghosts.push({ p, rail: rail([[x, y], r.pts[r.pts.length - 1], slotPreview(V, S.leafTeam[S.key(p)])]), s: 0, v: b.v, t: 0, x, y });
        return;
      }
      if (b.s >= r.len) { const [sx, sy] = slotFor(V, p.team); Object.assign(b, { st: "fall", vx: 0, vy: b.v * 0.6, sx, sy }); }
      else { const [x, y] = at(r, b.s); b.x = x; b.y = y; }
    }
    if (b.st === "fly") {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += G * dt; b.ft -= dt;
      if (b.ft <= 0) { const [sx, sy] = slotFor(V, p.team); Object.assign(b, { st: "fall", sx, sy, vx: 0 }); }
    }
    if (b.st === "fall") {
      b.x += (b.sx - b.x) * Math.min(1, dt * 8);
      b.vy += G * dt; b.y += b.vy * dt;
      if (b.y >= b.sy) { b.y = b.sy; if (b.vy > 160) b.vy = -b.vy * 0.3; else { b.st = "done"; b.x = b.sx; V.arrive(p.id); } }
    }
  }
})();

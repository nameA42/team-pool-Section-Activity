// Plinko: the original drop. Every path is real physics, worked out BACKWARDS:
// each ball starts in its team's bin and the simulation runs in reverse (bounces
// gain energy) until it peaks above the pegs, where it hangs on a hook. Played
// forward that's ordinary falling that lands exactly right. The only non-physics
// moments are nudges, drawn as a hand, with a dashed ghost following the same
// physics to where the ball would have landed without it.
// Paths are computed in Web Workers (js/solver-worker.js) and take a few seconds.
(function () {
  const BD = Reverse.Board;
  const { W, H, R, TT, RS, BT, FL } = BD;
  const rowY = BD.rowY;
  const TIME_SCALE = 0.65;
  let S;

  Modes.plinko = {
    name: "Plinko",
    icon: "🎰",
    blurb: "The classic drop. Real physics paths, computed backwards from each team's bin; nudges are the only cheats.",
    explain: `Each ball's path is real physics, worked out <b>backwards from its team's bin</b>. If the 2–4 rule split someone from their best match, you see one <span style="color:var(--nudge)">nudge</span>, and a dashed ghost follows the same physics to where they would have landed. It takes a few seconds to compute.`,
    options: [
      { key: "model", label: "Nudges", def: "A", choices: [["A", "Only forced moves"], ["B", "Every disagreement"]] },
      { key: "drop", label: "Drop", def: "stagger", choices: [["stagger", "One by one"], ["burst", "All at once"]] },
    ],
    nudged: (p) => (S && S.model === "B" ? p.B.nudges > 0 : p.A.nudged),

    reset(V) {
      V.size(W, H);
      const model = V.opts.model === "B" && V.q <= 10 ? "B" : "A";
      const St = (S = { model, phase: "computing", progress: 0, text: "Starting…", plan: null, tau: 0, workers: [], stageT: 0, landed: new Set() });
      compute(V, St).then((plan) => {
        if (St !== S || St.cancelled) return; // a newer run took over
        S.plan = plan; indexPlan(V, plan); S.phase = "staging"; S.stageT = 0;
      }).catch((e) => { console.error(e); if (St === S) { S.phase = "error"; S.text = String(e.message || e); } });
    },
    drop() {},
    stop() { if (S) { S.cancelled = true; S.workers.forEach((w) => w.terminate()); } },

    update(V, dt) {
      if (S.phase === "staging") { S.stageT += dt; if (S.stageT >= 1.4) S.phase = "play"; }
      if (S.phase === "play") {
        S.tau = Math.min(S.endTau, S.tau + dt * TIME_SCALE * bulletTime());
        for (const b of S.plan.balls) if (!S.landed.has(b.id) && S.tau * S.plan.fps >= b.Pland + 20) { S.landed.add(b.id); V.arrive(b.id); }
        if (S.tau >= S.endTau) { S.phase = "done"; V.match.people.forEach((p) => V.arrive(p.id)); }
      }
    },

    draw(V, ctx) {
      V.bg();
      const live = S.phase === "play" || S.phase === "done" || S.phase === "staging";
      const tau = S.tau;
      // question rows (model B)
      if (live && S.model === "B") {
        ctx.font = "500 12px Fredoka"; ctx.textAlign = "left";
        for (let q = 0; q < V.q; q++) {
          const y = rowY(q + 1), f = flashOf(S.evs.filter((e) => e.kind === "nudgeB" && e.q === q), 0.8);
          if (f > 0) { ctx.strokeStyle = `rgba(255,154,60,${f * 0.5})`; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]); }
          ctx.fillStyle = f > 0 ? V.COL.nudge : "rgba(168,166,207,0.55)";
          ctx.fillText(`Q${q + 1}`, 6, y - RS / 2 + 4);
        }
      }
      // pegs, flashing where the recording says a ball hit them
      const flash = {};
      if (live && S.hits) {
        let lo = 0, hi = S.hits.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (S.hits[m][0] < tau - 0.3) lo = m + 1; else hi = m; }
        for (let i = lo; i < S.hits.length && S.hits[i][0] <= tau; i++) flash[S.hits[i][1]] = Math.max(flash[S.hits[i][1]] || 0, 1 - (tau - S.hits[i][0]) / 0.3);
      }
      for (const p of BD.pegs) {
        const f = flash[p.id] || 0;
        if (f > 0) { ctx.fillStyle = `rgba(255,204,51,${f * 0.35})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 7 * f, 0, 7); ctx.fill(); }
        ctx.fillStyle = f > 0.2 ? "#fff3c4" : "#8f96e8";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
      // bins
      const T = V.match.teams.length, bw = W / T;
      ctx.strokeStyle = "#6a72c8"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, FL); ctx.lineTo(W, FL); ctx.stroke();
      ctx.textAlign = "center"; ctx.font = "600 14px Fredoka";
      for (let t = 0; t < T; t++) {
        if (t % 2) { ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.fillRect(t * bw, BT, bw, FL - BT); }
        ctx.fillStyle = V.COL.muted; ctx.fillText(T > 12 ? `${t + 1}` : `Team ${t + 1}`, (t + 0.5) * bw, FL + 22);
        if (t) { ctx.strokeStyle = "#5a62b0"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(t * bw, BT); ctx.lineTo(t * bw, FL); ctx.stroke(); }
      }
      const hp = V.hoverId && V.byId[V.hoverId];
      if (hp && S.model === "A" && hp.A.nudged) {
        ctx.strokeStyle = V.COL.nudge; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
        ctx.strokeRect(hp.A.ghostTeam * bw + 3, BT + 3, bw - 6, FL - BT - 6); ctx.setLineDash([]);
      }

      if (S.phase === "computing" || S.phase === "error") {
        const x = W / 2, y = 180;
        ctx.fillStyle = "rgba(18,20,43,.92)"; ctx.beginPath(); ctx.roundRect(x - 260, y - 60, 520, 130, 16); ctx.fill();
        ctx.strokeStyle = "#3a4080"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = V.COL.text; ctx.font = "600 20px Fredoka"; ctx.fillText(S.phase === "error" ? "Couldn't compute paths" : "Working out every path… backwards", x, y - 22);
        ctx.fillStyle = "#1b1e3d"; ctx.beginPath(); ctx.roundRect(x - 220, y - 4, 440, 12, 6); ctx.fill();
        ctx.fillStyle = V.COL.accent; ctx.beginPath(); ctx.roundRect(x - 220, y - 4, 440 * S.progress, 12, 6); ctx.fill();
        ctx.fillStyle = V.COL.muted; ctx.font = "500 13px Fredoka"; ctx.fillText(S.text, x, y + 36);
        return;
      }
      if (S.phase === "staging") {
        // balls drop onto their hooks from above
        const u = Math.min(1, S.stageT / 1.2), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        for (const b of S.plan.balls) {
          const x = b.apex.x, y = -40 + (b.apex.y + 40) * e;
          if (u > 0.85) drawHook(ctx, x, y, (u - 0.85) / 0.15);
          V.ball(b.p, x, y, R);
        }
        return;
      }
      const plan = S.plan;
      // ghosts: where a nudged ball would have gone, by the same physics, without the nudge
      for (const g of S.ghosts) {
        const age = tau - g.tau;
        if (age < 0) continue;
        const n = g.path.length / 2, i = age * plan.fps, done = i >= n - 1;
        if (done && age - (n - 1) / plan.fps > 3.5) continue;
        const fade = done ? Math.max(0, 1 - (age - (n - 1) / plan.fps) / 3.5) : 1, b = S.byId[g.id];
        ctx.globalAlpha = (V.hoverId === g.id ? 0.95 : 0.6) * fade;
        ctx.strokeStyle = b.p.color; ctx.lineWidth = 2; ctx.setLineDash([3, 6]);
        ctx.beginPath();
        for (let k = 0; k <= Math.min(i, n - 1); k++) k ? ctx.lineTo(g.path[2 * k], g.path[2 * k + 1]) : ctx.moveTo(g.path[0], g.path[1]);
        ctx.stroke();
        const [x, y] = interp(g.path, i);
        ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = b.p.color; ctx.font = "700 9px Fredoka"; ctx.textAlign = "center"; ctx.fillText(b.p.init, x, y + 3);
        if (done) { ctx.font = "500 12px Fredoka"; ctx.fillStyle = V.COL.text; ctx.fillText("would've been here", x, y - 20); }
        ctx.globalAlpha = 1;
      }
      const pos = {};
      for (const b of plan.balls) pos[b.id] = ballAt(b, tau);
      for (const b of plan.balls) {
        const p = pos[b.id];
        if (p.st === "held") {
          const rel = b.Prel / plan.fps - tau;
          drawHook(ctx, p.x, p.y, 1);
          if (rel < 0.6 && rel > 0) { ctx.globalAlpha = 1 - rel / 0.6; ctx.strokeStyle = V.COL.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, R + 4, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
        } else if (p.st === "fall") {
          const since = tau - b.Prel / plan.fps;
          if (since < 0.4) { ctx.globalAlpha = 1 - since / 0.4; drawHook(ctx, b.apex.x, b.apex.y, 1, true); ctx.globalAlpha = 1; }
        }
        V.ball(b.p, p.x, p.y, R);
      }
      for (const b of plan.balls) if (pos[b.id].st === "fall") V.label(b.p.name, pos[b.id].x, pos[b.id].y - R - 12, "rgba(18,20,43,0.8)", V.COL.text, 12);
      // nudge effects, drawn on the ball at the moment the recording applied the kick
      for (const e of S.evs) {
        const age = tau - e.tau, life = e.kind === "drift" ? 1.1 : 1.8;
        if (age < 0 || age > life) continue;
        const p = pos[e.id], k = age / life, person = S.byId[e.id].p;
        ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
        if (e.kind === "nudgeA") hand(V, ctx, e, p, k, `nudged −${person.A.adjust.toFixed(1)}`, V.COL.nudge, false, e.dir);
        else if (e.kind === "nudgeB") hand(V, ctx, e, p, k, e.s > 0.5 ? `Q${e.q + 1}` : `Q${e.q + 1} split`, e.s > 0.5 ? V.COL.nudge : V.COL.split, e.s <= 0.5, -e.dir);
        else if (e.kind === "drift") { const q = QUESTIONS[e.q]; V.label(e.dir > 0 ? `${q.b} →` : `← ${q.a}`, p.x + e.dir * 40, p.y + 4, e.dir > 0 ? V.COL.b : V.COL.a, "#111", 12); }
        ctx.globalAlpha = 1;
      }
      if (S.phase === "done") V.banner("Your teams!");
    },
  };

  // ---- computing the plan (parallel workers, main thread as fallback) ----
  function runJob(w, msg, onProgress) {
    return new Promise((resolve, reject) => {
      const job = Math.random();
      w.onmessage = (e) => {
        if (e.data.job !== job) return;
        if (e.data.progress) onProgress && onProgress(e.data.progress); else resolve(e.data.result);
      };
      w.onerror = (e) => reject(new Error(e.message || "worker failed"));
      w.postMessage({ ...msg, job });
    });
  }
  async function compute(V, St) {
    const T = V.match.teams.length;
    const specs = V.match.people.map((p) => ({ id: p.id, bin: p.team, events: St.model === "A" ? Reverse.eventsForA(p) : Reverse.eventsForB(p) }));
    const opts = { mode: V.opts.drop === "burst" ? "burst" : "stagger", seed: 11 };
    const set = (f, text) => { St.progress = f; if (text) St.text = text; };
    let N = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    try {
      St.workers = Array.from({ length: N }, () => new Worker("js/solver-worker.js"));
    } catch (e) {
      // no workers (e.g. opened from file://): do it here; the screen freezes for a few seconds
      set(0.3, "Computing on the main thread…");
      await new Promise((r) => setTimeout(r, 50));
      return Reverse.settle(Reverse.solve(T, specs, opts));
    }
    const fr = new Array(N).fill(0);
    set(0, `Searching reverse paths for ${specs.length} balls on ${N} threads…`);
    const parts = await Promise.all(St.workers.map((w, k) => runJob(w,
      { kind: "candidates", T, specs, opts, idxs: specs.map((_, i) => i).filter((i) => i % N === k) },
      (p) => { fr[k] = p.frac; set(0.5 * fr.reduce((a, b) => a + b, 0) / N); })));
    set(0.5, opts.mode === "burst" ? "Fitting everyone into one simultaneous drop without collisions…" : "Running everyone together and untangling collisions…");
    const plan = await runJob(St.workers[0], { kind: "solve", T, specs, opts: { ...opts, pools: Object.assign({}, ...parts) } }, (pr) => set(0.5 + 0.5 * pr.frac));
    St.workers.forEach((w) => w.terminate()); St.workers = [];
    return plan;
  }

  // Pre-index the plan for drawing: per-ball lookups and events in playback time.
  function indexPlan(V, plan) {
    const F = plan.fps, TF = plan.TendF;
    S.byId = {};
    for (const b of plan.balls) {
      b.p = V.byId[b.id];
      b.n = b.path.length / 2;
      b.Prel = TF - (b.f0 + b.n - 1); // playback frame it leaves the hook
      b.Pland = TF - b.f0;             // playback frame it enters the bin
      S.byId[b.id] = b;
    }
    const tauOf = (t) => (TF - t * F) / F;
    S.evs = plan.events.map((e) => ({ ...e, tau: tauOf(e.t) })).sort((a, b) => a.tau - b.tau);
    S.ghosts = plan.ghosts.map((g) => ({ ...g, tau: tauOf(g.t) }));
    S.hits = plan.hits.map(([t, id]) => [tauOf(t), id]).sort((a, b) => a[0] - b[0]);
    S.endTau = plan.endP / F;
    S.tau = 0;
  }

  function interp(arr, i) {
    const n = arr.length / 2;
    if (i <= 0) return [arr[0], arr[1]];
    if (i >= n - 1) return [arr[2 * n - 2], arr[2 * n - 1]];
    const k = Math.floor(i), u = i - k;
    return [arr[2 * k] * (1 - u) + arr[2 * k + 2] * u, arr[2 * k + 1] * (1 - u) + arr[2 * k + 3] * u];
  }
  function ballAt(b, t) {
    const plan = S.plan, P = t * plan.fps;
    if (!b.ok || P <= b.Prel) return { x: b.apex.x, y: b.apex.y, st: "held" };
    if (P < b.Pland) { const [x, y] = interp(b.path, plan.TendF - P - b.f0); return { x, y, st: "fall" }; }
    const [x, y] = interp(b.settle, P - b.Pland);
    return { x, y, st: "bin" };
  }
  // slow motion around each forced-move nudge so nobody misses it
  function bulletTime() {
    if (S.model !== "A") return 1;
    let f = 1;
    for (const e of S.evs) {
      if (e.kind !== "nudgeA") continue;
      const d = Math.abs(S.tau - e.tau + 0.15);
      if (d < 0.9) f = Math.min(f, 0.3 + 0.7 * Math.max(0, (d - 0.3) / 0.6));
    }
    return f;
  }
  function flashOf(list, life) {
    let f = 0;
    for (const e of list) { const age = S.tau - e.tau; if (age >= 0 && age < life) f = Math.max(f, 1 - age / life); }
    return f;
  }
  function hand(V, ctx, e, p, k, text, color, small, d) {
    const slide = Math.min(1, (k * 1.8) / 0.22);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.arc(e.x, e.y, R + 2, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `${small ? 22 : 30}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.save(); ctx.translate(p.x - d * (46 - 22 * slide), p.y); if (d < 0) ctx.scale(-1, 1); ctx.fillText("👉", 0, 0); ctx.restore();
    ctx.textBaseline = "alphabetic";
    ctx.strokeStyle = color; ctx.lineWidth = small ? 2 : 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, R + 6 + k * 10, 0, 7); ctx.stroke();
    V.label(text, p.x, p.y - R - 34 - k * 14, color, "#1c1000", small ? 12 : 14);
  }
  function drawHook(ctx, x, y, a, open) {
    const g0 = ctx.globalAlpha;
    ctx.globalAlpha *= a;
    ctx.strokeStyle = "#c9c6f2"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y - R - 14); ctx.lineTo(x, y - R - 4); ctx.stroke();
    const sp = open ? 9 : 5;
    ctx.beginPath(); ctx.moveTo(x - sp, y - R - 2); ctx.lineTo(x, y - R - 6); ctx.lineTo(x + sp, y - R - 2); ctx.stroke();
    ctx.globalAlpha = g0;
  }
})();

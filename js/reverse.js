// Reverse-physics path planner.
//
// Every ball starts in the mouth of the bin it has to end up in, moving
// upward. We run the simulation with time reversed: gravity is unchanged, but
// every bounce GAINS energy (restitution 1/e instead of e). Played backward,
// the recording shows ordinary falling with ordinary, lossy bounces, and it
// ends exactly where it started: dropping into the right bin. No steering.
//
// A ball's reverse run ends when it peaks (vy = 0) in the open space above the
// pegs. In the forward replay that peak is the ball hanging on its hook before
// release. Nudges are velocity kicks applied in the reverse run; in the replay
// they're the only moments that aren't plain physics, and they're drawn as such.
(function (root) {
  const B = { W: 960, H: 1130, R: 12, TT: 320, ROWS: 12, RS: 50, PEG_R: 5, BT: 930, FL: 1090, G: 1500 };
  B.rowY = (r) => B.TT + r * B.RS;
  B.pegs = [];
  for (let r = 0; r < B.ROWS; r++) {
    const off = r % 2 ? 32 : 0;
    for (let i = 0, x = 32 + off; x <= B.W - 20; i++, x += 64) B.pegs.push({ id: r * 100 + i, x, y: B.rowY(r), r: B.PEG_R });
  }

  const DT = 1 / 600, SUB = 10, FPS = 60; // sim steps per recorded frame

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  const hashSeed = (...xs) => xs.reduce((h, x) => Math.imul(h ^ (x | 0), 2654435761) >>> 0, 2166136261);

  function makeBins(T) {
    const bw = B.W / T;
    return { T, bw, x: (t) => (t + 0.5) * bw, divs: Array.from({ length: T - 1 }, (_, i) => (i + 1) * bw) };
  }

  // ---------- collisions ----------
  function hitCircle(b, cx, cy, cr, e) {
    const dx = b.x - cx, dy = b.y - cy, rr = B.R + cr, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 1e-9) return 0;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x = cx + nx * rr; b.y = cy + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return 0;
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    return -vn;
  }

  function collideStatic(b, bins, e, onPeg) {
    let hit = 0;
    const r0 = Math.round((b.y - B.TT) / B.RS);
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      if (r < 0 || r >= B.ROWS) continue;
      const py = B.rowY(r);
      if (Math.abs(b.y - py) > B.R + B.PEG_R) continue;
      const off = r % 2 ? 32 : 0, i0 = Math.round((b.x - 32 - off) / 64);
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        const px = 32 + off + 64 * i;
        if (i < 0 || px > B.W - 20) continue;
        const v = hitCircle(b, px, py, B.PEG_R, e);
        if (v) { hit = 1; if (v > 60 && onPeg) onPeg(r * 100 + i); }
      }
    }
    if (b.y > B.BT - B.R - 4) {
      for (const dx of bins.divs) {
        if (Math.abs(b.x - dx) > B.R + 3) continue;
        if (b.y < B.BT) { if (hitCircle(b, dx, B.BT, 3, e)) hit = 1; }
        else if (Math.abs(b.x - dx) < B.R) {
          const side = b.x < dx ? -1 : 1; // vertical divider wall
          b.x = dx + side * B.R;
          if (b.vx * side < 0) { b.vx = -e * b.vx; hit = 1; }
        }
      }
    }
    if (b.x < B.R) { b.x = B.R; if (b.vx < 0) { b.vx = -e * b.vx; hit = 1; } }
    if (b.x > B.W - B.R) { b.x = B.W - B.R; if (b.vx > 0) { b.vx = -e * b.vx; hit = 1; } }
    if (b.y > B.FL - B.R) { b.y = B.FL - B.R; if (b.vy > 0) { b.vy = -e * b.vy; hit = 1; } }
    return hit;
  }

  function collidePair(a, b, e) {
    const dx = b.x - a.x, dy = b.y - a.y, rr = 2 * B.R;
    if (dx > rr || dx < -rr || dy > rr || dy < -rr) return 0;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 1e-9) return 0;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (rr - d) / 2;
    a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn >= 0) return 0;
    const j = (-(1 + e) * vn) / 2;
    a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny;
    return 1;
  }

  // A "what if" ball: forward physics from the moment of the nudge, with no nudge.
  function ghostRun(bins, x, y, vx, vy, cfg, steerTo) {
    const g = { x, y, vx, vy }, path = [x, y];
    let bin = -1;
    for (let s = 1; s < 8 * 600; s++) {
      if (steerTo != null) {
        const p = Math.max(0, Math.min(1, (g.y - B.TT) / (B.BT - B.TT)));
        g.vx += Math.max(-3000, Math.min(3000, (6 + 80 * p * p) * (steerTo - g.x) - (1.2 + 7 * p) * g.vx)) * DT;
      }
      g.vy += B.G * DT; g.x += g.vx * DT; g.y += g.vy * DT;
      collideStatic(g, bins, cfg.e);
      if (s % SUB === 0) path.push(g.x, g.y);
      if (g.y > B.BT + 20 && bin < 0) bin = Math.floor(g.x / bins.bw);
      if (g.y > B.FL - B.R - 30) break;
    }
    return { bin, path };
  }

  // The nudge kick for this attempt, plus its ghost: plain forward physics from
  // the same spot with the replay velocity it had just before the nudge.
  function chooseNudge(bins, b, ev, cfg) {
    const r = rng(hashSeed(cfg.seed, b.idx, b.attempt, 77));
    const dx = ev.dir * (220 + r() * 520), dy = (r() - 0.6) * 220;
    // replay velocity just before the nudge = -(reverse velocity after it)
    let ghost = ghostRun(bins, b.x, b.y, -(b.vx + dx), -(b.vy + dy), cfg);
    const miss = ghost.bin !== ev.ghostBin;
    if (miss && b.allowSteer) { ghost = ghostRun(bins, b.x, b.y, -(b.vx + dx), -(b.vy + dy), cfg, bins.x(ev.ghostBin)); ghost.steered = true; }
    return { dx, dy, ghost, miss };
  }

  // ---------- the reverse run ----------
  function simulate(bins, balls, cfg) {
    const eR = 1 / cfg.e, eB = 1 / cfg.eBall;
    const hits = [], events = [], ghosts = [];
    for (const b of balls) {
      Object.assign(b, { x: b.mouth.x, y: b.mouth.y, vx: 0, vy: 0, mode: "rest", path: [], ei: 0, A: null, apex: null, f0: Math.round(b.L * FPS) });
    }
    const maxL = Math.max(...balls.map((b) => b.L));
    const steps = Math.ceil((maxL + cfg.flightMax) / DT);
    let moving = [], held = [];

    for (let s = 0; s <= steps; s++) {
      const t = s * DT, frame = s % SUB === 0 ? s / SUB : -1;
      let changed = false;
      if (frame >= 0) for (const b of balls) if (b.mode === "rest" && frame >= b.f0) {
        b.mode = "move"; b.vx = b.v0.x; b.vy = b.v0.y; changed = true;
      }
      if (changed) moving = balls.filter((b) => b.mode === "move");
      if (!moving.length) { if (balls.some((b) => b.mode === "rest")) continue; else break; }

      changed = false;
      for (const b of moving) {
        // a runaway reverse ball (energy keeps growing) can never become a sensible drop
        // and one that drops back into a bin is just pinballing there, gaining energy
        if (b.vx * b.vx + b.vy * b.vy > cfg.vDead * cfg.vDead || t - b.L > cfg.flightMax || (b.y > B.BT && b.vy > 0 && t - b.L > 0.05)) {
          b.mode = "dead"; changed = true; continue;
        }
        b.py = b.y; b.pvy = b.vy;
        b.vy += B.G * DT; b.x += b.vx * DT; b.y += b.vy * DT;
        b.free = b.vy;
      }
      if (changed) moving = moving.filter((b) => b.mode === "move");
      for (const b of moving) collideStatic(b, bins, eR, (id) => hits.push([t, id]));
      for (let i = 0; i < moving.length; i++) {
        for (let j = i + 1; j < moving.length; j++) collidePair(moving[i], moving[j], eB);
        for (const o of held) hitCircle(moving[i], o.x, o.y, B.R, eB);
      }
      if (cfg.kin && s % 2 === 0) {
        // re-search mode: everyone else is a fixed recording; touching any of them disqualifies
        const f = Math.floor(s / SUB);
        for (const b of moving) for (const o of cfg.kin) {
          if (f < o.f0 || (f > o.f1 && Math.abs(b.y - o.ay) > 60)) continue;
          const i = Math.min(f - o.f0, o.path.length / 2 - 1) * 2;
          const dx = b.x - o.path[i], dy = b.y - o.path[i + 1];
          if (dx * dx + dy * dy < (2 * B.R + 6) ** 2) { b.mode = "dead"; changed = true; }
        }
        if (changed) moving = moving.filter((b) => b.mode === "move");
      }

      changed = false;
      for (const b of moving) {
        while (b.ei < b.events.length && b.py > b.events[b.ei].y && b.y <= b.events[b.ei].y) {
          const ev = b.events[b.ei++];
          if (ev.kind === "nudgeA") {
            const n = chooseNudge(bins, b, ev, cfg);
            if (n.miss && !b.allowSteer) { b.mode = "dead"; changed = true; break; }
            b.vx += n.dx; b.vy += n.dy;
            events.push({ t, id: b.id, kind: "nudgeA", dir: ev.dir, x: b.x, y: b.y });
            ghosts.push({ t, id: b.id, path: n.ghost.path, bin: n.ghost.bin, steered: !!n.ghost.steered });
          } else {
            b.vx += ev.dx; b.vy += ev.dy;
            events.push({ t, id: b.id, kind: ev.kind, q: ev.q, dir: ev.dir, s: ev.s, x: b.x, y: b.y });
          }
        }
        if (b.mode !== "move") continue;
        // a clean peak (gravity alone flipped vy) above the pegs: this is the hook
        const peaked = b.pvy < 0 && b.free >= 0 && b.vy === b.free;
        if (peaked && b.y < B.TT - 40 && b.y > cfg.zoneTop && Math.abs(b.vx) < cfg.vxMax && b.ei >= b.events.length) {
          b.mode = "held"; b.A = t; b.apex = { x: b.x, y: b.y }; b.vx = b.vy = 0; changed = true;
          b.path.push(b.x, b.y);
        }
      }
      if (frame >= 0) for (const b of moving) if (b.mode === "move") b.path.push(b.x, b.y);
      if (changed) { moving = moving.filter((b) => b.mode === "move"); held = balls.filter((b) => b.mode === "held"); }
    }
    return { hits, events, ghosts };
  }

  function launchVelocity(cfg, b) {
    const r = rng(hashSeed(cfg.seed, b.idx, b.attempt));
    const ang = (r() - 0.5) * 0.9, sp = cfg.v0Min + r() * (cfg.v0Max - cfg.v0Min);
    return { x: Math.sin(ang) * sp, y: -Math.cos(ang) * sp };
  }

  function setAttempt(bins, cfg, b) {
    const rr = rng(hashSeed(cfg.seed, b.idx, b.attempt, 5));
    b.mouth = { x: bins.x(b.bin) + (rr() - 0.5) * Math.max(0, bins.bw - 2 * B.R - 10), y: B.BT - B.R - 8 };
    b.v0 = launchVelocity(cfg, b);
  }

  // Candidates found ahead of time (in parallel workers) are tried first, then fresh ones.
  function nextAttempt(bins, cfg, b, k, budget) {
    if (b.pool && b.pool.length) {
      const c = b.pool.shift();
      b.attempt = c.attempt; b.allowSteer = c.allowSteer;
    } else {
      b.fresh = (b.fresh || 0) + 1;
      b.attempt = b.fresh;
      b.allowSteer = k > budget / 2; // last resort: ghost drawn with steering
    }
    setAttempt(bins, cfg, b);
  }

  // Try launches for one ball on its own until its reverse run ends cleanly on a hook.
  function searchSolo(bins, cfg, b, kin) {
    const L = b.L;
    if (kin) cfg = Object.assign({}, cfg, { kin }); else b.L = 0;
    const budget = kin ? cfg.budget / 4 : cfg.budget;
    for (let k = 0; k < budget; k++) {
      nextAttempt(bins, cfg, b, k, budget);
      simulate(bins, [b], cfg);
      if (b.mode === "held") { b.D = b.A - b.L; break; }
    }
    b.L = L;
    return b.mode === "held";
  }

  // "All at once": balls are added one by one. Each is found on its own, then
  // launched so its peak (its release) lands at the shared moment Tstar. It's
  // only accepted if it never comes near a ball already placed, so the combined
  // replay is still exact physics.
  function solveBurst(bins, balls, cfg) {
    const Tstar = cfg.flightMax, F = Math.round(Tstar * FPS), clear2 = (2 * B.R + 8) ** 2;
    const placed = [], out = { hits: [], events: [], ghosts: [] };
    const posAt = (o, f2) => { // f2 = half-frame index
      const f = f2 / 2, i = Math.floor(f) - o.f0;
      if (i < 0) return null;
      const n = o.path.length / 2;
      if (i >= n - 1) return [o.path[2 * n - 2], o.path[2 * n - 1]];
      const u = f - Math.floor(f);
      return [o.path[2 * i] * (1 - u) + o.path[2 * i + 2] * u, o.path[2 * i + 1] * (1 - u) + o.path[2 * i + 3] * u];
    };
    let failed = 0;
    for (const b of balls) {
      let ok = false;
      for (let k = 0; k < cfg.budget && !ok; k++) {
        b.L = 0;
        nextAttempt(bins, cfg, b, k, cfg.budget);
        const res = simulate(bins, [b], cfg);
        if (b.mode !== "held" || b.A > Tstar) continue;
        // prefer releasing exactly at Tstar; later attempts may wait on the hook a little
        const maxWait = k < cfg.budget / 4 ? 0 : cfg.maxWait;
        for (let wait = 0; wait <= maxWait + 1e-9 && !ok; wait += 0.25) {
          b.f0 = F - Math.round((b.A + wait) * FPS);
          if (b.f0 < 0) break;
          ok = true;
          for (let f2 = 2 * b.f0; f2 <= 2 * F && ok; f2++) {
            const p = posAt(b, f2);
            for (const o of placed) {
              const q = posAt(o, f2);
              if (q && (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < clear2) { ok = false; break; }
            }
          }
        }
        if (ok) {
          const dt = b.f0 / FPS;
          b.L = dt; b.A += dt;
          res.events.forEach((e) => out.events.push({ ...e, t: e.t + dt }));
          res.ghosts.forEach((g) => out.ghosts.push({ ...g, t: g.t + dt }));
          res.hits.forEach(([t, id]) => out.hits.push([t + dt, id]));
          placed.push(b);
        }
      }
      if (!ok) { failed++; b.mode = "dead"; b.A = null; }
      cfg.onProgress && cfg.onProgress("placing", placed.length / balls.length);
    }
    return { out, failed };
  }

  const makeCfg = (opts) => Object.assign({ e: 0.9, eBall: 0.9, seed: 1, gap: 0.8, mode: "stagger", rounds: 12, budget: 30000, flightMax: 8,
    vDead: 2600, zoneTop: 40, vxMax: 250, v0Min: 700, v0Max: 1500, burstTol: 0.3, maxWait: 1.5 }, opts);
  const makeBall = (sp, i) => ({ id: sp.id, idx: i, bin: sp.bin, events: sp.events.slice().sort((a, b) => b.y - a.y), attempt: 0, L: 0 });

  // Solo search for a subset of balls, collecting up to K successful attempts each.
  // Runs in parallel workers; solve() then starts from these.
  function findCandidates(T, specs, idxs, opts, K = 4) {
    const cfg = makeCfg(opts), bins = makeBins(T), out = {};
    idxs.forEach((i, n) => {
      const b = makeBall(specs[i], i), cands = [];
      for (let k = 0; k < cfg.budget && cands.length < K; k++) {
        b.L = 0;
        nextAttempt(bins, cfg, b, k, cfg.budget);
        simulate(bins, [b], cfg);
        if (b.mode === "held") cands.push({ attempt: b.attempt, allowSteer: b.allowSteer });
      }
      out[i] = { cands, scanned: b.fresh };
      cfg.onProgress && cfg.onProgress("searching", (n + 1) / idxs.length);
    });
    return out;
  }

  // specs: [{id, bin, events}]; see eventsForA / eventsForB
  function solve(T, specs, opts = {}) {
    const cfg = makeCfg(opts);
    const bins = makeBins(T);
    const t0 = Date.now();
    const order = specs.map((_, i) => i);
    const r = rng(cfg.seed);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

    const balls = specs.map(makeBall);
    if (cfg.pools) for (const b of balls) if (cfg.pools[b.idx]) { b.pool = cfg.pools[b.idx].cands.slice(); b.fresh = cfg.pools[b.idx].scanned; }
    // reverse launch time: in stagger mode the k-th ball in `order` lands k gaps before the end
    order.forEach((i, k) => (balls[i].L = k * cfg.gap));

    if (cfg.mode === "burst") {
      const { out, failed } = solveBurst(bins, balls, cfg);
      const As = balls.filter((b) => b.A != null).map((b) => b.A);
      return finish(cfg, bins, T, balls.map((b) => ({ ...b })), out, failed, Math.max(...As) - Math.min(...As), 1, t0, balls.length - failed);
    }

    let solo = 0;
    for (const b of balls) {
      if (searchSolo(bins, cfg, b)) solo++;
      cfg.onProgress && cfg.onProgress("searching", (b.idx + 1) / balls.length);
    }

    let best = null;
    for (let round = 0; round < cfg.rounds; round++) {
      const res = simulate(bins, balls, cfg);
      const failed = balls.filter((b) => b.mode !== "held");
      const As = balls.filter((b) => b.A != null).map((b) => b.A);
      const spread = As.length ? Math.max(...As) - Math.min(...As) : 0;
      const score = failed.length;
      if (!best || score < best.score) best = { score, spread, failed: failed.length, round, res, snap: balls.map((b) => ({ ...b })) };
      if (!failed.length) break;
      // whoever got knocked off course searches again, this time steering clear of
      // everyone else's recorded path so nobody else changes in the next run
      const kinFor = (b) => balls.filter((o) => o !== b && o.mode === "held").map((o) => ({ f0: o.f0, f1: o.f0 + o.path.length / 2 - 1, ay: o.apex.y, path: o.path }));
      for (const b of failed) if (!searchSolo(bins, cfg, b, kinFor(b))) searchSolo(bins, cfg, b);
      cfg.onProgress && cfg.onProgress("untangling", 1 - failed.length / balls.length);
    }

    return finish(cfg, bins, T, best.snap, best.res, best.failed, best.spread, best.round + 1, t0, solo);
  }

  function finish(cfg, bins, T, snap, res, failed, spread, rounds, t0, solo) {
    const okIds = new Set(snap.filter((b) => b.A != null).map((b) => b.id));
    const Tend = Math.max(...snap.map((b) => (b.A != null ? b.A : b.L + b.path.length / 2 / FPS)));
    return {
      bins: { T, bw: bins.bw }, Tend, fps: FPS, mode: cfg.mode, failed, spread, rounds,
      soloOk: solo, attempts: snap.reduce((s, b) => s + b.attempt, 0), ms: Date.now() - t0,
      balls: snap.map((b) => ({ id: b.id, bin: b.bin, mouth: b.mouth, v0: b.v0, ok: b.A != null, L: b.L, A: b.A ?? Tend, f0: b.f0, path: b.path,
        apex: b.apex || { x: b.path[b.path.length - 2], y: b.path[b.path.length - 1] } })),
      events: res.events.filter((e) => okIds.has(e.id)), ghosts: res.ghosts.filter((g) => okIds.has(g.id)), hits: res.hits,
    };
  }

  // The last bit of each replay (dropping into the bin and settling on the
  // stack) is ordinary forward physics with a padded, low-bounce bin. It's
  // recorded too, so the whole drop can be scrubbed back and forth.
  function settle(plan) {
    const bins = makeBins(plan.bins.T), TendF = Math.round(plan.Tend * FPS);
    const items = plan.balls.filter((b) => b.ok).map((b) => ({ b, Pland: TendF - b.f0, x: b.mouth.x, y: b.mouth.y, vx: -b.v0.x, vy: -b.v0.y, path: [] }));
    const startP = Math.min(...items.map((i) => i.Pland)), endP = Math.max(...items.map((i) => i.Pland)) + 2 * FPS;
    const active = [];
    for (let P = startP; P <= endP; P++) {
      for (const it of items) if (it.Pland === P) active.push(it);
      for (const a of active) a.path.push(a.x, a.y);
      for (let s = 0; s < SUB; s++) {
        for (const a of active) { a.vy += B.G * DT; a.vx *= 0.998; a.x += a.vx * DT; a.y += a.vy * DT; }
        for (let k = 0; k < 2; k++) {
          for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) collidePair(active[i], active[j], 0.25);
          for (const a of active) collideStatic(a, bins, 0.3);
        }
      }
    }
    for (const it of items) { it.b.settle = it.path; it.b.Pland = it.Pland; }
    plan.TendF = TendF;
    plan.endP = endP;
    return plan;
  }

  // ---------- event builders for the two nudge models ----------
  function eventsForA(person) {
    if (!person.A.nudged) return [];
    const far = Math.abs(person.A.ghostTeam - person.team);
    const row = Math.max(2, Math.min(6, 7 - far));
    return [{ kind: "nudgeA", y: B.rowY(row) + B.RS / 2, ghostBin: person.A.ghostTeam, dir: Math.sign(person.team - person.A.ghostTeam) }];
  }
  function eventsForB(person) {
    const out = [];
    person.B.qSplit.forEach((f, q) => {
      if (f < 0.5) return;
      const dir = person.answers[q] ? 1 : -1; // option B pulls right, option A pulls left
      out.push({ kind: "drift", q, dir, s: f, y: B.rowY(q) + 8, dx: dir * f * 260, dy: 0 });
      out.push({ kind: "nudgeB", q, dir, s: f, y: B.rowY(q + 1) - 4, dx: -dir * f * 300, dy: 0 });
    });
    return out;
  }

  const api = { Board: B, solve, settle, findCandidates, eventsForA, eventsForB, makeBins };
  if (typeof module !== "undefined") module.exports = api;
  root.Reverse = api;
})(typeof window !== "undefined" ? window : globalThis);

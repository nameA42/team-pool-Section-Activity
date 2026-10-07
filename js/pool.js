// The lobby: a swimming pool seen from above. Every student who finishes the
// survey cannonballs in and bobs around on a floatie. Fish swim underneath and
// scatter from splashes; a rubber duck drifts about and quacks when clicked
// (and when someone new jumps in). Independent of the presentation mode.
(function () {
  const W = 1200, H = 800;
  const PX = 70, PY = 70, PW = W - 140, PH = H - 140; // water rectangle
  const BALL_R = 14, TUBE_R = 22, BODY_R = 30;        // ball, floatie ring centreline, collision radius
  const FLOATIE = ["#ff5a5f", "#ffb400", "#ff7ad9", "#4fc3ff", "#7bd88f", "#ff8c42", "#b98cff"];
  const FISH = ["#ff8c42", "#ffd23f", "#ff6b9d", "#7ee8fa", "#c3a6ff", "#9cff8f"];

  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  // ---------- sound ----------
  let ac = null;
  function audio() {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function quackSound(times = 2) {
    const a = audio(); if (!a) return;
    for (let k = 0; k < times; k++) {
      const t0 = a.currentTime + k * 0.24, f0 = 470 - k * 25;
      const o1 = a.createOscillator(), o2 = a.createOscillator();
      o1.type = "sawtooth"; o2.type = "square";
      o1.frequency.setValueAtTime(f0, t0); o1.frequency.exponentialRampToValueAtTime(f0 * 0.62, t0 + 0.17);
      o2.frequency.setValueAtTime(f0 * 1.01, t0); o2.frequency.exponentialRampToValueAtTime(f0 * 0.6, t0 + 0.17);
      const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1250; bp.Q.value = 2.8;
      const nasal = a.createBiquadFilter(); nasal.type = "peaking"; nasal.frequency.value = 2600; nasal.gain.value = 9;
      const rasp = a.createGain(); rasp.gain.value = 0.65;
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 42; lg.gain.value = 0.35;
      lfo.connect(lg); lg.connect(rasp.gain);
      const env = a.createGain();
      env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(0.55, t0 + 0.02); env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      o1.connect(bp); o2.connect(bp); bp.connect(nasal); nasal.connect(rasp); rasp.connect(env); env.connect(a.destination);
      for (const o of [o1, o2, lfo]) { o.start(t0); o.stop(t0 + 0.22); }
    }
  }
  function splashSound(vol = 0.18) {
    const a = audio(); if (!a) return;
    const len = 0.45, buf = a.createBuffer(1, a.sampleRate * len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(2400, a.currentTime); f.frequency.exponentialRampToValueAtTime(500, a.currentTime + len);
    const g = a.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(a.destination); src.start();
  }

  function create(V, opts = {}) {
    const P = {
      sound: true, quackOnJoin: true, t: 0, balls: new Map(), fish: [], fx: [], drops: [], diving: null, qr: null,
      lastQuack: -10, nextAmbient: 30 + Math.random() * 30, joinText: "", count: 0,
    };
    const world = new Physics.World({ g: 0, substeps: 2 });
    world.ballRest = 0.55; world.wallRest = 0.6;
    world.addSeg(PX, PY, PX + PW, PY); world.addSeg(PX + PW, PY, PX + PW, PY + PH);
    world.addSeg(PX + PW, PY + PH, PX, PY + PH); world.addSeg(PX, PY + PH, PX, PY);
    // a gentle swirling current so everyone drifts around
    world.force = (b) => {
      const t = P.t;
      const ax = 14 * Math.sin(b.y / 150 + t * 0.21) + 8 * Math.sin(b.y / 61 - t * 0.37 + b.seed);
      const ay = 14 * Math.cos(b.x / 170 - t * 0.17) + 8 * Math.cos(b.x / 73 + t * 0.29 + b.seed);
      return { ax: ax - 0.45 * b.vx, ay: ay - 0.45 * b.vy };
    };
    const duck = { isDuck: true, r: 38, x: PX + PW * 0.78, y: PY + PH * 0.32, vx: 12, vy: 4, seed: 1.7, squash: 0, bubble: 0 };
    world.addBall(duck);
    for (let i = 0; i < 6; i++) P.fish.push({
      x: PX + 80 + Math.random() * (PW - 160), y: PY + 80 + Math.random() * (PH - 160), a: Math.random() * 7,
      sp: 45 + Math.random() * 35, len: 26 + Math.random() * 16, col: FISH[i % FISH.length], wig: Math.random() * 7, flee: 0,
    });

    function freeSpot() {
      let best = null, bestD = -1;
      for (let k = 0; k < 40; k++) {
        const x = PX + 60 + Math.random() * (PW - 120), y = PY + 60 + Math.random() * (PH - 120);
        let d = Math.hypot(x - duck.x, y - duck.y) - 30;
        for (const b of P.balls.values()) d = Math.min(d, Math.hypot(x - b.x, y - b.y));
        if (d > bestD) { bestD = d; best = [x, y]; }
      }
      return best;
    }

    function splash(x, y, big = true) {
      P.fx.push({ kind: "ripple", x, y, t: 0, life: 1.6, big });
      if (big) for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 140;
        P.drops.push({ x, y, z: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 160 + Math.random() * 160, t: 0 });
      }
      for (const f of P.fish) {
        const d = Math.hypot(f.x - x, f.y - y);
        if (d < 230) { f.a = Math.atan2(f.y - y, f.x - x); f.flee = 1.4; }
      }
    }

    function quack(times = 2) {
      duck.squash = 1; duck.bubble = 1.6; P.lastQuack = P.t;
      if (P.sound) quackSound(times);
    }

    // students: [{id, name, color, init}]. mode: "splash" (jump in) or "pop" (resurface quietly)
    P.sync = (students, mode = "splash") => {
      const ids = new Set(students.map((s) => s.id));
      for (const [id, b] of P.balls) if (!ids.has(id) && !b.leaving) { b.leaving = P.t; world.removeBall(b); }
      let delay = 0;
      for (const s of students) {
        const old = P.balls.get(s.id);
        if (old && !old.leaving) { old.name = s.name; continue; }
        const [x, y] = freeSpot();
        const b = { id: s.id, name: s.name, color: s.color, init: s.init, r: BODY_R, x, y, vx: 0, vy: 0, seed: (hash(s.id) % 1000) / 100,
          floatie: FLOATIE[hash(s.id + "f") % FLOATIE.length], born: P.t + delay, mode, landed: false, inWorld: false };
        P.balls.set(s.id, b);
        if (mode === "pop") delay += 0.04;
      }
      P.count = students.length;
    };

    // everyone dives out of sight, then cb()
    P.dive = (cb) => {
      let k = 0;
      for (const b of P.balls.values()) if (!b.leaving) { b.diveAt = P.t + 0.12 * k++ / Math.max(1, P.balls.size / 10); }
      P.diving = { done: P.t + 1.3 + 0.12 * k / Math.max(1, P.balls.size / 10), cb };
      if (P.sound) splashSound(0.25);
    };
    P.resurface = (students) => {
      for (const b of P.balls.values()) world.removeBall(b);
      P.balls.clear(); P.diving = null;
      P.sync(students, "pop");
      if (P.sound) splashSound(0.15);
    };
    P.quack = quack;
    P.setQR = (canvas, text) => {
      P.qr = canvas; P.joinText = text;
      if (canvas && !P.qrWall) { // keep floaties out from under the QR card
        const x = W - 150 - 36, y = H - 150 - 56;
        world.addSeg(x, y, PX + PW, y); world.addSeg(x, y, x, PY + PH);
        P.qrWall = true;
      }
    };

    P.click = (x, y) => {
      audio();
      if (Math.hypot(x - duck.x, y - duck.y) < 46) { quack(2); duck.vx += (Math.random() - 0.5) * 120; duck.vy += (Math.random() - 0.5) * 120; return; }
      for (const b of P.balls.values()) if (!b.leaving && Math.hypot(x - b.x, y - b.y) < BODY_R) {
        const a = Math.random() * 7; b.vx += Math.cos(a) * 160; b.vy += Math.sin(a) * 160; splash(b.x, b.y, false); return;
      }
      splash(x, y, false);
    };

    P.update = (dt) => {
      P.t += dt;
      for (const b of P.balls.values()) {
        if (b.leaving || b.inWorld || P.t < b.born) continue;
        const fallT = b.mode === "pop" ? 0.35 : 0.55;
        if (P.t >= b.born + fallT) {
          b.inWorld = true; b.landedAt = P.t; world.addBall(b);
          if (b.mode === "splash") {
            splash(b.x, b.y, true);
            if (P.sound) splashSound();
            if (P.quackOnJoin && P.t - P.lastQuack > 1.5) quack(1);
          } else splash(b.x, b.y, false);
        }
      }
      for (const [id, b] of P.balls) if (b.leaving && P.t - b.leaving > 1.2) P.balls.delete(id);
      if (P.diving && P.t >= P.diving.done) { const cb = P.diving.cb; P.diving.cb = null; if (cb) cb(); }
      world.step(dt);
      duck.squash = Math.max(0, duck.squash - dt * 3); duck.bubble = Math.max(0, duck.bubble - dt);
      if (P.t > P.nextAmbient) { if (!P.diving) quack(1); P.nextAmbient = P.t + 40 + Math.random() * 40; }
      for (const f of P.fish) {
        f.flee = Math.max(0, f.flee - dt);
        // wander, and turn back toward the middle near the walls
        f.a += (Math.sin(P.t * 0.7 + f.wig) * 0.6 + (Math.random() - 0.5) * 0.8) * dt;
        const m = 70;
        if (f.x < PX + m || f.x > PX + PW - m || f.y < PY + m || f.y > PY + PH - m) {
          const want = Math.atan2(PY + PH / 2 - f.y, PX + PW / 2 - f.x);
          let da = ((want - f.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          f.a += da * Math.min(1, dt * 2.5);
        }
        const sp = f.sp * (1 + 2.2 * f.flee);
        f.x += Math.cos(f.a) * sp * dt; f.y += Math.sin(f.a) * sp * dt;
        f.wig += dt * (6 + 10 * f.flee);
      }
      for (const d of P.drops) { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vz -= 900 * dt; d.z += d.vz * dt; }
      P.drops = P.drops.filter((d) => d.z > 0 || d.t < 0.05);
      P.fx.forEach((f) => (f.t += dt)); P.fx = P.fx.filter((f) => f.t < f.life);
    };

    P.draw = (ctx) => {
      V.size(W, H);
      // deck
      ctx.fillStyle = "#e9dfc7"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(120,100,70,0.12)"; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // coping and water
      ctx.fillStyle = "#fbf7ee"; ctx.beginPath(); ctx.roundRect(PX - 14, PY - 14, PW + 28, PH + 28, 26); ctx.fill();
      const wg = ctx.createLinearGradient(PX, PY, PX + PW, PY + PH);
      wg.addColorStop(0, "#38c9e0"); wg.addColorStop(1, "#1585b8");
      ctx.save(); ctx.beginPath(); ctx.roundRect(PX, PY, PW, PH, 16); ctx.clip();
      ctx.fillStyle = wg; ctx.fillRect(PX, PY, PW, PH);
      // floor tiles and lane lines
      ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1;
      for (let x = PX; x < PX + PW; x += 40) { ctx.beginPath(); ctx.moveTo(x, PY); ctx.lineTo(x, PY + PH); ctx.stroke(); }
      for (let y = PY; y < PY + PH; y += 40) { ctx.beginPath(); ctx.moveTo(PX, y); ctx.lineTo(PX + PW, y); ctx.stroke(); }
      ctx.strokeStyle = "rgba(10,40,90,0.35)"; ctx.lineWidth = 10;
      for (let k = 1; k < 4; k++) { const y = PY + (PH * k) / 4; ctx.beginPath(); ctx.moveTo(PX + 60, y); ctx.lineTo(PX + PW - 60, y); ctx.stroke(); }
      // fish (under the surface)
      for (const f of P.fish) drawFish(ctx, f);
      // caustics: shimmering net of light
      ctx.strokeStyle = "rgba(255,255,255,0.13)"; ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const y0 = PY + (i + 0.5) * (PH / 14);
        ctx.beginPath();
        for (let x = PX; x <= PX + PW; x += 24) { const y = y0 + 9 * Math.sin(x / 55 + P.t * 1.3 + i * 1.7) + 5 * Math.sin(x / 23 - P.t * 0.9 + i); x === PX ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      }
      for (let i = 0; i < 20; i++) {
        const x0 = PX + (i + 0.5) * (PW / 20);
        ctx.beginPath();
        for (let y = PY; y <= PY + PH; y += 24) { const x = x0 + 9 * Math.sin(y / 50 - P.t * 1.1 + i * 2.1) + 5 * Math.sin(y / 27 + P.t * 0.8 + i); y === PY ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // ripples
      for (const f of P.fx) {
        const k = f.t / f.life;
        for (let r = 0; r < (f.big ? 3 : 2); r++) {
          const kk = Math.max(0, k - r * 0.15);
          ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - kk)})`; ctx.lineWidth = 3 * (1 - kk) + 0.5;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, 10 + kk * (f.big ? 90 : 50), 8 + kk * (f.big ? 75 : 42), 0, 0, 7); ctx.stroke();
        }
      }
      // shadows on the pool floor
      ctx.fillStyle = "rgba(0,30,60,0.25)";
      for (const b of P.balls.values()) if (b.inWorld && !b.leaving && b.diveAt == null) { ctx.beginPath(); ctx.ellipse(b.x + 12, b.y + 16, BODY_R - 2, BODY_R - 6, 0, 0, 7); ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(duck.x + 12, duck.y + 18, 36, 24, 0, 0, 7); ctx.fill();
      ctx.restore();

      // ladder
      ctx.strokeStyle = "#b8c2cc"; ctx.lineWidth = 6; ctx.lineCap = "round";
      for (const dx of [0, 34]) { ctx.beginPath(); ctx.moveTo(PX + PW - 120 + dx, PY - 30); ctx.lineTo(PX + PW - 120 + dx, PY + 26); ctx.stroke(); }
      ctx.lineWidth = 4;
      for (const y of [PY + 4, PY + 18]) { ctx.beginPath(); ctx.moveTo(PX + PW - 120, y); ctx.lineTo(PX + PW - 86, y); ctx.stroke(); }

      // the floaters
      for (const b of P.balls.values()) drawFloater(ctx, b);
      drawDuck(ctx, duck);
      // splash droplets
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (const d of P.drops) { ctx.beginPath(); ctx.arc(d.x, d.y - d.z * 0.35, 3, 0, 7); ctx.fill(); }

      // deck text + join card
      ctx.fillStyle = "#6b5b3e"; ctx.font = "700 26px Fredoka, \"Segoe UI Emoji\", \"Apple Color Emoji\""; ctx.textAlign = "left";
      ctx.fillText(`🏊 ${P.count} in the pool`, PX, 48);
      if (P.joinText) { ctx.font = "600 20px Fredoka"; ctx.textAlign = "right"; ctx.fillText(`Join: ${P.joinText}`, PX + PW, 48); }
      if (P.qr) {
        const s = 150, x = W - s - 26, y = H - s - 46;
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(x - 10, y - 10, s + 20, s + 44, 14); ctx.fill();
        ctx.drawImage(P.qr, x, y, s, s);
        ctx.fillStyle = "#1c1600"; ctx.font = "700 16px Fredoka"; ctx.textAlign = "center"; ctx.fillText("Scan to join", x + s / 2, y + s + 24);
      }
      if (!P.count) {
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "700 34px Fredoka"; ctx.textAlign = "center";
        ctx.fillText("Waiting for swimmers…", W / 2, H / 2);
      }
    };

    function drawFloater(ctx, b) {
      let x = b.x, y = b.y, s = 1, alpha = 1;
      if (!b.inWorld && !b.leaving) {
        if (P.t < b.born) return;
        const fallT = b.mode === "pop" ? 0.35 : 0.55, u = Math.min(1, (P.t - b.born) / fallT);
        if (b.mode === "pop") { s = u; alpha = u; }
        else { s = 2.6 - 1.6 * u * u; alpha = Math.min(1, u * 3); y -= (1 - u) * 50; }
      }
      if (b.leaving) { const u = Math.min(1, (P.t - b.leaving) / 1); s = 1 - 0.6 * u; alpha = 1 - u; }
      if (b.diveAt != null && P.t >= b.diveAt) {
        const u = Math.min(1, (P.t - b.diveAt) / 0.5); s *= 1 - 0.7 * u; alpha *= 1 - u;
        if (!b.dove) { b.dove = true; splash(b.x, b.y, false); }
      }
      if (alpha <= 0.01) return;
      const bob = b.inWorld ? 1 + 0.03 * Math.sin(P.t * 2.2 + b.seed * 3) : 1;
      const born = b.landedAt != null ? Math.min(1, (P.t - b.landedAt) / 0.35) : 1;
      const inflate = born < 1 ? 0.4 + 0.6 * born + 0.15 * Math.sin(born * Math.PI) : 1; // floatie pops open on landing
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(s * bob, s * bob);
      if (V.hoverId === b.id) { ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.beginPath(); ctx.arc(0, 0, BODY_R + 9, 0, 7); ctx.fill(); }
      // inner tube: striped ring with a highlight
      ctx.save(); ctx.scale(inflate, inflate); ctx.rotate(P.t * 0.15 + b.seed);
      const segs = 8;
      for (let k = 0; k < segs; k++) {
        ctx.strokeStyle = k % 2 ? "#ffffff" : b.floatie; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.arc(0, 0, TUBE_R, (k / segs) * Math.PI * 2, ((k + 1) / segs) * Math.PI * 2 + 0.02); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, TUBE_R * inflate + 2, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
      // the student
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.arc(-4, -4, 5, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 11px Fredoka"; ctx.textAlign = "center"; ctx.fillText(b.init, 0, 4);
      ctx.restore();
      if (alpha > 0.5 && b.inWorld && !b.leaving) {
        ctx.globalAlpha = alpha;
        V.label(b.name, x, y + BODY_R + 12, "rgba(8,50,80,0.78)", "#fff", 13);
        ctx.globalAlpha = 1;
      }
    }

    function drawDuck(ctx, d) {
      const face = d.vx >= 0 ? 1 : -1, bob = Math.sin(P.t * 2) * 0.06, sq = d.squash;
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(bob); ctx.scale(face * (1 + 0.12 * sq), 1 - 0.14 * sq);
      ctx.fillStyle = "#f5c400";
      ctx.beginPath(); ctx.moveTo(-34, 2); ctx.lineTo(-46, -14); ctx.lineTo(-28, -6); ctx.fill(); // tail
      ctx.fillStyle = "#ffd60a"; ctx.beginPath(); ctx.ellipse(0, 6, 36, 25, 0, 0, 7); ctx.fill();   // body
      ctx.fillStyle = "#ffe35c"; ctx.beginPath(); ctx.ellipse(-6, 6, 18, 11, -0.2, 0, 7); ctx.fill(); // wing
      ctx.strokeStyle = "#e0b400"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(-6, 6, 18, 11, -0.2, 0, 7); ctx.stroke();
      ctx.fillStyle = "#ffd60a"; ctx.beginPath(); ctx.arc(18, -16, 18, 0, 7); ctx.fill();              // head
      ctx.fillStyle = "#ff8c1a"; ctx.beginPath(); ctx.ellipse(36, -12 + sq * 3, 12, 6 + sq * 3, 0.1, 0, 7); ctx.fill(); // beak
      ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(23, -21, 3.6, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(24.2, -22.2, 1.3, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,120,120,0.35)"; ctx.beginPath(); ctx.arc(15, -10, 4, 0, 7); ctx.fill();
      ctx.restore();
      if (d.bubble > 0) {
        ctx.globalAlpha = Math.min(1, d.bubble * 2);
        V.label("Quack!", d.x + 30, d.y - 58 - (1.6 - d.bubble) * 10, "#ffffff", "#c47a00", 18);
        ctx.globalAlpha = 1;
      }
    }

    function drawFish(ctx, f) {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.globalAlpha = 0.72;
      const L = f.len, w = Math.sin(f.wig) * 0.45;
      ctx.fillStyle = f.col;
      ctx.save(); ctx.translate(-L * 0.45, 0); ctx.rotate(w);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-L * 0.45, -L * 0.28); ctx.lineTo(-L * 0.45, L * 0.28); ctx.closePath(); ctx.fill(); // tail
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, 0, L * 0.55, L * 0.24, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.ellipse(L * 0.05, -L * 0.07, L * 0.3, L * 0.07, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#10233a"; ctx.beginPath(); ctx.arc(L * 0.32, -L * 0.06, 2.4, 0, 7); ctx.fill();
      ctx.restore();
    }

    return P;
  }

  window.Pool = { create, W, H };
})();

// Runs one presentation mode on a canvas: computes teams, owns the clock and
// the drawing helpers every mode shares (balls, labels, nudge hands), and
// reports each student's arrival so the presenter can publish their result.
// Modes register themselves on window.Modes (see js/modes/*.js).
window.Modes = window.Modes || {};

(function () {
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function create(cv, wrap, hooks = {}) {
    const ctx = cv.getContext("2d");
    const V = {
      W: 900, H: 900, ctx, t: 0, speed: 1, mode: null, modeKey: null, opts: {},
      arrived: new Set(), dropped: false, hoverId: null, teamOrder: null,
      COL: { nudge: css("--nudge"), split: css("--split"), a: css("--a"), b: css("--b"), accent: css("--accent"), muted: css("--muted"), text: css("--text"), good: css("--good") },
    };

    V.size = (W, H) => { if (V.W !== W || V.H !== H) { V.W = W; V.H = H; resize(); } };
    V.arrive = (id) => { if (!V.arrived.has(id)) { V.arrived.add(id); hooks.onArrive && hooks.onArrive(id); } };
    V.refresh = () => hooks.onRefresh && hooks.onRefresh();
    V.teamLabel = (ti) => (V.teamOrder ? V.teamOrder.indexOf(ti) : ti) + 1;
    V.nudged = (p) => !!(V.mode && V.mode.nudged(p, V));
    V.allArrived = () => !!V.match && V.arrived.size >= V.match.people.length;

    // students: [{id, name, answers, color, init}]
    V.start = (key, students, opts = {}) => {
      if (V.mode && V.mode.stop) V.mode.stop();
      const mode = window.Modes[key];
      V.mode = mode; V.modeKey = key; V.opts = opts;
      V.students = students; V.n = students.length; V.q = students[0].answers.length;
      V.match = Matcher.match(students, { seed: 7 });
      V.byId = {};
      V.match.people.forEach((p, i) => { V.byId[p.id] = Object.assign(p, { color: students[i].color, init: students[i].init }); });
      V.arrived = new Set(); V.teamOrder = null; V.t = 0; V.dropped = true; V.hoverId = null;
      mode.reset(V);
      mode.drop(V);
    };
    V.stop = () => { if (V.mode && V.mode.stop) V.mode.stop(); V.mode = null; V.modeKey = null; V.dropped = false; };

    // ---- drawing helpers ----
    V.bg = () => {
      const g = ctx.createLinearGradient(0, 0, 0, V.H);
      g.addColorStop(0, "#1b1e3d"); g.addColorStop(1, "#14163a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
    };
    V.ball = (p, x, y, R, o = {}) => {
      if (o.ghost) {
        ctx.globalAlpha = o.alpha ?? 0.6;
        ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = p.color; ctx.font = `700 ${Math.round(R * 0.8)}px Fredoka`; ctx.textAlign = "center"; ctx.fillText(p.init, x, y + R * 0.3);
        ctx.globalAlpha = 1;
        return;
      }
      if (o.shadow) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x + 4, y + 6, R, R * 0.8, 0, 0, 7); ctx.fill(); }
      if (V.hoverId === p.id) { ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.arc(x, y, R + 8, 0, 7); ctx.fill(); }
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.beginPath(); ctx.arc(x - R * 0.33, y - R * 0.33, R * 0.4, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.round(R * 0.8)}px Fredoka`; ctx.textAlign = "center"; ctx.fillText(p.init, x, y + R * 0.3);
    };
    V.label = (text, x, y, bg, fg, size = 13) => {
      ctx.font = `600 ${size}px Fredoka`;
      const w = ctx.measureText(text).width + 12, h = size + 8;
      const lx = Math.max(w / 2 + 2, Math.min(V.W - w / 2 - 2, x));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(lx - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
      ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.fillText(text, lx, y + size * 0.36);
    };
    // a pointing hand pushing toward angle `ang`; `k` in 0..1 is the effect's age
    V.hand = (x, y, ang, k, text, R = 12) => {
      const a = Math.min(1, (1 - k) * 2.5);
      ctx.globalAlpha = a;
      const slide = Math.min(1, k / 0.15), d = 46 - 20 * slide;
      ctx.save(); ctx.translate(x - Math.cos(ang) * d, y - Math.sin(ang) * d); ctx.rotate(ang);
      ctx.font = `30px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("👉", 0, 0); ctx.restore(); ctx.textBaseline = "alphabetic";
      ctx.strokeStyle = V.COL.nudge; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R + 6 + k * 10, 0, 7); ctx.stroke();
      if (text) V.label(text, x, y - R - 30 - k * 12, V.COL.nudge, "#1c1000", 14);
      ctx.globalAlpha = 1;
    };
    V.banner = (text, a = 1) => { ctx.globalAlpha = a; V.label(text, V.W / 2, 34, "rgba(255,204,51,0.95)", "#1c1600", 18); ctx.globalAlpha = 1; };

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const s = Math.min((wrap.clientWidth - 20) / V.W, (wrap.clientHeight - 20) / V.H) || 0.5;
      cv.style.width = V.W * s + "px"; cv.style.height = V.H * s + "px";
      cv.width = Math.round(V.W * s * dpr); cv.height = Math.round(V.H * s * dpr);
      ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
      V.scale = s;
    }
    V.resize = resize;
    window.addEventListener("resize", resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);

    const toLogical = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / V.scale, (e.clientY - r.top) / V.scale]; };
    cv.addEventListener("click", (e) => hooks.onClick && hooks.onClick(...toLogical(e)));
    cv.addEventListener("mousemove", (e) => hooks.onMove && hooks.onMove(...toLogical(e)));

    // advance by `secs` in small steps (also handy from the console: APP.V.tick(5))
    V.tick = (secs) => {
      for (let left = secs; left > 1e-9; left -= 1 / 60) {
        const dt = Math.min(1 / 60, left);
        if (V.mode) { V.t += dt; V.mode.update(V, dt); } else if (hooks.idle) hooks.idle(dt);
      }
      ctx.clearRect(0, 0, V.W, V.H);
      if (V.mode) V.mode.draw(V, ctx); else if (hooks.idleDraw) hooks.idleDraw(ctx);
    };
    let last = performance.now();
    function loop(now) {
      V.tick(Math.min(0.05, (now - last) / 1000) * (V.mode ? V.speed : 1)); last = now;
      requestAnimationFrame(loop);
    }
    resize();
    requestAnimationFrame(loop);
    return V;
  }

  window.Engine = { create };
})();

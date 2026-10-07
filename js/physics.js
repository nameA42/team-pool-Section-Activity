// Tiny 2D circle physics: balls bounce off pegs (static circles), walls
// (segments) and each other. Small enough to tune by hand, which matters
// because the drop steers balls with gentle forces instead of scripting them.
(function () {
  class World {
    constructor(opts = {}) {
      this.g = opts.g ?? 1500;
      this.sub = opts.substeps ?? 6;
      this.iters = 2;
      this.balls = [];
      this.pegs = [];
      this.segs = [];
      this.force = null; // (ball, dt) => {ax, ay}
      this.ballRest = 0.25;
      this.pegRest = 0.5;
      this.wallRest = 0.3;
      this.maxV = 1300;
      this.onPegHit = null;
    }
    addBall(b) { b.vx ??= 0; b.vy ??= 0; this.balls.push(b); return b; }
    addPeg(x, y, r, tag) { const p = { x, y, r, tag, flash: 0 }; this.pegs.push(p); return p; }
    addSeg(x1, y1, x2, y2, tag) { const s = { x1, y1, x2, y2, tag, on: true }; this.segs.push(s); return s; }
    removeBall(b) { this.balls = this.balls.filter((x) => x !== b); }

    step(dt) {
      const h = dt / this.sub;
      for (let s = 0; s < this.sub; s++) this.substep(h);
    }

    substep(h) {
      for (const b of this.balls) {
        let ax = 0, ay = this.g;
        if (this.force) { const f = this.force(b, h); if (f) { ax += f.ax || 0; ay += f.ay || 0; } }
        b.vx += ax * h; b.vy += ay * h;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > this.maxV) { b.vx *= this.maxV / sp; b.vy *= this.maxV / sp; }
        b.x += b.vx * h; b.y += b.vy * h;
      }
      for (let it = 0; it < this.iters; it++) {
        const bs = this.balls;
        for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) this.ballBall(bs[i], bs[j]);
        for (const b of bs) {
          for (const p of this.pegs) {
            const dy = b.y - p.y;
            if (dy > b.r + p.r || dy < -b.r - p.r) continue;
            const dx = b.x - p.x, rr = b.r + p.r, d2 = dx * dx + dy * dy;
            if (d2 < rr * rr && d2 > 1e-6) {
              const d = Math.sqrt(d2);
              if (this.resolve(b, dx / d, dy / d, rr - d, this.pegRest, 0.05) && this.onPegHit) this.onPegHit(p, b);
            }
          }
          for (const s of this.segs) if (s.on) this.ballSeg(b, s);
        }
      }
    }

    // Push the ball out along normal (nx, ny) and bounce its velocity.
    resolve(b, nx, ny, pen, rest, fric) {
      b.x += nx * pen; b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn >= 0) return false;
      b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny;
      const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
      b.vx -= vt * fric * tx; b.vy -= vt * fric * ty;
      return vn < -60;
    }

    ballSeg(b, s) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const len2 = dx * dx + dy * dy;
      let t = ((b.x - s.x1) * dx + (b.y - s.y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = s.x1 + dx * t, cy = s.y1 + dy * t;
      const ex = b.x - cx, ey = b.y - cy, d2 = ex * ex + ey * ey;
      if (d2 >= b.r * b.r) return;
      let d = Math.sqrt(d2), nx, ny;
      if (d < 1e-6) { const l = Math.sqrt(len2); nx = -dy / l; ny = dx / l; d = 0; }
      else { nx = ex / d; ny = ey / d; }
      this.resolve(b, nx, ny, b.r - d, this.wallRest, 0.08);
    }

    ballBall(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) return;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) return;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = rr - d;
      a.x -= nx * pen / 2; a.y -= ny * pen / 2;
      b.x += nx * pen / 2; b.y += ny * pen / 2;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) return;
      const j = (-(1 + this.ballRest) * vn) / 2;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
    }
  }

  window.Physics = { World };
})();

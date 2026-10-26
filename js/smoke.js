/* =========================================================
   Button smoke — soft, realistic smoke that drifts out from
   behind every edge of a .btn for as long as the mouse is on it.

   One fixed canvas for the whole page. The hovered button's own
   rectangle is clipped out of every frame, so the smoke always
   appears to come from behind the button. Particles are stored
   relative to their button, so the smoke follows it on scroll.
   Off for touch-only devices and for reduced motion.
   ========================================================= */
(() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- tuning ---------- */
  const EMIT_PER_SEC = 58;        // for a ~160 x 40 button; scales with perimeter
  const MAX_PARTICLES = 190;
  const LIFE = [1.5, 2.7];        // seconds
  const START_SIZE = [22, 36];    // px
  const GROWTH = [60, 110];       // px gained over a lifetime
  const PEAK_ALPHA = [0.34, 0.56];
  const SPRITES = 6;
  const SPRITE_PX = 128;

  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let sprites = null;
  let rafId = 0;
  let last = 0;

  const particles = [];
  const active = new Map();   // button -> { emitting, carry }

  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- smoke textures: fractal value noise in a soft falloff ---------- */
  function makeNoise(size, cells, seed) {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const grid = [];
    for (let i = 0; i <= cells; i++) { grid[i] = []; for (let j = 0; j <= cells; j++) grid[i][j] = rnd(); }
    for (let i = 0; i <= cells; i++) { grid[i][cells] = grid[i][0]; grid[cells][i] = grid[0][i]; }
    const smooth = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const gx = (x / size) * cells, gy = (y / size) * cells;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const tx = smooth(gx - x0), ty = smooth(gy - y0);
      const a = grid[x0][y0], b = grid[x0 + 1][y0], c = grid[x0][y0 + 1], d = grid[x0 + 1][y0 + 1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
  }

  function buildSprites() {
    const list = [];
    for (let k = 0; k < SPRITES; k++) {
      const c = document.createElement('canvas');
      c.width = c.height = SPRITE_PX;
      const g = c.getContext('2d');
      const img = g.createImageData(SPRITE_PX, SPRITE_PX);
      const octaves = [makeNoise(SPRITE_PX, 3, 11 + k * 97), makeNoise(SPRITE_PX, 6, 23 + k * 131),
                       makeNoise(SPRITE_PX, 12, 37 + k * 173), makeNoise(SPRITE_PX, 24, 53 + k * 197)];
      const weights = [0.5, 0.27, 0.15, 0.08];
      // mostly pale grey smoke; a few puffs carry a faint warm gold cast
      const warm = k % 3 === 2;
      const [r, gr, b] = warm ? [248, 228, 182] : [232, 234, 228];
      const half = SPRITE_PX / 2;
      for (let y = 0; y < SPRITE_PX; y++) {
        for (let x = 0; x < SPRITE_PX; x++) {
          let n = 0;
          for (let o = 0; o < octaves.length; o++) n += octaves[o](x, y) * weights[o];
          const dx = (x - half) / half, dy = (y - half) / half;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const fall = Math.max(0, 1 - dist);
          const soft = fall * fall * (3 - 2 * fall);            // smooth edge
          const wisp = Math.max(0, (n - 0.32) / 0.68);           // breaks the puff into wisps
          const a = soft * Math.pow(wisp, 1.35);
          const i = (y * SPRITE_PX + x) * 4;
          img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b;
          img.data[i + 3] = Math.round(Math.min(1, a * 2.1) * 255);
        }
      }
      g.putImageData(img, 0, 0);
      list.push(c);
    }
    return list;
  }
  // the same puffs in warm charcoal, for buttons that sit on light paper
  function tint(list, color) {
    return list.map((src) => {
      const c = document.createElement('canvas');
      c.width = c.height = SPRITE_PX;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
      return c;
    });
  }
  let darkSprites = null;

  /* ---------- canvas ---------- */
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'btn-smoke';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    sprites = buildSprites();
    darkSprites = tint(sprites, 'rgb(92, 78, 60)');
    resize();
    window.addEventListener('resize', resize, { passive: true });
    // the scrollbar comes and goes when a dialog locks the page; re-measure then too
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(document.documentElement);
  }

  // size the canvas to the area it is actually displayed in (the viewport
  // without any scrollbar), so drawing coordinates match the page exactly
  let vw = 0, vh = 0;
  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    vw = document.documentElement.clientWidth || window.innerWidth;
    vh = document.documentElement.clientHeight || window.innerHeight;
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
  }

  /* ---------- particles ---------- */
  function emit(btn, rect) {
    const w = rect.width, h = rect.height;
    const per = 2 * (w + h);
    // choose a point on the perimeter, uniformly by length
    let t = Math.random() * per;
    let x, y, nx, ny;
    if (t < w) { x = t; y = 0; nx = 0; ny = -1; }
    else if ((t -= w) < h) { x = w; y = t; nx = 1; ny = 0; }
    else if ((t -= h) < w) { x = w - t; y = h; nx = 0; ny = 1; }
    else { t -= w; x = 0; y = h - t; nx = -1; ny = 0; }

    const out = rand(16, 42);
    const life = rand(LIFE[0], LIFE[1]);
    particles.push({
      btn,
      // start just inside the edge so it emerges from behind the button
      x: x - nx * rand(2, 8),
      y: y - ny * rand(2, 8),
      vx: nx * out + rand(-6, 6),
      vy: ny * out - rand(8, 18),         // smoke always drifts a little upward
      size: rand(START_SIZE[0], START_SIZE[1]),
      grow: rand(GROWTH[0], GROWTH[1]),
      rot: Math.random() * Math.PI * 2,
      spin: rand(-0.7, 0.7),
      peak: rand(PEAK_ALPHA[0], PEAK_ALPHA[1]),
      sprite: (btn.closest('.paper') ? darkSprites : sprites)[(Math.random() * sprites.length) | 0],
      seed: Math.random() * 100,
      age: 0,
      life
    });
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;

    // the visible viewport can change without a resize event (scrollbar shown or hidden)
    const cw = document.documentElement.clientWidth || window.innerWidth;
    const ch = document.documentElement.clientHeight || window.innerHeight;
    if (cw !== vw || ch !== vh) resize();
    // rects of buttons that still own smoke
    const rects = new Map();
    for (const [btn, state] of active) {
      const r = btn.getBoundingClientRect();
      if (!btn.isConnected || r.width === 0) { active.delete(btn); continue; }
      rects.set(btn, r);
      if (state.emitting) {
        const perimeterScale = (2 * (r.width + r.height)) / 400;
        state.carry += EMIT_PER_SEC * Math.max(0.35, perimeterScale) * dt;
        while (state.carry >= 1 && particles.length < MAX_PARTICLES) { emit(btn, r); state.carry -= 1; }
        if (particles.length >= MAX_PARTICLES) state.carry = 0;
      }
    }

    // update
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life || !rects.has(p.btn)) { particles.splice(i, 1); continue; }
      const k = p.age / p.life;
      // gentle curling turbulence + slow buoyancy + air drag
      p.vx += Math.sin(p.seed + p.age * 2.1) * 14 * dt;
      p.vy += (Math.cos(p.seed * 1.7 + p.age * 1.6) * 8 - 10) * dt;
      p.vx *= 1 - 0.9 * dt;
      p.vy *= 1 - 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt * (1 - k * 0.5);
    }

    // draw
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    // clip the buttons out, so the smoke sits behind them
    ctx.beginPath();
    ctx.rect(-50, -50, vw + 100, vh + 100);
    // cut the buttons out, with a hair of margin so no smoke ever lands on their edge
    for (const r of rects.values()) ctx.rect(r.left - 1, r.top - 1, r.width + 2, r.height + 2);
    ctx.clip('evenodd');

    for (const p of particles) {
      const r = rects.get(p.btn);
      const k = p.age / p.life;
      // fade in fast, linger, fade out slowly
      const alpha = p.peak * Math.min(1, k / 0.14) * Math.pow(1 - k, 1.6);
      if (alpha <= 0.003) continue;
      const size = p.size + p.grow * (1 - Math.pow(1 - k, 2));
      const cos = Math.cos(p.rot) * dpr, sin = Math.sin(p.rot) * dpr;
      ctx.globalAlpha = alpha;
      ctx.setTransform(cos, sin, -sin, cos, (r.left + p.x) * dpr, (r.top + p.y) * dpr);
      ctx.drawImage(p.sprite, -size / 2, -size / 2, size, size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // stop the loop when nothing is left to draw
    for (const [btn, state] of active) {
      if (!state.emitting && !particles.some((p) => p.btn === btn)) active.delete(btn);
    }
    if (active.size || particles.length) {
      rafId = requestAnimationFrame(frame);
    } else {
      rafId = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function start(btn) {
    if (reduced.matches) return;
    if (btn.disabled || btn.closest('dialog')) return;   // dialogs sit above the page layer
    ensureCanvas();
    const state = active.get(btn) || { emitting: false, carry: 0 };
    state.emitting = true;
    state.carry = Math.max(state.carry, 6);              // a first puff right away
    active.set(btn, state);
    if (!rafId) { last = performance.now(); rafId = requestAnimationFrame(frame); }
  }

  function stop(btn) {
    const state = active.get(btn);
    if (state) state.emitting = false;                    // existing smoke drifts away and fades
  }

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const btn = e.target.closest && e.target.closest('.btn');
    if (btn && !(e.relatedTarget && btn.contains(e.relatedTarget))) start(btn);
  });
  document.addEventListener('pointerout', (e) => {
    const btn = e.target.closest && e.target.closest('.btn');
    if (btn && !(e.relatedTarget && btn.contains(e.relatedTarget))) stop(btn);
  });
  window.addEventListener('blur', () => { for (const btn of active.keys()) stop(btn); });
  reduced.addEventListener('change', () => { if (reduced.matches) for (const btn of active.keys()) stop(btn); });
})();

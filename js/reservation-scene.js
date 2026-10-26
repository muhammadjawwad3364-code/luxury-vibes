/* =========================================================
   Luxury Vibes — 3D guests in the dining room (Three.js r149)

   A transparent WebGL layer sits exactly over the dining-room
   photo. The camera is orthographic and looks straight down, like
   the photo, so a floor point at image pixel (u, v) is world
   (x = u, z = v), and a standing guest's head is directly above
   their feet. Invisible table tops (depth only) hide whatever is
   under a table (legs, laps), never arms resting on it.

   Guests are stylised, cartoon-realistic young adults built from
   rounded meshes and animated with procedural joints: walk cycle,
   turning, sitting, conversation (head turns, nods, laughs, hand
   gestures, blinking, posture shifts, looking up at the camera),
   standing up and leaving. Paths come from A* on a walkability
   grid built from the tables, chairs and walls, padded by the
   guests' shoulder width, so nobody walks through furniture.
   ========================================================= */
(() => {
  'use strict';
  const THREE = window.THREE;
  const LV = window.LV;
  if (!THREE || !LV) return;
  // treat every colour below as sRGB (as designers pick them), so navy stays navy and maroon stays maroon
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  const { ROOM, TABLES, ReservationService: Svc } = LV;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const W = ROOM.width, H = ROOM.height, PPM = ROOM.pxPerMeter;
  // Guests are sized to this room: shoulders about the width of a chair,
  // narrow enough to pass between the tables without touching them.
  const S = PPM * 0.8;                  // person scale (model metres -> room pixels)
  const OCC_H = 0.6 * S;                // table occluder: above knees and laps, below elbows and hands
  const SEAT_H = 0.47;                  // seat height in model metres
  const WALK_SPEED = 1.2 * S;           // px per second
  const STRIDE = 1.3 * S;               // px per full gait cycle
  const ARRIVAL_GAP = 1.35;             // seconds between guests entering
  const PERSON_R = 0.25 * S;            // half shoulder width incl. arms, in room px (≈30)

  /* =========================================================
     Walkability grids + A*
     A normal grid padded by the guests' full shoulder width, and a
     tighter "squeeze" grid used only for seats boxed in by the
     window or other chairs (where real guests squeeze past too).
     ========================================================= */
  const CELL = 6;
  const COLS = Math.ceil(W / CELL), ROWS = Math.ceil(H / CELL);
  const BODY_R = Math.round(PERSON_R) + 2;   // walk with a little air around the shoulders
  const SQUEEZE_R = 20;
  const CHAIR_R = 28;
  const idx = (c, r) => r * COLS + c;
  const cellOf = (x, y) => [Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL))), Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL)))];
  const centerOf = (c, r) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 });
  const inRect = (x, y, x0, y0, x1, y1, pad) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
  const inTable = (t, x, y, pad) => t.shape === 'circle'
    ? Math.hypot(x - t.cx, y - t.cy) <= t.r + pad
    : inRect(x, y, t.x, t.y, t.x + t.w, t.y + t.h, pad);
  function tableDistance(t, x, y) {
    if (t.shape === 'circle') return Math.hypot(x - t.cx, y - t.cy) - t.r;
    const dx = Math.max(t.x - x, 0, x - (t.x + t.w)), dy = Math.max(t.y - y, 0, y - (t.y + t.h));
    if (dx || dy) return Math.hypot(dx, dy);
    return -Math.min(x - t.x, t.x + t.w - x, y - t.y, t.y + t.h - y);
  }

  function makeGrid(bodyR) {
    const blocked = new Uint8Array(COLS * ROWS);
    const markWhere = (test) => {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const p = centerOf(c, r);
        if (test(p.x, p.y)) blocked[idx(c, r)] = 1;
      }
    };
    ROOM.blocked.forEach(([x0, y0, x1, y1]) => markWhere((x, y) => inRect(x, y, x0, y0, x1, y1, bodyR * 0.6)));
    TABLES.forEach((t) => {
      markWhere((x, y) => inTable(t, x, y, bodyR + 6));
      t.seats.forEach(([sx, sy]) => markWhere((x, y) => Math.hypot(x - sx, y - sy) <= CHAIR_R + bodyR * 0.78));
    });
    const isFree = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const [c, r] = cellOf(x, y);
      return !blocked[idx(c, r)];
    };
    // every cell reachable from the doorway
    const reach = new Uint8Array(COLS * ROWS);
    const [sc0, sr0] = cellOf(ROOM.entranceInside.x, ROOM.entranceInside.y);
    const q = [idx(sc0, sr0)]; reach[q[0]] = 1;
    while (q.length) {
      const cur = q.pop();
      const cc = cur % COLS, cr = (cur / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = cc + dx, nr = cr + dy;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const ni = idx(nc, nr);
        if (blocked[ni] || reach[ni]) continue;
        reach[ni] = 1; q.push(ni);
      }
    }
    const isReachable = (x, y) => { const [c, r] = cellOf(x, y); return isFree(x, y) && !!reach[idx(c, r)]; };
    const lineFree = (a, b, step = 3) => {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(d / step));
      for (let i = 0; i <= n; i++) { const t = i / n; if (!isFree(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false; }
      return true;
    };
    function astar(from, to) {
      const [sc, sr] = cellOf(from.x, from.y), [ec, er] = cellOf(to.x, to.y);
      const start = idx(sc, sr), goal = idx(ec, er);
      const g = new Float32Array(COLS * ROWS).fill(Infinity);
      const came = new Int32Array(COLS * ROWS).fill(-1);
      const closed = new Uint8Array(COLS * ROWS);
      const heap = [];
      const push = (i, f) => { heap.push([f, i]); let j = heap.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
      const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let m = j; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return top; };
      const h = (c, r) => { const dx = Math.abs(c - ec), dy = Math.abs(r - er); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
      g[start] = 0; push(start, h(sc, sr));
      while (heap.length) {
        const [, cur] = pop();
        if (cur === goal) break;
        if (closed[cur]) continue;
        closed[cur] = 1;
        const cc = cur % COLS, cr = (cur / COLS) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nc = cc + dx, nr = cr + dy;
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
          const ni = idx(nc, nr);
          if (blocked[ni] && ni !== goal) continue;
          if (dx && dy && (blocked[idx(cc + dx, cr)] || blocked[idx(cc, cr + dy)])) continue;  // no corner cutting
          const cost = g[cur] + (dx && dy ? Math.SQRT2 : 1);
          if (cost < g[ni]) { g[ni] = cost; came[ni] = cur; push(ni, cost + h(nc, nr)); }
        }
      }
      if (came[goal] === -1 && goal !== start) return null;
      const cells = [];
      for (let i = goal; i !== -1; i = came[i]) { cells.push(centerOf(i % COLS, (i / COLS) | 0)); if (i === start) break; }
      cells.reverse();
      cells[0] = { x: from.x, y: from.y };
      cells[cells.length - 1] = { x: to.x, y: to.y };
      // string-pull: keep only the corners we need
      const out = [cells[0]];
      let i = 0;
      while (i < cells.length - 1) {
        let j = cells.length - 1;
        while (j > i + 1 && !lineFree(cells[i], cells[j])) j--;
        out.push(cells[j]);
        i = j;
      }
      return smoothPath(out, lineFree);
    }
    return { isFree, isReachable, lineFree, astar, bodyR };
  }
  // round the corners where there is room, so turns look natural
  function smoothPath(p, lineFree) {
    if (p.length < 3) return p;
    const out = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1], b = p[i], c = p[i + 1];
      const la = Math.hypot(b.x - a.x, b.y - a.y), lc = Math.hypot(c.x - b.x, c.y - b.y);
      const r = Math.min(30, la * 0.35, lc * 0.35);
      if (!(r > 1)) { out.push(b); continue; }
      const q1 = { x: b.x + ((a.x - b.x) / la) * r, y: b.y + ((a.y - b.y) / la) * r };
      const q2 = { x: b.x + ((c.x - b.x) / lc) * r, y: b.y + ((c.y - b.y) / lc) * r };
      const mid = { x: ((q1.x + q2.x) / 2 + b.x) / 2, y: ((q1.y + q2.y) / 2 + b.y) / 2 };
      if (lineFree(q1, mid) && lineFree(mid, q2)) out.push(q1, mid, q2); else out.push(b);
    }
    out.push(p[p.length - 1]);
    return out;
  }
  const GRID = makeGrid(BODY_R);
  const SQUEEZE = makeGrid(SQUEEZE_R);

  function nearestTablePoint(t, x, y) {
    if (t.shape === 'circle') { const a = Math.atan2(y - t.cy, x - t.cx); return { x: t.cx + Math.cos(a) * t.r, y: t.cy + Math.sin(a) * t.r }; }
    return { x: Math.max(t.x, Math.min(t.x + t.w, x)), y: Math.max(t.y, Math.min(t.y + t.h, y)) };
  }
  // the last step onto the chair stays clear of table tops; it may pass empty chairs of the same table only if allowed
  function stepCheck(a, b, table, seatIndex, allowOwnChairs) {
    const n = 24;
    const passes = new Set();
    for (let i = 0; i <= n; i++) {
      const x = a.x + (b.x - a.x) * (i / n), y = a.y + (b.y - a.y) * (i / n);
      for (const t of TABLES) if (tableDistance(t, x, y) < 12) return null;
      for (const t of TABLES) {
        for (let j = 0; j < t.seats.length; j++) {
          if (t === table && j === seatIndex) continue;
          if (Math.hypot(x - t.seats[j][0], y - t.seats[j][1]) < CHAIR_R + 10) {
            if (allowOwnChairs && t === table) passes.add(j); else return null;
          }
        }
      }
    }
    return [...passes];
  }
  // a reachable floor spot next to a chair, from which a guest can step straight onto it
  function seatApproach(t, si) {
    const [sx, sy] = t.seats[si];
    const nearest = nearestTablePoint(t, sx, sy);
    const away = Math.atan2(sy - nearest.y, sx - nearest.x);
    const tries = [[GRID, false], [SQUEEZE, false], [SQUEEZE, true]];
    for (const [grid, lenient] of tries) {
      for (let dist = 54; dist <= 200; dist += 8) {
        for (let a = 0; a < 48; a++) {
          const ang = away + ((a % 2 ? 1 : -1) * Math.ceil(a / 2) * Math.PI) / 24;
          const p = { x: sx + Math.cos(ang) * dist, y: sy + Math.sin(ang) * dist };
          if (!grid.isReachable(p.x, p.y)) continue;
          const passes = stepCheck(p, { x: sx, y: sy }, t, si, lenient);
          if (!passes) continue;
          return { point: p, grid, passes };
        }
      }
    }
    return { point: null, grid: GRID, passes: [] };
  }

  // every seat: where the guest steps in from, where they sit, which way they face
  const SEATS = new Map();
  TABLES.forEach((t) => {
    SEATS.set(t.id, t.seats.map(([sx, sy], si) => {
      const near = nearestTablePoint(t, sx, sy);
      const facing = Math.atan2(near.x - sx, near.y - sy);      // yaw (+Z = image down)
      const back = 6;                                            // sit slightly back on the chair
      const len = Math.hypot(near.x - sx, near.y - sy) || 1;
      const ap = seatApproach(t, si);
      return {
        index: si, approach: ap.point, grid: ap.grid, passes: ap.passes,
        sit: { x: sx - ((near.x - sx) / len) * back, y: sy - ((near.y - sy) / len) * back }, facing
      };
    }));
  });
  const isFree = GRID.isFree;
  const astar = GRID.astar;

  /* =========================================================
     Characters
     ========================================================= */
  const SKIN = [0xf3cdb0, 0xeebf9c, 0xe3ad88, 0xd29a74, 0xc08562];
  const HAIR_M = [0x24170e, 0x2e1d11, 0x3a2414, 0x1c130d];
  const HAIR_F = [0x3a2414, 0x4b2d18, 0x5e3a1f, 0x2e1c10, 0x6b4325];
  const SUITS = [
    { name: 'navy',    jacket: 0x1b2747, trousers: 0x18223d, shirt: 0x1d2a4c, tie: null,     square: 0xd9b25e },
    { name: 'black',   jacket: 0x141414, trousers: 0x111111, shirt: 0x1a1a1a, tie: null,     square: null },
    { name: 'brown',   jacket: 0x5b3a22, trousers: 0x42291a, shirt: 0xe8dfcf, tie: 0x0f4a29, square: null },
    { name: 'emerald', jacket: 0x0f4a2e, trousers: 0x0b321f, shirt: 0x161616, tie: 0xc9a24f, square: 0xc9a24f }
  ];
  const DRESSES = [
    { name: 'maroon', body: 0x7a1428, trim: 0xd2a24c, legs: 0x5e0f1f, dupatta: null },
    { name: 'ivory',  body: 0xf1ebdf, trim: 0xd9c8a0, legs: 0xe6dccb, dupatta: 0xf7f2e8 },
    { name: 'red',    body: 0xa8172a, trim: 0xe0b45c, legs: 0x7d1020, dupatta: null },
    { name: 'wine',   body: 0x5c1230, trim: 0xd6a75a, legs: 0x440c22, dupatta: 0xd6a75a },
    { name: 'emerald', body: 0x0f5a36, trim: 0xe0b45c, legs: 0x0b3d25, dupatta: null }
  ];

  let seedState = 1;
  let ORDER = 0;                         // who started walking first (right of way)
  const rnd = () => ((seedState = (seedState * 16807) % 2147483647) / 2147483647);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const GEO = {};
  const geo = (key, make) => GEO[key] || (GEO[key] = make());
  const sphere = (r, ws = 22, hs = 16) => geo(`s${r}_${ws}_${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  const capsule = (r, l) => geo(`c${r}_${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
  const cyl = (rt, rb, h, s = 20) => geo(`y${rt}_${rb}_${h}_${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
  const box = (x, y, z) => geo(`b${x}_${y}_${z}`, () => new THREE.BoxGeometry(x, y, z));

  const SHADOW_TEX = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.6)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.28)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  // wavy hair strands: stripes run pole to pole on the sphere UVs, so seen from above
  // they fan out from the crown like real hair; the waves catch the warm light
  const HAIR_TEX = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 512, 256);
    let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 520; i++) {
      const x0 = r() * 512, amp = 3 + r() * 7, freq = 2 + r() * 3, ph = r() * 6.28;
      const light = r();
      g.strokeStyle = light > 0.84 ? `rgba(255,232,200,${0.16 + r() * 0.2})` : `rgba(0,0,0,${0.22 + r() * 0.3})`;
      g.lineWidth = 0.8 + r() * 2.2;
      g.beginPath();
      for (let y = 0; y <= 256; y += 6) {
        const x = x0 + Math.sin((y / 256) * Math.PI * freq + ph) * amp;
        y === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  })();

  function buildGuest(gender, outfit) {
    const f = gender === 'f';
    const mats = [];
    const M = (color, rough = 0.7, metal = 0, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, transparent: true, opacity: 1, ...extra });
      m.userData.base = extra.opacity != null ? extra.opacity : 1;
      mats.push(m);
      return m;
    };
    const skinC = pick(SKIN);
    const skin = M(skinC, 0.62);
    const hairBase = new THREE.Color(pick(f ? HAIR_F : HAIR_M)).offsetHSL(0, 0, 0.05).getHex();
    const hair = M(hairBase, 0.36, 0, { map: HAIR_TEX, bumpMap: HAIR_TEX, bumpScale: 0.004 });
    const white = M(0xfbf8f2, 0.3);
    const iris = M(f ? 0x4a2a16 : 0x3a2414, 0.25);
    const pupil = M(0x0c0806, 0.2);
    const shine = M(0xffffff, 0.1, 0, { emissive: 0xffffff, emissiveIntensity: 0.6 });
    const brow = M(0x1c120b, 0.6);
    const lips = M(f ? 0xb4373f : 0x9c5848, 0.45);
    const blush = M(0xf08f86, 0.7, 0, { opacity: f ? 0.32 : 0.16, depthWrite: false });
    const shoeM = M(0x0b0a09, 0.22, 0.3);
    let top, sleeve, legsM, trim, accent;
    if (f) {
      top = M(outfit.body, outfit.name === 'ivory' ? 0.75 : 0.5, outfit.name === 'ivory' ? 0 : 0.05);
      sleeve = top; legsM = M(outfit.legs, 0.6); trim = M(outfit.trim, 0.3, 0.8);
      accent = M(0xd9b25e, 0.25, 0.9);
    } else {
      top = M(outfit.jacket, 0.62); sleeve = top; legsM = M(outfit.trousers, 0.66);
      trim = M(outfit.shirt, 0.55); accent = outfit.tie != null ? M(outfit.tie, 0.45, outfit.tie === 0xc9a24f ? 0.7 : 0) : null;
    }
    const mesh = (g, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); if (parent) parent.add(o); return o; };

    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const pelvis = new THREE.Group(); pelvis.position.y = 0.88; body.add(pelvis);

    /* legs */
    const legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(side * (f ? 0.08 : 0.09), 0, 0); pelvis.add(hip);
      mesh(capsule(f ? 0.058 : 0.066, 0.3), legsM, 0, -0.2, 0, hip);
      const knee = new THREE.Group(); knee.position.y = -0.4; hip.add(knee);
      mesh(capsule(f ? 0.046 : 0.054, 0.32), legsM, 0, -0.2, 0, knee);
      mesh(box(f ? 0.072 : 0.09, 0.06, f ? 0.2 : 0.25), shoeM, 0, -0.45, 0.05, knee);
      legs.push({ hip, knee });
    }
    mesh(cyl(f ? 0.13 : 0.15, f ? 0.15 : 0.155, 0.18), f ? top : legsM, 0, 0, 0, pelvis);

    /* skirt (ladies): flares from the waist, follows the thighs when seated */
    let skirt = null;
    if (f) {
      skirt = new THREE.Group(); skirt.position.y = 0.06; pelvis.add(skirt);
      const sk = mesh(cyl(0.145, 0.27, 0.66, 28), top, 0, -0.33, 0, skirt); sk.scale.z = 0.86;
      const hem = mesh(geo('hem', () => new THREE.TorusGeometry(0.268, 0.012, 8, 40)), trim, 0, -0.655, 0, skirt);
      hem.rotation.x = Math.PI / 2; hem.scale.y = 0.86;
      const band = mesh(geo('band', () => new THREE.TorusGeometry(0.205, 0.008, 8, 40)), trim, 0, -0.45, 0, skirt);
      band.rotation.x = Math.PI / 2; band.scale.y = 0.86;
    }

    /* torso */
    const spine = new THREE.Group(); spine.position.y = 0.04; pelvis.add(spine);
    const torso = mesh(cyl(f ? 0.148 : 0.168, f ? 0.12 : 0.142, 0.44, 24), top, 0, 0.22, 0, spine); torso.scale.z = f ? 0.66 : 0.62;
    for (const side of [-1, 1]) mesh(sphere(f ? 0.058 : 0.072), top, side * (f ? 0.142 : 0.165), 0.42, 0, spine);
    if (!f) {
      // dark shirt V, lapels, optional tie and pocket square
      mesh(box(0.075, 0.2, 0.01), trim, 0, 0.35, 0.1, spine);
      for (const side of [-1, 1]) {
        const lap = mesh(box(0.045, 0.26, 0.012), M(new THREE.Color(outfit.jacket).offsetHSL(0, 0, 0.05).getHex(), 0.5), side * 0.05, 0.31, 0.104, spine);
        lap.rotation.z = side * 0.34;
      }
      if (accent) mesh(box(0.032, 0.19, 0.012), accent, 0, 0.33, 0.108, spine);
      if (outfit.square) mesh(box(0.04, 0.02, 0.01), M(outfit.square, 0.3, 0.6), 0.105, 0.33, 0.1, spine);
      mesh(cyl(0.065, 0.078, 0.06), trim, 0, 0.47, 0, spine);   // collar
    } else {
      mesh(cyl(0.07, 0.1, 0.05), skin, 0, 0.455, 0, spine);   // neckline
      mesh(geo('neckTrim', () => new THREE.TorusGeometry(0.088, 0.007, 8, 30)), trim, 0, 0.452, 0.004, spine).rotation.x = Math.PI / 2;
      if (outfit.dupatta) {
        // a draped scarf from the left shoulder across to the right hip
        const d = mesh(capsule(0.04, 0.5), M(outfit.dupatta, 0.8, 0, {}), 0.02, 0.22, 0.095, spine);
        d.rotation.z = 0.62; d.scale.set(1.5, 1, 0.45);
        mesh(capsule(0.045, 0.28), d.material, -0.14, 0.18, -0.02, spine).scale.set(1.3, 1, 0.5);
      }
    }
    mesh(cyl(0.046, 0.05, 0.08), skin, 0, 0.5, 0, spine);   // neck

    /* head + face */
    const headPivot = new THREE.Group(); headPivot.position.y = 0.53; spine.add(headPivot);
    const head = mesh(sphere(0.14, 30, 22), skin, 0, 0.15, 0, headPivot); head.scale.set(0.95, 1.06, 0.97);
    for (const side of [-1, 1]) { const ear = mesh(sphere(0.03, 12, 10), skin, side * 0.133, 0.14, -0.005, headPivot); ear.scale.set(0.5, 1, 0.8); }
    const eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(side * 0.048, 0.155, 0.118); headPivot.add(eye);
      const w = mesh(sphere(0.028, 16, 12), white, 0, 0, 0, eye); w.scale.set(1, 1.12, 0.42);
      const ir = mesh(sphere(0.019, 14, 10), iris, 0, -0.002, 0.009, eye); ir.scale.set(1, 1.05, 0.45);
      mesh(sphere(0.01, 10, 8), pupil, 0, -0.002, 0.014, eye).scale.set(1, 1, 0.45);
      mesh(sphere(0.0055, 8, 6), shine, side * -0.006, 0.008, 0.017, eye);
      if (f) { const lash = mesh(box(0.058, 0.007, 0.012), brow, 0, 0.026, 0.006, eye); lash.rotation.z = side * -0.12; }
      eyes.push(eye);
      const b = mesh(box(f ? 0.046 : 0.052, f ? 0.008 : 0.012, 0.012), brow, side * 0.05, 0.2, 0.124, headPivot);
      b.rotation.z = side * (f ? -0.18 : -0.1);
    }
    const nose = mesh(sphere(0.017, 12, 10), skin, 0, 0.122, 0.137, headPivot); nose.scale.set(0.8, 1.15, 1);
    for (const side of [-1, 1]) { const bl = mesh(sphere(0.022, 12, 10), blush, side * 0.077, 0.112, 0.112, headPivot); bl.scale.set(1, 0.6, 0.3); }

    /* hair */
    const cap = mesh(geo('cap', () => new THREE.SphereGeometry(0.152, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair, 0, 0.168, -0.012, headPivot);
    cap.rotation.x = -0.28; cap.scale.set(1, 0.95, 1.06);
    const back = mesh(geo('backhair', () => new THREE.SphereGeometry(0.147, 24, 14, Math.PI, Math.PI, 0, Math.PI * 0.66)), hair, 0, 0.15, -0.006, headPivot);
    back.scale.set(1.02, 1.04, 1.04);
    if (!f) {
      // a full, wavy crown swept up at the front
      // full, wavy volume swept up and back at the front, like the reference
      [[0, 0.262, 0.035, 0.12, 1.12, 0.5, 1.0], [-0.055, 0.252, -0.055, 0.105, 1.0, 0.5, 1.0], [0.06, 0.25, -0.05, 0.1, 1.0, 0.5, 1.0],
       [0.012, 0.255, 0.105, 0.07, 1.5, 0.62, 0.72], [-0.1, 0.215, 0.02, 0.07, 0.75, 0.8, 1.2], [0.1, 0.212, 0.02, 0.068, 0.75, 0.8, 1.2]]
        .forEach(([x, y, z, r, sx, sy, sz]) => { const w = mesh(sphere(r, 20, 14), hair, x, y, z, headPivot); w.scale.set(sx, sy, sz); w.rotation.y = (rnd() - 0.5) * 0.4; });
      for (const side of [-1, 1]) { const sb = mesh(box(0.016, 0.06, 0.04), hair, side * 0.128, 0.13, 0.03, headPivot); sb.rotation.z = side * 0.08; }
      // short, neat beard and moustache
      const beard = mesh(geo('beard', () => new THREE.SphereGeometry(0.146, 24, 10, Math.PI / 2 - 1.1, 2.2, Math.PI * 0.6, Math.PI * 0.27)), M(new THREE.Color(hairBase).offsetHSL(0, 0, -0.04).getHex(), 0.85), 0, 0.15, 0, headPivot);
      beard.scale.set(0.97, 1.06, 0.99);
      const mous = mesh(capsule(0.011, 0.045), beard.material, 0, 0.097, 0.135, headPivot); mous.rotation.z = Math.PI / 2;
    } else {
      // soft waves on the crown, a side parting, and long hair over the shoulders
      [[-0.052, 0.255, 0.01, 0.105, 1.0, 0.48, 1.12], [0.058, 0.25, 0.0, 0.1, 1.0, 0.48, 1.1], [0, 0.245, -0.07, 0.11, 1.1, 0.5, 0.9]]
        .forEach(([x, y, z, r, sx, sy, sz]) => { const w = mesh(sphere(r, 20, 14), hair, x, y, z, headPivot); w.scale.set(sx, sy, sz); });
      for (const side of [-1, 1]) {
        const lock = mesh(sphere(0.07, 18, 14), hair, side * 0.128, 0.06, 0.012, headPivot); lock.scale.set(0.72, 1.75, 0.9);
        mesh(sphere(0.013, 8, 6), accent, side * 0.137, 0.072, 0.045, headPivot);   // earring
      }
      // long, wavy hair hangs from the shoulders, so it stays put when the head turns
      const backHair = mesh(sphere(0.17, 24, 18), hair, 0, 0.36, -0.1, spine); backHair.scale.set(1.08, 1.45, 0.46);
      [[-0.07, 0.17, -0.1], [0.07, 0.165, -0.1], [0, 0.15, -0.11]].forEach(([x, y, z]) => { const e = mesh(sphere(0.075, 16, 12), hair, x, y, z, spine); e.scale.set(1, 1.3, 0.5); });
      for (const side of [-1, 1]) {
        const front = mesh(sphere(0.06, 16, 12), hair, side * 0.128, 0.36, 0.055, spine); front.scale.set(0.95, 2.1, 0.7);
        front.rotation.z = side * -0.08;
      }
    }
    const mouth = mesh(geo('mouth', () => new THREE.TorusGeometry(0.027, 0.0068, 8, 18, Math.PI)), lips, 0, 0.085, f ? 0.131 : 0.141, headPivot);
    mouth.rotation.z = Math.PI;

    /* arms */
    const arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * (f ? 0.155 : 0.178), 0.41, 0); spine.add(shoulder);
      mesh(capsule(f ? 0.042 : 0.05, 0.17), sleeve, 0, -0.12, 0, shoulder);
      const elbow = new THREE.Group(); elbow.position.y = -0.26; shoulder.add(elbow);
      mesh(capsule(f ? 0.038 : 0.044, 0.13), sleeve, 0, -0.1, 0, elbow);
      mesh(cyl(f ? 0.042 : 0.048, f ? 0.046 : 0.05, 0.03), trim, 0, -0.195, 0, elbow);   // cuff
      const hand = mesh(sphere(0.045, 14, 10), skin, 0, -0.235, 0.006, elbow); hand.scale.set(0.82, 1.12, 0.62);
      if (f && side === 1) mesh(geo('bangle', () => new THREE.TorusGeometry(0.045, 0.007, 8, 24)), accent, 0, -0.205, 0, elbow).rotation.x = Math.PI / 2;
      arms.push({ shoulder, elbow, hand, side });
    }

    /* soft floor shadow */
    const shadowMat = new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false, opacity: 1 });
    shadowMat.userData.base = 1; mats.push(shadowMat);
    const shadow = mesh(geo('shadow', () => new THREE.PlaneGeometry(0.85, 0.85)), shadowMat, 0, 0.005, 0, root);
    shadow.rotation.x = -Math.PI / 2;

    root.scale.setScalar(S);
    return { root, body, pelvis, spine, headPivot, mouth, eyes, legs, arms, skirt, mats, shadow, gender };
  }

  /* ---------- pose: blends walking, sitting and conversation ---------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const pulse = (x) => Math.pow(Math.max(0, Math.sin(x)), 3);
  const SEATED_PELVIS = SEAT_H + 0.02;
  const LEAN = 0.12;
  // seated arms: elbows on the table edge, forearms resting on the table top
  const ARM_REST = { shoulder: -0.78, elbow: -0.9, inward: 0.62 };

  function applyPose(g, t, calm) {
    const p = g.pose;
    const s = ease(Math.max(0, Math.min(1, p.sit)));
    const w = p.walkAmt;
    const ph = p.phase;
    const ph2 = g.phase2;
    const amp = calm ? 0.35 : 1;
    const look = ease(Math.max(0, Math.min(1, p.look)));

    // walking
    const swing = 0.44 * Math.sin(ph) * w;
    const bob = 0.022 * Math.abs(Math.sin(ph)) * w;
    // conversation (only while seated)
    const talkYaw = (0.42 * Math.sin(t * 0.37 + ph2) + 0.2 * Math.sin(t * 0.83 + ph2 * 1.7)) * amp;
    const nod = (0.06 * Math.sin(t * 1.9 + ph2) + 0.035 * Math.sin(t * 3.1 + ph2 * 0.5)) * amp;
    const laugh = pulse(t * 0.21 + ph2 * 2.3) * amp;
    const gestR = pulse(t * 0.47 + ph2) * amp;
    const gestL = pulse(t * 0.39 + ph2 + 2.1) * amp * 0.8;
    const shift = 0.03 * Math.sin(t * 0.29 + ph2) * amp;

    g.pelvis.position.y = lerp(0.88 + bob, SEATED_PELVIS, s);
    g.pelvis.position.z = lerp(0, -0.03, s);
    g.legs[0].hip.rotation.x = lerp(-swing, -1.52, s);
    g.legs[1].hip.rotation.x = lerp(swing, -1.52, s);
    g.legs[0].knee.rotation.x = lerp(0.1 + 0.6 * Math.max(0, Math.sin(ph - 0.9)) * w, 1.52, s);
    g.legs[1].knee.rotation.x = lerp(0.1 + 0.6 * Math.max(0, Math.sin(ph + Math.PI - 0.9)) * w, 1.52, s);
    if (g.skirt) { g.skirt.rotation.x = lerp(0.04 * Math.sin(ph * 2) * w, -1.3, s); g.skirt.scale.y = lerp(1, 0.6, s); g.skirt.scale.z = lerp(1, 0.42, s); g.skirt.position.z = lerp(0, 0.04, s); }

    const lean = LEAN + 0.04 * Math.sin(t * 0.6 + ph2) * amp - laugh * 0.1 - look * 0.12;
    g.spine.rotation.x = lerp(0.03, lean, s);
    g.spine.rotation.y = lerp(0.07 * Math.sin(ph) * w, talkYaw * 0.3 * (1 - look), s);
    g.spine.rotation.z = lerp(0, shift, s);

    // head: talk, nod, laugh; "look up" turns the face towards the camera above
    g.headPivot.rotation.y = lerp(0, talkYaw * 0.75 * (1 - look), s);
    g.headPivot.rotation.x = lerp(0.03, (nod - laugh * 0.3 + 0.05) * (1 - look) - look * 1.25, s);
    g.headPivot.rotation.z = lerp(0, 0.06 * Math.sin(t * 0.55 + ph2) * amp * (1 - look), s);
    const smile = Math.max(laugh, look * 0.4);
    g.mouth.scale.set(1 + 0.25 * smile * s, 1 + 1.2 * laugh * s + 0.15, 1);
    // blink every few seconds
    const blink = Math.max(0, 1 - Math.abs(((t + ph2 * 3) % 4.3) - 0.08) / 0.08);
    g.eyes.forEach((e) => { e.scale.y = 1 - 0.9 * blink; });

    // arms: swing when walking; rest on the table and gesture upwards when seated
    const [L, R] = g.arms;
    const gL = gestL * (1 - look * 0.6), gR = gestR * (1 - look * 0.6);
    L.shoulder.rotation.x = lerp(0.36 * Math.sin(ph) * w, ARM_REST.shoulder - 0.14 * gL, s);
    R.shoulder.rotation.x = lerp(-0.36 * Math.sin(ph) * w, ARM_REST.shoulder - 0.16 * gR, s);
    L.shoulder.rotation.z = lerp(-0.07, -0.07 - 0.14 * gL, s);
    R.shoulder.rotation.z = lerp(0.07, 0.07 + 0.16 * gR, s);
    L.elbow.rotation.x = lerp(-0.26, ARM_REST.elbow - 0.95 * gL - 0.08 * Math.sin(t * 4.2 + ph2) * gL, s);
    R.elbow.rotation.x = lerp(-0.26, ARM_REST.elbow - 1.05 * gR - 0.1 * Math.sin(t * 3.7 + ph2 * 1.3) * gR, s);
    // forearms angle in so the hands rest together in front, and open outwards when gesturing
    L.elbow.rotation.z = lerp(0, ARM_REST.inward * (1 - gL) - 0.15 * gL, s);
    R.elbow.rotation.z = lerp(0, -ARM_REST.inward * (1 - gR) + 0.18 * gR, s);
    g.shadow.scale.setScalar(lerp(1, 0.75, s));
  }

  /* =========================================================
     The scene
     ========================================================= */
  class DiningScene {
    constructor(container) {
      this.container = container;
      const canvas = document.createElement('canvas');
      canvas.className = 'room-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      container.insertBefore(canvas, container.querySelector('.room-tables'));
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      this.scene = new THREE.Scene();
      // orthographic, straight down, exactly the photo's framing
      this.camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 10, 6000);
      this.camera.position.set(W / 2, 3000, H / 2);
      this.camera.up.set(0, 0, -1);
      this.camera.lookAt(W / 2, 0, H / 2);

      // warm, candle-lit room light from above
      this.scene.add(new THREE.HemisphereLight(0xffe6c4, 0x2a1a0c, 1.05));
      const key = new THREE.DirectionalLight(0xffdcae, 1.9);
      key.position.set(W / 2 - 600, 2400, H / 2 - 500); key.target.position.set(W / 2, 0, H / 2);
      this.scene.add(key, key.target);
      const fill = new THREE.DirectionalLight(0xb8d4c2, 0.45);
      fill.position.set(W / 2 + 900, 900, H / 2 + 800); fill.target.position.set(W / 2, 0, H / 2);
      this.scene.add(fill, fill.target);

      // table tops: depth only, so legs and laps under a table stay hidden
      const occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
      TABLES.forEach((t) => {
        const m = t.shape === 'circle'
          ? new THREE.Mesh(new THREE.CircleGeometry(t.r - 2, 48), occMat)
          : new THREE.Mesh(new THREE.PlaneGeometry(t.w - 4, t.h - 4), occMat);
        m.position.set(t.shape === 'circle' ? t.cx : t.x + t.w / 2, OCC_H, t.shape === 'circle' ? t.cy : t.y + t.h / 2);
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = -1;
        this.scene.add(m);
      });

      this.parties = new Map();     // tableId -> party
      this.sessionIds = new Set();  // bookings made during this visit: their party arrives straight away
      this.pendingIds = new Set();
      this.awaitingSince = 0;
      this.time = 0;
      this.visible = true;
      this.running = false;

      this.resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(container);
      else window.addEventListener('resize', () => this.resize());
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; this.kick(); }, { rootMargin: '120px' }).observe(container);
      }
      document.addEventListener('visibilitychange', () => this.kick());

      Svc.subscribe(() => this.reconcile());
      this.reconcile(true);
      setInterval(() => this.reconcile(), 5000);   // bookings starting or ending while the page is open
    }

    resize() {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      if (!w || !h) return;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(w, h, false);
      this.render();
    }

    /* ---------- bookings -> parties ---------- */
    expectArrival() { this.awaitingSince = Date.now() - 1; }
    cancelExpect() { this.awaitingSince = 0; }
    arrive(id) {
      this.awaitingSince = 0;
      this.pendingIds.delete(id);
      this.sessionIds.add(id);
      const r = Svc.list().find((x) => x.id === id);
      if (!r) return;
      const existing = this.parties.get(r.tableId);
      if (existing) { existing.queued = r; if (existing.state !== 'leaving' && existing.resId !== r.id) this.leave(existing); return; }
      this.spawn(r, true);
    }

    reconcile(initial = false) {
      const now = Date.now();
      TABLES.forEach((t) => {
        // who should be at this table now: a booking in progress, or the party you just booked
        const desired = Svc.forTable(t.id)
          .filter((r) => r.end > now && (r.start <= now || this.sessionIds.has(r.id)))
          .sort((a, b) => a.start - b.start)[0] || null;
        const party = this.parties.get(t.id);
        if (party && party.state !== 'leaving' && (!desired || desired.id !== party.resId)) this.leave(party);
        if (!party && desired) {
          if (this.awaitingSince && desired.createdAt >= this.awaitingSince) { this.pendingIds.add(desired.id); return; }
          if (this.pendingIds.has(desired.id)) return;
          // already here when the page opened: seated; starting while you watch: they walk in
          this.spawn(desired, !initial, initial);
        }
      });
      this.kick();
    }

    spawn(r, walkIn, initial = false) {
      const t = LV.tableById(r.tableId);
      const seatsInfo = SEATS.get(t.id);
      const n = Math.min(r.guests, t.capacity);
      seedState = (hash(r.id) % 2147483646) + 1;
      // balanced mix: alternate ladies and gentlemen around the table, no two outfits alike
      const firstF = rnd() > 0.5;
      const suits = shuffle(SUITS.slice()), dresses = shuffle(DRESSES.slice());
      let si = 0, di = 0;
      const order = t.fill.slice(0, n);
      const guests = order.map((seatIndex, i) => {
        const gender = (i % 2 === 0) === firstF ? 'f' : 'm';
        const g = buildGuest(gender, gender === 'f' ? dresses[di++ % dresses.length] : suits[si++ % suits.length]);
        g.seat = seatsInfo[seatIndex];
        g.phase2 = rnd() * Math.PI * 2;
        g.pose = { sit: 0, walkAmt: 0, phase: rnd() * 6, look: 0 };
        g.lookAt = 0; g.lookUntil = 0; g.nextLook = 0;
        g.alpha = 0;
        this.scene.add(g.root);
        return g;
      });
      const party = { resId: r.id, tableId: t.id, guests, state: walkIn ? 'arriving' : 'seated' };
      this.parties.set(t.id, party);

      if (walkIn && !reduced.matches) {
        // farthest seats first, and anyone who steps past another chair goes before whoever sits there
        const plans = guests.map((g) => ({ g, path: this.routeIn(g.seat) }));
        plans.sort((a, b) => pathLen(b.path) - pathLen(a.path));
        for (let pass = 0; pass < plans.length; pass++) {
          for (let i = 0; i < plans.length; i++) {
            for (let j = i + 1; j < plans.length; j++) {
              if (plans[j].g.seat.passes.includes(plans[i].g.seat.index)) { const tmp = plans[j]; plans.splice(j, 1); plans.splice(i, 0, tmp); }
            }
          }
        }
        plans.forEach(({ g, path }, i) => {
          g.order = ++ORDER;
          g.task = { type: 'walk', path, seg: 0, delay: i * ARRIVAL_GAP, fadeIn: true, then: 'sit' };
          setRoot(g, path[0].x, path[0].y, Math.atan2(path[1].x - path[0].x, path[1].y - path[0].y));
          g.root.visible = false;
        });
      } else {
        guests.forEach((g, i) => {
          setRoot(g, g.seat.sit.x, g.seat.sit.y, g.seat.facing);
          g.pose.sit = 1;
          g.alpha = initial ? 1 : 0;
          g.task = { type: 'fade', to: 1, delay: initial ? 0 : i * 0.15 };
          g.state = 'seated';
          g.nextLook = this.time + 3 + rnd() * 6;
        });
      }
      guests.forEach((g) => setAlpha(g, g.alpha));
      this.kick();
    }

    leave(party) {
      party.state = 'leaving';
      party.guests.forEach((g, i) => {
        const path = this.routeOut(g.seat);
        g.pose.look = Math.min(g.pose.look, 0.5);
        // leave in the reverse order: whoever blocks another guest's way out goes first
        const blockedBy = party.guests.filter((o) => g.seat.passes.includes(o.seat.index)).length;
        i = blockedBy ? i + party.guests.length : i;
        g.lookUntil = 0;
        g.order = ++ORDER;
        g.task = { type: 'stand', delay: i * 0.7, path, then: 'walkOut' };
        if (reduced.matches) g.task = { type: 'fade', to: 0, delay: 0, remove: true };
      });
      this.kick();
    }

    // the wide grid wherever possible; the squeeze grid only for the last part to a boxed-in seat
    routeIn(seat) {
      const doorOut = ROOM.entrance, doorIn = ROOM.entranceInside;
      const a = seat.approach || doorIn;
      const mid = seat.grid.astar(doorIn, a) || [doorIn, a];
      return [doorOut, ...mid, seat.sit];
    }
    routeOut(seat) {
      const doorOut = ROOM.entrance, doorIn = ROOM.entranceInside;
      const a = seat.approach || doorIn;
      const mid = seat.grid.astar(a, doorIn) || [a, doorIn];
      return [seat.sit, ...mid, doorOut];
    }

    blockedAhead(g) {
      const hx = Math.sin(g.root.rotation.y), hy = Math.cos(g.root.rotation.y);
      for (const p of this.parties.values()) for (const o of p.guests) {
        if (o === g || o.gone || !o.root.visible || o.state === 'seated' || (o.order ?? 0) >= (g.order ?? 0)) continue;
        const dx = o.root.position.x - g.root.position.x, dy = o.root.position.z - g.root.position.z;
        const d = Math.hypot(dx, dy);
        if (d < PERSON_R * 2.1 && (dx * hx + dy * hy) / (d || 1) > 0.25) return true;
      }
      return false;
    }

    /* ---------- animation loop ---------- */
    kick() {
      if (this.running) return;
      if (!this.parties.size || !this.visible || document.hidden) { this.render(); return; }
      this.running = true;
      this.last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.update(dt);
        this.render();
        if (this.parties.size && this.visible && !document.hidden) requestAnimationFrame(loop);
        else { this.running = false; this.render(); }
      };
      requestAnimationFrame(loop);
    }

    update(dt) {
      this.time += dt;
      const calm = reduced.matches;
      for (const [tableId, party] of this.parties) {
        let allGone = party.guests.length > 0;
        let allSeated = true;
        for (const g of party.guests) {
          this.step(g, dt);
          this.lookCycle(g, dt, calm);
          applyPose(g, this.time, calm);
          if (!g.gone) allGone = false;
          if (g.state !== 'seated') allSeated = false;
        }
        if (party.state === 'arriving' && allSeated) {
          party.state = 'seated';
          // everyone looks up and smiles at the camera together, like a group photo
          party.guests.forEach((g) => { g.lookAt = this.time + 0.6; g.lookUntil = this.time + 3.6; g.nextLook = this.time + 9 + rnd() * 8; });
        }
        if (party.state === 'leaving' && allGone) {
          party.guests.forEach((g) => { this.scene.remove(g.root); g.mats.forEach((m) => m.dispose()); });
          this.parties.delete(tableId);
          const queued = party.queued;
          if (queued && queued.end > Date.now() && Svc.list().some((x) => x.id === queued.id)) this.spawn(queued, true);
          else this.reconcile();
        }
      }
    }

    // seated guests now and then look up at the camera with a smile
    lookCycle(g, dt, calm) {
      if (g.state !== 'seated' || calm) { g.pose.look = Math.max(0, g.pose.look - dt * 1.5); return; }
      if (this.time >= g.nextLook && this.time > g.lookUntil) {
        g.lookAt = this.time; g.lookUntil = this.time + 2 + rnd() * 1.4; g.nextLook = this.time + 10 + rnd() * 12;
      }
      const want = this.time >= g.lookAt && this.time < g.lookUntil ? 1 : 0;
      g.pose.look += (want - g.pose.look) * Math.min(1, dt * 2.6);
    }

    step(g, dt) {
      const task = g.task;
      if (!task) return;
      if (task.delay > 0) { task.delay -= dt; return; }
      if (task.type === 'fade') {
        g.alpha += (task.to > g.alpha ? 1 : -1) * dt / 0.6;
        g.alpha = Math.max(0, Math.min(1, g.alpha));
        setAlpha(g, g.alpha);
        if (g.alpha === task.to) { g.task = null; if (task.remove) g.gone = true; }
        return;
      }
      if (task.type === 'walk') {
        g.root.visible = true;
        const path = task.path;
        let move = WALK_SPEED * dt * (g.squeezing ? 0.55 : 1);
        // give way to anyone standing or walking just ahead who started before us
        if (this.blockedAhead(g)) {
          task.waited = (task.waited || 0) + dt;
          if (task.waited < 3) { g.pose.walkAmt = Math.max(0, g.pose.walkAmt - dt * 4); return; }
        } else task.waited = 0;
        g.pose.walkAmt = Math.min(1, g.pose.walkAmt + dt * 4);
        while (move > 0 && task.seg < path.length - 1) {
          const a = { x: g.root.position.x, y: g.root.position.z }, b = path[task.seg + 1];
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (d > 0.5) g.targetYaw = Math.atan2(b.x - a.x, b.y - a.y);
          if (d <= move) { setPos(g, b.x, b.y); move -= d; task.seg++; }
          else { setPos(g, a.x + (b.x - a.x) * (move / d), a.y + (b.y - a.y) * (move / d)); move = 0; }
        }
        g.pose.phase += ((WALK_SPEED * dt) / STRIDE) * Math.PI * 2 * (g.squeezing ? 0.6 : 1);
        // sidestep onto the chair: keep facing the table instead of turning sideways
        const lastLeg = task.then === 'sit' && task.seg >= path.length - 2;
        // where it is tight, turn side-on to the nearest table and shuffle past it, like real guests do
        const px = g.root.position.x, py = g.root.position.z;
        let near = null, nd = Infinity;
        for (const t of TABLES) { const d = tableDistance(t, px, py); if (d < nd) { nd = d; near = t; } }
        g.squeezing = !lastLeg && nd < PERSON_R + 6;
        let yaw = lastLeg ? g.seat.facing : g.targetYaw;
        if (g.squeezing) {
          const np = nearestTablePoint(near, px, py);
          const faceTable = Math.atan2(np.x - px, np.y - py);
          // face the table or face away from it, whichever is the smaller turn from the walking direction
          const d1 = Math.abs(Math.atan2(Math.sin(faceTable - g.targetYaw), Math.cos(faceTable - g.targetYaw)));
          yaw = d1 <= Math.PI / 2 ? faceTable : faceTable + Math.PI;
        }
        turnToward(g, yaw, dt, lastLeg ? 6 : 7);
        // fade through the doorway
        const fromDoor = Math.hypot(g.root.position.x - ROOM.entrance.x, g.root.position.z - ROOM.entrance.y);
        if (task.fadeIn || task.fadeOut) { g.alpha = Math.min(1, fromDoor / 80); setAlpha(g, g.alpha); }
        if (task.seg >= path.length - 1) {
          if (task.then === 'sit') g.task = { type: 'face', yaw: g.seat.facing, then: 'sit' };
          else { g.gone = true; g.root.visible = false; g.task = null; }
        }
        return;
      }
      g.pose.walkAmt = Math.max(0, g.pose.walkAmt - dt * 5);
      if (task.type === 'face') {
        const done = turnToward(g, task.yaw, dt, 5);
        g.pose.phase += dt * 2;
        if (done) g.task = { type: 'sit', t: 0 };
        return;
      }
      if (task.type === 'sit') {
        task.t += dt / 1.1;
        g.pose.sit = Math.min(1, task.t);
        if (task.t >= 1) { g.task = null; g.state = 'seated'; }
        return;
      }
      if (task.type === 'stand') {
        task.t = (task.t || 0) + dt / 0.9;
        g.pose.sit = Math.max(0, 1 - task.t);
        g.state = 'leaving';
        if (task.t >= 1) g.task = { type: 'walk', path: task.path, seg: 0, delay: 0, fadeOut: true, then: 'exit' };
      }
    }

    render() { this.renderer.render(this.scene, this.camera); }

    /* debug / test helpers */
    debugCounts() {
      const out = {};
      for (const [id, p] of this.parties) out[id] = { state: p.state, guests: p.guests.length, seated: p.guests.filter((g) => g.state === 'seated').length };
      return out;
    }
    // positions of everyone walking, and the table/chair they are heading for
    debugWalkers() {
      const out = [];
      for (const [tableId, p] of this.parties) for (const g of p.guests) {
        if (g.task && g.task.type === 'walk' && g.root.visible) {
          out.push({ tableId, x: g.root.position.x, y: g.root.position.z, seg: g.task.seg, segs: g.task.path.length - 1, sx: g.seat.sit.x, sy: g.seat.sit.y });
        }
      }
      return out;
    }
    // lowest point (metres) of every seated guest's elbows and hands
    debugArmHeights() {
      let min = Infinity;
      const v = new THREE.Vector3();
      for (const p of this.parties.values()) for (const g of p.guests) {
        if (g.state !== 'seated' || g.pose.sit < 1) continue;
        g.root.updateMatrixWorld(true);
        for (const a of g.arms) {
          a.elbow.getWorldPosition(v); min = Math.min(min, (v.y - 0.05 * S) / S);
          a.hand.getWorldPosition(v); min = Math.min(min, (v.y - 0.05 * S) / S);
        }
      }
      return { lowest: min, tableCut: OCC_H / S };
    }
  }

  function setPos(g, x, y) { g.root.position.set(x, 0, y); }
  function setRoot(g, x, y, yaw) { setPos(g, x, y); g.root.rotation.y = yaw; g.targetYaw = yaw; }
  function turnToward(g, yaw, dt, rate) {
    let d = yaw - g.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const stepA = Math.sign(d) * Math.min(Math.abs(d), rate * dt * Math.max(0.25, Math.abs(d)));
    g.root.rotation.y += stepA;
    return Math.abs(d) < 0.02;
  }
  function setAlpha(g, a) {
    g.mats.forEach((m) => { m.opacity = a * (m.userData.base ?? 1); if (m.userData.base === 1 || m.userData.base == null) m.depthWrite = a > 0.98; });
    g.root.visible = a > 0.001 || g.root.visible;
  }
  function pathLen(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  LV.DiningScene = DiningScene;
  LV._sceneDebug = { astar, SEATS, isFree, tableDistance, BODY_R, CHAIR_R, OCC_H, PPM, S, PERSON_R, GRID, SQUEEZE, routeIn: (seat) => DiningScene.prototype.routeIn(seat) };
})();

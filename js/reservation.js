/* =========================================================
   Luxury Vibes — Reservation page UI
   Table hotspots, the reservation card (paper + pen flight),
   the pen cursor, calendar, start→end time picker, validation,
   signing the card, booking flow and "Manage bookings".
   Data lives in js/reservation-data.js; 3D guests in
   js/reservation-scene.js.
   ========================================================= */
(() => {
  'use strict';

  const LV = window.LV;
  if (!LV || !LV.ReservationService) return;
  const { CONFIG, ROOM, TABLES, time: T, ReservationService: Svc } = LV;
  const gsap = window.gsap;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const pct = (v, of) => `${(v / of) * 100}%`;
  const motionOK = () => !!gsap && !reduced.matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const MIN_LEN = CONFIG.MIN_DURATION_MINUTES;
  const MAX_LEN = CONFIG.MAX_DURATION_MINUTES;
  const LAST_END = CONFIG.LAST_END_MINUTES;
  const SLOT = CONFIG.SLOT_MINUTES;

  /* =========================================================
     Hero heading: split into words for the reveal
     ========================================================= */
  const title = $('[data-split]');
  if (title && !reduced.matches) {
    const words = title.textContent.trim().split(/\s+/);
    title.setAttribute('aria-label', title.textContent.trim());
    title.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ');
    title.classList.add('is-split');
  }

  /* =========================================================
     Table hotspots
     ========================================================= */
  const room = $('#room-stage');
  const layer = $('#room-tables');
  const statusEl = $('#room-status');
  const CARD_W = 46;   // reservation card lying on a table, in room pixels
  const spots = new Map();

  const describe = (t) => (t.shape === 'circle' ? `round table for ${t.capacity}` : t.capacity === 6 ? 'long table for six' : `table for ${t.capacity}`);

  TABLES.forEach((t) => {
    const b = t.bounds;
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const tx = t.shape === 'circle' ? t.cx - t.r : t.x, ty = t.shape === 'circle' ? t.cy - t.r : t.y;
    const tw = t.shape === 'circle' ? t.r * 2 : t.w, th = t.shape === 'circle' ? t.r * 2 : t.h;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'table-spot';
    btn.dataset.table = t.id;
    btn.dataset.shape = t.shape;
    btn.style.cssText = [
      `--l:${pct(b.x0, ROOM.width)}`, `--t:${pct(b.y0, ROOM.height)}`, `--w:${pct(bw, ROOM.width)}`, `--h:${pct(bh, ROOM.height)}`,
      `--rl:${pct(tx - b.x0, bw)}`, `--rt:${pct(ty - b.y0, bh)}`, `--rw:${pct(tw, bw)}`, `--rh:${pct(th, bh)}`,
      `--cl:${pct(t.center.x - CARD_W / 2 - b.x0, bw)}`, `--ct:${pct(t.center.y - CARD_W * 0.75 - b.y0, bh)}`, `--cw:${pct(CARD_W, bw)}`
    ].join(';');
    btn.innerHTML = `
      <span class="table-ring"></span>
      <span class="table-card"><img class="tc-paper" src="assets/images/reservation/reservation-card.webp" alt=""><img class="tc-pen" src="assets/images/reservation/fountain-pen.webp" alt=""><span class="tc-tip"></span></span>
      <span class="table-tag"><span class="tt-name">Table ${t.number} · ${t.capacity} seats</span><span class="tt-status"></span></span>`;
    btn.addEventListener('click', () => openCard(t, btn));
    layer.appendChild(btn);
    spots.set(t.id, btn);
  });

  function tableState(t, now = Date.now()) {
    const list = Svc.forTable(t.id);
    const seated = list.find((r) => Svc.phase(r, now) === 'seated');
    const next = list.find((r) => r.end > now);
    return { list, seated, next };
  }

  const rangeLabel = (r) => `${T.msToLabel(r.start)} – ${T.msToLabel(r.end)}`;
  const shortDate = (k) => T.dateLabel(k, { weekday: 'short', day: 'numeric', month: 'short' });
  const slotLabel = (r) => (r.date === T.dateKey(new Date()) ? rangeLabel(r) : `${shortDate(r.date)}, ${rangeLabel(r)}`);

  function renderTables() {
    const now = Date.now();
    TABLES.forEach((t) => {
      const btn = spots.get(t.id);
      const { seated, next } = tableState(t, now);
      btn.classList.toggle('is-booked', !!next);
      btn.classList.toggle('is-seated', !!seated);
      const tagStatus = $('.tt-status', btn);
      let label = `Table ${t.number}, ${describe(t)}. `;
      if (seated) {
        tagStatus.textContent = `Seated until ${T.msToLabel(seated.end)}`;
        label += `Guests seated until ${T.msToLabel(seated.end)}. Select to book another time.`;
      } else if (next) {
        tagStatus.textContent = `Reserved ${slotLabel(next)}`;
        label += `Reserved ${slotLabel(next)}. Select to book another time.`;
      } else {
        tagStatus.textContent = 'Available';
        label += 'Available. Select to reserve.';
      }
      btn.setAttribute('aria-label', label);
    });
    renderBookbook();
  }

  /* ---------- reservations kept in this browser ---------- */
  const bookList = $('#bookbook-list');
  const phaseName = { seated: 'Seated now', upcoming: 'Upcoming', completed: 'Completed' };
  function bookingLine(r) {
    return `${shortDate(r.date)} · ${rangeLabel(r)} · ${r.guests} ${r.guests === 1 ? 'guest' : 'guests'}`;
  }
  function renderBookbook() {
    const now = Date.now();
    const all = Svc.list().sort((a, b) => a.start - b.start);
    const live = all.filter((r) => Svc.phase(r, now) !== 'completed');
    const done = all.filter((r) => Svc.phase(r, now) === 'completed').slice(-3);
    const rows = [...live, ...done];
    if (!rows.length) { bookList.innerHTML = '<li class="bookbook-empty">No reservations yet. Choose a table to make the first one.</li>'; return; }
    bookList.innerHTML = '';
    rows.forEach((r) => {
      const phase = Svc.phase(r, now);
      const li = document.createElement('li');
      li.innerHTML = `<span class="bb-table">T${r.tableNumber}</span><span class="bb-who"></span><span class="bb-chip bb-chip--${phase}">${phaseName[phase]}</span>`;
      const who = $('.bb-who', li);
      who.textContent = r.guestName;
      const small = document.createElement('small');
      small.textContent = bookingLine(r);
      who.appendChild(small);
      bookList.appendChild(li);
    });
  }

  /* =========================================================
     3D guests (optional: needs WebGL + Three.js)
     ========================================================= */
  let scene = null;
  try {
    if (window.THREE && LV.DiningScene) scene = new LV.DiningScene(room);
  } catch (e) {
    scene = null;
    console.warn('3D guests unavailable:', e);
  }

  /* =========================================================
     Reservation card: elements + state
     ========================================================= */
  const booking = $('#booking');
  const backdrop = $('.booking-backdrop', booking);
  const stage = $('.booking-stage', booking);
  const paper = $('#paper');
  const pen = $('#pen');
  const fields = $('#paper-fields');
  const nameIn = $('#pf-name');
  const tableOut = $('#pf-table');
  const dateBtn = $('#pf-date');
  const timeBtn = $('#pf-time');
  const guestsIn = $('#pf-guests');
  const guestsHint = $('#pf-guests-hint');
  const confirmBtn = $('#paper-confirm');
  const signEl = $('#paper-sign');
  const errors = {
    name: $('#pf-name-error'), table: $('#pf-table-error'), date: $('#pf-date-error'),
    time: $('#pf-time-error'), guests: $('#pf-guests-error')
  };
  const fieldWrap = { name: $('.pf--name'), table: $('.pf--table'), date: $('.pf--date'), time: $('.pf--time'), guests: $('.pf--guests') };
  const outside = [$('#main'), $('.site-header'), $('.site-footer')];

  const state = {
    open: false, busy: false, locked: false, animating: false,
    table: null, spot: null, date: null, start: null, end: null, attempted: false
  };

  Svc.subscribe(() => { renderTables(); if (state.open && !state.locked) refreshTableField(); });
  renderTables();
  setInterval(renderTables, 30000);

  /* ---------- time rules ---------- */
  const todayKey = () => T.dateKey(new Date());
  const ms = (dateKey, minutes) => T.at(dateKey, minutes);

  // can a booking START at this minute? (at least MIN_LEN must be free after it)
  function startState(dateKey, m, tableId) {
    if ((dateKey === todayKey() && m < T.nextSlotMinutes()) || ms(dateKey, m) <= Date.now()) return 'past';
    if (m + MIN_LEN > LAST_END) return 'late';
    if (Svc.conflicts(tableId, ms(dateKey, m), ms(dateKey, m + MIN_LEN)).length) return 'booked';
    return 'free';
  }
  // can a booking that starts at s END at e?
  function endState(dateKey, s, e, tableId) {
    if (e - s < MIN_LEN) return 'short';
    if (e - s > MAX_LEN || e > LAST_END) return 'long';
    if (Svc.conflicts(tableId, ms(dateKey, s), ms(dateKey, e)).length) return 'booked';
    return 'free';
  }
  function freeStartsOn(dateKey, tableId) {
    let n = 0;
    for (let m = 0; m < 1440; m += SLOT) if (startState(dateKey, m, tableId) === 'free') n++;
    return n;
  }
  function firstBookableDate(tableId) {
    const d = new Date();
    for (let i = 0; i < 3; i++) {
      const k = T.dateKey(d);
      if (freeStartsOn(k, tableId)) return k;
      d.setDate(d.getDate() + 1);
    }
    return T.dateKey(d);
  }

  /* ---------- field rendering ---------- */
  function setValue(btn, text) { $('.pf-value', btn).textContent = text || ''; }
  function timeText() {
    if (state.start == null) return '';
    if (state.end == null) return `${T.minutesToLabel(state.start)} – choose an end time`;
    return `${T.minutesToLabel(state.start)} – ${T.minutesToLabel(state.end)}  ·  ${T.durationLabel(state.end - state.start)}`;
  }
  function renderFields() {
    const t = state.table;
    tableOut.textContent = `No. ${t.number} — ${describe(t)}`;
    setValue(dateBtn, state.date ? T.dateLabel(state.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
    setValue(timeBtn, timeText());
    guestsHint.textContent = `Up to ${Math.min(t.capacity, CONFIG.MAX_GUESTS)}`;
    guestsIn.placeholder = `1 to ${Math.min(t.capacity, CONFIG.MAX_GUESTS)}`;
    refreshTableField();
  }

  function setError(key, message) {
    const el = errors[key];
    const had = el.textContent;
    if (typeof message === 'string') el.textContent = message || '';
    else { el.innerHTML = ''; if (message) el.appendChild(message); }
    const on = !!message;
    fieldWrap[key].classList.toggle('is-invalid', on && key !== 'table');
    if (on && !had) { el.classList.remove('is-shown'); void el.offsetWidth; el.classList.add('is-shown'); }
    const control = { name: nameIn, table: tableOut, date: dateBtn, time: timeBtn, guests: guestsIn }[key];
    if (control && control.setAttribute) control.setAttribute('aria-invalid', on ? 'true' : 'false');
  }

  // the table line shows the clash message, or a note when guests are seated now
  function refreshTableField() {
    const t = state.table;
    if (!t) return false;
    if (state.date && state.start != null) {
      const s = ms(state.date, state.start);
      const e = ms(state.date, state.end != null ? state.end : state.start + MIN_LEN);
      const clash = Svc.conflicts(t.id, s, e);
      if (clash.length) {
        const c = clash[0];
        const box = document.createElement('div');
        box.innerHTML = '<strong>Apologies, this table is reserved</strong><span></span><div class="pf-actions"></div>';
        $('span', box).textContent = `Booked ${rangeLabel(c)}, ${shortDate(c.date)}. Please choose another time or table.`;
        const acts = $('.pf-actions', box);
        [['Another time', () => openPanel('tp')], ['Change date', () => openPanel('cal')], ['Another table', () => closeCard()]].forEach(([txt, fn]) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'btn btn--sm'; b.textContent = txt;
          b.addEventListener('click', fn);
          acts.appendChild(b);
        });
        errors.table.className = 'pf-error pf-error--table';
        setError('table', box);
        return false;
      }
    }
    errors.table.className = 'pf-error pf-error--table';
    const { seated } = tableState(t);
    if (seated && (!state.date || state.date === todayKey())) {
      const note = document.createElement('span');
      note.className = 'pf-note';
      note.textContent = `Guests are seated here until ${T.msToLabel(seated.end)}.`;
      errors.table.innerHTML = '';
      errors.table.appendChild(note);
      tableOut.setAttribute('aria-invalid', 'false');
    } else {
      setError('table', '');
    }
    return true;
  }

  /* ---------- validation ---------- */
  function checkName(show) {
    const v = nameIn.value.trim().replace(/\s+/g, ' ');
    let msg = '';
    if (!v) msg = 'Please enter the name for the booking.';
    else if (v.length < 2) msg = 'Please enter at least two letters.';
    else if (!/^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(v)) msg = 'Use letters, spaces, apostrophes or hyphens only.';
    if (show) setError('name', msg);
    return !msg;
  }
  function checkDate(show) {
    let msg = '';
    if (!state.date) msg = 'Please choose a date.';
    else if (state.date < todayKey()) msg = 'That date has passed. Please choose another.';
    if (show) setError('date', msg);
    return !msg;
  }
  function checkTime(show) {
    let msg = '';
    if (state.start == null) msg = 'Please choose a start time.';
    else if (state.end == null) msg = 'Please choose an end time.';
    else if (state.date) {
      const s = startState(state.date, state.start, state.table.id);
      const e = endState(state.date, state.start, state.end, state.table.id);
      if (s === 'past') msg = 'That start time has passed. Please choose a later time.';
      else if (e === 'short') msg = `A booking lasts at least ${MIN_LEN} minutes.`;
      else if (e === 'long') msg = `A booking can last up to ${T.durationLabel(MAX_LEN)} and must end by 11:55 PM.`;
    }
    if (show) setError('time', msg);
    return !msg;
  }
  function checkGuests(show) {
    const raw = guestsIn.value.trim();
    const cap = Math.min(state.table.capacity, CONFIG.MAX_GUESTS);
    let msg = '';
    if (!raw) msg = `Enter the number of guests, 1 to ${cap}.`;
    else if (!/^\d+$/.test(raw)) msg = 'Use a whole number, for example 4.';
    else {
      const n = Number(raw);
      if (n < CONFIG.MIN_GUESTS) msg = 'At least one guest, please.';
      else if (n > CONFIG.MAX_GUESTS) msg = `We take up to ${CONFIG.MAX_GUESTS} guests per booking.`;
      else if (n > state.table.capacity) msg = `Table ${state.table.number} seats ${state.table.capacity}. For ${n}, choose Table 6, our long table.`;
    }
    if (show) setError('guests', msg);
    return !msg;
  }

  nameIn.addEventListener('input', () => { if (state.attempted || errors.name.textContent) checkName(true); });
  nameIn.addEventListener('blur', () => { if (nameIn.value) checkName(true); });
  guestsIn.addEventListener('input', () => {
    const clean = guestsIn.value.replace(/\D/g, '').slice(0, 2);
    if (clean !== guestsIn.value) guestsIn.value = clean;
    if (clean || state.attempted) checkGuests(true);
  });
  guestsIn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cap = Math.min(state.table.capacity, CONFIG.MAX_GUESTS);
      const n = Number(guestsIn.value) || 0;
      guestsIn.value = String(Math.max(1, Math.min(cap, n + (e.key === 'ArrowUp' ? 1 : -1))));
      checkGuests(true);
    }
  });

  /* =========================================================
     The pen. Its transform origin is the nib tip, so every pose
     is "where the tip is, which way it points, how big it is".
     ========================================================= */
  const PEN_TIP = { fx: 0.0031, fy: 0.477 };       // nib tip inside fountain-pen.webp
  const CURSOR_LEN = 86;                             // pen length in px while it is the cursor
  const CURSOR_ROT = -40;                            // nib points down-left, like a writing hand
  const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  function penBox() {
    const w = pen.offsetWidth, h = pen.offsetHeight;
    return { w, h, ox: w * PEN_TIP.fx, oy: h * PEN_TIP.fy };
  }
  // pose that puts the nib tip at (tipX, tipY) on screen
  function tipPose(tipX, tipY, rotation, scale) {
    const sr = stage.getBoundingClientRect();
    const { ox, oy } = penBox();
    return { x: tipX - sr.left - ox, y: tipY - sr.top - oy, rotation, scale };
  }
  // pose whose pen CENTRE is at (cx, cy)
  function centrePose(cx, cy, rotation, scale) {
    const { w, h, ox, oy } = penBox();
    const a = (rotation * Math.PI) / 180;
    const vx = (ox - w / 2) * scale, vy = (oy - h / 2) * scale;
    return tipPose(cx + vx * Math.cos(a) - vy * Math.sin(a), cy + vx * Math.sin(a) + vy * Math.cos(a), rotation, scale);
  }
  function currentTip() {
    const sr = stage.getBoundingClientRect();
    const { ox, oy } = penBox();
    return { x: Number(gsap.getProperty(pen, 'x')) + sr.left + ox, y: Number(gsap.getProperty(pen, 'y')) + sr.top + oy };
  }
  // where the pen rests beside the card
  function restPose() {
    const pr = paper.getBoundingClientRect();
    const roomRight = window.innerWidth - pr.right;
    if (roomRight > pr.width * 0.2) {
      return centrePose(pr.right + Math.min(roomRight * 0.42, pr.width * 0.13), pr.top + pr.height * 0.52, -74, 1);
    }
    return centrePose(pr.left + pr.width * 0.66, pr.bottom - pr.width * 0.035, -13, 0.6);
  }
  function setPen(p) {
    if (gsap) gsap.set(pen, p);
    else pen.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg) scale(${p.scale})`;
  }
  if (gsap) gsap.set(pen, { transformOrigin: `${PEN_TIP.fx * 100}% ${PEN_TIP.fy * 100}%` });
  else pen.style.transformOrigin = `${PEN_TIP.fx * 100}% ${PEN_TIP.fy * 100}%`;

  /* ---------- the pen as the cursor while filling in the card ---------- */
  const cursor = { on: false, ready: false, mouse: false, last: null, lastDownAt: 0, qx: null, qy: null, tween: null, skipFocus: false };
  const cursorScale = () => CURSOR_LEN / penBox().w;

  function fieldAnchor(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(18, r.width * 0.1), y: r.bottom - Math.min(10, r.height * 0.3) };
  }
  function enterCursor(target) {
    if (!gsap || state.locked) return;
    const p = tipPose(target.x, target.y, CURSOR_ROT, cursorScale());
    cursor.ready = false;
    if (cursor.tween) cursor.tween.kill();
    const done = () => {
      cursor.ready = true;
      cursor.qx = gsap.quickTo(pen, 'x', { duration: reduced.matches ? 0 : 0.14, ease: 'power3.out' });
      cursor.qy = gsap.quickTo(pen, 'y', { duration: reduced.matches ? 0 : 0.14, ease: 'power3.out' });
    };
    cursor.on = true;
    booking.classList.toggle('pen-cursor', cursor.mouse);
    if (!motionOK()) { gsap.set(pen, p); done(); return; }
    cursor.tween = gsap.to(pen, { ...p, duration: 0.8, ease: 'power3.inOut', onComplete: done });
  }
  function glideTip(target, dur = 0.45) {
    if (!cursor.on || !gsap) return;
    if (cursor.tween) cursor.tween.kill();
    cursor.ready = false;
    const p = tipPose(target.x, target.y, CURSOR_ROT, cursorScale());
    cursor.tween = gsap.to(pen, { x: p.x, y: p.y, rotation: CURSOR_ROT, scale: p.scale, duration: motionOK() ? dur : 0, ease: 'power2.inOut', onComplete: () => {
      cursor.ready = true;
      cursor.qx = gsap.quickTo(pen, 'x', { duration: reduced.matches ? 0 : 0.14, ease: 'power3.out' });
      cursor.qy = gsap.quickTo(pen, 'y', { duration: reduced.matches ? 0 : 0.14, ease: 'power3.out' });
    } });
  }
  function exitCursor() {
    cursor.on = false; cursor.ready = false;
    if (cursor.tween) { cursor.tween.kill(); cursor.tween = null; }
    booking.classList.remove('pen-cursor');
  }
  function followPointer(x, y) {
    if (!cursor.on) return;
    const p = tipPose(x, y, CURSOR_ROT, cursorScale());
    if (cursor.ready) { cursor.qx(p.x); cursor.qy(p.y); }
    else if (cursor.tween && cursor.tween.isActive()) {
      // still shrinking into the cursor: steer the tween to the moving pointer
      cursor.tween.vars.x = p.x; cursor.tween.vars.y = p.y; cursor.tween.invalidate();
    }
  }
  booking.addEventListener('pointermove', (e) => {
    cursor.last = { x: e.clientX, y: e.clientY };
    const isMouse = e.pointerType === 'mouse' || e.pointerType === 'pen';
    if (isMouse !== cursor.mouse) { cursor.mouse = isMouse; booking.classList.toggle('pen-cursor', cursor.on && isMouse); }
    if (isMouse) followPointer(e.clientX, e.clientY);
  });
  booking.addEventListener('pointerdown', (e) => {
    cursor.lastDownAt = performance.now();
    cursor.last = { x: e.clientX, y: e.clientY };
    cursor.mouse = e.pointerType === 'mouse' || e.pointerType === 'pen';
  });
  // selecting any field turns the pen into the cursor
  paper.addEventListener('focusin', (e) => {
    if (!state.open || state.locked || state.animating) return;
    if (cursor.skipFocus) { cursor.skipFocus = false; return; }   // the card focusing its first field on open
    const el = e.target;
    if (!el.matches('input, button, output, [tabindex]')) return;
    const byPointer = performance.now() - cursor.lastDownAt < 600 && cursor.last;
    const target = cursor.mouse && byPointer ? cursor.last : fieldAnchor(el);
    if (!cursor.on) enterCursor(cursor.mouse && cursor.last ? cursor.last : target);
    else if (!cursor.mouse || !byPointer) glideTip(target);
  });
  // pressing on a field (even the one already focused) also turns the pen into the cursor
  paper.addEventListener('pointerdown', (e) => {
    if (!state.open || state.locked || state.animating || cursor.on) return;
    if (!e.target.closest('.pf, .paper-panel, .paper-actions')) return;
    const isMouse = e.pointerType === 'mouse' || e.pointerType === 'pen';
    cursor.mouse = isMouse;
    enterCursor(isMouse ? { x: e.clientX, y: e.clientY } : fieldAnchor(e.target.closest('.pf-input, button, input') || e.target));
  });
  // a little writing flick while typing
  paper.addEventListener('input', (e) => {
    if (!cursor.on && state.open && !state.locked && !state.animating && e.target.matches('input')) {
      enterCursor(cursor.mouse && cursor.last ? cursor.last : fieldAnchorAtCaret(e.target));
      return;
    }
    if (!cursor.on || !gsap || !motionOK() || !e.target.matches('input')) return;
    gsap.fromTo(pen, { rotation: CURSOR_ROT - 7 }, { rotation: CURSOR_ROT, duration: 0.35, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
    if (!cursor.mouse) glideTip(fieldAnchorAtCaret(e.target), 0.2);
  });
  function fieldAnchorAtCaret(input) {
    // approximate caret position for touch/keyboard typing
    const r = input.getBoundingClientRect();
    const span = document.createElement('span');
    const cs = getComputedStyle(input);
    span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
    span.textContent = input.value.slice(0, input.selectionStart ?? input.value.length);
    document.body.appendChild(span);
    const w = span.getBoundingClientRect().width;
    span.remove();
    return { x: Math.min(r.right - 6, r.left + w + 3), y: r.bottom - Math.min(10, r.height * 0.3) };
  }

  function lockPage(on) {
    document.documentElement.style.overflow = on ? 'hidden' : '';
    outside.forEach((el) => { if (el) el.inert = on; });
  }

  /* =========================================================
     Opening: the card flies from the table to the viewer
     ========================================================= */
  function openCard(table, spot) {
    if (state.open || state.animating) return;
    state.open = true; state.locked = false; state.busy = false; state.attempted = false;
    state.table = table; state.spot = spot;
    state.date = firstBookableDate(table.id);
    state.start = null; state.end = null;
    // tapping a table where guests are seated right now: prefill the next slot so the clash is explained at once
    const { seated } = tableState(table);
    if (seated && state.date === todayKey()) {
      const s = T.nextSlotMinutes();
      if (s + 60 <= LAST_END) { state.start = s; state.end = s + 60; }
    }
    paper.classList.remove('is-locked', 'is-signing');
    signEl.classList.remove('is-on');
    fields.disabled = false;
    confirmBtn.disabled = false;
    confirmBtn.removeAttribute('aria-busy');
    $('[data-label]', confirmBtn).textContent = 'Confirm Your Reservation';
    ['name', 'date', 'time', 'guests'].forEach((k) => setError(k, ''));
    guestsIn.value = '';
    nameIn.value = '';
    renderFields();
    closePanels(true);
    exitCursor();

    booking.hidden = false;
    lockPage(true);
    statusEl.textContent = '';

    if (!motionOK()) {
      if (gsap) gsap.set([paper, backdrop], { clearProps: 'all' });
      backdrop.style.opacity = '1';
      pen.style.opacity = '1';
      setPen(restPose());
      paper.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
      cursor.skipFocus = true; nameIn.focus({ preventScroll: true }); cursor.skipFocus = false;
      return;
    }

    state.animating = true;
    gsap.set(paper, { clearProps: 'transform,opacity' });
    const pr = paper.getBoundingClientRect();
    const tr = $('.table-ring', spot).getBoundingClientRect();
    const from = rectCenter(tr), to = rectCenter(pr);
    const s0 = Math.max(0.04, (Math.min(tr.width, tr.height) * 0.42) / pr.width);
    const rest = restPose();
    const miniScale = (tr.width * 0.4) / penBox().w;

    gsap.set(paper, { x: from.x - to.x, y: from.y - to.y, scale: s0, rotationZ: -9, rotationX: 0, rotationY: 0, opacity: 1, transformOrigin: '50% 50%' });
    gsap.set(pen, { ...centrePose(from.x + tr.width * 0.12, from.y, -71, miniScale), opacity: 1 });
    gsap.set(backdrop, { opacity: 0 });

    const tl = gsap.timeline({ onComplete: () => { state.animating = false; state.openTl = null; cursor.skipFocus = true; nameIn.focus({ preventScroll: true }); cursor.skipFocus = false; } });
    state.openTl = tl;
    tl.to(paper, { x: 0, y: 0, scale: 1, rotationZ: 0, duration: 1.55, ease: 'power3.inOut' }, 0)
      .to(paper, { keyframes: { rotationX: [0, 34, -7, 0], rotationY: [0, -15, 4, 0], easeEach: 'sine.inOut' }, duration: 1.55, ease: 'none' }, 0)
      .to(backdrop, { opacity: 1, duration: 1.25, ease: 'power1.out' }, 0.05)
      .to(pen, { x: rest.x, y: rest.y, rotation: rest.rotation, scale: rest.scale, duration: 1.7, ease: 'power3.inOut' }, 0.12)
      .to(pen, { keyframes: { rotationY: [0, 22, -6, 0], easeEach: 'sine.inOut' }, duration: 1.7, ease: 'none' }, 0.12);
  }

  window.addEventListener('resize', () => {
    if (!state.open || state.animating || cursor.on || state.locked) return;
    setPen(restPose());
  });

  /* ---------- closing without booking: the card returns to its table and is put away ---------- */
  function closeCard() {
    if (state.openTl) state.openTl.progress(1);       // still flying in: land it first, then send it back
    if (!state.open || state.busy || state.animating) return;
    closePanels(true);
    exitCursor();
    const spot = state.spot;
    const done = () => {
      booking.hidden = true;
      state.open = false; state.animating = false;
      lockPage(false);
      if (gsap) gsap.set([paper, backdrop], { clearProps: 'all' });
      if (gsap) gsap.set(pen, { clearProps: 'opacity' });
      spot.focus({ preventScroll: true });
    };
    if (!motionOK()) { done(); return; }
    state.animating = true;
    const pr = paper.getBoundingClientRect();
    const tr = $('.table-ring', spot).getBoundingClientRect();
    const from = rectCenter(pr), to = rectCenter(tr);
    const s1 = Math.max(0.04, (Math.min(tr.width, tr.height) * 0.42) / pr.width);
    const penTo = centrePose(to.x, to.y, -71, (tr.width * 0.4) / penBox().w);
    gsap.timeline({ onComplete: done })
      .to(paper, { x: to.x - from.x, y: to.y - from.y, scale: s1, rotationZ: -9, duration: 1.1, ease: 'power3.inOut' }, 0)
      .to(paper, { keyframes: { rotationX: [0, 26, 0], easeEach: 'sine.inOut' }, duration: 1.1 }, 0)
      .to(paper, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0.85)
      .to(pen, { ...penTo, duration: 1.1, ease: 'power3.inOut' }, 0)
      .to(pen, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0.85)
      .to(backdrop, { opacity: 0, duration: 0.9, ease: 'power1.inOut' }, 0.15);
  }
  $('[data-close-paper]').addEventListener('click', closeCard);

  /* =========================================================
     Panels (calendar + time) share open/close
     ========================================================= */
  const cal = $('#cal');
  const tp = $('#tp');
  let openPanelEl = null, panelReturn = null;

  function openPanel(which) {
    const el = which === 'cal' ? cal : tp;
    if (state.locked || state.busy) return;
    if (openPanelEl && openPanelEl !== el) closePanels(true);
    panelReturn = which === 'cal' ? dateBtn : timeBtn;
    if (which === 'cal') prepareCalendar(); else prepareTimes();
    el.hidden = false;
    openPanelEl = el;
    if (motionOK()) {
      gsap.fromTo(el, { opacity: 0, y: 26, clipPath: 'inset(100% 0% 0% 0%)' }, { opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.55, ease: 'power3.out' });
    }
    const focusTarget = which === 'cal'
      ? ($('.cal-day[aria-selected="true"]', cal) || $('.cal-day:not(:disabled)', cal))
      : ($('.tp-chip[aria-checked="true"]:not(:disabled)', tp) || $('.tp-seg[aria-checked="true"]', tp));
    (focusTarget || $('.panel-close', el)).focus({ preventScroll: true });
  }

  function closePanels(instant = false, restoreFocus = false) {
    const el = openPanelEl;
    if (!el) { cal.hidden = true; tp.hidden = true; return; }
    openPanelEl = null;
    const fin = () => { el.hidden = true; if (gsap) gsap.set(el, { clearProps: 'all' }); if (restoreFocus && panelReturn) panelReturn.focus({ preventScroll: true }); };
    if (instant || !motionOK()) { fin(); return; }
    gsap.to(el, { opacity: 0, y: 18, clipPath: 'inset(0% 0% 100% 0%)', duration: 0.4, ease: 'power2.in', onComplete: fin });
  }
  $$('[data-close-panel]').forEach((b) => b.addEventListener('click', () => closePanels(false, true)));
  dateBtn.addEventListener('click', () => openPanel('cal'));
  timeBtn.addEventListener('click', () => openPanel('tp'));

  /* ---------- calendar ---------- */
  const calGrid = $('#cal-grid');
  const calMonth = $('#cal-month');
  const calPicked = $('#cal-picked');
  const calPrev = $('#cal-prev');
  const calNext = $('#cal-next');
  const calUse = $('#cal-use');
  const cal$ = { month: null, pick: null };

  const windowEnd = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + CONFIG.BOOKING_WINDOW_DAYS); return T.dateKey(d); };

  function prepareCalendar() {
    cal$.pick = state.date;
    const base = state.date ? T.parseDateKey(state.date) : new Date();
    cal$.month = new Date(base.getFullYear(), base.getMonth(), 1);
    renderCalendar(0);
  }

  function renderCalendar(dir) {
    const m = cal$.month;
    const today = todayKey();
    const last = windowEnd();
    calMonth.textContent = m.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const startOffset = (m.getDay() + 6) % 7; // Monday first
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    calGrid.innerHTML = '';
    let row = null;
    const cells = Math.ceil((startOffset + days) / 7) * 7;
    for (let i = 0; i < cells; i++) {
      if (i % 7 === 0) { row = document.createElement('div'); row.setAttribute('role', 'row'); row.style.display = 'contents'; calGrid.appendChild(row); }
      const dnum = i - startOffset + 1;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cal-day';
      b.setAttribute('role', 'gridcell');
      if (dnum < 1 || dnum > days) { b.classList.add('is-outside'); b.disabled = true; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); row.appendChild(b); continue; }
      const key = T.dateKey(new Date(m.getFullYear(), m.getMonth(), dnum));
      b.textContent = dnum;
      b.dataset.date = key;
      const tooEarly = key < today || (key === today && !freeStartsOn(key, state.table.id));
      const tooLate = key > last;
      b.disabled = tooEarly || tooLate;
      b.setAttribute('aria-label', `${T.dateLabel(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${key === today ? ', today' : ''}${b.disabled ? ', unavailable' : ''}`);
      if (key === today) b.classList.add('is-today');
      b.setAttribute('aria-selected', key === cal$.pick ? 'true' : 'false');
      b.tabIndex = key === cal$.pick ? 0 : -1;
      b.addEventListener('click', () => pickDay(key));
      row.appendChild(b);
    }
    if (!$('.cal-day[tabindex="0"]', calGrid)) { const f = $('.cal-day:not(:disabled)', calGrid); if (f) f.tabIndex = 0; }
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
    calPrev.disabled = m <= thisMonth;
    const lastD = T.parseDateKey(last);
    calNext.disabled = m.getFullYear() > lastD.getFullYear() || (m.getFullYear() === lastD.getFullYear() && m.getMonth() >= lastD.getMonth());
    calPicked.textContent = cal$.pick ? T.dateLabel(cal$.pick, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'No date selected';
    calUse.disabled = !cal$.pick;
    if (dir && motionOK()) gsap.fromTo(calGrid, { xPercent: dir * 35, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.45, ease: 'power3.out' });
  }

  function pickDay(key) {
    cal$.pick = key;
    $$('.cal-day', calGrid).forEach((b) => { const on = b.dataset.date === key; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    calPicked.textContent = T.dateLabel(key, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    calUse.disabled = false;
  }
  calPrev.addEventListener('click', () => { cal$.month = new Date(cal$.month.getFullYear(), cal$.month.getMonth() - 1, 1); renderCalendar(-1); });
  calNext.addEventListener('click', () => { cal$.month = new Date(cal$.month.getFullYear(), cal$.month.getMonth() + 1, 1); renderCalendar(1); });
  calGrid.addEventListener('keydown', (e) => {
    const cur = e.target.closest('.cal-day');
    if (!cur || !cur.dataset.date) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!cur.disabled) { pickDay(cur.dataset.date); } return; }
    if (!step) return;
    e.preventDefault();
    const d = T.parseDateKey(cur.dataset.date); d.setDate(d.getDate() + step);
    const key = T.dateKey(d);
    if (d.getMonth() !== cal$.month.getMonth()) {
      if ((step < 0 && calPrev.disabled) || (step > 0 && calNext.disabled)) return;
      cal$.month = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendar(step > 0 ? 1 : -1);
    }
    const target = $(`.cal-day[data-date="${key}"]`, calGrid);
    if (target) { $$('.cal-day', calGrid).forEach((b) => (b.tabIndex = -1)); target.tabIndex = 0; target.focus(); }
  });
  calUse.addEventListener('click', () => {
    if (!cal$.pick) return;
    const changed = cal$.pick !== state.date;
    state.date = cal$.pick;
    if (changed && state.start != null && startState(state.date, state.start, state.table.id) === 'past') { state.start = null; state.end = null; }
    setValue(dateBtn, T.dateLabel(state.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    setValue(timeBtn, timeText());
    checkDate(true);
    if (state.start != null || state.attempted) checkTime(true);
    refreshTableField();
    closePanels(false, true);
  });

  /* =========================================================
     Time picker: step 1 start time, step 2 end time
     ========================================================= */
  const tpTitle = $('#tp-title');
  const tpBody = $('#tp-body');
  const tpHours = $('#tp-hours');
  const tpMins = $('#tp-mins');
  const tpUse = $('#tp-use');
  const tpBack = $('#tp-back');
  const tpPicked = $('#tp-picked');
  const tpContext = $('#tp-context');
  const stepStart = $('#tp-step-start');
  const stepEnd = $('#tp-step-end');
  const segs = $$('.tp-seg', tp);
  const tp$ = { stage: 'start', ampm: 'pm', hour: null, min: null, start: null, end: null };

  const chipState = (m) => (tp$.stage === 'start'
    ? startState(state.date, m, state.table.id)
    : endState(state.date, tp$.start, m, state.table.id));
  function hourOk(h24) {
    for (let mm = 0; mm < 60; mm += SLOT) if (chipState(h24 * 60 + mm) === 'free') return true;
    return false;
  }
  function halfOk(ampm) {
    for (let h = ampm === 'am' ? 0 : 12; h < (ampm === 'am' ? 12 : 24); h++) if (hourOk(h)) return true;
    return false;
  }

  function prepareTimes() {
    if (!state.date) state.date = firstBookableDate(state.table.id);
    tp$.start = state.start; tp$.end = state.end;
    if (tp$.start != null && startState(state.date, tp$.start, state.table.id) !== 'free') { tp$.start = null; tp$.end = null; }
    setStage('start', false);
  }

  function setStage(stage, animate = true) {
    const apply = () => {
      tp$.stage = stage;
      const val = stage === 'start' ? tp$.start : tp$.end;
      if (val != null) { tp$.hour = Math.floor(val / 60); tp$.min = val % 60; }
      else { tp$.hour = null; tp$.min = null; }
      const anchor = val != null ? val : stage === 'end' ? tp$.start : null;
      tp$.ampm = anchor != null ? (anchor < 720 ? 'am' : 'pm') : (halfOk('pm') ? 'pm' : 'am');
      if (!halfOk(tp$.ampm) && halfOk(tp$.ampm === 'am' ? 'pm' : 'am')) tp$.ampm = tp$.ampm === 'am' ? 'pm' : 'am';
      tpTitle.textContent = stage === 'start' ? 'Choose a start time' : 'Choose an end time';
      stepStart.classList.toggle('is-active', stage === 'start');
      stepEnd.classList.toggle('is-active', stage === 'end');
      stepStart.setAttribute('aria-selected', String(stage === 'start'));
      stepEnd.setAttribute('aria-selected', String(stage === 'end'));
      stepEnd.disabled = tp$.start == null;
      tpBack.hidden = stage !== 'end';
      tpContext.textContent = stage === 'start'
        ? `${shortDate(state.date)} · Table ${state.table.number} · bookings last ${MIN_LEN} min to ${T.durationLabel(MAX_LEN)}`
        : `From ${T.minutesToLabel(tp$.start)} · choose when your table is free again (${MIN_LEN} min – ${T.durationLabel(MAX_LEN)})`;
      renderTimes();
    };
    if (!animate || !motionOK()) { apply(); return; }
    gsap.to(tpBody, { opacity: 0, y: -8, duration: 0.22, ease: 'power1.in', onComplete: () => {
      apply();
      gsap.fromTo(tpBody, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
      gsap.fromTo([tpTitle, tpContext], { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out' });
      const first = $('.tp-chip[aria-checked="true"]:not(:disabled)', tp) || $('.tp-chip:not(:disabled)', tpHours) || $('.tp-seg[aria-checked="true"]', tp);
      if (first) first.focus({ preventScroll: true });
    } });
  }

  function renderTimes() {
    stepStart.querySelector('small').textContent = tp$.start != null ? T.minutesToLabel(tp$.start) : 'Not set';
    stepEnd.querySelector('small').textContent = tp$.end != null ? T.minutesToLabel(tp$.end) : 'Not set';
    segs.forEach((s) => {
      const on = s.dataset.ampm === tp$.ampm;
      s.setAttribute('aria-checked', on ? 'true' : 'false');
      s.tabIndex = on ? 0 : -1;
      s.disabled = !halfOk(s.dataset.ampm);
    });
    tpHours.innerHTML = '';
    const base = tp$.ampm === 'am' ? 0 : 12;
    const startHour = tp$.start != null ? Math.floor(tp$.start / 60) : -1;
    for (let i = 0; i < 12; i++) {
      const h24 = base + i;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tp-chip';
      b.setAttribute('role', 'radio');
      b.textContent = String(i === 0 ? 12 : i);
      b.dataset.hour = h24;
      const ok = hourOk(h24);
      b.disabled = !ok;
      if (tp$.stage === 'end' && h24 === startHour) b.classList.add('is-start');
      b.setAttribute('aria-checked', tp$.hour === h24 ? 'true' : 'false');
      b.setAttribute('aria-label', `${i === 0 ? 12 : i} ${tp$.ampm.toUpperCase()}${ok ? '' : ', unavailable'}`);
      b.addEventListener('click', () => {
        tp$.hour = h24;
        if (tp$.min != null && chipState(h24 * 60 + tp$.min) !== 'free') tp$.min = null;
        renderTimes(); focusChip(tpHours, h24, 'hour');
      });
      tpHours.appendChild(b);
    }
    tpMins.innerHTML = '';
    for (let mm = 0; mm < 60; mm += SLOT) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tp-chip';
      b.setAttribute('role', 'radio');
      b.textContent = ':' + T.pad(mm);
      b.dataset.min = mm;
      if (tp$.hour == null) {
        b.disabled = true;
        b.setAttribute('aria-label', `${T.pad(mm)} minutes, choose an hour first`);
      } else {
        const st = chipState(tp$.hour * 60 + mm);
        b.disabled = st !== 'free';
        if (st === 'booked') b.classList.add('is-booked');
        b.setAttribute('aria-label', `${T.minutesToLabel(tp$.hour * 60 + mm)}${st === 'booked' ? ', reserved at this table' : st !== 'free' ? ', unavailable' : ''}`);
      }
      b.setAttribute('aria-checked', tp$.min === mm && tp$.hour != null ? 'true' : 'false');
      b.addEventListener('click', () => pickMinute(mm));
      tpMins.appendChild(b);
    }
    const chosen = tp$.hour != null && tp$.min != null ? tp$.hour * 60 + tp$.min : null;
    if (tp$.stage === 'start') {
      tpPicked.textContent = chosen != null ? `Starts ${T.minutesToLabel(chosen)}` : tp$.hour != null ? 'Pick the minutes' : 'Pick an hour';
      tpUse.textContent = 'Next: end time';
      tpUse.disabled = chosen == null;
    } else {
      tpPicked.textContent = chosen != null
        ? `${T.minutesToLabel(tp$.start)} – ${T.minutesToLabel(chosen)} · ${T.durationLabel(chosen - tp$.start)}`
        : `From ${T.minutesToLabel(tp$.start)}`;
      tpUse.textContent = chosen != null ? `Use ${T.minutesToLabel(tp$.start)} – ${T.minutesToLabel(chosen)}` : 'Use this time';
      tpUse.disabled = chosen == null;
    }
  }
  function focusChip(grid, value, key) {
    const b = $(`.tp-chip[data-${key}="${value}"]`, grid);
    if (b) b.focus({ preventScroll: true });
  }
  let advanceTimer = null;
  function pickMinute(mm) {
    tp$.min = mm;
    const v = tp$.hour * 60 + mm;
    if (tp$.stage === 'start') {
      if (tp$.start !== v) tp$.end = null;           // a new start clears the old end
      tp$.start = v;
      renderTimes(); focusChip(tpMins, mm, 'min');
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(() => { if (openPanelEl === tp && tp$.stage === 'start') setStage('end'); }, 420);
    } else {
      tp$.end = v;
      renderTimes(); focusChip(tpMins, mm, 'min');
    }
  }
  segs.forEach((s) => s.addEventListener('click', () => {
    if (tp$.ampm === s.dataset.ampm) return;
    tp$.ampm = s.dataset.ampm;
    tp$.hour = null; tp$.min = null;
    renderTimes();
    if (motionOK()) gsap.fromTo([tpHours, tpMins], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out' });
    s.focus({ preventScroll: true });
  }));
  stepStart.addEventListener('click', () => { if (tp$.stage !== 'start') { clearTimeout(advanceTimer); setStage('start'); } });
  stepEnd.addEventListener('click', () => { if (tp$.stage !== 'end' && tp$.start != null) setStage('end'); });
  tpBack.addEventListener('click', () => { clearTimeout(advanceTimer); setStage('start'); });
  tpUse.addEventListener('click', () => {
    if (tp$.hour == null || tp$.min == null) return;
    if (tp$.stage === 'start') { clearTimeout(advanceTimer); setStage('end'); return; }
    state.start = tp$.start;
    state.end = tp$.end;
    setValue(timeBtn, timeText());
    checkTime(true);
    refreshTableField();
    closePanels(false, true);
  });

  /* =========================================================
     Keyboard: Escape + focus trap inside the card
     ========================================================= */
  document.addEventListener('keydown', (e) => {
    if (!manage.hidden) return;   // the bookings panel handles its own keys
    if (!state.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (openPanelEl) closePanels(false, true);
      else if (!state.locked) closeCard();
      return;
    }
    if (e.key === 'Tab') {
      const scope = openPanelEl || paper;
      const focusables = $$('button:not(:disabled), input:not(:disabled), [tabindex="0"]', scope)
        .filter((el) => el.offsetParent !== null && !el.closest('[hidden]') && (scope !== paper || !el.closest('.paper-panel')));
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!scope.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
  backdrop.addEventListener('click', () => { if (!openPanelEl && !state.locked) closeCard(); });

  /* =========================================================
     Submit
     ========================================================= */
  paper.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.busy || state.locked || state.animating) return;
    state.attempted = true;
    const okName = checkName(true), okDate = checkDate(true), okTime = checkTime(true), okGuests = checkGuests(true);
    const okTable = refreshTableField();
    if (!(okName && okDate && okTime && okGuests && okTable)) {
      const firstBad = !okName ? nameIn : !okDate ? dateBtn : !okTime ? timeBtn : !okTable ? ($('.pf-error--table .btn', paper) || timeBtn) : guestsIn;
      firstBad.focus({ preventScroll: true });
      if (motionOK()) gsap.fromTo(paper, { x: 0 }, { keyframes: { x: [0, -9, 8, -5, 3, 0] }, duration: 0.45, ease: 'power1.out' });
      return;
    }

    // the click is a user gesture, so audio may start now
    const sound = motionOK() ? createScribbleSound() : null;

    state.busy = true;
    confirmBtn.disabled = true;
    confirmBtn.setAttribute('aria-busy', 'true');
    $('[data-label]', confirmBtn).textContent = 'Confirming…';
    if (scene) scene.expectArrival();
    state.locked = true;            // the card no longer reacts to booking changes (including its own)

    const result = Svc.create({
      tableId: state.table.id,
      guestName: nameIn.value,
      guests: Number(guestsIn.value),
      date: state.date,
      time: T.timeKey(state.start),
      endTime: T.timeKey(state.end)
    });

    if (!result.ok) {
      if (sound) sound.stop();
      if (scene) scene.cancelExpect();
      state.locked = false;
      state.busy = false;
      confirmBtn.disabled = false;
      confirmBtn.removeAttribute('aria-busy');
      $('[data-label]', confirmBtn).textContent = 'Confirm Your Reservation';
      if (result.field === 'table') refreshTableField();
      else setError(result.field, result.message);
      return;
    }

    // freeze the card
    fields.disabled = true;
    paper.classList.add('is-locked');
    $('[data-label]', confirmBtn).textContent = 'Reserved';
    const r = result.reservation;
    statusEl.textContent = `Table ${r.tableNumber} is reserved for ${r.guestName} on ${T.dateLabel(r.date, { weekday: 'long', day: 'numeric', month: 'long' })}, ${rangeLabel(r)}, for ${r.guests} ${r.guests === 1 ? 'guest' : 'guests'}. Your party is on its way in.`;
    signCard(r, sound).then(() => sendHome(r));
  });

  /* =========================================================
     Signing: the pen draws the Luxury Vibes mark on the card
     ========================================================= */
  const signSvg = $('svg', signEl);
  const signStrokes = $$('.sign-stroke', signEl);
  const signName = $('.sign-name', signEl);
  const signClip = $('#sign-clip-rect');
  const signSub = $('#sign-sub');

  function svgPoint(el, x, y) {
    const m = el.getScreenCTM();
    return { x: x * m.a + y * m.c + m.e, y: x * m.b + y * m.d + m.f };
  }

  async function signCard(r, sound) {
    exitCursor();
    if (cursor.tween) cursor.tween.kill();
    paper.classList.add('is-signing');
    signSub.textContent = `RESERVED · TABLE ${r.tableNumber}`;
    signSub.classList.remove('is-on');
    signStrokes.forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      p.classList.remove('is-filled');
    });
    const nameW = signName.getBBox().width + 14;
    signClip.setAttribute('width', '0');
    signEl.classList.add('is-on');

    if (!motionOK()) {
      signStrokes.forEach((p) => { p.style.strokeDashoffset = '0'; if (p.classList.contains('sign-fill')) p.classList.add('is-filled'); });
      signClip.setAttribute('width', String(nameW));
      signSub.classList.add('is-on');
      await wait(900);
      return;
    }

    const signScale = (paper.getBoundingClientRect().width * 0.44) / penBox().w;
    const ROT = -38;
    let last = null, lastT = 0;
    const putTip = (pt) => {
      gsap.set(pen, tipPose(pt.x, pt.y, ROT, signScale));
      const now = performance.now();
      if (last && sound) sound.speed(Math.hypot(pt.x - last.x, pt.y - last.y) / Math.max(0.008, (now - lastT) / 1000));
      last = pt; lastT = now;
    };
    const run = ({ target, ...vars }) => new Promise((resolve) => gsap.to(target, { ...vars, onComplete: resolve }));

    // to the first stroke
    const p0 = signStrokes[0];
    const s0 = p0.getPointAtLength(0);
    const first = svgPoint(p0, s0.x, s0.y);
    await new Promise((resolve) => gsap.to(pen, { ...tipPose(first.x, first.y, ROT, signScale * 1.06), duration: 0.75, ease: 'power3.inOut', onComplete: resolve }));

    for (const path of signStrokes) {
      const len = path.getTotalLength();
      const a = path.getPointAtLength(0);
      const startPt = svgPoint(path, a.x, a.y);
      // lift and move to the start of the stroke
      await new Promise((resolve) => gsap.to(pen, { ...tipPose(startPt.x, startPt.y, ROT, signScale * 1.06), duration: 0.2, ease: 'power2.inOut', onComplete: resolve }));
      gsap.to(pen, { scale: signScale, duration: 0.08 });
      last = null;
      if (sound) sound.down();
      const proxy = { p: 0 };
      await run({
        target: proxy, p: 1, duration: Math.max(0.28, len / 70), ease: 'sine.inOut',
        onUpdate: () => {
          const d = len * proxy.p;
          path.style.strokeDashoffset = `${len - d}`;
          const pt = path.getPointAtLength(d);
          putTip(svgPoint(path, pt.x, pt.y));
        }
      });
      if (sound) sound.up();
      if (path.classList.contains('sign-fill')) path.classList.add('is-filled');
    }

    // the name, written left to right
    const baseY = 74;
    const startName = svgPoint(signSvg, 160, baseY - 16);
    await new Promise((resolve) => gsap.to(pen, { ...tipPose(startName.x, startName.y, ROT, signScale * 1.06), duration: 0.32, ease: 'power2.inOut', onComplete: resolve }));
    gsap.to(pen, { scale: signScale, duration: 0.08 });
    last = null;
    if (sound) sound.down();
    const proxy = { p: 0 };
    await run({
      target: proxy, p: 1, duration: 1.9, ease: 'none',
      onUpdate: () => {
        const w = nameW * proxy.p;
        signClip.setAttribute('width', String(w));
        // the nib loops up and down like handwriting as it travels along the word
        const y = baseY - 18 + 15 * Math.sin(proxy.p * Math.PI * 22) * Math.sin(proxy.p * Math.PI);
        putTip(svgPoint(signSvg, 160 + w, y));
      }
    });
    if (sound) { sound.up(); sound.stop(0.5); }
    signSub.classList.add('is-on');

    // the pen goes back to rest beside the card
    const rest = restPose();
    await new Promise((resolve) => gsap.to(pen, { ...rest, duration: 0.8, ease: 'power3.inOut', onComplete: resolve }));
    await wait(350);
  }

  /* ---------- the sound of a nib on textured paper (Web Audio, no files) ---------- */
  function createScribbleSound() {
    let ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { return null; }
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // white noise with a grainy texture: occasional stronger grains like paper fibres
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.06 ? 1 : 0.45);
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 0.8;
    const scratch = ctx.createGain(); scratch.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const body = ctx.createGain(); body.gain.value = 0;
    const master = ctx.createGain(); master.gain.value = 0.9;
    src.connect(hp); hp.connect(bp); bp.connect(scratch); scratch.connect(master);
    src.connect(lp); lp.connect(body); body.connect(master);
    master.connect(ctx.destination);
    src.start();
    let down = false, stopped = false;
    const set = (param, v, tc = 0.015) => param.setTargetAtTime(v, ctx.currentTime, tc);
    return {
      down() { down = true; },
      up() { down = false; set(scratch.gain, 0, 0.03); set(body.gain, 0, 0.03); },
      speed(v) {
        if (!down || stopped) return;
        const k = Math.min(1, v / 650);
        const grain = 0.65 + Math.random() * 0.7;                // paper tooth makes it uneven
        set(scratch.gain, (0.04 + 0.42 * k) * grain);
        set(body.gain, (0.02 + 0.2 * k) * grain);
        set(bp.frequency, 2600 + 1800 * k + Math.random() * 500, 0.03);
      },
      stop(after = 0.2) {
        if (stopped) return;
        stopped = true;
        set(master.gain, 0, after / 3);
        setTimeout(() => { try { src.stop(); ctx.close(); } catch (e) { /* already closed */ } }, after * 1000 + 300);
      }
    };
  }

  /* ---------- the card and pen go back to their table, then the party arrives ---------- */
  function sendHome(r) {
    const spot = spots.get(r.tableId);
    renderTables();
    const finish = () => {
      booking.hidden = true;
      state.open = false; state.busy = false; state.animating = false;
      lockPage(false);
      if (gsap) gsap.set([paper, backdrop], { clearProps: 'all' });
      if (gsap) gsap.set(pen, { clearProps: 'opacity' });
      paper.classList.remove('is-signing');
      signEl.classList.remove('is-on');
      spot.classList.remove('is-landing');
      spot.focus({ preventScroll: true });
      if (scene) scene.arrive(r.id);
    };
    if (!motionOK()) { finish(); return; }

    state.animating = true;
    spot.classList.add('is-landing');                // hide the table's own card until ours lands
    const card = $('.table-card', spot);
    const miniPen = $('.tc-pen', card);
    const pr = paper.getBoundingClientRect();
    const cardC = rectCenter(card.getBoundingClientRect());
    const s1 = card.offsetWidth / pr.width;
    const from = rectCenter(pr);
    const tip = rectCenter($('.tc-tip', card).getBoundingClientRect());
    const penTo = tipPose(tip.x, tip.y, -71, miniPen.offsetWidth / penBox().w);

    state.homeTl = gsap.timeline({ onComplete: finish });
    state.homeTl
      .to(paper, { x: cardC.x - from.x, y: cardC.y - from.y, scale: s1, rotationZ: -9, duration: 1.55, ease: 'power3.inOut' }, 0.15)
      .to(paper, { keyframes: { rotationX: [0, -22, 9, 0], rotationY: [0, 12, -4, 0], easeEach: 'sine.inOut' }, duration: 1.55, ease: 'none' }, 0.15)
      .to(pen, { ...penTo, duration: 1.6, ease: 'power3.inOut' }, 0.05)
      .to(backdrop, { opacity: 0, duration: 1.3, ease: 'power1.inOut' }, 0.35)
      .add(() => { spot.classList.remove('is-landing'); }, 1.72)
      .to([paper, pen], { opacity: 0, duration: 0.18, ease: 'none' }, 1.72);
  }

  /* =========================================================
     Manage bookings: tick bookings to remove, or remove all
     ========================================================= */
  const manage = $('#manage');
  const manageList = $('#manage-list');
  const manageAll = $('#manage-all');
  const manageRemove = $('#manage-remove');
  const manageStatus = $('#manage-status');
  const manageOpenBtn = $('#manage-open');

  function manageBoxes() { return $$('input[type="checkbox"]', manageList); }
  function updateManage() {
    const boxes = manageBoxes();
    const n = boxes.filter((b) => b.checked).length;
    manageAll.checked = boxes.length > 0 && n === boxes.length;
    manageAll.indeterminate = n > 0 && n < boxes.length;
    manageAll.disabled = boxes.length === 0;
    manageRemove.disabled = n === 0;
    manageRemove.textContent = n === 0 ? 'Remove selected' : n === boxes.length && n > 1 ? `Remove all ${n} bookings` : `Remove ${n} ${n === 1 ? 'booking' : 'bookings'}`;
  }
  function buildManage() {
    const now = Date.now();
    const list = Svc.list().sort((a, b) => a.start - b.start);
    manageList.innerHTML = '';
    if (!list.length) {
      manageList.innerHTML = '<li class="manage-empty">There are no bookings to remove.</li>';
    }
    list.forEach((r) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'manage-row';
      label.innerHTML = '<input type="checkbox"><span class="mcheck" aria-hidden="true"></span><span class="mr-text"><strong></strong><small></small></span><span class="bb-chip"></span>';
      const box = $('input', label);
      box.value = r.id;
      $('strong', label).textContent = `Table ${r.tableNumber} · ${r.guestName}`;
      $('small', label).textContent = bookingLine(r);
      const phase = Svc.phase(r, now);
      const chip = $('.bb-chip', label);
      chip.classList.add(`bb-chip--${phase}`);
      chip.textContent = phaseName[phase];
      box.addEventListener('change', updateManage);
      li.appendChild(label);
      manageList.appendChild(li);
    });
    updateManage();
  }
  function openManage() {
    manageStatus.textContent = '';
    buildManage();
    manage.hidden = false;
    lockPage(true);
    (manageAll.disabled ? $('[data-manage-close].btn', manage) : manageAll).focus({ preventScroll: true });
  }
  function closeManage() {
    manage.hidden = true;
    lockPage(false);
    manageOpenBtn.focus({ preventScroll: true });
  }
  manageOpenBtn.addEventListener('click', openManage);
  $$('[data-manage-close]', manage).forEach((b) => b.addEventListener('click', closeManage));
  manageAll.addEventListener('change', () => {
    manageBoxes().forEach((b) => { b.checked = manageAll.checked; });
    updateManage();
  });
  manageRemove.addEventListener('click', () => {
    const ids = manageBoxes().filter((b) => b.checked).map((b) => b.value);
    if (!ids.length) return;
    const n = Svc.remove(ids);
    const msg = `Removed ${n} ${n === 1 ? 'booking' : 'bookings'}.`;
    buildManage();
    manageStatus.textContent = msg;
    statusEl.textContent = msg;
    if (!manageBoxes().length) manageAll.checked = false;
    // keep keyboard focus inside the panel
    (manageAll.disabled ? $('[data-manage-close].btn', manage) : manageAll).focus({ preventScroll: true });
  });
  document.addEventListener('keydown', (e) => {
    if (manage.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeManage(); return; }
    if (e.key !== 'Tab') return;
    if (!manage.contains(document.activeElement)) { e.preventDefault(); manageAll.focus(); return; }
    const f = $$('input:not(:disabled), button:not(:disabled)', manage).filter((el) => el.offsetParent !== null || el.type === 'checkbox');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // for testing departures without waiting for a booking to end
  window.LuxuryReservations = { service: Svc, scene: () => scene, finish: (id) => Svc.finish(id), _state: () => state };
})();

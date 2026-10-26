/* =========================================================
   Luxury Vibes — reservation data layer
   - CONFIG: booking rules (durations, guest limits, storage)
   - ROOM / TABLES: exact positions measured on the dining-room
     image (1536 x 1024 px). Everything in the scene uses these.
   - ReservationService: the only place bookings are read/written.

   There is no backend in this project, so the service stores
   bookings in this browser (localStorage). That makes the demo
   fully working for one visitor, but it does NOT share bookings
   between visitors or devices. For real availability, replace
   LocalStore below with calls to a shared API/database; the rest
   of the page only talks to ReservationService.
   ========================================================= */
(() => {
  'use strict';
  const LV = (window.LV = window.LV || {});

  /* ---------- booking rules ---------- */
  LV.CONFIG = {
    SLOT_MINUTES: 5,             // smallest selectable time step
    MIN_DURATION_MINUTES: 30,    // shortest booking (start -> end)
    MAX_DURATION_MINUTES: 240,   // longest booking
    LAST_END_MINUTES: 23 * 60 + 55,   // a booking must end by 11:55 PM the same day
    MIN_GUESTS: 1,
    MAX_GUESTS: 6,
    BOOKING_WINDOW_DAYS: 180,    // how far ahead the calendar allows
    LIFECYCLE_CHECK_MS: 5000,    // how often finished bookings are released
    STORAGE_KEY: 'lv-reservations-v2',
    OLD_STORAGE_KEYS: ['lv-reservations-v1']   // earlier demo data, deleted on load
  };

  /* ---------- the room (image pixels) ---------- */
  LV.ROOM = {
    width: 1536,
    height: 1024,
    pxPerMeter: 150,                    // 4-seat table ≈ 1.5 m
    entrance: { x: 34, y: 714 },        // guests walk in (and out) here, on the left
    entranceInside: { x: 128, y: 714 },
    // areas guests can never walk through (walls, bar, banquette, lamps, plants)
    blocked: [
      [0, 0, 1536, 16],          // top wall
      [0, 0, 112, 690],          // left wall + bar counter
      [0, 738, 112, 1024],       // left wall below the doorway
      [100, 0, 176, 106],        // potted palm, top left
      [100, 320, 200, 690],      // bar stools
      [104, 826, 150, 906],      // floor lamp, left
      [110, 884, 212, 1024],     // console, bottom left
      [200, 906, 1184, 1024],    // banquette and planter
      [1170, 822, 1300, 934],    // floor lamp, right
      [1290, 792, 1536, 1024],   // counters, bottom right
      [1378, 0, 1536, 1024]      // windows / right wall
    ]
  };

  const rect = (x, y, w, h) => ({ shape: 'rect', x, y, w, h });
  const circle = (cx, cy, r) => ({ shape: 'circle', cx, cy, r });

  // seats: chair-seat centres in image pixels; fill = order used to seat a party
  LV.TABLES = [
    { id: 't1', number: 1, ...rect(255, 100, 223, 138),
      seats: [[310, 78], [418, 78], [320, 268], [418, 268]], fill: [0, 2, 1, 3] },
    { id: 't2', number: 2, ...rect(615, 100, 213, 138),
      seats: [[668, 78], [768, 78], [675, 268], [770, 268]], fill: [0, 2, 1, 3] },
    { id: 't3', number: 3, ...rect(1052, 100, 221, 140),
      seats: [[1108, 78], [1218, 78], [1113, 268], [1210, 268]], fill: [0, 2, 1, 3] },
    { id: 't4', number: 4, ...circle(414, 487, 86),
      seats: [[405, 383], [305, 498], [517, 476], [413, 588]], fill: [0, 3, 1, 2] },
    { id: 't5', number: 5, ...circle(817, 487, 84),
      seats: [[817, 380], [720, 478], [919, 475], [820, 587]], fill: [0, 3, 1, 2] },
    { id: 't6', number: 6, ...rect(1163, 357, 169, 326),
      seats: [[1135, 432], [1135, 532], [1137, 622], [1358, 430], [1358, 530], [1360, 625]], fill: [0, 3, 1, 4, 2, 5] },
    { id: 't7', number: 7, ...rect(327, 728, 263, 134),
      seats: [[406, 712], [515, 712], [406, 878], [512, 878]], fill: [0, 2, 1, 3] },
    { id: 't8', number: 8, ...rect(745, 728, 261, 135),
      seats: [[820, 712], [930, 712], [821, 880], [930, 880]], fill: [0, 2, 1, 3] }
  ].map((t) => ({
    ...t,
    capacity: t.seats.length,
    center: t.shape === 'circle' ? { x: t.cx, y: t.cy } : { x: t.x + t.w / 2, y: t.y + t.h / 2 },
    // hit area = table plus its chairs, so clicking a chair also picks its table
    bounds: (() => {
      const xs = t.seats.map((s) => s[0]), ys = t.seats.map((s) => s[1]);
      const tx0 = t.shape === 'circle' ? t.cx - t.r : t.x, ty0 = t.shape === 'circle' ? t.cy - t.r : t.y;
      const tx1 = t.shape === 'circle' ? t.cx + t.r : t.x + t.w, ty1 = t.shape === 'circle' ? t.cy + t.r : t.y + t.h;
      return {
        x0: Math.min(tx0, ...xs.map((x) => x - 36)), y0: Math.min(ty0, ...ys.map((y) => y - 30)),
        x1: Math.max(tx1, ...xs.map((x) => x + 36)), y1: Math.max(ty1, ...ys.map((y) => y + 30))
      };
    })()
  }));
  LV.tableById = (id) => LV.TABLES.find((t) => t.id === id);

  /* ---------- date/time helpers (local time) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  LV.time = {
    pad,
    dateKey: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    parseDateKey: (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); },
    at: (dateKey, minutes) => { const d = LV.time.parseDateKey(dateKey); d.setMinutes(minutes); return d.getTime(); },
    minutesToLabel: (m) => {
      const h = Math.floor(m / 60) % 24, mm = m % 60;
      return `${h % 12 === 0 ? 12 : h % 12}:${pad(mm)} ${h < 12 ? 'AM' : 'PM'}`;
    },
    msToLabel: (ms) => { const d = new Date(ms); return LV.time.minutesToLabel(d.getHours() * 60 + d.getMinutes()); },
    timeKey: (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`,
    parseTimeKey: (k) => { const [h, m] = k.split(':').map(Number); return h * 60 + m; },
    dateLabel: (k, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) =>
      LV.time.parseDateKey(k).toLocaleDateString('en-GB', opts),
    durationLabel: (mins) => {
      const h = Math.floor(mins / 60), m = mins % 60;
      return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
    },
    // first bookable slot today: now rounded up to the next slot
    nextSlotMinutes: (now = new Date()) => {
      const m = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() || now.getMilliseconds() ? 1 : 0);
      return Math.ceil(m / LV.CONFIG.SLOT_MINUTES) * LV.CONFIG.SLOT_MINUTES;
    }
  };

  /* ---------- storage (swap this for a real backend) ---------- */
  const memory = { data: null };
  const LocalStore = {
    read() {
      try {
        const raw = window.localStorage.getItem(LV.CONFIG.STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* storage blocked: fall back to memory */ }
      return memory.data;
    },
    write(list) {
      memory.data = list;
      try { window.localStorage.setItem(LV.CONFIG.STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* memory only */ }
    },
    clearOld() {
      try { LV.CONFIG.OLD_STORAGE_KEYS.forEach((k) => window.localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    }
  };

  /* ---------- reservation service ---------- */
  const listeners = new Set();
  let records = [];

  const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const valid = (r) => r && r.id && r.tableId && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start && !r.sample;

  function load() {
    LocalStore.clearOld();
    const stored = LocalStore.read();
    records = Array.isArray(stored) ? stored.filter(valid) : [];
    if (!Array.isArray(stored) || stored.length !== records.length) LocalStore.write(records);
    sweep(false);
  }

  // mark finished bookings completed; prune old history
  function sweep(notify = true) {
    const now = Date.now();
    let changed = false;
    for (const r of records) {
      if (r.status === 'confirmed' && r.end <= now) { r.status = 'completed'; changed = true; }
    }
    const keepAfter = now - 30 * 24 * 3600 * 1000;
    const before = records.length;
    records = records.filter((r) => r.end > keepAfter);
    if (records.length !== before) changed = true;
    if (changed) { LocalStore.write(records); if (notify) emit(); }
  }

  function emit() { for (const fn of listeners) fn(records.slice()); }

  const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
  const C = () => LV.CONFIG;

  LV.ReservationService = {
    list() { return records.slice(); },
    active() { return records.filter((r) => r.status === 'confirmed'); },
    forTable(tableId) { return records.filter((r) => r.tableId === tableId && r.status === 'confirmed').sort((a, b) => a.start - b.start); },
    phase(r, now = Date.now()) {
      if (r.status === 'completed' || r.end <= now) return 'completed';
      return r.start <= now ? 'seated' : 'upcoming';
    },
    /** bookings on this table that overlap [start, end) */
    conflicts(tableId, start, end, ignoreId = null) {
      return this.forTable(tableId).filter((r) => r.id !== ignoreId && overlaps(start, end, r.start, r.end));
    },
    /** validate + save. Returns { ok, reservation } or { ok:false, field, message } */
    create(input) {
      sweep();
      const table = LV.tableById(input.tableId);
      if (!table) return { ok: false, field: 'table', message: 'Please choose a table in the dining room.' };
      const name = String(input.guestName || '').trim().replace(/\s+/g, ' ');
      if (name.length < 2) return { ok: false, field: 'name', message: 'Please enter the name for the booking.' };
      const guests = Number(input.guests);
      if (!Number.isInteger(guests) || guests < C().MIN_GUESTS || guests > C().MAX_GUESTS) {
        return { ok: false, field: 'guests', message: `Enter a whole number from ${C().MIN_GUESTS} to ${C().MAX_GUESTS}.` };
      }
      if (guests > table.capacity) return { ok: false, field: 'guests', message: `Table ${table.number} seats up to ${table.capacity}.` };
      const sMin = LV.time.parseTimeKey(input.time);
      const eMin = LV.time.parseTimeKey(input.endTime);
      if (sMin % C().SLOT_MINUTES || eMin % C().SLOT_MINUTES) return { ok: false, field: 'time', message: 'Times are booked in 5-minute steps.' };
      const len = eMin - sMin;
      if (len < C().MIN_DURATION_MINUTES) return { ok: false, field: 'time', message: `A booking lasts at least ${C().MIN_DURATION_MINUTES} minutes.` };
      if (len > C().MAX_DURATION_MINUTES) return { ok: false, field: 'time', message: `A booking can last up to ${LV.time.durationLabel(C().MAX_DURATION_MINUTES)}.` };
      if (eMin > C().LAST_END_MINUTES) return { ok: false, field: 'time', message: 'Bookings must end by 11:55 PM.' };
      const start = LV.time.at(input.date, sMin);
      const end = LV.time.at(input.date, eMin);
      if (!(start > Date.now())) return { ok: false, field: 'time', message: 'That time has already passed. Please choose a later time.' };
      const clash = this.conflicts(table.id, start, end);
      if (clash.length) return { ok: false, field: 'table', message: 'Apologies, this table is reserved', clash };
      const reservation = {
        id: uid(), tableId: table.id, tableNumber: table.number,
        guestName: name, guests, date: input.date,
        time: input.time, endTime: input.endTime, start, end,
        status: 'confirmed', createdAt: Date.now()
      };
      records.push(reservation);
      LocalStore.write(records);
      emit();
      return { ok: true, reservation };
    },
    /** permanently delete bookings (Manage bookings panel) */
    remove(ids) {
      const set = new Set(ids);
      const before = records.length;
      records = records.filter((r) => !set.has(r.id));
      if (records.length !== before) { LocalStore.write(records); emit(); }
      return before - records.length;
    },
    /** end a booking now (guests stand up and leave); handy for testing */
    finish(id) {
      const r = records.find((x) => x.id === id);
      if (!r || r.status !== 'confirmed') return;
      r.end = Math.min(r.end, Date.now());
      r.status = 'completed';
      LocalStore.write(records);
      emit();
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    tick() { sweep(); }
  };

  load();
  setInterval(() => LV.ReservationService.tick(), LV.CONFIG.LIFECYCLE_CHECK_MS);
  // keep several open tabs of this browser in step
  window.addEventListener('storage', (e) => {
    if (e.key !== LV.CONFIG.STORAGE_KEY) return;
    load();
    emit();
  });
})();

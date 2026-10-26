/* =========================================================
   Luxury Vibes — Menu page
   - renders the 20 dishes from js/menu-data.js
   - the scroll: stage 1 widens the rolled scroll sideways,
     stage 2 unrolls the black sheet downwards (the bottom roller
     turns as it travels). Closing plays the same timeline backwards.
   - a soft parchment sound made live with Web Audio (no files),
     started by the click, with a mute toggle
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const gsap = window.gsap;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionOK = () => !!gsap && !reduced.matches;
  const DATA = window.LV_MENU || { currency: '$', dishes: [] };

  /* ---------- hero heading: word-by-word reveal (same as Reservation) ---------- */
  const title = $('[data-split]');
  if (title && !reduced.matches) {
    const words = title.textContent.trim().split(/\s+/);
    title.setAttribute('aria-label', title.textContent.trim());
    title.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ');
    title.classList.add('is-split');
  }

  /* ---------- dishes ---------- */
  const cols = [$('#dish-col-1'), $('#dish-col-2')];
  const money = (n) => `${DATA.currency}${Number(n).toFixed(Number.isInteger(n) ? 0 : 2)}`;
  DATA.dishes.slice(0, 20).forEach((d, i) => {
    const li = document.createElement('li');
    li.className = 'dish';
    li.innerHTML = `
      <img class="dish-photo" alt="" width="240" height="160" loading="lazy" decoding="async">
      <div class="dish-text">
        <h4 class="dish-name"></h4>
        <span class="dish-rule" aria-hidden="true"></span>
        <p class="dish-desc"></p>
        <span class="dish-price"></span>
      </div>`;
    const img = $('img', li);
    img.src = `assets/images/menu/dishes/${d.image}`;
    img.alt = d.alt || d.name;
    $('.dish-name', li).textContent = d.name;
    $('.dish-desc', li).textContent = d.description;
    $('.dish-price', li).textContent = money(d.price);
    cols[i < 10 ? 0 : 1].appendChild(li);
  });

  /* ---------- elements + state ---------- */
  const stageEl = $('#scroll-stage');
  const wrap = $('#menu-sheet');
  const sheet = $('.sheet', wrap);
  const toggle = $('#scroll-toggle');
  const label = $('[data-label]', toggle);
  const muteBtn = $('#scroll-mute');
  const status = $('#scroll-status');
  const section = $('#scroll-section');

  const geo = { d: 88, closedW: 520, openW: 1200, H: 1400 };
  const st = { w: 0, h: 0 };                 // animated values
  let tl = null;
  let state = 'closed';                      // closed | opening | open | closing
  let lastH = 0, lastT = 0, lastW = 0, lastWT = 0;

  const setVar = (k, v) => stageEl.style.setProperty(k, v);

  function measure() {
    const avail = section.clientWidth - parseFloat(getComputedStyle(section).paddingLeft) - parseFloat(getComputedStyle(section).paddingRight);
    const vw = window.innerWidth;
    const narrow = vw < 640;
    const d = Math.round(narrow ? Math.max(38, Math.min(50, vw * 0.1)) : Math.max(50, Math.min(92, vw * 0.064)));
    const capW = d * 1.4553;
    // on phones the spike tips of the end caps may run just past the screen edge, so the paper gets the width
    const overhang = narrow ? capW * 0.42 : 0;
    const closedW = Math.round(Math.max(140, Math.min(480, vw * 0.3, avail - capW * 2 - 8)));
    const openW = Math.round(Math.max(closedW, Math.min(1480, avail - capW * 2 + d * 0.06 + overhang * 2)));
    geo.d = d; geo.closedW = closedW; geo.openW = openW;
    setVar('--d', `${d}px`);
    // measure the sheet at its open width (it is clipped to zero height, so nothing shows)
    const prevW = stageEl.style.getPropertyValue('--rod-w');
    setVar('--rod-w', `${openW}px`);
    geo.H = Math.ceil(sheet.getBoundingClientRect().height + d * 0.5);
    setVar('--rod-w', prevW || `${closedW}px`);
    makeDeckle();
  }

  // softly irregular side edges for the paper
  function makeDeckle() {
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const left = [], right = [];
    for (let y = 0; y <= 100; y += 1.25) {
      left.push(`${(r() * 3.2).toFixed(2)}px ${y}%`);
      right.push(`calc(100% - ${(r() * 3.2).toFixed(2)}px) ${y}%`);
    }
    sheet.style.setProperty('--deckle', `polygon(${[...left, ...right.reverse()].join(',')})`);
  }

  /* ---------- applying the animated values ---------- */
  function applyW() {
    setVar('--rod-w', `${st.w}px`);
    const now = performance.now();
    const v = Math.abs(st.w - lastW) / Math.max(0.008, (now - lastWT) / 1000);
    lastW = st.w; lastWT = now;
    sound.slide(v);
  }

  function applyH() {
    const now = performance.now();
    const dt = Math.max(0.008, (now - lastT) / 1000);
    const v = Math.max(-1600, Math.min(1600, (st.h - lastH) / dt));   // px per second (+ opening, - closing), capped
    lastH = st.h; lastT = now;
    setVar('--open', `${st.h.toFixed(2)}px`);
    // the bottom roller turns as it travels: its surface moves by the distance rolled
    setVar('--roll', `${(-st.h * 0.9).toFixed(1)}px`);
    // heavy paper: it leans back and ripples a little while moving, then settles flat
    const speed = Math.min(1, Math.abs(v) / 900);
    wrap.style.setProperty('--ripple', (speed * 0.85).toFixed(3));
    wrap.style.setProperty('--ripple-y', `${(st.h * 0.6).toFixed(1)}px`);
    sheet.style.setProperty('--tilt', `${Math.max(-6, Math.min(6, -v / 900 * 5)).toFixed(3)}deg`);
    sheet.style.setProperty('--skew', `${(Math.sin(now / 260) * speed * 0.35).toFixed(3)}deg`);
    sound.rustle(v);
    camApply();
  }

  /* ---------- the camera ----------
     The page scroll is a pure function of the animation, applied
     instantly each frame (never smooth-scrolled, never nudged), so it
     moves in one continuous glide and runs backwards just as smoothly.
       stage 1: glide from where you were to the scroll's top edge
       stage 2: once the roller nears the bottom of the screen, travel with it
     If you scroll yourself during a movement, the camera lets go. */
  const cam = { p: 0, from: 0, align: 0, stageTop: 0, offset: 0, active: false };
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  function camTarget() {
    const vh = window.innerHeight;
    const base = cam.from + (cam.align - cam.from) * cam.p;
    // the roller's little settle at the end is ignored, so the camera only ever moves one way
    const h = Math.min(st.h, geo.H);
    const rollerBottom = cam.stageTop + geo.d * 1.2 + h;
    const follow = Math.max(0, rollerBottom - vh * 0.84 - cam.align);
    const fade = geo.H ? h / geo.H : 0;                          // closing: any reading offset fades out
    return base + follow + cam.offset * fade;
  }
  function camApply() {
    if (!cam.active) return;
    const y = Math.max(0, Math.round(camTarget()));
    if (Math.abs(window.scrollY - y) >= 1) window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  }
  function camStart(opening) {
    cam.active = motionOK();
    cam.stageTop = docTop(stageEl);
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (opening) {
      cam.from = window.scrollY;
      const onScreen = cam.stageTop - window.scrollY;
      // already comfortably in view: don't move yet; otherwise glide to it
      cam.align = onScreen >= 40 && onScreen <= window.innerHeight * 0.5
        ? cam.from
        : Math.max(0, Math.min(maxScroll, cam.stageTop - 96));
      cam.offset = 0;
    } else {
      // closing from wherever you were reading: start exactly there, end on the closed scroll
      cam.from = cam.align = Math.max(0, cam.stageTop - 96);
      cam.offset = 0;
      cam.offset = window.scrollY - camTarget();
    }
  }
  // your own scrolling always wins
  ['wheel', 'touchmove', 'keydown'].forEach((ev) => window.addEventListener(ev, (e) => {
    if (ev === 'keydown' && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) return;
    if (state === 'opening' || state === 'closing') cam.active = false;
  }, { passive: true }));

  /* ---------- the timeline: stage 1 sideways, stage 2 down ---------- */
  function build() {
    if (tl) tl.kill();
    st.w = geo.closedW; st.h = 0;
    applyGeometry();
    tl = gsap.timeline({ paused: true, onComplete: opened, onReverseComplete: closed });
    // stage 1 — the rolled scroll widens; its height never changes
    cam.p = 0;
    tl.call(() => sound.tink(0.9), null, 0.02)
      .to(st, { w: geo.openW, duration: 1.35, ease: 'power3.inOut', onUpdate: applyW }, 0)
      .to(cam, { p: 1, duration: 1.2, ease: 'power2.inOut', onUpdate: camApply }, 0)
      .call(() => sound.tink(1.25), null, 1.3)
      // stage 2 — begins as the widening finishes: the sheet unrolls downwards
      .to(st, { h: geo.H + Math.min(18, geo.d * 0.22), duration: 2.7, ease: 'power2.inOut', onUpdate: applyH }, 1.12)
      // a heavy roller settles back a touch
      .to(st, { h: geo.H, duration: 0.55, ease: 'sine.out', onUpdate: applyH })
      .call(() => sound.thud(), null, '>-0.5');
  }
  function applyGeometry() {
    setVar('--rod-w', `${st.w}px`);
    setVar('--open', `${st.h}px`);
    setVar('--roll', '0px');
  }

  function opened() {
    cam.active = false;
    state = 'open';
    stageEl.dataset.state = 'open';
    toggle.removeAttribute('aria-busy');
    label.textContent = 'Close Menu';
    toggle.setAttribute('aria-expanded', 'true');
    wrap.removeAttribute('aria-hidden');
    wrap.inert = false;
    wrap.style.setProperty('--ripple', '0');
    sheet.style.setProperty('--tilt', '0deg');
    sheet.style.setProperty('--skew', '0deg');
    sound.quiet();
    status.textContent = 'Menu open: twenty dishes in two columns.';
  }
  function closed() {
    cam.active = false;
    state = 'closed';
    stageEl.dataset.state = 'closed';
    toggle.removeAttribute('aria-busy');
    label.textContent = 'Show Menu';
    toggle.setAttribute('aria-expanded', 'false');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.inert = true;
    wrap.style.setProperty('--ripple', '0');
    sound.quiet();
    status.textContent = 'Menu closed.';
  }

  function open() {
    state = 'opening';
    stageEl.dataset.state = 'opening';
    toggle.setAttribute('aria-busy', 'true');
    if (!motionOK()) {
      st.w = geo.openW; st.h = geo.H; applyGeometry();
      sheet.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      opened();
      return;
    }
    measure();
    build();
    camStart(true);
    lastH = 0; lastT = performance.now(); lastW = st.w; lastWT = performance.now();
    tl.play(0);
  }
  function close() {
    state = 'closing';
    stageEl.dataset.state = 'closing';
    toggle.setAttribute('aria-busy', 'true');
    wrap.inert = true;
    if (!motionOK() || !tl) {
      st.w = geo.closedW; st.h = 0; applyGeometry();
      closed();
      return;
    }
    lastH = st.h; lastT = performance.now(); lastW = st.w; lastWT = performance.now();
    camStart(false);
    tl.reverse();
  }

  toggle.addEventListener('click', () => {
    sound.unlock();                                  // a user gesture: audio may start
    if (state === 'opening' || state === 'closing') return;   // one movement at a time
    if (state === 'closed') open(); else close();
  });

  /* ---------- resizing ---------- */
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state === 'opening' || state === 'closing') return;
      measure();
      if (state === 'open') {
        if (motionOK()) { build(); tl.progress(1).pause(); }
        st.w = geo.openW; st.h = geo.H; applyGeometry();
      } else {
        st.w = geo.closedW; st.h = 0; applyGeometry();
        if (tl) { tl.kill(); tl = null; }
      }
    }, 150);
  });

  /* =========================================================
     Sound: parchment, a sliding whoosh, small metal ticks and a
     soft settle. Quiet by design; muted state is remembered.
     ========================================================= */
  const sound = (() => {
    let ctx = null, master = null, noise = null;
    let rustleGain, rustleBp, slideGain, slideBp, crackleBus;
    let muted = false;
    try { muted = localStorage.getItem('lv-menu-muted') === '1'; } catch (e) { /* storage blocked */ }

    function unlock() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const loop = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(); return s; };
      // paper rustle: bright, grainy noise
      const src1 = loop();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      rustleBp = ctx.createBiquadFilter(); rustleBp.type = 'bandpass'; rustleBp.frequency.value = 2400; rustleBp.Q.value = 0.6;
      rustleGain = ctx.createGain(); rustleGain.gain.value = 0;
      src1.connect(hp); hp.connect(rustleBp); rustleBp.connect(rustleGain); rustleGain.connect(master);
      // sideways slide: a low, airy whoosh
      const src2 = loop();
      slideBp = ctx.createBiquadFilter(); slideBp.type = 'bandpass'; slideBp.frequency.value = 520; slideBp.Q.value = 0.9;
      slideGain = ctx.createGain(); slideGain.gain.value = 0;
      src2.connect(slideBp); slideBp.connect(slideGain); slideGain.connect(master);
      crackleBus = ctx.createGain(); crackleBus.gain.value = 0.5; crackleBus.connect(master);
    }
    const at = (p, v, tc = 0.03) => { if (ctx) p.setTargetAtTime(v, ctx.currentTime, tc); };

    function crackle(strength) {
      if (!ctx || muted) return;
      const s = ctx.createBufferSource(); s.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500 + Math.random() * 3500; f.Q.value = 2;
      const g = ctx.createGain(); const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.10 * strength, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03 + Math.random() * 0.04);
      s.connect(f); f.connect(g); g.connect(crackleBus);
      s.start(t, Math.random() * 1.5, 0.09);
    }

    return {
      unlock,
      slide(v) {
        if (!ctx) return;
        const k = Math.min(1, v / 900);
        at(slideGain.gain, 0.16 * k);
        at(slideBp.frequency, 380 + 520 * k, 0.05);
      },
      rustle(v) {
        if (!ctx) return;
        const k = Math.min(1, Math.abs(v) / 700);
        at(rustleGain.gain, 0.06 * k * (0.7 + Math.random() * 0.6));
        at(rustleBp.frequency, 1700 + 1600 * k + Math.random() * 400, 0.05);
        if (Math.random() < k * 0.35) crackle(0.5 + k * 0.5);
      },
      tink(pitch = 1) {
        if (!ctx || muted) return;
        const t = ctx.currentTime;
        [[2350, 0.035], [3720, 0.018], [5180, 0.008]].forEach(([f, a]) => {
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * pitch;
          const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
          o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.6);
        });
      },
      thud() {
        if (!ctx || muted) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(62, t + 0.22);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.35);
      },
      quiet() { if (ctx) { at(rustleGain.gain, 0, 0.06); at(slideGain.gain, 0, 0.06); } },
      setMuted(m) {
        muted = m;
        try { localStorage.setItem('lv-menu-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
        if (ctx) at(master.gain, m ? 0 : 0.55, 0.05);
      },
      isMuted: () => muted
    };
  })();

  function renderMute() {
    const m = sound.isMuted();
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.setAttribute('aria-label', m ? 'Turn the scroll sound on' : 'Mute the scroll sound');
    $('use', muteBtn).setAttribute('href', m ? '#icon-mute' : '#icon-sound');
  }
  muteBtn.addEventListener('click', () => { sound.setMuted(!sound.isMuted()); renderMute(); });
  renderMute();

  /* ---------- start closed ---------- */
  measure();
  st.w = geo.closedW; st.h = 0; applyGeometry();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (state === 'closed') measure(); });

  // for automated checks
  window.LuxuryMenu = { state: () => state, geo: () => ({ ...geo }), progress: () => (tl ? tl.progress() : 0), timeline: () => tl };
})();

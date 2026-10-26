/* =========================================================
   Luxury Vibes — Gallery page
   Everything that moves every frame is a transform or opacity on
   its own layer, so the graphics card does the work and the page
   stays smooth:
   - Bento entrance: a gold-edged curtain sweeps off each tile in a
     wave that spreads from the middle of the grid, while the photo
     settles from a close zoom.
   - Glass caption: a pre-blurred copy of the photo is revealed by a
     circle growing from the exact point where the pointer entered
     (and shrinking toward where it left). The blur is drawn once,
     never recomputed while animating.
   - Depth: gentle parallax while scrolling; tiles tilt toward the
     pointer with a glint, eased every frame.
   - Lightbox: the photo morphs from its tile to full size and back
     (transform + crop, no layout work per frame).
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const EASE = 'cubic-bezier(.16, 1, .3, 1)';        // expo-out
  const EASE_IO = 'cubic-bezier(.7, 0, .2, 1)';
  const motion = () => !reduced.matches;
  const dur = (ms) => (motion() ? ms : 1);

  const bento = $('#bento');
  if (!bento) return;
  const items = $$('.tile', bento).map((tile) => ({
    tile,
    btn: $('.tile-btn', tile),
    layer: $('.tile-layer', tile),
    img: $('.tile-img', tile),
    glare: $('.tile-glare', tile),
    curtain: $('.tile-curtain', tile),
    tag: $('.tile-tag', tile).textContent,
    title: $('.tile-title', tile).textContent,
    desc: $('.tile-desc', tile).textContent
  }));

  /* ---------------------------------------------------------
     1. Entrance
     --------------------------------------------------------- */
  if (motion() && 'IntersectionObserver' in window) {
    bento.classList.add('is-waiting');
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const box = bento.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + Math.min(box.height, window.innerHeight) / 2;
      const order = items
        .map((it) => {
          const r = it.tile.getBoundingClientRect();
          return { it, d: Math.hypot(r.left + r.width / 2 - cx, (r.top + r.height / 2 - cy) * 1.15) };
        })
        .sort((a, b) => a.d - b.d);
      order.forEach(({ it }, i) => {
        const delay = 60 + i * 70;
        it.tile.animate(
          [{ opacity: 0, transform: 'translate3d(0, 34px, 0) scale(.97)' }, { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }],
          { duration: 1000, delay, easing: EASE, fill: 'backwards' }
        );
        it.curtain.animate(
          [{ transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(0, -101%, 0)' }],
          { duration: 1150, delay: delay + 120, easing: EASE_IO, fill: 'backwards' }
        );
        it.img.animate(
          [{ transform: 'scale(1.32)' }, { transform: 'scale(1.04)' }],
          { duration: 1700, delay: delay + 120, easing: EASE, fill: 'backwards' }
        );
      });
      bento.classList.remove('is-waiting');
    }, { threshold: 0.1 });
    io.observe(bento);
  }

  /* ---------------------------------------------------------
     2. Parallax: the photo layer and the numbers background drift
        a little against the scroll (transform only, only when
        on screen, only when the value changes)
     --------------------------------------------------------- */
  const numbersBg = $('.g-numbers-bg');
  const last = new WeakMap();
  const setY = (el, y) => {
    const v = Math.round(y * 10) / 10;
    if (last.get(el) === v) return;
    last.set(el, v);
    el.style.transform = `translate3d(0, ${v}px, 0)`;
  };
  let pQueued = false;
  const parallax = () => {
    pQueued = false;
    if (!motion()) return;
    const vh = window.innerHeight;
    items.forEach(({ tile, layer }) => {
      const r = tile.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const off = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      setY(layer, -off * r.height * 0.06);
    });
    if (numbersBg) {
      const r = numbersBg.parentElement.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) setY(numbersBg, -((r.top + r.height / 2 - vh / 2) / vh) * 70);
    }
  };
  const queueParallax = () => { if (!pQueued) { pQueued = true; requestAnimationFrame(parallax); } };
  window.addEventListener('scroll', queueParallax, { passive: true });
  window.addEventListener('resize', queueParallax);
  queueParallax();

  // the endless photo strips only run while they are on screen
  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver((entries) => entries.forEach((en) => {
      en.target.classList.toggle('is-paused', !en.isIntersecting);
    }));
    $$('.strip').forEach((el) => so.observe(el));
  }

  /* ---------------------------------------------------------
     3. Hover: glass from the entry point, tilt and glint
     --------------------------------------------------------- */
  const pointIn = (r, e) => ({
    x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
    y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
  });

  items.forEach((it) => {
    const { tile, btn, glare } = it;
    // one eased loop per tile while it is moving, then it stops
    const s = { rx: 0, ry: 0, trx: 0, try: 0, gx: 0.5, gy: 0.5, tgx: 0.5, tgy: 0.5, raf: 0, rect: null };
    const frame = () => {
      s.rx += (s.trx - s.rx) * 0.1;
      s.ry += (s.try - s.ry) * 0.1;
      s.gx += (s.tgx - s.gx) * 0.16;
      s.gy += (s.tgy - s.gy) * 0.16;
      btn.style.transform = `perspective(1000px) rotateX(${s.rx.toFixed(3)}deg) rotateY(${s.ry.toFixed(3)}deg)`;
      glare.style.transform = `translate3d(${(s.gx * 100).toFixed(2)}%, ${(s.gy * 100).toFixed(2)}%, 0)`;
      const moving = Math.abs(s.trx - s.rx) + Math.abs(s.try - s.ry) + Math.abs(s.tgx - s.gx) + Math.abs(s.tgy - s.gy) > 0.002;
      s.raf = moving ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => { if (!s.raf) s.raf = requestAnimationFrame(frame); };

    // where the circle starts, and how big it must grow to cover the tile from there
    const aim = (p, r) => {
      const fx = Math.max(p.x, 1 - p.x) * r.width;
      const fy = Math.max(p.y, 1 - p.y) * r.height;
      btn.style.setProperty('--mx', `${(p.x * 100).toFixed(1)}%`);
      btn.style.setProperty('--my', `${(p.y * 100).toFixed(1)}%`);
      btn.style.setProperty('--reach', `${Math.ceil(Math.hypot(fx, fy)) + 2}px`);
    };

    btn.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      s.rect = btn.getBoundingClientRect();
      const p = pointIn(s.rect, e);
      aim(p, s.rect);
      s.gx = s.tgx = p.x; s.gy = s.tgy = p.y;
      requestAnimationFrame(() => tile.classList.add('is-hover'));   // the circle starts from the entry point
      kick();
    });
    btn.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !s.rect) return;
      const p = pointIn(s.rect, e);
      s.tgx = p.x; s.tgy = p.y;
      if (motion() && finePointer.matches) {
        const max = tile.classList.contains('tile--xl') ? 3.5 : 6;
        s.try = (p.x - 0.5) * 2 * max;
        s.trx = -(p.y - 0.5) * 2 * max;
      }
      kick();
    });
    btn.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      const r = s.rect || btn.getBoundingClientRect();
      aim(pointIn(r, e), r);
      tile.classList.remove('is-hover');
      s.trx = 0; s.try = 0; s.rect = null;
      kick();
    });
    btn.addEventListener('focus', () => {
      if (!btn.matches(':focus-visible')) return;
      const r = btn.getBoundingClientRect();
      aim({ x: 0.5, y: 1 }, r);
    });
    // the page may scroll under a resting pointer
    window.addEventListener('scroll', () => { if (s.rect) s.rect = btn.getBoundingClientRect(); }, { passive: true });
    btn.addEventListener('click', () => open(items.indexOf(it)));
  });

  /* ---------------------------------------------------------
     4. Lightbox
     --------------------------------------------------------- */
  const lb = $('#lightbox');
  const frameEl = $('.lb-frame', lb);
  const big = $('img', frameEl);
  const backdrop = $('.lb-backdrop', lb);
  const cap = $('.lb-caption', lb);
  const count = $('.lb-count', lb);
  const btns = $$('.lb-btn', lb);
  const chrome = [cap, count, ...btns];
  let index = -1;
  let busy = false;
  let lastFocus = null;
  let current = null;            // the frame's resting rectangle

  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  const place = (r) => {
    current = r;
    Object.assign(frameEl.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  };

  function target(it) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const small = vw <= 640;
    const padX = small ? 12 : 88;
    const top = small ? 56 : 64;
    const bottom = small ? 210 : 200;
    const ratio = (it.img.naturalWidth || 4) / (it.img.naturalHeight || 3);
    let w = vw - padX * 2;
    let h = w / ratio;
    const maxH = vh - top - bottom;
    if (h > maxH) { h = maxH; w = h * ratio; }
    return { left: (vw - w) / 2, top: top + (maxH - h) / 2, width: w, height: h };
  }

  // keyframe that makes the frame (resting at `to`) look exactly like the box `from`,
  // cropped the way a cover-fitted photo is: uniform scale plus an inset crop
  function pose(from, to) {
    const sc = Math.max(from.width / to.width, from.height / to.height);
    const ix = (to.width - from.width / sc) / 2;
    const iy = (to.height - from.height / sc) / 2;
    const tx = from.left - to.left - ix * sc;
    const ty = from.top - to.top - iy * sc;
    return {
      transform: `translate3d(${tx}px, ${ty}px, 0) scale(${sc})`,
      clipPath: `inset(${iy}px ${ix}px ${iy}px ${ix}px round ${6 / sc}px)`
    };
  }
  const REST = { transform: 'translate3d(0, 0, 0) scale(1)', clipPath: 'inset(0px 0px 0px 0px round 6px)' };

  function fillCaption(it, i) {
    $('.lb-tag', lb).textContent = it.tag;
    $('.lb-title', lb).textContent = it.title;
    $('.lb-desc', lb).textContent = it.desc;
    count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    big.alt = it.img.alt;
  }

  function open(i) {
    if (busy || index !== -1) return;
    busy = true;
    index = i;
    const it = items[i];
    lastFocus = it.btn;
    it.tile.classList.remove('is-hover');
    fillCaption(it, i);
    big.src = it.img.currentSrc || it.img.src;
    lb.hidden = false;
    lb.classList.add('is-open');
    document.documentElement.classList.add('lb-open');
    const to = target(it);
    place(to);
    const from = rectOf(it.btn);
    it.tile.style.visibility = 'hidden';
    const morph = frameEl.animate([pose(from, to), REST], { duration: dur(820), easing: EASE });
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur(520), fill: 'forwards' });
    chrome.forEach((el, k) => el.animate(
      [{ opacity: 0, transform: 'translate3d(0, 16px, 0)' }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }],
      { duration: dur(700), delay: dur(360 + k * 55), easing: EASE, fill: 'both' }
    ));
    morph.finished.then(() => { busy = false; $('.lb-close', lb).focus({ preventScroll: true }); });
  }

  function close() {
    if (busy || index === -1) return;
    busy = true;
    const it = items[index];
    const r = rectOf(it.btn);
    const visible = r.bottom > 0 && r.top < window.innerHeight;
    chrome.forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(200), fill: 'forwards' }));
    const morph = visible
      ? frameEl.animate([REST, pose(r, current)], { duration: dur(700), easing: EASE_IO, fill: 'forwards' })
      : frameEl.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.94)' }], { duration: dur(380), easing: EASE, fill: 'forwards' });
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(visible ? 620 : 380), fill: 'forwards' });
    morph.finished.then(() => {
      it.tile.style.visibility = '';
      lb.classList.remove('is-open');
      lb.hidden = true;
      document.documentElement.classList.remove('lb-open');
      [frameEl, backdrop, big, ...chrome].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
      index = -1;
      busy = false;
      lastFocus?.focus({ preventScroll: true });
    });
  }

  function go(delta) {
    if (busy || index === -1) return;
    busy = true;
    const prev = items[index];
    index = (index + delta + items.length) % items.length;
    const it = items[index];
    prev.tile.style.visibility = '';
    it.tile.style.visibility = 'hidden';
    const shift = 50 * delta;
    const out = big.animate(
      [{ opacity: 1, transform: 'translate3d(0, 0, 0)' }, { opacity: 0, transform: `translate3d(${-shift}px, 0, 0)` }],
      { duration: dur(230), easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }
    );
    cap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(200), fill: 'forwards' });
    out.finished.then(() => {
      fillCaption(it, index);
      big.src = it.img.currentSrc || it.img.src;
      const ready = big.decode ? big.decode().catch(() => {}) : Promise.resolve();
      ready.then(() => {
        const from = current;
        const to = target(it);
        place(to);
        frameEl.animate([pose(from, to), REST], { duration: dur(620), easing: EASE });
        out.cancel();
        const inn = big.animate(
          [{ opacity: 0, transform: `translate3d(${shift}px, 0, 0)` }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }],
          { duration: dur(620), easing: EASE }
        );
        cap.getAnimations().forEach((a) => a.cancel());
        cap.animate([{ opacity: 0, transform: 'translate3d(0, 10px, 0)' }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }], { duration: dur(560), easing: EASE, fill: 'both' });
        inn.finished.then(() => { busy = false; });
      });
    });
  }

  $$('[data-lb-close]', lb).forEach((el) => el.addEventListener('click', close));
  $('.lb-prev', lb).addEventListener('click', () => go(-1));
  $('.lb-next', lb).addEventListener('click', () => go(1));
  document.addEventListener('keydown', (e) => {
    if (index === -1) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Tab') {
      const f = btns.filter((b) => b.offsetParent !== null);
      const first = f[0], lastB = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastB.focus(); }
      else if (!e.shiftKey && document.activeElement === lastB) { e.preventDefault(); first.focus(); }
      else if (!lb.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
  // swipe between photos
  let sx = null, sy = null;
  frameEl.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  frameEl.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
  });
  frameEl.addEventListener('dragstart', (e) => e.preventDefault());
  window.addEventListener('resize', () => { if (index !== -1 && !busy) place(target(items[index])); });
})();

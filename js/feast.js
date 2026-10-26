/* =========================================================
   From Our Table — scroll-pinned plate animation
   GSAP 3 + ScrollTrigger (loaded from cdnjs in index.html).

   Sequence, scrubbed to scroll while the section is pinned:
     1. Two plates float above the table (nothing else is shown).
     2. Both plates rotate in 3D and descend onto the table.
     3. After they land, the fork, herbs and chili drop in from above.
     4. A short hold, then the pin releases and the page scrolls on.

   Without GSAP, or with reduced motion, the finished table is shown
   as a normal, unpinned section.
   ========================================================= */
(() => {
  'use strict';

  const section = document.getElementById('feast');
  if (!section) return;

  const hasGsap = window.gsap && window.ScrollTrigger;
  if (!hasGsap) { section.classList.add('is-static'); return; }

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const plates = Array.from(section.querySelectorAll('[data-plate]'));
  const decos = Array.from(section.querySelectorAll('[data-deco]'));

  // Timeline positions (arbitrary units; scroll distance is set below)
  const PLATE_START = 0;
  const PLATE_DUR = 5;
  const PLATE_STAGGER = 0.35;
  const PLATE_LANDED = PLATE_START + PLATE_DUR + PLATE_STAGGER * (plates.length - 1);
  const DECO_START = PLATE_LANDED + 0.45;   // decorations only after both plates land
  const DECO_DUR = 2.4;
  const DECO_STAGGER = 0.26;
  const HOLD = 0.6;

  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    section.classList.remove('is-static');

    // How far above its resting place a decoration starts: just above the viewport top.
    const dropDistance = (piece) => {
      const sectionTop = section.getBoundingClientRect().top;
      const r = piece.getBoundingClientRect();
      return -((r.top - sectionTop) + r.height + window.innerHeight * 0.12);
    };

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => '+=' + Math.round(window.innerHeight * 2.4),
        pin: true,
        pinSpacing: true,
        scrub: 0.9,             // smooths wheel/trackpad steps, no jumps
        anticipatePin: 1,
        invalidateOnRefresh: true,
        fastScrollEnd: false
      }
    });

    /* ---------- 1–2. Plates: float, rotate in 3D, land ---------- */
    plates.forEach((plate, i) => {
      const dir = Number(plate.dataset.dir) || 1;
      const body = plate.querySelector('.feast-body');
      const shadow = plate.querySelector('.plate-shadow');
      const contact = plate.querySelector('.plate-contact');
      const at = PLATE_START + i * PLATE_STAGGER;

      tl.fromTo(body,
        { z: 190, yPercent: -7, rotationX: 30, rotationY: -14 * dir, rotationZ: -30 * dir },
        { z: 0, yPercent: 0, rotationX: 0, rotationY: 0, rotationZ: 0, duration: PLATE_DUR, ease: 'power2.inOut' },
        at);

      // soft cast shadow: wide and faint while floating, tight and dark on landing
      tl.fromTo(shadow,
        { xPercent: 10, yPercent: 17, scale: 1.24, opacity: 0.2 },
        { xPercent: 0, yPercent: 0, scale: 1, opacity: 1, duration: PLATE_DUR, ease: 'power2.inOut' },
        at);

      tl.fromTo(contact, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power1.in' }, at + PLATE_DUR - 0.7);

      // the moment of contact: a tiny settle
      tl.to(body, { scale: 0.988, duration: 0.22, ease: 'power1.out' }, at + PLATE_DUR)
        .to(body, { scale: 1, duration: 0.35, ease: 'power1.inOut' }, at + PLATE_DUR + 0.22);
    });

    /* ---------- 3. Fork, herbs and chili drop in from above ---------- */
    decos.forEach((deco, i) => {
      const body = deco.querySelector('.feast-body');
      const shadow = deco.querySelector('.deco-shadow');
      const spin = Number(deco.dataset.spin) || 120;
      const at = DECO_START + i * DECO_STAGGER;
      const tilt = i % 2 ? -1 : 1;

      tl.fromTo(body,
        { y: () => dropDistance(deco), z: 180, rotationX: 58 * tilt, rotationY: 24 * tilt, rotationZ: spin },
        { y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, duration: DECO_DUR, ease: 'power3.out', immediateRender: true },
        at);
      tl.fromTo(body, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power1.out', immediateRender: true }, at);

      // shadow stays faint until the piece is close to the table, then sharpens under it
      tl.fromTo(shadow,
        { xPercent: 45, yPercent: 35, scale: 1.35 },
        { xPercent: 0, yPercent: 0, scale: 1, duration: DECO_DUR * 0.7, ease: 'power3.out' },
        at + DECO_DUR * 0.3);
      tl.fromTo(shadow,
        { autoAlpha: 0 },
        { autoAlpha: 0.5, duration: DECO_DUR * 0.55, ease: 'power2.in', immediateRender: true },
        at + DECO_DUR * 0.3);
    });

    /* ---------- 4. Hold the finished table, then release ---------- */
    tl.to({}, { duration: HOLD });

    return () => { /* matchMedia reverts every tween and the pin automatically */ };
  });

  mm.add('(prefers-reduced-motion: reduce)', () => {
    section.classList.add('is-static');
    return () => section.classList.remove('is-static');
  });

  // Keep pin positions correct when content above changes height
  // (images loading, the "Explore our story" panel opening, fonts swapping).
  let refreshTimer;
  const queueRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 150);
  };
  if ('ResizeObserver' in window) {
    const main = document.getElementById('main');
    let lastH = main ? main.offsetHeight : 0;
    new ResizeObserver(() => {
      const h = main.offsetHeight;
      if (Math.abs(h - lastH) > 1) { lastH = h; queueRefresh(); }
    }).observe(main);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueRefresh);
})();

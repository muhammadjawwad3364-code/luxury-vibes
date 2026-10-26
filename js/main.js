/* =========================================================
   Luxury Vibes — site behaviour
   Vanilla JS, no dependencies.
   ========================================================= */
(() => {
  'use strict';

  /* Back/forward visits restore the page from the browser's memory with every
     entrance animation already finished. Reload instead, so headings, text and
     layout animate in on every visit. */
  window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Footer: current year ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Background videos (muted, looping, decorative) ---------- */
  $$('.hero-video, video[data-ambient]').forEach((video) => {
    video.muted = true;               // always silent, even if the browser ignores the attribute
    video.defaultMuted = true;
    const tryPlay = () => { const p = video.play(); if (p && p.catch) p.catch(() => {}); };  // blocked autoplay: the poster stays
    let onScreen = false;
    const sync = () => {
      if (reducedMotion.matches || !onScreen || document.hidden) video.pause();
      else tryPlay();
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; sync(); }).observe(video);
    } else { onScreen = true; }
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener?.('change', sync);
    sync();
  });

  /* ---------- Mobile navigation: slide-in drawer ---------- */
  const navToggle = $('.nav-toggle');
  const siteNav = $('#site-nav');
  const siteHeader = $('.site-header');
  const drawerClose = $('.drawer-close');
  const isDrawer = () => window.matchMedia('(max-width: 56.24em)').matches;

  const setNav = (open, returnFocus = false) => {
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    siteNav.classList.toggle('is-open', open);
    siteHeader.classList.toggle('nav-open', open);
    document.documentElement.classList.toggle('nav-locked', open);
    if (open && isDrawer() && drawerClose) setTimeout(() => drawerClose.focus({ preventScroll: true }), 60);
    if (!open && returnFocus) navToggle.focus({ preventScroll: true });
  };
  const navIsOpen = () => siteNav.classList.contains('is-open');
  navToggle.addEventListener('click', () => setNav(!navIsOpen()));
  $$('[data-nav-close]').forEach((el) => el.addEventListener('click', () => setNav(false, true)));
  siteNav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('keydown', (e) => {
    if (!navIsOpen()) return;
    if (e.key === 'Escape') { setNav(false, true); return; }
    // keep keyboard focus inside the open drawer
    if (e.key === 'Tab' && isDrawer()) {
      const items = $$('a[href], button:not([disabled])', siteNav).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!siteNav.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
  window.matchMedia('(min-width: 56.25em)').addEventListener('change', (m) => { if (m.matches) setNav(false); });

  /* ---------- Scroll-spy for the main nav ---------- */
  const navLinks = $$('.nav-link[data-spy]');
  const spyTargets = navLinks.map((l) => document.getElementById(l.dataset.spy)).filter(Boolean);
  const setActiveNav = (id) => {
    navLinks.forEach((l) => {
      const on = l.dataset.spy === id;
      l.classList.toggle('is-active', on);
      if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
    });
  };
  if ('IntersectionObserver' in window) {
    const visible = new Map();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => visible.set(en.target.id, en.isIntersecting ? en.intersectionRatio : 0));
      let best = null, bestRatio = 0;
      spyTargets.forEach((t) => {
        const r = visible.get(t.id) || 0;
        if (r > bestRatio) { best = t.id; bestRatio = r; }
      });
      if (best) setActiveNav(best);
    }, { rootMargin: '-35% 0px -45% 0px', threshold: [0, .01, .25, .5, .75, 1] });
    spyTargets.forEach((t) => spy.observe(t));
  }

  /* ---------- "Explore our story" disclosure ---------- */
  const storyBtn = $('.story-toggle');
  const storyMore = $('#story-more');
  if (storyBtn && storyMore) {
    const label = $('[data-label]', storyBtn);
    storyBtn.addEventListener('click', () => {
      const open = storyBtn.getAttribute('aria-expanded') !== 'true';
      storyBtn.setAttribute('aria-expanded', String(open));
      storyMore.hidden = !open;
      label.textContent = open ? 'Show less' : 'Explore our story';
      if (open) {
        storyMore.classList.remove('is-opening');
        void storyMore.offsetWidth;
        storyMore.classList.add('is-opening');
      }
    });
  }

  /* =========================================================
     Slider — one independent instance per menu category
     ========================================================= */
  class Slider {
    constructor(root) {
      this.root = root;
      this.frame = $('.slider-frame', root);
      this.slides = $$('.slide', root);
      this.caption = $('[data-caption]', root);
      this.dotsWrap = $('.slider-dots', root);
      this.index = Math.max(0, this.slides.findIndex((s) => s.classList.contains('is-active')));
      this.leaveTimers = new Map();

      this.dots = this.slides.map((slide, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'slider-dot';
        const name = $('figcaption', slide)?.textContent.trim() || `Dish ${i + 1}`;
        dot.setAttribute('aria-label', `Show ${name} (${i + 1} of ${this.slides.length})`);
        dot.addEventListener('click', () => this.goTo(i));
        this.dotsWrap.appendChild(dot);
        return dot;
      });

      $('[data-prev]', root).addEventListener('click', () => this.prev());
      $('[data-next]', root).addEventListener('click', () => this.next());

      root.addEventListener('keydown', (e) => {
        if (e.target.closest('input, textarea')) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
      });

      this.bindSwipe();
      this.bindImageErrors();
      this.sync(true);
    }

    get length() { return this.slides.length; }
    next() { this.goTo((this.index + 1) % this.length, 1); }
    prev() { this.goTo((this.index - 1 + this.length) % this.length, -1); }

    goTo(i, dir) {
      if (i === this.index || i < 0 || i >= this.length) return;
      const from = this.slides[this.index];
      const to = this.slides[i];
      const d = dir || (i > this.index ? 1 : -1);

      // place the incoming slide on the correct side before it fades in
      to.style.transition = 'none';
      to.style.setProperty('--from', `${3 * d}%`);
      void to.offsetWidth;
      to.style.transition = '';

      from.style.setProperty('--to', `${-3 * d}%`);
      from.classList.add('is-leaving');
      clearTimeout(this.leaveTimers.get(from));
      this.leaveTimers.set(from, setTimeout(() => from.classList.remove('is-leaving'), 1400));

      this.index = i;
      this.sync();
    }

    sync(initial = false) {
      this.slides.forEach((s, i) => {
        const on = i === this.index;
        s.classList.toggle('is-active', on);
        if (on) s.classList.remove('is-leaving');
        s.setAttribute('aria-hidden', String(!on));
      });
      this.dots.forEach((d, i) => {
        if (i === this.index) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
      // warm the neighbour images so the next transition never shows a blank frame
      [this.index + 1, this.index - 1].forEach((n) => {
        const img = $('img', this.slides[(n + this.length) % this.length]);
        if (img && img.loading === 'lazy') img.loading = 'eager';
      });
      this.updateCaption(initial);
    }

    updateCaption(instant) {
      if (!this.caption) return;
      const text = $('figcaption', this.slides[this.index])?.textContent.trim() || '';
      if (instant || reducedMotion.matches) { this.caption.textContent = text; return; }
      this.caption.classList.add('is-swapping');
      clearTimeout(this.captionTimer);
      this.captionTimer = setTimeout(() => {
        this.caption.textContent = text;
        this.caption.classList.remove('is-swapping');
      }, 260);
    }

    loadAll() {
      this.slides.forEach((s) => { const img = $('img', s); if (img) img.loading = 'eager'; });
    }

    bindSwipe() {
      let x0 = null, y0 = null, id = null;
      this.frame.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        x0 = e.clientX; y0 = e.clientY; id = e.pointerId;
      });
      const end = (e) => {
        if (x0 === null || e.pointerId !== id) return;
        const dx = e.clientX - x0, dy = e.clientY - y0;
        x0 = y0 = id = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) (dx < 0 ? this.next() : this.prev());
      };
      this.frame.addEventListener('pointerup', end);
      this.frame.addEventListener('pointercancel', () => { x0 = y0 = id = null; });
      this.frame.addEventListener('dragstart', (e) => e.preventDefault());
    }

    bindImageErrors() {
      this.slides.forEach((s) => {
        const img = $('img', s);
        if (!img) return;
        const fail = () => s.classList.add('is-broken');
        img.addEventListener('error', fail);
        if (img.complete && img.naturalWidth === 0 && img.currentSrc) fail();
      });
    }
  }

  /* =========================================================
     Menu tabs — Signature Curries / Tandoor / Desserts
     ========================================================= */
  const tabs = $$('.menu-tab');
  const panels = $$('.menu-panel');
  const sliders = {};
  panels.forEach((p) => { sliders[p.dataset.panel] = new Slider($('[data-slider]', p)); });

  const activateTab = (name, { focus = false } = {}) => {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    panels.forEach((p) => {
      const on = p.dataset.panel === name;
      p.classList.toggle('is-active', on);
      p.inert = !on;
      if (on) p.removeAttribute('aria-hidden'); else p.setAttribute('aria-hidden', 'true');
    });
    sliders[name]?.loadAll();
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => activateTab(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      let n = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') n = 0;
      if (e.key === 'End') n = tabs.length - 1;
      if (n === null) return;
      e.preventDefault();
      activateTab(tabs[n].dataset.tab, { focus: true });
    });
  });
  // preload the other categories once the browser is idle
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  window.addEventListener('load', () => idle(() => Object.values(sliders).forEach((s) => s.loadAll())));

  /* =========================================================
     Site search
     ========================================================= */
  const dialog = $('#search-dialog');
  const input = $('#site-search');
  const results = $('#search-results');
  const openSearchBtns = $$('[data-open-search]');
  let lastOpener = null;

  const index = [
    { label: 'Home', meta: 'Section', go: '#home', keys: 'home top bold flavors timeless table' },
    { label: 'Our Signature', meta: 'Gallery', go: '#signature', keys: 'gallery signature fresh ingredients crafted care photos' },
    { label: 'A Taste of Tradition', meta: 'About', go: '#about', keys: 'about story tradition regional kitchens biryani' },
    { label: 'A Celebration of Spice', meta: 'Menu', go: '#menu', keys: 'menu food dishes spice order' },
    { label: 'Reserve a table', meta: 'Reservation', href: 'reservation.html#room', keys: 'reservation reserve book booking table seat dining room' },
    { label: 'Full menu', meta: 'Menu', href: 'menu.html#scroll-section', keys: 'menu full scroll dishes food prices steak salmon pizza pasta curry dessert lava cake' },
    { label: 'Gallery', meta: 'Photos', href: 'gallery.html#bento-section', keys: 'gallery photos pictures images dishes dining room kitchen video' },
    { label: 'Our story', meta: 'About', href: 'about.html#story', keys: 'about story history founder street cart locations chef team philosophy' },
    { label: 'Our locations', meta: 'About', href: 'about.html#locations', keys: 'locations visit old town harbour garden riverside dining rooms' },
    { label: 'Terms & Conditions', meta: 'Legal', href: 'terms.html', keys: 'terms conditions legal booking policy' },
    { label: 'Privacy Policy', meta: 'Legal', href: 'privacy.html', keys: 'privacy policy data cookies storage' }
  ];
  tabs.forEach((t) => {
    const cat = t.dataset.tab;
    index.push({ label: $('.menu-tab-title', t).textContent.trim(), meta: 'Category', tab: cat, keys: `${cat} category` });
    $$('.slide', $(`[data-panel="${cat}"]`)).forEach((s, i) => {
      const name = $('figcaption', s).textContent.trim();
      index.push({ label: name, meta: $('.menu-tab-title', t).textContent.trim(), tab: cat, slide: i, keys: `${name} ${$('img', s).alt} ${cat}` });
    });
  });

  const render = (q) => {
    const term = q.trim().toLowerCase();
    const list = term
      ? index.filter((it) => `${it.label} ${it.keys}`.toLowerCase().includes(term))
      : index.filter((it) => it.meta === 'Category' || it.go || it.href);
    results.innerHTML = '';
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'search-empty';
      li.textContent = `No matches for “${q.trim()}”. Try a dish name such as tikka or jalebi.`;
      results.appendChild(li);
      return;
    }
    list.slice(0, 10).forEach((it) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = it.label;
      b.lastChild.textContent = it.meta;
      b.addEventListener('click', () => choose(it));
      li.appendChild(b);
      results.appendChild(li);
    });
  };

  const closeSearch = () => { if (dialog.open) dialog.close(); };
  const choose = (it) => {
    closeSearch();
    if (it.tab) {
      activateTab(it.tab);
      if (typeof it.slide === 'number') sliders[it.tab].goTo(it.slide);
      document.getElementById('menu').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    } else if (it.href) {
      const [page, hash] = it.href.split('#');
      const here = document.getElementById(hash);
      if (here && location.pathname.endsWith(page)) here.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      else location.href = it.href;
    } else {
      const el = document.querySelector(it.go);
      if (el) el.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      else location.href = 'index.html' + it.go;   // a landing-page section, opened from another page
    }
  };

  openSearchBtns.forEach((btn) => btn.addEventListener('click', () => {
    if (typeof dialog.showModal !== 'function') { location.hash = 'menu'; return; }
    lastOpener = btn;
    setNav(false);
    input.value = '';
    render('');
    dialog.showModal();
    input.focus();
  }));
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('button', results)?.click();
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); $('button', results)?.focus(); }
  });
  results.addEventListener('keydown', (e) => {
    const btns = $$('button', results);
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < btns.length - 1) { e.preventDefault(); btns[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? btns[i - 1] : input).focus(); }
  });
  $('[data-close-search]').addEventListener('click', closeSearch);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeSearch(); });
  dialog.addEventListener('close', () => lastOpener?.focus({ preventScroll: true }));
})();

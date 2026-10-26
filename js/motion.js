/* =========================================================
   Luxury Vibes — motion (shared by every page)
   1. Entrance + scroll reveals: headings rise word by word out
      of a mask, text and buttons drift up, photos unveil, cards
      and footer items follow in a stagger.
   2. Letter roll: on hover/keyboard focus, the text of every
      button and link rolls up letter by letter inside its own
      line (overflow is clipped at the text height); on leave it
      rolls back the same way.
   Web Animations API only (no library needed), composited
   transforms/opacity, and nothing runs for reduced motion.
   ========================================================= */
(() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return;

  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';      // expo-out
  const EASE_INOUT = 'cubic-bezier(.77, 0, .18, 1)';

  /* ---------------------------------------------------------
     Shared: wrap the words of every text node in `el`.
     Keeps inner elements (em, strong, links), keeps spaces as
     real text so wrapping and textContent are unchanged, and
     puts everything in one inline wrapper so flex/grid parents
     don't turn each word into a separate item.
     --------------------------------------------------------- */
  const SKIP_TEXT = 'svg, .visually-hidden, [aria-hidden="true"], script, style';
  function textNodes(el) {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest(SKIP_TEXT) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    while (walker.nextNode()) out.push(walker.currentNode);
    return out;
  }

  /* =========================================================
     1. ENTRANCE + SCROLL REVEALS
     ========================================================= */
  // Areas that run their own animation, stay hidden until opened, or update live
  const EXCLUDE = [
    '.site-header', '.hero', '.res-hero', '.feast', '.scroll-stage', '.sheet',
    'dialog', '[hidden]', '[inert]', '.slider', '.slider-frame', '.room-frame', '#bookbook-list',
    '.booking-layer', '.paper', '.manage', '[aria-live]', '[role="status"]',
    '.visually-hidden', '[data-no-motion]', '.story-more', '.bento', '.strip', '.lightbox'
  ].join(', ');

  const HEAD_SEL = 'main h2, main h3, footer h2';
  const TEXT_SEL = [
    'main p', 'main li', 'main dt', 'main dd', 'main blockquote', 'main figcaption',
    '.footer-nav li', '.footer-legal'
  ].join(', ');
  const BTN_SEL = 'main .btn';
  const MEDIA_SEL = 'main img';
  const CARD_ONLY = '.sig-card, .menu-tab, .timeline-item, .location, .quote-card, .about-stat, .footer-ornament';
  const CARD_SEL = `main [data-reveal], ${CARD_ONLY}`;

  const usable = (el) => !el.closest(EXCLUDE) && !el.closest('.hero, .res-hero');

  const kindOf = new Map();
  const add = (el, kind) => { if (!kindOf.has(el) && usable(el)) kindOf.set(el, kind); };

  // Containers first, so text inside an animated card or button isn't animated twice
  $$(CARD_SEL).forEach((el) => {
    // [data-reveal] blocks that only wrap other animated content just fade (no movement)
    if (el.matches('h1, h2, h3')) return;            // headings get the word rise instead
    add(el, el.matches(CARD_ONLY) ? 'card' : 'fade');
  });
  $$(BTN_SEL).forEach((el) => add(el, 'btn'));
  $$(MEDIA_SEL).forEach((el) => {
    const w = parseFloat(el.getAttribute('width')) || el.naturalWidth || 0;
    if (w >= 160) add(el, 'media');
  });
  $$(HEAD_SEL).forEach((el) => add(el, 'head'));
  $$(TEXT_SEL).forEach((el) => add(el, 'text'));

  // Moving kinds never nest inside another moving kind (headings use a mask, so they may)
  const MOVING = new Set(['card', 'btn', 'text', 'media']);
  for (const [el, kind] of kindOf) {
    if (kind === 'head' || kind === 'fade') continue;
    let p = el.parentElement;
    while (p) {
      const k = kindOf.get(p);
      if (k && MOVING.has(k)) { kindOf.delete(el); break; }
      p = p.parentElement;
    }
  }
  // headings inside a moving text block (rare) just ride along with it
  for (const [el, kind] of kindOf) {
    if (kind !== 'head') continue;
    let p = el.parentElement;
    while (p) { if (kindOf.get(p) === 'text' || kindOf.get(p) === 'btn') { kindOf.delete(el); break; } p = p.parentElement; }
  }

  // Headings: split into masked words
  function splitHeading(h) {
    const words = [];
    textNodes(h).forEach((node) => {
      const line = document.createElement('span');
      line.className = 'mo-line';
      node.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { line.appendChild(document.createTextNode(part)); return; }
        const w = document.createElement('span');
        w.className = 'mo-w';
        const inner = document.createElement('span');
        inner.className = 'mo-wi';
        inner.textContent = part;
        w.appendChild(inner);
        line.appendChild(w);
        words.push(inner);
      });
      node.replaceWith(line);
    });
    return words;
  }

  const words = new Map();
  for (const [el, kind] of kindOf) {
    if (kind === 'head') {
      // gradient-clipped text can't be split without losing its fill
      if (getComputedStyle(el).backgroundClip === 'text') { kindOf.set(el, 'text'); continue; }
      words.set(el, splitHeading(el));
    }
    el.classList.add('mo', `mo-${kindOf.get(el)}`, 'mo-wait');
  }

  const play = (el, kind, delay) => {
    const opts = { duration: 1000, delay, easing: EASE_OUT, fill: 'backwards' };
    let anims = [];
    if (kind === 'head') {
      const ws = words.get(el) || [];
      const step = Math.min(65, 520 / Math.max(1, ws.length));
      anims = ws.map((w, i) => w.animate(
        [{ transform: 'translate3d(0, 110%, 0) rotate(2deg)' }, { transform: 'translate3d(0, 0, 0) rotate(0)' }],
        { ...opts, duration: 1100, delay: delay + i * step }
      ));
    } else if (kind === 'text' || kind === 'btn') {
      anims = [el.animate([{ opacity: 0, transform: 'translate3d(0, 26px, 0)' }, { opacity: 1, transform: 'none' }], opts)];
    } else if (kind === 'card') {
      anims = [el.animate([{ opacity: 0, transform: 'translate3d(0, 36px, 0) scale(.98)' }, { opacity: 1, transform: 'none' }], { ...opts, duration: 1100 })];
    } else if (kind === 'media') {
      anims = [el.animate(
        [{ clipPath: 'inset(100% 0% 0% 0%)', transform: 'scale(1.12)' }, { clipPath: 'inset(0% 0% 0% 0%)', transform: 'scale(1)' }],
        { ...opts, duration: 1400, easing: EASE_INOUT }
      )];
    } else {
      anims = [el.animate([{ opacity: 0 }, { opacity: 1 }], { ...opts, duration: 900 })];
    }
    el.classList.remove('mo-wait');
    const done = () => el.classList.add('mo-done');
    if (anims.length) anims[anims.length - 1].finished.then(done, done); else done();
  };

  // Elements that enter together play in reading order with a short stagger
  let queue = [];
  let flushing = false;
  let firstBatch = true;
  const flush = () => {
    flushing = false;
    queue.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    // on page load, wait for the hero/header entrance to get going first
    const base = firstBatch ? 260 : 0;
    firstBatch = false;
    queue.forEach((el, i) => play(el, kindOf.get(el), base + Math.min(i, 9) * 85));
    queue = [];
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        queue.push(en.target);
      });
      if (queue.length && !flushing) { flushing = true; requestAnimationFrame(flush); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    kindOf.forEach((_, el) => io.observe(el));
    // the last lines of a page can never rise past the trigger line, so once the
    // page is scrolled to the end, reveal whatever is on screen
    let sweepQueued = false;
    const sweep = () => {
      sweepQueued = false;
      const doc = document.documentElement;
      if (window.scrollY + window.innerHeight < doc.scrollHeight - 2) return;
      let added = false;
      $$('.mo-wait').forEach((el) => {
        if (queue.includes(el)) return;
        const r = el.getBoundingClientRect();
        if (r.height && r.top < window.innerHeight && r.bottom > 0) { io.unobserve(el); queue.push(el); added = true; }
      });
      if (added && !flushing) { flushing = true; requestAnimationFrame(flush); }
    };
    const queueSweep = () => { if (!sweepQueued) { sweepQueued = true; requestAnimationFrame(sweep); } };
    window.addEventListener('scroll', queueSweep, { passive: true });
    window.addEventListener('resize', queueSweep);
    queueSweep();
    // never leave anything hidden for print
    window.addEventListener('beforeprint', () => $$('.mo-wait').forEach((el) => el.classList.remove('mo-wait')));
  } else {
    $$('.mo-wait').forEach((el) => el.classList.remove('mo-wait'));
  }

  /* About/legal hero titles: same word rise as the Menu and Reservation pages
     (their own scripts split the title there) */
  if (document.body.matches('.page-about, .page-legal, .page-gallery')) {
    $$('.res-title[data-split]').forEach((title) => {
      const text = title.textContent.trim();
      title.setAttribute('aria-label', text);
      title.innerHTML = text.split(/\s+/).map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ');
      title.classList.add('is-split');
    });
  }

  /* =========================================================
     COUNT-UP: every [data-count] number counts up when it comes
     into view (from data-from, default 0) at a medium pace.
     The HTML already holds the final value, so it is correct
     without JavaScript and for reduced motion.
     ========================================================= */
  const counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    const fmt = (n, group) => (group ? Math.round(n).toLocaleString('en-US') : String(Math.round(n)));
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const run = (el) => {
      const end = parseFloat(el.dataset.count);
      const start = parseFloat(el.dataset.from || '0');
      const group = el.hasAttribute('data-group');
      const span = Math.abs(end - start);
      const duration = Math.min(2400, 1400 + span * 4);     // medium speed; bigger jumps a little longer
      const t0 = performance.now() + 120;
      const tick = (now) => {
        const t = Math.max(0, Math.min(1, (now - t0) / duration));
        el.textContent = fmt(start + (end - start) * ease(t), group);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        cio.unobserve(en.target);
        run(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    counters.forEach((el) => {
      const group = el.hasAttribute('data-group');
      const end = parseFloat(el.dataset.count);
      // reserve the final width so nothing around it moves while counting
      el.textContent = fmt(end, group);
      el.style.minWidth = `${el.getBoundingClientRect().width}px`;
      el.textContent = fmt(parseFloat(el.dataset.from || '0'), group);
      cio.observe(el);
    });
  }

  /* =========================================================
     2. LETTER ROLL ON BUTTONS AND LINKS
     Split happens on the first hover and is undone after the
     roll back, so labels other scripts change stay plain text.
     ========================================================= */
  const HOST_SEL = 'a[href], button, [role="tab"], summary';
  const NO_ROLL = '[data-no-roll], .sheet, input, select, textarea';
  const DUR = 560;              // ms per letter
  const MAX_SPREAD = 260;       // the last letter starts at most this long after the first
  const finePointer = (e) => e.pointerType !== 'touch';

  function splitHost(host) {
    if (host._roll) return host._roll;
    const nodes = textNodes(host).filter((n) => n.nodeValue.trim().length <= 48);
    if (!nodes.length) return null;
    const total = nodes.reduce((s, n) => s + n.nodeValue.replace(/\s/g, '').length, 0);
    if (!total || total > 64) return null;
    const step = Math.min(24, MAX_SPREAD / Math.max(1, total - 1));
    let i = 0;
    const lines = [];
    nodes.forEach((node) => {
      const line = document.createElement('span');
      line.className = 'roll';
      line._text = node.nodeValue;
      node.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { line.appendChild(document.createTextNode(part)); return; }
        const word = document.createElement('span');
        word.className = 'roll-w';
        for (const ch of part) {
          const c = document.createElement('span');
          c.className = 'roll-c';
          const inner = document.createElement('span');
          inner.className = 'roll-ci';
          inner.textContent = ch;
          inner.style.transitionDelay = `${Math.round(i * step)}ms`;
          c.appendChild(inner);
          word.appendChild(c);
          i += 1;
        }
        line.appendChild(word);
      });
      node.replaceWith(line);
      lines.push(line);
    });
    host._roll = { lines, span: DUR + Math.round((i - 1) * step) };
    return host._roll;
  }

  function unsplitHost(host) {
    const r = host._roll;
    host._roll = null;
    host.classList.remove('roll-ready', 'roll-on');
    if (!r) return;
    r.lines.forEach((line) => { if (line.isConnected) line.replaceWith(document.createTextNode(line._text)); });
  }

  function rollIn(host) {
    clearTimeout(host._rollTimer);
    // a script may have replaced the label since the last hover
    if (host._roll && !host._roll.lines.some((l) => l.isConnected)) unsplitHost(host);
    if (!splitHost(host)) return;
    if (!host.classList.contains('roll-ready')) {
      void host.offsetWidth;          // commit the resting position so the first roll animates
      host.classList.add('roll-ready');
    }
    host.classList.add('roll-on');
  }

  function rollOut(host) {
    if (!host._roll) return;
    host.classList.remove('roll-on');
    clearTimeout(host._rollTimer);
    host._rollTimer = setTimeout(() => {
      if (!host.classList.contains('roll-on')) unsplitHost(host);
    }, host._roll.span + 80);
  }

  const hostFrom = (t) => {
    const host = t instanceof Element ? t.closest(HOST_SEL) : null;
    if (!host || host.closest(NO_ROLL) || host.matches(':disabled, [aria-disabled="true"]')) return null;
    return host;
  };

  document.addEventListener('pointerover', (e) => {
    if (!finePointer(e)) return;
    const host = hostFrom(e.target);
    if (!host || (e.relatedTarget instanceof Node && host.contains(e.relatedTarget))) return;
    host._hovered = true;
    rollIn(host);
  });
  document.addEventListener('pointerout', (e) => {
    if (!finePointer(e)) return;
    const host = hostFrom(e.target);
    if (!host || (e.relatedTarget instanceof Node && host.contains(e.relatedTarget))) return;
    host._hovered = false;
    if (!host._focused) rollOut(host);
  });
  document.addEventListener('focusin', (e) => {
    const host = hostFrom(e.target);
    if (!host || host !== e.target || !host.matches(':focus-visible')) return;
    host._focused = true;
    rollIn(host);
  });
  document.addEventListener('focusout', (e) => {
    const host = hostFrom(e.target);
    if (!host || !host._focused) return;
    host._focused = false;
    if (!host._hovered) rollOut(host);
  });
})();

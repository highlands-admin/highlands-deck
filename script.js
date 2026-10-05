/* Highlands AI Solutions deck — Concept C "Field & Sky", slide engine.
   Engine: GSAP + SplitText (CDN, no build step).

   Scroll model: FIXED SLIDES. On desktop the page never scrolls natively.
   Every section is a full-viewport slide addressed by an index; one wheel
   gesture, one arrow key, or one swipe moves exactly one slide. Moving
   down, the next slide rides over the current one with a rounded top edge
   while the covered slide recedes and dims (the same stacking look the
   sticky build had); moving up plays the exact move in reverse. There is
   no scroll position, no zones, no settle timers: an index, a transition
   lock, and nothing else.

   Content taller than the viewport is scaled down to fit (transform on the
   slide's .wrap), the way slide tools handle overflowing slides.

   Under 961px (phones/tablets) the page keeps plain native scrolling with
   everything visible: no hijacking on touch devices. */

(function () {
  var panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));
  var railLinks = Array.prototype.slice.call(document.querySelectorAll('[data-rail]'));
  var progressFill = document.querySelector('.progress-bar span');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var slideMode = window.matchMedia('(min-width: 961px)').matches;

  var byId = {};
  railLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });

  function applyChrome(id, isDay) {
    railLinks.forEach(function (a) { a.classList.remove('is-active'); });
    if (byId[id]) byId[id].classList.add('is-active');
    document.body.classList.toggle('deck-on-day', !!isDay);
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  }

  /* ================= ambient videos (both modes) ================= */

  function playAmbient() {
    document.querySelectorAll('video[data-auto]').forEach(function (v) {
      if (!v.paused) return;
      if (v.ended && !v.loop) return; // play-once film holds its endcard
      v.muted = true;
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    });
  }
  playAmbient();
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) playAmbient();
  });

  /* Crossing the desktop/mobile boundary swaps engines: reload once. */
  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (window.matchMedia('(min-width: 961px)').matches !== slideMode) location.reload();
    }, 250);
  });

  if (!window.gsap) return; // CDN failed: the plain scrolling page stands on its own
  var hasSplit = !!window.SplitText;
  if (hasSplit) gsap.registerPlugin(SplitText);

  /* ====== self-playing product flows (CA + SnapSign, both modes) ====== */

  var flows = []; // { panelId, tl }
  function buildFlow(panelId, journeyId) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var steps = Array.prototype.slice.call(panel.querySelectorAll('#' + journeyId + ' .j-step'));
    var frames = Array.prototype.slice.call(panel.querySelectorAll('.ca-frames img'));
    if (steps.length < 2 || steps.length !== frames.length) return;
    var activate = function (i) {
      steps.forEach(function (s, k) { s.classList.toggle('active', k === i); });
    };
    var tl = gsap.timeline({ repeat: -1, paused: true });
    steps.forEach(function (step, i) {
      tl.addLabel('step' + i);
      tl.call(activate, [i]);
      tl.to(frames[i], { opacity: 1, duration: 0.45, ease: 'power2.out' }, '<');
      frames.forEach(function (f, k) {
        if (k !== i) tl.to(f, { opacity: 0, duration: 0.35 }, '<');
      });
      tl.to({}, { duration: 2.6 });
    });
    /* Demo behavior: hovering a step (or the screen itself) HOLDS the flow
       on that screen so it can be talked over; it resumes only when the
       cursor leaves. */
    var holdOn = function (i) {
      tl.pause();
      activate(i);
      // render that step's screen fully swapped (0.5s past the label is
      // beyond the crossfade), without firing the timeline's own callbacks
      tl.time(tl.labels['step' + i] + 0.5, true);
    };
    var resume = function () { tl.play(); };
    steps.forEach(function (step, i) {
      var jump = function () { holdOn(i); };
      step.addEventListener('click', jump);
      step.addEventListener('pointerenter', jump);
      step.addEventListener('mouseenter', jump);
      step.addEventListener('focus', jump);
    });
    var journeyEl = document.getElementById(journeyId);
    if (journeyEl) journeyEl.addEventListener('pointerleave', resume);
    var framesEl = panel.querySelector('.ca-frames');
    if (framesEl) {
      framesEl.addEventListener('pointerenter', function () { tl.pause(); });
      framesEl.addEventListener('pointerleave', resume);
    }
    flows.push({ panelId: panelId, tl: tl });
  }
  buildFlow('community-assistant', 'ca-journey');
  buildFlow('snapsign', 'ss-journey');
  buildFlow('workflow360', 'wf-journey');
  buildFlow('marketing', 'mk-journey');
  buildFlow('staffguard', 'sg-journey');

  /* =========================================================
     MOBILE / NARROW: plain native scrolling, content visible
     ========================================================= */
  if (!slideMode) {
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        if (progressFill) {
          var max = document.documentElement.scrollHeight - window.innerHeight;
          progressFill.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
        }
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    window.addEventListener('scroll', playAmbient, { passive: true, once: true });
    if (flows.length) {
      var flowSync = function () {
        flows.forEach(function (fl) {
          var r = document.getElementById(fl.panelId).getBoundingClientRect();
          var inView = r.top < window.innerHeight && r.bottom > 0;
          if (inView && fl.tl.paused()) fl.tl.play();
          if (!inView && !fl.tl.paused()) fl.tl.pause();
        });
      };
      setInterval(flowSync, 500);
      window.addEventListener('scroll', flowSync, { passive: true });
      flowSync();
    }
    return;
  }

  /* =========================================================
     DESKTOP: the slide engine
     ========================================================= */

  document.body.classList.add('slides');

  var current = 0;
  var animating = false;
  var DUR = reduced ? 0 : 0.6;

  panels.forEach(function (p, i) {
    p.classList.toggle('s-show', i === 0);
    gsap.set(p, { zIndex: i === 0 ? 2 : 1 });
  });

  /* ---- fit: scale any overflowing slide's .wrap down to the viewport ---- */
  function fitSlides() {
    panels.forEach(function (p) {
      var w = p.querySelector('.wrap');
      if (!w) return;
      var cs = getComputedStyle(p);
      var avail = window.innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var h = w.scrollHeight; // layout height: transforms never affect it
      var s = Math.min(1, avail / h);
      if (s < 0.995) {
        w.style.transform = 'scale(' + s.toFixed(4) + ')';
        w.style.transformOrigin = '50% 50%';
      } else {
        w.style.transform = '';
      }
    });
  }
  fitSlides();
  window.addEventListener('load', fitSlides);
  window.addEventListener('resize', function () { setTimeout(fitSlides, 200); });
  document.querySelectorAll('img').forEach(function (im) {
    if (!im.complete) im.addEventListener('load', fitSlides, { once: true });
  });

  /* ---------------- slide intros (once per slide) ---------------- */

  function lineReveal(tl, el, at) {
    if (!el) return;
    if (hasSplit) {
      var split = new SplitText(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      tl.from(split.lines, {
        yPercent: 115, duration: 1.05, ease: 'power4.out', stagger: 0.09,
        // the masks clip the Fraunces italics and their teal glow, so the
        // split must not outlive the animation
        onComplete: function () { split.revert(); }
      }, at);
    } else {
      tl.from(el, { opacity: 0, y: 28, duration: 0.9, ease: 'power3.out' }, at);
    }
  }
  function spring(tl, targets, at, stagger) {
    if (!targets || !targets.length) return;
    tl.from(targets, {
      opacity: 0, y: 26, scale: 0.97,
      duration: 0.7, ease: 'back.out(1.6)', stagger: stagger || 0.09
    }, at);
  }
  function addCounts(tl, root, at) {
    root.querySelectorAll('.count').forEach(function (el) {
      var end = parseInt(el.getAttribute('data-count'), 10);
      if (isNaN(end)) return;
      var prefix = el.getAttribute('data-prefix') || '';
      var suffix = el.getAttribute('data-suffix') || '';
      var obj = { v: 0 };
      tl.to(obj, {
        v: end, duration: 1.2, ease: 'power2.out',
        onStart: function () { el.textContent = prefix + '0' + suffix; },
        onUpdate: function () { el.textContent = prefix + Math.round(obj.v).toLocaleString('en-US') + suffix; },
        onComplete: function () { el.textContent = prefix + end.toLocaleString('en-US') + suffix; }
      }, at);
    });
  }

  function buildIntro(p) {
    var tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });

    if (p.id === 'hero') {
      tl.from('.hero-copy .eyebrow', { opacity: 0, x: -18, duration: 0.7 }, 0.1);
      lineReveal(tl, p.querySelector('h1'), 0.25);
      tl.from('.hero-copy .sub', { opacity: 0, y: 22, duration: 0.8 }, 0.85);
      tl.from('.hero-media', {
        y: 70, scale: 0.88, opacity: 0,
        duration: 1.2, ease: 'back.out(1.4)', transformOrigin: '50% 60%'
      }, 0.4);
      tl.from('.cue', { opacity: 0, y: 10, duration: 0.6 }, 1.3);
      return tl;
    }

    /* shared chapter choreography (purpose's h2 belongs to the typing
       sequence below: splitting it twice broke centering AND the typing) */
    var label = p.querySelector('.chapter-label');
    if (label) tl.from(label, { opacity: 0, x: -16, duration: 0.6 }, 0);
    if (p.id !== 'purpose') lineReveal(tl, p.querySelector('h2'), 0.12);
    var lede = p.querySelector('.lede');
    if (lede) tl.from(lede, { opacity: 0, y: 24, duration: 0.8 }, 0.3);

    var BODY = 0.42; // where slide-specific content starts

    var line = p.querySelector('.timeline, .journey');
    if (line) {
      tl.fromTo(line, { '--draw': 0 }, { '--draw': 1, duration: 1.1, ease: 'power2.inOut' }, BODY);
      // the CA journey's step visibility is owned by the flow's active
      // state; reveal-tweening the same elements fought it before
      if (!line.classList.contains('journey')) spring(tl, line.children, BODY, 0.13);
    }
    var problems = p.querySelectorAll('.problem-grid li');
    if (problems.length) spring(tl, problems, BODY, 0.06);
    var idx = p.querySelectorAll('.index-list li');
    if (idx.length) spring(tl, idx, BODY, 0.07);
    p.querySelectorAll('.trio').forEach(function (t) { spring(tl, t.children, BODY); });
    var road = p.querySelectorAll('.roadmap-list li');
    if (road.length) spring(tl, road, BODY);
    var proofs = p.querySelectorAll('.proof-item');
    if (proofs.length) spring(tl, proofs, BODY, 0.12);
    p.querySelectorAll('.dlist, .findings ul').forEach(function (ul) {
      spring(tl, ul.children, BODY, 0.07);
    });
    p.querySelectorAll('.bezel').forEach(function (bezel, k) {
      tl.from(bezel, { opacity: 0, y: 64, scale: 0.965, duration: 1.0 }, BODY + 0.12 + k * 0.12);
    });
    var phone = p.querySelector('.phone');
    if (phone) {
      tl.from(phone, { opacity: 0, y: 60, rotation: 5, duration: 1.0, ease: 'back.out(1.4)' }, BODY + 0.1);
      tl.call(function () {
        gsap.to(phone, { y: -14, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      });
    }
    var vcChart = p.querySelector('.vc-chart');
    if (vcChart) tl.from(vcChart, { opacity: 0, y: 44, scale: 0.94, duration: 0.8, ease: 'back.out(1.5)' }, BODY + 0.4);
    var casePanel = p.querySelector('.case-panel, .ca-case');
    if (casePanel) tl.from(casePanel, { opacity: 0, y: 70, scale: 0.98, duration: 0.95 }, BODY + 0.25);

    addCounts(tl, p, BODY + 0.5);

    /* PURPOSE: plain words rise dim-to-lit, then teal phrases type out */
    if (p.id === 'purpose' && hasSplit) {
      var purpose = p.querySelector('.purpose-headline');
      var voiceEls = Array.prototype.slice.call(purpose.querySelectorAll('em.voice'));
      var plainSplit = new SplitText(purpose, { type: 'words' });
      var plainWords = plainSplit.words.filter(function (w) {
        return !voiceEls.some(function (v) { return v.contains(w); });
      });
      var voiceChars = [];
      var charSplits = [];
      voiceEls.forEach(function (v) {
        var cs = new SplitText(v, { type: 'chars' });
        charSplits.push(cs);
        voiceChars = voiceChars.concat(cs.chars);
      });
      tl.fromTo(plainWords, { opacity: 0.1 }, { opacity: 1, stagger: 0.045, duration: 0.4, ease: 'power1.out' }, 0.2);
      tl.fromTo(voiceChars, { opacity: 0, y: 8 },
        { opacity: 1, y: 0, stagger: 0.05, duration: 0.06, ease: 'none' }, '-=0.1');
      // restore clean markup (and centering) once the typing has played
      tl.call(function () {
        charSplits.reverse().forEach(function (cs) { cs.revert(); });
        plainSplit.revert();
      });
    }

    return tl;
  }

  var introPlayed = {};
  function playIntro(i, delay) {
    if (reduced || introPlayed[i]) return;
    introPlayed[i] = true;
    try {
      var tl = buildIntro(panels[i]); // builds paused: from-states apply now
      gsap.delayedCall(delay || 0, function () { tl.play(); });
    } catch (err) {
      /* an intro failure must never block navigation */
      if (window.console) console.error('intro failed for', panels[i].id, err);
    }
  }

  function onSlideSettled(i) {
    flows.forEach(function (fl) {
      if (panels[i].id === fl.panelId) { if (fl.tl.paused()) fl.tl.play(); }
      else if (!fl.tl.paused()) fl.tl.pause();
    });
    playAmbient();
  }

  /* ---------------- the transition ---------------- */

  function goTo(target, instant) {
    target = Math.max(0, Math.min(panels.length - 1, target));
    if (target === current || animating) return;
    var cur = panels[current];
    var nxt = panels[target];
    var down = target > current;

    applyChrome(nxt.id, nxt.classList.contains('day'));
    playIntro(target, instant ? 0.1 : 0.38);

    if (instant || reduced) {
      cur.classList.remove('s-show');
      gsap.set(cur, { zIndex: 1, xPercent: 0, scale: 1, '--veil': 0 });
      nxt.classList.add('s-show');
      gsap.set(nxt, { zIndex: 2, xPercent: 0, scale: 1, '--veil': 0 });
      current = target;
      onSlideSettled(target);
      return;
    }

    animating = true;
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      cur.classList.remove('s-show', 's-cover');
      nxt.classList.remove('s-cover');
      gsap.set(cur, { zIndex: 1, xPercent: 0, scale: 1, '--veil': 0 });
      gsap.set(nxt, { zIndex: 2, xPercent: 0, scale: 1, '--veil': 0 });
      current = target;
      animating = false;
      onSlideSettled(target);
    }

    /* Horizontal, deck-style: forward, the next slide rides in from the
       right and covers the receding, dimming current one; backward is the
       exact reverse. Quick and decisive on purpose. */
    nxt.classList.add('s-show');
    var tl = gsap.timeline({ onComplete: finish });
    if (down) {
      nxt.classList.add('s-cover');
      gsap.set(nxt, { zIndex: 3, xPercent: 100, scale: 1, '--veil': 0 });
      gsap.set(cur, { zIndex: 2 });
      tl.to(nxt, { xPercent: 0, duration: DUR, ease: 'power2.inOut' }, 0);
      tl.to(cur, { scale: 0.965, '--veil': 0.55, transformOrigin: '30% 50%', duration: DUR, ease: 'power2.inOut' }, 0);
    } else {
      cur.classList.add('s-cover');
      gsap.set(cur, { zIndex: 3 });
      gsap.set(nxt, { zIndex: 2, xPercent: 0, scale: 0.965, '--veil': 0.55 });
      tl.to(cur, { xPercent: 100, duration: DUR, ease: 'power2.inOut' }, 0);
      tl.to(nxt, { scale: 1, '--veil': 0, transformOrigin: '30% 50%', duration: DUR, ease: 'power2.inOut' }, 0);
    }
    setTimeout(finish, DUR * 1000 + 500); // failsafe: never leave the deck locked
  }

  /* ---------------- input ---------------- */

  /* Wheel gating: one physical gesture triggers one slide, never two.
     A trigger disarms the wheel. Re-arming needs a real pause (>140ms
     between events) or a direction change, so a momentum tail can't
     chain into the next slide. A momentum tail's dying events are small,
     so a fresh trigger also needs real amplitude (>=12): the sparse tail
     stragglers with big gaps can't fire a second slide. Devices that
     emit a truly continuous stream (no pause, no reversal, ever) re-arm
     unconditionally 1500ms after the last trigger, so the wheel can
     never stay dead. */
  var armed = true;
  var lastWheelAt = 0;
  var lastDir = 0;
  var lastTriggerAt = 0;
  window.addEventListener('wheel', function (e) {
    e.preventDefault(); // the engine owns all scrolling in slide mode
    var now = performance.now();
    var gap = now - lastWheelAt;
    lastWheelAt = now;
    if (Math.abs(e.deltaY) < 4) return;
    var dir = e.deltaY > 0 ? 1 : -1;
    if (animating) { lastDir = dir; return; } // never re-arm mid-transition
    if (!armed && (gap > 140 || dir !== lastDir || now - lastTriggerAt > 1500)) armed = true;
    lastDir = dir;
    if (!armed) return;
    if (Math.abs(e.deltaY) < 12) return; // too weak to start a slide
    armed = false;
    lastTriggerAt = now;
    goTo(current + dir);
  }, { passive: false });

  var touchPt = null;
  window.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) touchPt = [e.touches[0].clientX, e.touches[0].clientY];
  }, { passive: true });
  window.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend', function (e) {
    if (touchPt === null) return;
    var dx = touchPt[0] - e.changedTouches[0].clientX;
    var dy = touchPt[1] - e.changedTouches[0].clientY;
    touchPt = null;
    var d = Math.abs(dx) > Math.abs(dy) ? dx : dy; // dominant axis
    if (Math.abs(d) > 60) goTo(current + (d > 0 ? 1 : -1));
  }, { passive: true });

  window.addEventListener('keydown', function (e) {
    if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
      e.preventDefault(); goTo(current + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
      e.preventDefault(); goTo(current - 1);
    } else if (e.key === 'Home' || e.key === 'Escape') {
      e.preventDefault(); goTo(0);
    } else if (e.key === 'End') {
      e.preventDefault(); goTo(panels.length - 1);
    }
  });

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var href = a.getAttribute('href');
      var el = href.length > 1 && document.querySelector(href);
      if (el) {
        e.preventDefault();
        var i = panels.indexOf(el);
        if (i !== -1) goTo(i);
      }
    });
  });

  /* ---------------- init ---------------- */

  /* browser back/forward move between slides too */
  window.addEventListener('hashchange', function () {
    var i = initialIndex();
    if (i !== current) goTo(i);
  });

  function initialIndex() {
    var id = (location.hash || '').slice(1);
    if (!id) return 0;
    var el = document.getElementById(id);
    var i = el ? panels.indexOf(el) : -1;
    return i === -1 ? 0 : i;
  }

  function start() {
    fitSlides();
    var i = initialIndex();
    if (i !== 0) {
      panels[0].classList.remove('s-show');
      gsap.set(panels[0], { zIndex: 1 });
      panels[i].classList.add('s-show');
      gsap.set(panels[i], { zIndex: 2 });
      current = i;
    }
    applyChrome(panels[i].id, panels[i].classList.contains('day'));
    playIntro(i, 0.2);
    onSlideSettled(i);
  }

  /* validation hook (harmless in production) */
  window.__slides = {
    i: function () { return current; },
    go: goTo,
    n: panels.length,
    fit: fitSlides,
    state: function () { return { current: current, animating: animating, id: panels[current].id }; }
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start);
  } else {
    start();
  }
})();

// EDUminds scroll site
// - Hero Book (closed-book scrub + "Education, simplified." + explode into
//   the 6 subject cards) is the original, unmodified flow: ONE pinned
//   section, its own scroll-progress driver (initHeroBook) — do not split
//   or re-architect this again.
// - Plain content sections each get their own IntersectionObserver (no
//   single global scroll listener/observer) — text reveals in on entry
//   and resets on exit.
// - Sir Teaching in Classroom, Blue & Orange Lines Forming Brain, and Brain
//   Sparkling are scroll-scrubbed: each is a tall pinned section whose own
//   scroll-progress tracker drives the animation frame-by-frame, forward
//   and backward, exactly with scroll position.

(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');
  if (reducedMotion) document.documentElement.classList.add('reduced-motion');

  // ---------------- Nav scroll-spy (highlights the chip for the visible section) ----------------
  const navChips = document.querySelectorAll('.nav-links a[data-nav]');
  if (navChips.length) {
    const sections = [...navChips]
      .map((chip) => document.getElementById(chip.dataset.nav))
      .filter(Boolean);

    const setActive = (id) => {
      navChips.forEach((chip) => chip.classList.toggle('is-active', chip.dataset.nav === id));
    };

    const spy = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) {
          visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach((s) => spy.observe(s));
  }

  // ---------------- Per-section reveal (own IntersectionObserver per section,
  // not one shared page-wide observer). Toggles in AND out, matching the
  // "animate in on entry, animate out/reset on exit" requirement. ----------------
  function initSectionReveal(section) {
    if (!section) return;
    const items = section.querySelectorAll('.reveal');
    if (!items.length) return;
    if (reducedMotion) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          items.forEach((el) => el.classList.toggle('is-visible', entry.isIntersecting));
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(section); // one dedicated observer instance for this section only
  }

  ['#about', '#subjects', '#teach', '#testimonials', '#contact', '.logo-reveal',
    '.hero-book', '#classroom-teaching', '#brain-lines', '#brain-sparkle']
    .forEach((sel) => initSectionReveal(document.querySelector(sel)));

  // ---------------- Shared frame-sequence drawing helpers ----------------
  function frameUrl(manifest, i) {
    return manifest.pattern.replace('%04d', String(i).padStart(4, '0'));
  }

  function drawFrameCapped(ctx, canvas, img) {
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const cw = canvas.width, ch = canvas.height;
    // Capped "cover" fit: true edge-to-edge fill when the box is close to
    // the footage's 16:9, only letterboxing once the box's aspect ratio
    // strays far from that — see reference/vanilla-film.md for the math.
    const srcAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = cw / ch;
    const MAX_DEVIATION = 1.05;
    let effCw = cw, effCh = ch;
    if (containerAspect > srcAspect * MAX_DEVIATION) {
      effCw = ch * srcAspect * MAX_DEVIATION;
    } else if (containerAspect < srcAspect / MAX_DEVIATION) {
      effCh = cw / (srcAspect / MAX_DEVIATION);
    }
    const scale = Math.max(effCw / img.naturalWidth, effCh / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }


  // ---------------- Scroll-progress helper: tracks how far a tall pinned
  // section has scrolled through its own sticky viewport (0 at the top of
  // the section, 1 once it's fully scrolled past) and reports it via a
  // dedicated rAF-throttled scroll listener — every scrub section gets its
  // own instance/closure, independent of every other section's. ----------------
  function bindScrollProgress(section, onUpdate) {
    let ticking = false;
    function update() {
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      const progress = total > 0 ? scrolled / total : 0;
      onUpdate(Math.min(1, Math.max(0, progress)));
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // ---------------- Hero book: ONE pinned section carries the closed-book
  // scrub, then crossfades (same pose) into the CSS-driven exploding-pages
  // animation — no separate section boundary, no hand-off cut. Restored
  // verbatim from the original build (own local frameUrl/drawFrame/resize,
  // independent of the shared film helpers below) — never re-split this. ----------------
  function initHeroBook() {
    const section = document.querySelector('.hero-book');
    if (!section || reducedMotion) return; // baseline CSS already shows everything statically

    section.classList.add('scrub-ready');

    const canvas = section.querySelector('canvas');
    const loadingEl = section.querySelector('.film-loading');
    const ctx = canvas.getContext('2d');

    const VIDEO_END = 0.28;               // fraction of total scroll spent on the book scrub + headline
    const CROSSFADE = 0.05;               // width of the canvas -> book-object handoff
    const EXPLODE_START = VIDEO_END + CROSSFADE;
    const TEXT_FADE_START = VIDEO_END * 0.6;

    function explodeAmount(q) {
      if (q < 0.12) return 0;
      if (q < 0.4) return (q - 0.12) / 0.28;
      if (q < 0.68) return 1;
      if (q < 0.96) return 1 - (q - 0.68) / 0.28;
      return 0;
    }

    function frameUrl(manifest, i) {
      return manifest.pattern.replace('%04d', String(i).padStart(4, '0'));
    }
    function resizeCanvas() {
      canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    }
    function drawFrame(img) {
      if (!img || !img.complete || img.naturalWidth === 0) return;
      const cw = canvas.width, ch = canvas.height;
      // Capped "cover" fit: on a window shaped close to the footage's 16:9,
      // this is true edge-to-edge full-bleed with zero letterbox. Only once
      // the window's aspect ratio strays far from 16:9 (a narrow/tall or
      // very wide/short window) does it cap the crop and let a little white
      // letterbox appear instead of cropping further — a middle ground
      // between "always full-bleed, sometimes crops a lot" and "never
      // crops, sometimes looks like a small boxed-in rectangle".
      const srcAspect = img.naturalWidth / img.naturalHeight;
      const containerAspect = cw / ch;
      const MAX_DEVIATION = 1.05;
      let effCw = cw, effCh = ch;
      if (containerAspect > srcAspect * MAX_DEVIATION) {
        effCw = ch * srcAspect * MAX_DEVIATION;
      } else if (containerAspect < srcAspect / MAX_DEVIATION) {
        effCh = cw / (srcAspect / MAX_DEVIATION);
      }
      const scale = Math.max(effCw / img.naturalWidth, effCh / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      if (loadingEl) loadingEl.classList.add('is-hidden');
    }

    fetch('assets/frames-a/manifest.json')
      .then((r) => { if (!r.ok) throw new Error('manifest not found'); return r.json(); })
      .then(run)
      .catch(() => { if (loadingEl) loadingEl.textContent = 'Film not available'; });

    function run(manifest) {
      resizeCanvas();

      const images = new Array(manifest.frameCount);
      const EAGER = Math.min(24, manifest.frameCount);
      for (let i = 0; i < EAGER; i++) {
        const img = new Image();
        img.src = frameUrl(manifest, i);
        if (i === 0) img.onload = () => drawFrame(img);
        images[i] = img;
      }
      let lazyIndex = EAGER;
      function loadNextLazy() {
        if (lazyIndex >= manifest.frameCount) return;
        const i = lazyIndex++;
        const img = new Image();
        img.src = frameUrl(manifest, i);
        images[i] = img;
        img.onload = () => scheduleLazy();
        img.onerror = () => scheduleLazy();
      }
      function scheduleLazy() {
        if ('requestIdleCallback' in window) requestIdleCallback(loadNextLazy, { timeout: 200 });
        else setTimeout(loadNextLazy, 16);
      }
      scheduleLazy();

      let currentFrame = -1;

      function updateAll(p) {
        // Video phase: 0 .. VIDEO_END
        const videoProgress = Math.min(1, p / VIDEO_END);
        const targetFrame = Math.min(manifest.frameCount - 1, Math.max(0, Math.floor(videoProgress * manifest.frameCount)));
        if (targetFrame !== currentFrame) {
          currentFrame = targetFrame;
          const img = images[currentFrame];
          if (img && img.complete) drawFrame(img);
          else if (img) img.onload = () => { if (currentFrame === targetFrame) drawFrame(img); };
        }

        // Headline fades out just before the crossfade starts
        const textOp = p <= TEXT_FADE_START ? 1 : Math.max(0, 1 - (p - TEXT_FADE_START) / (VIDEO_END - TEXT_FADE_START));
        section.style.setProperty('--filmtext-op', textOp.toFixed(3));

        // Crossfade: VIDEO_END .. EXPLODE_START — canvas hands off to the
        // static book-object image (same pose), "What we teach" fades in
        const fade = Math.max(0, Math.min(1, (p - VIDEO_END) / CROSSFADE));
        section.style.setProperty('--canvas-op', (1 - fade).toFixed(3));
        section.style.setProperty('--book-op', fade.toFixed(3));
        section.style.setProperty('--intro-op', fade.toFixed(3));

        // Explode phase: EXPLODE_START .. 1
        const q = p <= EXPLODE_START ? 0 : (p - EXPLODE_START) / (1 - EXPLODE_START);
        section.style.setProperty('--progress', explodeAmount(q).toFixed(4));
      }

      bindScrollProgress(section, updateAll);

      window.addEventListener('resize', () => {
        resizeCanvas();
        if (images[currentFrame]) drawFrame(images[currentFrame]);
      });
    }
  }

  initHeroBook();

  // ---------------- Scrub-film: a tall pinned section whose canvas frame is
  // chosen directly from scroll progress through its own range — scrubs
  // forward and backward exactly with scroll direction. Used for Sir
  // Teaching in Classroom, Blue & Orange Lines Forming Brain, and Brain
  // Sparkling; each section gets its own manifest fetch, frame cache, and
  // bindScrollProgress instance. ----------------
  function initScrubFilm(section) {
    if (!section) return;
    const canvas = section.querySelector('canvas');
    const loadingEl = section.querySelector('.film-loading');
    const manifestUrl = section.dataset.manifest;
    const frameStart = parseInt(section.dataset.start, 10) || 0;
    const frameEnd = parseInt(section.dataset.end, 10) || frameStart;
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
      canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    }

    fetch(manifestUrl)
      .then((r) => { if (!r.ok) throw new Error('manifest not found'); return r.json(); })
      .then(run)
      .catch(() => { if (loadingEl) loadingEl.textContent = 'Animation not available'; });

    function run(manifest) {
      resizeCanvas();

      if (reducedMotion) {
        const poster = new Image();
        poster.src = frameUrl(manifest, frameEnd);
        poster.onload = () => {
          if (loadingEl) loadingEl.classList.add('is-hidden');
          drawFrameCapped(ctx, canvas, poster);
        };
        window.addEventListener('resize', () => { resizeCanvas(); drawFrameCapped(ctx, canvas, poster); });
        return;
      }

      const total = frameEnd - frameStart;
      const images = new Array(total + 1);
      function loadFrame(localIdx) {
        if (images[localIdx]) return images[localIdx];
        const img = new Image();
        img.src = frameUrl(manifest, frameStart + localIdx);
        images[localIdx] = img;
        return img;
      }
      // Preload the rest lazily in the background so fast scrubbing has as
      // many frames cached as possible without stalling entry on a full burst.
      // Uses addEventListener (not .onload =) so this never clobbers the
      // load callback showFrame() attaches to the same cached Image below.
      let lazyIdx = 1;
      function scheduleLazy() {
        if ('requestIdleCallback' in window) requestIdleCallback(loadNextLazy, { timeout: 200 });
        else setTimeout(loadNextLazy, 16);
      }
      function loadNextLazy() {
        if (lazyIdx > total) return;
        const img = loadFrame(lazyIdx++);
        if (img.complete) scheduleLazy();
        else {
          img.addEventListener('load', scheduleLazy, { once: true });
          img.addEventListener('error', scheduleLazy, { once: true });
        }
      }
      scheduleLazy();

      let currentLocal = -1;
      function showFrame(localIdx) {
        currentLocal = localIdx;
        const img = loadFrame(localIdx);
        const draw = () => {
          if (currentLocal !== localIdx) return;
          if (loadingEl) loadingEl.classList.add('is-hidden');
          drawFrameCapped(ctx, canvas, img);
        };
        if (img.complete) draw(); else img.addEventListener('load', draw, { once: true });
      }

      bindScrollProgress(section, (q) => {
        showFrame(Math.round(q * total));
      });

      window.addEventListener('resize', () => {
        resizeCanvas();
        const img = images[currentLocal];
        if (img && img.complete) drawFrameCapped(ctx, canvas, img);
      });
    }
  }

  ['#classroom-teaching', '#brain-lines', '#brain-sparkle']
    .forEach((sel) => initScrubFilm(document.querySelector(sel)));

  // ---------------- Logo intro (opens the page, still scroll-scrubbed —
  // it's a splash lead-in, not one of the 10 numbered sections) ----------------
  const logoIntro = document.querySelector('.logo-intro');
  if (logoIntro && !reducedMotion) {
    let ticking = false;
    function updateLogoIntro() {
      const rect = logoIntro.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      const progress = total > 0 ? scrolled / total : 0;
      logoIntro.style.setProperty('--progress', Math.min(1, progress).toFixed(4));
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(updateLogoIntro); ticking = true; }
    }, { passive: true });
    window.addEventListener('resize', updateLogoIntro);
    updateLogoIntro();
  }

  // ---------------- Subject pill picker + spotlight ----------------
  const pills = document.querySelectorAll('.subject-pill');
  const spotlight = document.querySelector('.subject-spotlight');
  if (pills.length && spotlight) {
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const subject = pill.dataset.subject;
        const color = pill.style.getPropertyValue('--pill-color');

        pills.forEach((p) => {
          const active = p === pill;
          p.classList.toggle('is-active', active);
          p.setAttribute('aria-selected', String(active));
        });

        if (color) spotlight.style.setProperty('--spot-color', color);
        spotlight.querySelectorAll('[data-subject-content]').forEach((block) => {
          block.hidden = block.dataset.subjectContent !== subject;
        });
      });
    });
  }

  // ---------------- 3D tilt on subject cards (pointer-driven, desktop only) ----------------
  if (!reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.subject-card').forEach((card) => {
      const MAX_TILT = 7;
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.classList.add('is-tracking');
        card.style.setProperty('--rx', ((px - 0.5) * MAX_TILT * 2).toFixed(2) + 'deg');
        card.style.setProperty('--ry', (-(py - 0.5) * MAX_TILT * 2).toFixed(2) + 'deg');
        card.style.setProperty('--lift', '-6px');
      });
      card.addEventListener('pointerleave', () => {
        card.classList.remove('is-tracking');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--lift', '0px');
      });
    });
  }

  // ---------------- Magnetic buttons (pointer-driven, desktop only) ----------------
  if (!reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.button, .nav-cta').forEach((btn) => {
      const PULL = 0.28;
      const MAX_OFFSET = 10; // px — keeps the pull subtle and never pushes the button off-screen
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const mx = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, (e.clientX - (r.left + r.width / 2)) * PULL));
        const my = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, (e.clientY - (r.top + r.height / 2)) * PULL));
        btn.style.setProperty('--mx', mx.toFixed(1) + 'px');
        btn.style.setProperty('--my', my.toFixed(1) + 'px');
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  }

  // ---------------- Cursor-reactive glow in the opening hero ----------------
  if (!reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const heroGlow = document.querySelector('.logo-intro-sticky');
    if (heroGlow) {
      heroGlow.addEventListener('pointermove', (e) => {
        const r = heroGlow.getBoundingClientRect();
        heroGlow.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        heroGlow.style.setProperty('--gy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    }
  }
})();

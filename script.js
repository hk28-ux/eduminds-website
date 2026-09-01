// EDUminds scroll site
// - Two independent canvas frame-scrub "films" (see reference/vanilla-film.md pattern)
// - A scroll-driven exploding-book section built with pure CSS custom properties
// - Standard reveal-on-scroll for the brand sections below

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

  // ---------------- Reveal-on-scroll for brand sections ----------------
  if (!reducedMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  }

  // ---------------- Canvas frame-scrub film (reusable) ----------------
  function initFilm(cfg) {
    const section = document.querySelector(cfg.section);
    if (!section) return;
    const canvas = section.querySelector('canvas');
    const captionEl = section.querySelector('.film-caption');
    const loadingEl = section.querySelector('.film-loading');
    const ctx = canvas.getContext('2d');

    fetch(cfg.manifest)
      .then((r) => {
        if (!r.ok) throw new Error('manifest not found');
        return r.json();
      })
      .then((manifest) => run(manifest))
      .catch(() => {
        if (loadingEl) loadingEl.textContent = 'Film not available';
      });

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
      const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      if (loadingEl) loadingEl.classList.add('is-hidden');
    }

    function run(manifest) {
      resizeCanvas();

      if (reducedMotion) {
        const poster = new Image();
        poster.src = frameUrl(manifest, manifest.frameCount - 1);
        poster.onload = () => {
          if (loadingEl) loadingEl.classList.add('is-hidden');
          drawFrame(poster);
        };
        window.addEventListener('resize', () => { resizeCanvas(); drawFrame(poster); });
        return;
      }

      const images = new Array(manifest.frameCount);
      const EAGER = Math.min(24, manifest.frameCount);

      for (let i = 0; i < EAGER; i++) {
        const img = new Image();
        img.src = frameUrl(manifest, i);
        if (i === 0) img.onload = () => { if (loadingEl) loadingEl.classList.add('is-hidden'); drawFrame(img); };
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
      let ticking = false;

      function updateFromScroll() {
        const rect = section.getBoundingClientRect();
        const total = rect.height - window.innerHeight;
        const scrolled = Math.min(Math.max(-rect.top, 0), total);
        const progress = total > 0 ? scrolled / total : 0;
        const targetFrame = Math.min(manifest.frameCount - 1, Math.max(0, Math.floor(progress * manifest.frameCount)));

        if (targetFrame !== currentFrame) {
          currentFrame = targetFrame;
          const img = images[currentFrame];
          if (img && img.complete) {
            drawFrame(img);
          } else if (img) {
            img.onload = () => { if (currentFrame === targetFrame) drawFrame(img); };
          }

          if (captionEl && manifest.chapters) {
            let activeChapter = manifest.chapters[0];
            for (const ch of manifest.chapters) {
              if (currentFrame >= ch.startFrame) activeChapter = ch;
            }
            if (captionEl.dataset.chapter !== activeChapter.name) {
              captionEl.dataset.chapter = activeChapter.name;
              captionEl.textContent = activeChapter.caption || '';
              captionEl.classList.toggle('is-active', Boolean(activeChapter.caption));
            }
          }
        }
        ticking = false;
      }

      window.addEventListener('scroll', () => {
        if (!ticking) { requestAnimationFrame(updateFromScroll); ticking = true; }
      }, { passive: true });

      window.addEventListener('resize', () => {
        resizeCanvas();
        if (images[currentFrame]) drawFrame(images[currentFrame]);
      });

      updateFromScroll();
    }
  }

  initFilm({ section: '.film-b', manifest: 'assets/frames-b/manifest.json' });

  // Maps scroll position within `section` (0 = top of section reaches top of
  // viewport, 1 = bottom of section leaves bottom of viewport) to a 0..1
  // progress value, rAF-throttled, and hands it to onUpdate every tick.
  function bindScrollProgress(section, onUpdate) {
    let ticking = false;
    function update() {
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      const progress = total > 0 ? scrolled / total : 0;
      onUpdate(progress);
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
  // animation — no separate section boundary, no hand-off cut. ----------------
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
      const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
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

  // ---------------- Logo intro (opens the scroll sequence) ----------------
  const logoIntro = document.querySelector('.logo-intro');
  if (logoIntro && !reducedMotion) {
    bindScrollProgress(logoIntro, (progress) => {
      logoIntro.style.setProperty('--progress', Math.min(1, progress).toFixed(4));
    });
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

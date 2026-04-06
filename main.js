/* ============================================================
   PROMISED, NOT DELIVERED — Application Logic v3
   Three.js particle hero · GSAP ScrollTrigger reveals
   Custom cursor · 3D card tilt · Magnetic buttons
   All data rendering & interaction preserved
   ============================================================ */
(function () {
  'use strict';

  /* ---- State ---- */
  let data = null;
  let selectedDocId = null;
  const activeFilters = new Set(['all']);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = 'ontouchstart' in window;

  /* ---- Label maps ---- */
  const LABELS = {
    community_ownership: 'Communities will lead',
    context_sensitivity: 'Context-specific design',
    participation: 'Participatory approach',
    sustainability: 'Sustainable beyond the project',
    equity: 'Reaching the most vulnerable',
  };
  const CATS = Object.keys(LABELS);

  /* ---- Selectors ---- */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    if (!isTouch && !reducedMotion) initCursor();
    setupNav();
    setupFilters();
    setupPanel();
    fakeLoaderProgress();

    try {
      const res = await fetch('data.json');
      if (!res.ok) throw new Error('fetch failed');
      data = await res.json();
    } catch {
      finishLoader();
      $('#error-state').classList.add('show');
      return;
    }

    $('#main').style.display = '';

    requestAnimationFrame(() => {
      initHero();
      render();
      finishLoader();
      if (!reducedMotion) initScrollAnimations();
      initHeroReveal();
    });
  }

  /* ---- Loader ---- */
  function fakeLoaderProgress() {
    const bar = $('#loader-bar');
    if (!bar) return;
    let w = 0;
    const t = setInterval(() => {
      w = Math.min(w + Math.random() * 18, 85);
      bar.style.width = w + '%';
    }, 150);
    window._loaderTimer = t;
  }

  function finishLoader() {
    clearInterval(window._loaderTimer);
    const bar = $('#loader-bar');
    if (bar) bar.style.width = '100%';
    setTimeout(() => $('#loader').classList.add('hidden'), 300);
  }

  /* ============================================================
     CUSTOM CURSOR
     ============================================================ */
  function initCursor() {
    const dot = $('#cursor-dot');
    const ring = $('#cursor-ring');
    if (!dot || !ring) return;

    let mx = -100, my = -100;
    let dotX = -100, dotY = -100;
    let ringX = -100, ringY = -100;

    document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });

    const interactiveEls = 'a, button, [role="button"], .timeline__dot, .tl-card, .promise-card, .panel__source-btn';

    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(interactiveEls)) {
        dot.classList.add('hover');
        ring.classList.add('hover');
      }
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(interactiveEls)) {
        dot.classList.remove('hover');
        ring.classList.remove('hover');
      }
    });

    document.addEventListener('mousedown', () => {
      dot.style.transform = 'translate(-50%,-50%) scale(0.6)';
    });
    document.addEventListener('mouseup', () => {
      dot.style.transform = '';
    });

    (function tick() {
      dotX += (mx - dotX) * 0.18;
      dotY += (my - dotY) * 0.18;
      ringX += (mx - ringX) * 0.07;
      ringY += (my - ringY) * 0.07;
      dot.style.left  = dotX + 'px';
      dot.style.top   = dotY + 'px';
      ring.style.left = ringX + 'px';
      ring.style.top  = ringY + 'px';
      requestAnimationFrame(tick);
    })();
  }

  /* ============================================================
     THREE.JS PARTICLE HERO
     ============================================================ */
  function initHero() {
    const canvas = $('#hero-canvas');
    if (!canvas || typeof THREE === 'undefined' || reducedMotion) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);

    const scene = new THREE.Scene();
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 1200);
    camera.position.z = 380;

    /* White ambient particles */
    const N = 700;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) {
      pos[i] = (Math.random() - 0.5) * 1100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xE8E4DC, size: 1.4, transparent: true, opacity: 0.32 });
    scene.add(new THREE.Points(geo, mat));

    /* Amber document dots */
    const DN = 45;
    const dPos = new Float32Array(DN * 3);
    for (let i = 0; i < DN * 3; i++) dPos[i] = (Math.random() - 0.5) * 750;
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    const dMat = new THREE.PointsMaterial({ color: 0xD4A853, size: 3.2, transparent: true, opacity: 0.88 });
    scene.add(new THREE.Points(dGeo, dMat));

    /* Mouse parallax */
    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;

    window.addEventListener('mousemove', (e) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 22;
      targetY = (e.clientY / window.innerHeight - 0.5) * 14;
    }, { passive: true });

    /* Resize */
    const onResize = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize, { passive: true });

    /* Only render when hero is visible */
    let heroVisible = true;
    const heroObs = new IntersectionObserver((entries) => {
      heroVisible = entries[0].isIntersecting;
    });
    heroObs.observe($('#hero'));

    /* Animation loop */
    const clock = new THREE.Clock();
    let rafId;
    (function animate() {
      rafId = requestAnimationFrame(animate);
      if (!heroVisible) return;
      const t = clock.getElapsedTime();
      scene.rotation.y = t * 0.018;
      scene.rotation.x = Math.sin(t * 0.008) * 0.04;
      currentX += (targetX - currentX) * 0.025;
      currentY += (targetY - currentY) * 0.025;
      camera.position.x = currentX;
      camera.position.y = -currentY;
      renderer.render(scene, camera);
    })();
  }

  /* ============================================================
     HERO TEXT REVEAL
     ============================================================ */
  function initHeroReveal() {
    /* Wrap lines in inner span for reveal animation */
    $$('.hero__line').forEach((line) => {
      const text = line.textContent;
      line.innerHTML = `<span class="hero__line-inner">${text}</span>`;
    });

    if (reducedMotion) {
      $$('.hero__line-inner').forEach(el => { el.style.transform = 'translateY(0)'; });
      $$('.hero__kicker, .hero__subtitle, .hero__stats').forEach(el => el.classList.add('visible'));
      return;
    }

    /* Animate lines */
    const lines = $$('.hero__line-inner');
    if (typeof gsap !== 'undefined') {
      gsap.to(lines, {
        y: '0%', duration: 1.1, ease: 'power4.out',
        stagger: 0.12, delay: 0.2,
        onComplete: () => {
          /* Fade in subtitle + stats after lines land */
          setTimeout(() => {
            $$('.hero__kicker, .hero__subtitle, .hero__stats').forEach(el => el.classList.add('visible'));
          }, 100);
        }
      });
    } else {
      lines.forEach((l, i) => {
        l.style.transition = `transform 1.1s ${0.2 + i * 0.12}s cubic-bezier(0.16,1,0.3,1)`;
        l.style.transform = 'translateY(0)';
      });
      setTimeout(() => {
        $$('.hero__kicker, .hero__subtitle, .hero__stats').forEach(el => el.classList.add('visible'));
      }, 600);
    }
  }

  /* ============================================================
     GSAP SCROLL ANIMATIONS
     ============================================================ */
  function initScrollAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    /* Section labels and titles */
    $$('.section-label, .section-intro, .section-title, .showcase__panel-title, .showcase__caption, .timeline__legend, .process-footnote, .flowchart__footnote, .dataviz__caption').forEach(el => {
      gsap.fromTo(el,
        { y: 30, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.85, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
        }
      );
    });

    /* Promise cards stagger */
    const cards = $$('.promise-card');
    if (cards.length) {
      gsap.fromTo(cards,
        { y: 50, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.07,
          scrollTrigger: { trigger: '#promise-grid', start: 'top 82%' }
        }
      );
    }

    /* Timeline header */
    gsap.fromTo('.timeline__header .section-title',
      { x: -40, opacity: 0 },
      {
        x: 0, opacity: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: '.timeline__header', start: 'top 85%' }
      }
    );

    /* Index section */
    gsap.fromTo('.index-section__header .section-title',
      { x: -40, opacity: 0 },
      {
        x: 0, opacity: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: '.index-section__header', start: 'top 85%' }
      }
    );

    /* Process steps stagger */
    gsap.fromTo('.process-step',
      { y: 40, opacity: 0 },
      {
        y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.1,
        scrollTrigger: { trigger: '.process-steps', start: 'top 82%' }
      }
    );

    /* Dataviz cards */
    gsap.fromTo('.dataviz__card',
      { y: 40, opacity: 0 },
      {
        y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.12,
        scrollTrigger: { trigger: '.dataviz__grid', start: 'top 82%' }
      }
    );

    /* Showcase panels */
    gsap.fromTo('.showcase__panel',
      { y: 40, opacity: 0 },
      {
        y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.2,
        scrollTrigger: { trigger: '.showcase__grid', start: 'top 82%' }
      }
    );

    /* Footer */
    gsap.fromTo('.footer__inner',
      { y: 30, opacity: 0 },
      {
        y: 0, opacity: 1, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: '.footer', start: 'top 90%' }
      }
    );
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    renderCounters();
    renderPromiseWall();
    renderShowcase();
    renderTimeline();
    renderIndex();

    /* Init card tilt after DOM is ready */
    requestAnimationFrame(() => {
      if (!isTouch && !reducedMotion) initCardTilts();
      animateIndexBars();
    });
  }

  /* ---- Counters ---- */
  function renderCounters() {
    const totalDocs = data.total_documents || 0;
    let totalPromises = 0;
    Object.values(data.promise_counts || {}).forEach(v => totalPromises += v);
    const orgs = new Set();
    (data.documents || []).forEach(d => { if (d.org) orgs.add(d.org); });

    animateCounter($('#counter-docs'), totalDocs);
    animateCounter($('#counter-promises'), totalPromises);
    animateCounter($('#counter-orgs'), orgs.size);
  }

  function animateCounter(el, target) {
    if (!el) return;
    if (reducedMotion || target === 0) { el.textContent = target; return; }

    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      const obj = { val: 0 };
      gsap.to(obj, {
        val: target, duration: 2.2, ease: 'power2.out',
        onUpdate() { el.textContent = Math.round(obj.val).toLocaleString(); },
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
      });
    } else {
      /* Fallback RAF */
      const dur = 1800, t0 = performance.now();
      (function tick(now) {
        const p = Math.min((now - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(e * target).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }
  }

  /* ---- Promise Wall ---- */
  function renderPromiseWall() {
    const grid = $('#promise-grid');
    if (!grid) return;
    grid.innerHTML = '';

    CATS.forEach(cat => {
      const count = (data.promise_counts || {})[cat] || 0;
      const quotes = [];
      for (const doc of data.documents || []) {
        for (const p of doc.promises || []) {
          if (p.category === cat && quotes.length < 3) quotes.push(p.quote);
        }
        if (quotes.length >= 3) break;
      }

      const card = document.createElement('div');
      card.className = 'promise-card';
      card.dataset.category = cat;
      card.tabIndex = 0;

      const qHTML = quotes.length
        ? '<div class="promise-card__quotes">' +
          quotes.map(q => `<div class="promise-card__quote-item">"${esc(q.slice(0, 120))}${q.length > 120 ? '…' : ''}"</div>`).join('') +
          '</div>'
        : '';

      card.innerHTML = `
        <div class="promise-card__glow"></div>
        <div class="promise-card__count" data-target="${count}" data-counted="false">0</div>
        <div class="promise-card__label">${LABELS[cat]}</div>
        <div class="promise-card__key">${cat.replace(/_/g, ' ')}</div>
        ${qHTML}
      `;
      grid.appendChild(card);
    });

    /* Count up on scroll */
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const num = e.target.querySelector('.promise-card__count');
        if (num && num.dataset.counted === 'false') {
          num.dataset.counted = 'true';
          animateCounter(num, parseInt(num.dataset.target, 10));
        }
        obs.unobserve(e.target);
      });
    }, { threshold: 0.3 });
    $$('.promise-card').forEach(c => obs.observe(c));
  }

  /* ---- 3D Tilt on promise cards ---- */
  function initCardTilts() {
    $$('.promise-card').forEach(card => {
      let targetRX = 0, targetRY = 0;
      let currentRX = 0, currentRY = 0;
      let active = false;

      card.addEventListener('mouseenter', () => { active = true; });
      card.addEventListener('mouseleave', () => {
        targetRX = 0; targetRY = 0;
      });
      card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        targetRY = ((e.clientX - cx) / (rect.width / 2)) * 7;
        targetRX = -((e.clientY - cy) / (rect.height / 2)) * 7;
      });

      (function tick() {
        currentRX += (targetRX - currentRX) * 0.1;
        currentRY += (targetRY - currentRY) * 0.1;
        const dist = Math.abs(currentRX) + Math.abs(currentRY);
        if (dist > 0.05) {
          card.style.transform = `perspective(800px) rotateX(${currentRX}deg) rotateY(${currentRY}deg) translateZ(8px)`;
        } else {
          card.style.transform = '';
        }
        requestAnimationFrame(tick);
      })();
    });
  }

  /* ---- Index bar animation ---- */
  function animateIndexBars() {
    if (reducedMotion) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const bars = e.target.querySelectorAll('.index-bar');
        bars.forEach((bar, i) => {
          const targetW = bar.dataset.targetWidth;
          if (!targetW) return;
          setTimeout(() => { bar.style.width = targetW; }, i * 90);
        });
        obs.unobserve(e.target);
      });
    }, { threshold: 0.1 });
    const tbody = $('#index-body');
    if (tbody) obs.observe(tbody);
  }

  /* ---- Showcase ---- */
  function renderShowcase() {
    const left = $('#showcase-left');
    const right = $('#showcase-right');

    const stratDocs = (data.documents || []).filter(d => d.visual_type === 'illustration' && d.visual_path);
    if (stratDocs.length && left) {
      const doc = stratDocs[Math.floor(Math.random() * stratDocs.length)];
      loadSVG(doc.visual_path, left);
      const cap = $('#showcase-left-caption');
      if (cap) cap.textContent = `${doc.title} — ${doc.org}, ${doc.year || 'n.d.'}`;
    } else if (left) {
      left.innerHTML = '<span style="color:var(--text-3);font-size:13px;padding:2rem;text-align:center;display:block;">Illustrations appear after the first data run.</span>';
    }

    if (right) {
      const img = document.createElement('img');
      img.src = 'charts/promise_timeline.svg';
      img.alt = 'Timeline chart';
      img.onerror = () => {
        right.innerHTML = '<span style="color:var(--text-3);font-size:13px;padding:2rem;text-align:center;display:block;">Charts appear after the first data run.</span>';
      };
      right.appendChild(img);
    }
  }

  async function loadSVG(path, el) {
    try {
      const r = await fetch(path);
      if (r.ok) el.innerHTML = await r.text();
    } catch { /* ignore */ }
  }

  /* ---- Timeline ---- */
  function renderTimeline() {
    renderDesktop();
    renderMobile();
  }

  function renderDesktop() {
    const track = $('#timeline-track');
    const svg = $('#timeline-svg');
    if (!track || !svg) return;

    const docs = data.documents || [];
    if (!docs.length) {
      track.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-3);font-size:13px;">No documents yet. Run Day 0 to populate.</div>';
      return;
    }

    svg.innerHTML = '';
    const W = 1400, minY = 1990, maxY = 2026, yBase = 120;
    const sorted = [...docs].sort((a, b) => (a.year || 9999) - (b.year || 9999));
    const yearBuckets = {};
    const dotMap = {};

    sorted.forEach((doc, i) => {
      const yr = parseInt(doc.year) || 2024;
      const x = ((yr - minY) / (maxY - minY)) * (W - 100) + 50;
      if (!yearBuckets[yr]) yearBuckets[yr] = 0;
      const y = yBase - 15 - yearBuckets[yr] * 14;
      yearBuckets[yr]++;

      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', x);
      c.setAttribute('cy', y);
      c.setAttribute('r', 5);
      c.classList.add('timeline__dot');
      c.dataset.id = doc.id;
      c.dataset.docType = doc.doc_type || 'other';

      const color = doc.org_color || '#7A7A85';
      if (doc.doc_type === 'evaluation') {
        c.setAttribute('fill', 'none');
        c.setAttribute('stroke', color);
        c.setAttribute('stroke-width', '2');
      } else {
        c.setAttribute('fill', color);
      }

      if (!reducedMotion) {
        c.style.opacity = '0';
        setTimeout(() => {
          c.style.transition = 'opacity 0.5s ease, r 0.15s ease';
          c.style.opacity = '1';
        }, i * 20);
      }

      c.addEventListener('click', () => openPanel(doc.id));
      svg.appendChild(c);
      dotMap[doc.id] = c;
    });

    /* Arcs between paired docs */
    docs.forEach(doc => {
      if (doc.paired_evaluation_id && dotMap[doc.id] && dotMap[doc.paired_evaluation_id]) {
        const a = dotMap[doc.id], b = dotMap[doc.paired_evaluation_id];
        const x1 = +a.getAttribute('cx'), y1 = +a.getAttribute('cy');
        const x2 = +b.getAttribute('cx'), y2 = +b.getAttribute('cy');
        const mx = (x1 + x2) / 2, cy2 = Math.min(y1, y2) - 28;
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', `M${x1} ${y1} Q${mx} ${cy2} ${x2} ${y2}`);
        p.classList.add('timeline__arc');
        svg.insertBefore(p, svg.firstChild);
      }
    });

    /* Decade labels */
    [1990, 2000, 2010, 2020, 2026].forEach(yr => {
      if (track.querySelector(`.timeline__decade[data-year="${yr}"]`)) return;
      const x = ((yr - minY) / (maxY - minY)) * (W - 100) + 50;
      const m = document.createElement('div');
      m.className = 'timeline__decade'; m.dataset.year = yr;
      m.style.left = x + 'px'; m.textContent = yr;
      track.appendChild(m);
    });
  }

  function renderMobile() {
    const el = $('#timeline-mobile');
    if (!el) return;
    const docs = [...(data.documents || [])].sort((a, b) => (b.year || 0) - (a.year || 0));
    if (!docs.length) {
      el.innerHTML = '<div style="padding:1rem;color:var(--text-3);font-size:13px;">No documents yet.</div>';
      return;
    }
    el.innerHTML = '';
    docs.forEach(d => {
      const card = document.createElement('div');
      card.className = 'tl-card'; card.dataset.id = d.id; card.dataset.docType = d.doc_type || 'other';
      const dotStyle = d.doc_type === 'evaluation'
        ? `style="background:transparent;border:1.5px solid ${d.org_color || '#7A7A85'}"`
        : `style="background:${d.org_color || '#7A7A85'}"`;
      card.innerHTML = `
        <span class="tl-card__year">${d.year || '—'}</span>
        <span class="tl-card__dot" ${dotStyle}></span>
        <span class="tl-card__title">${esc(d.title)}</span>
        <span class="tl-card__type">${d.doc_type || 'other'}</span>
      `;
      card.addEventListener('click', () => openPanel(d.id));
      el.appendChild(card);
    });
  }

  /* ---- Index ---- */
  function renderIndex() {
    const tbody = $('#index-body');
    if (!tbody) return;
    const docs = data.documents || [];
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:2rem;">No data yet.</td></tr>';
      return;
    }

    const stats = {};
    docs.forEach(d => {
      const org = d.org || 'Other';
      if (!stats[org]) stats[org] = { org, color: d.org_color || '#7A7A85', s: 0, e: 0, p: 0, cats: {} };
      if (d.doc_type === 'strategy') stats[org].s++;
      else if (d.doc_type === 'evaluation') stats[org].e++;
      (d.promises || []).forEach(pr => {
        stats[org].p++;
        stats[org].cats[pr.category] = (stats[org].cats[pr.category] || 0) + 1;
      });
    });

    const rows = Object.values(stats).sort((a, b) => b.p - a.p);
    const maxP = Math.max(...rows.map(r => r.p), 1);
    tbody.innerHTML = '';

    rows.forEach((r, idx) => {
      let topCat = '—', topN = 0;
      Object.entries(r.cats).forEach(([c, n]) => { if (n > topN) { topN = n; topCat = LABELS[c] || c; } });
      const pct = Math.round((r.p / maxP) * 100);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="index-table__org" style="color:${r.color}">${esc(r.org)}</td>
        <td style="color:var(--text-2)">${r.s}</td>
        <td style="color:var(--text-2)">${r.e}</td>
        <td style="color:var(--text-2)">${r.p}</td>
        <td style="color:var(--text-2);font-size:12px">${esc(topCat)}</td>
        <td class="index-table__bar-cell">
          <div class="index-bar" data-target-width="${pct}%" style="background:${r.color}"></div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ============================================================
     PANEL
     ============================================================ */
  function openPanel(id) {
    const doc = (data.documents || []).find(d => d.id === id);
    if (!doc) return;
    selectedDocId = id;
    const el = $('#panel-content');
    if (!el) return;

    let h = '';
    if (doc.auto_added && !doc.reviewed)
      h += '<div class="panel__review-badge">Pending editorial review</div>';

    h += `<div class="panel__org">
      <span class="panel__org-dot" style="background:${doc.org_color || '#7A7A85'}"></span>
      <span class="panel__org-name">${esc(doc.org)}</span>
    </div>`;
    h += `<h2 class="panel__title">${esc(doc.title)}</h2>`;
    h += `<div class="panel__chips">
      <span class="panel__chip">${doc.year || '—'}</span>
      <span class="panel__chip">${(doc.doc_type || 'other').toUpperCase()}</span>
      ${doc.source ? `<span class="panel__chip">${esc(doc.source)}</span>` : ''}
    </div>`;
    h += '<div class="panel__visual" id="pv"></div>';

    if (doc.summary) h += `<p class="panel__summary">"${esc(doc.summary)}"</p>`;

    if (doc.promises && doc.promises.length) {
      h += '<div class="panel__section-head">Promises made</div>';
      doc.promises.forEach(p => {
        const sc = p.credibility_score || 0;
        const dots = [1,2,3,4,5].map(i => `<span class="cred-dot ${i <= sc ? 'filled' : ''}"></span>`).join('');
        h += `<div class="panel__promise" data-cat="${p.category || ''}">
          <div class="panel__quote-text">"${esc(p.quote)}"</div>
          <div class="panel__cred-dots">${dots}</div>
          ${p.adversarial_note ? `<div class="panel__adversarial">${esc(p.adversarial_note)}</div>` : ''}
        </div>`;
      });
    }

    if (doc.evaluation_findings && doc.evaluation_findings.length) {
      h += '<div class="panel__section-head">What the evaluation found</div>';
      h += '<div class="panel__eval-box">' +
        doc.evaluation_findings.map(f => `<p>${esc(f)}</p>`).join('') + '</div>';
    }

    if (doc.url)
      h += `<a href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer" class="panel__source-btn">View source document →</a>`;

    el.innerHTML = h;

    const pv = document.getElementById('pv');
    if (pv) {
      if (doc.visual_type === 'illustration' && doc.visual_path) {
        loadSVG(doc.visual_path, pv);
      } else if (doc.visual_type === 'chart_reference') {
        const img = document.createElement('img');
        img.src = 'charts/promise_timeline.svg';
        img.alt = 'Timeline chart';
        pv.appendChild(img);
      }
    }

    $('#panel').classList.add('open');
    $('#overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    el.scrollTop = 0;
  }

  function closePanel() {
    selectedDocId = null;
    $('#panel').classList.remove('open');
    $('#overlay').classList.remove('active');
    document.body.style.overflow = '';
  }

  function setupPanel() {
    const closeBtn = $('#panel-close');
    const overlay = $('#overlay');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (overlay) overlay.addEventListener('click', closePanel);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
  }

  /* ============================================================
     FILTERS
     ============================================================ */
  function setupFilters() {
    $$('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        if (f === 'all') {
          activeFilters.clear(); activeFilters.add('all');
        } else {
          activeFilters.delete('all');
          activeFilters.has(f) ? activeFilters.delete(f) : activeFilters.add(f);
          if (!activeFilters.size) activeFilters.add('all');
        }
        $$('.filter-btn').forEach(b => b.classList.toggle('active', activeFilters.has(b.dataset.filter)));
        applyFilters();
      });
    });
  }

  function applyFilters() {
    const all = activeFilters.has('all');
    $$('.timeline__dot').forEach(d => {
      d.classList.toggle('timeline__dot--hidden', !all && !activeFilters.has(d.dataset.docType));
    });
    $$('.tl-card').forEach(c => {
      c.style.display = all || activeFilters.has(c.dataset.docType) ? '' : 'none';
    });
  }

  /* ============================================================
     NAV
     ============================================================ */
  function setupNav() {
    const nav = $('#nav');
    if (!nav) return;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 20);
        ticking = false;
      });
    }, { passive: true });
  }

  /* ============================================================
     UTILITY
     ============================================================ */
  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

})();

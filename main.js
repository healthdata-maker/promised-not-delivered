/* ============================================================
   PROMISED, NOT DELIVERED — Application Logic
   ============================================================ */
(function () {
  'use strict';

  /* --- State --- */
  let data = null;
  let selectedDocId = null;
  const activeFilters = new Set(['all']);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LABELS = {
    community_ownership: 'Communities will lead',
    context_sensitivity: 'Context-specific design',
    participation: 'Participatory approach',
    sustainability: 'Sustainable beyond the project',
    equity: 'Reaching the most vulnerable',
  };

  const CATS = ['community_ownership', 'context_sensitivity', 'participation', 'sustainability', 'equity'];

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    setupNav();
    setupFilters();
    setupPanel();
    setupScrollReveals();

    try {
      const res = await fetch('data.json');
      if (!res.ok) throw new Error();
      data = await res.json();
    } catch {
      $('#loader').classList.add('hidden');
      $('#error-state').classList.add('show');
      return;
    }

    $('#main').style.display = '';
    render();

    // small delay so paint happens first
    requestAnimationFrame(() => {
      setTimeout(() => $('#loader').classList.add('hidden'), 300);
    });

    // methodology
    loadMethodology();
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
  }

  /* --- Counters --- */
  function renderCounters() {
    const totalDocs = data.total_documents || 0;
    let totalPromises = 0;
    Object.values(data.promise_counts || {}).forEach((v) => (totalPromises += v));

    const orgs = new Set();
    (data.documents || []).forEach((d) => orgs.add(d.org));
    const totalOrgs = orgs.size;

    animate($('#counter-docs'), totalDocs);
    animate($('#counter-promises'), totalPromises);
    animate($('#counter-orgs'), totalOrgs);
  }

  function animate(el, target) {
    if (!el) return;
    if (target === 0 || reducedMotion) {
      el.textContent = target;
      return;
    }
    const dur = 1800;
    const t0 = performance.now();
    (function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(e * target);
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* --- Promise Wall --- */
  function renderPromiseWall() {
    const grid = $('#promise-grid');
    if (!grid) return;
    grid.innerHTML = '';

    CATS.forEach((cat) => {
      const count = (data.promise_counts || {})[cat] || 0;

      // gather example quotes
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

      let qHTML = '';
      if (quotes.length) {
        qHTML = '<div class="promise-card__quotes">' +
          quotes.map((q) => `<div class="promise-card__quote-item">"${esc(q)}"</div>`).join('') +
          '</div>';
      }

      card.innerHTML = `
        <div class="promise-card__count" data-target="${count}" data-counted="false">0</div>
        <div class="promise-card__label">${LABELS[cat]}</div>
        <div class="promise-card__key">${cat.replace(/_/g, ' ')}</div>
        ${qHTML}
      `;
      grid.appendChild(card);
    });

    // count-up on scroll
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const num = e.target.querySelector('.promise-card__count');
        if (num && num.dataset.counted === 'false') {
          num.dataset.counted = 'true';
          animate(num, parseInt(num.dataset.target, 10));
        }
        obs.unobserve(e.target);
      });
    }, { threshold: 0.25 });

    $$('.promise-card').forEach((c) => obs.observe(c));
  }

  /* --- Showcase --- */
  function renderShowcase() {
    const left = $('#showcase-left');
    const right = $('#showcase-right');

    const stratDocs = (data.documents || []).filter((d) => d.visual_type === 'illustration' && d.visual_path);
    if (stratDocs.length && left) {
      const doc = stratDocs[Math.floor(Math.random() * stratDocs.length)];
      loadSVG(doc.visual_path, left);
      const cap = $('#showcase-left-caption');
      if (cap) cap.textContent = `${doc.title} — ${doc.org}, ${doc.year || 'n.d.'}`;
    } else if (left) {
      left.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">Illustrations appear after the first data collection run.</span>';
    }

    if (right) {
      const img = document.createElement('img');
      img.src = 'charts/promise_timeline.svg';
      img.alt = 'Timeline';
      img.onerror = () => {
        right.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">Charts appear after the first data collection run.</span>';
      };
      right.innerHTML = '';
      right.appendChild(img);
    }
  }

  async function loadSVG(path, el) {
    try {
      const r = await fetch(path);
      if (r.ok) el.innerHTML = await r.text();
    } catch { /* ignore */ }
  }

  /* --- Timeline --- */
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
      track.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted);font-size:14px;">No documents in the archive yet.</div>';
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

      const color = doc.org_color || '#6B7280';
      if (doc.doc_type === 'strategy') {
        c.setAttribute('fill', color);
        c.setAttribute('stroke', 'none');
      } else {
        c.setAttribute('fill', 'none');
        c.setAttribute('stroke', color);
        c.setAttribute('stroke-width', '2');
      }

      if (!reducedMotion) {
        c.style.opacity = '0';
        c.style.transition = 'opacity 0.4s ease';
        setTimeout(() => (c.style.opacity = '1'), i * 25);
      }

      c.addEventListener('click', () => openPanel(doc.id));
      svg.appendChild(c);
      dotMap[doc.id] = c;
    });

    // arcs
    docs.forEach((doc) => {
      if (doc.paired_evaluation_id && dotMap[doc.id] && dotMap[doc.paired_evaluation_id]) {
        const a = dotMap[doc.id], b = dotMap[doc.paired_evaluation_id];
        const x1 = +a.getAttribute('cx'), y1 = +a.getAttribute('cy');
        const x2 = +b.getAttribute('cx'), y2 = +b.getAttribute('cy');
        const mx = (x1 + x2) / 2, cy2 = Math.min(y1, y2) - 30;
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', `M${x1} ${y1} Q${mx} ${cy2} ${x2} ${y2}`);
        p.classList.add('timeline__arc');
        svg.insertBefore(p, svg.firstChild);
      }
    });

    // decade marks
    [1990, 2000, 2010, 2020, 2026].forEach((yr) => {
      if (track.querySelector(`.timeline__decade[data-year="${yr}"]`)) return;
      const x = ((yr - minY) / (maxY - minY)) * (W - 100) + 50;
      const m = document.createElement('div');
      m.className = 'timeline__decade';
      m.dataset.year = yr;
      m.style.left = x + 'px';
      m.textContent = yr;
      track.appendChild(m);
    });
  }

  function renderMobile() {
    const el = $('#timeline-mobile');
    if (!el) return;
    const docs = [...(data.documents || [])].sort((a, b) => (b.year || 0) - (a.year || 0));
    if (!docs.length) {
      el.innerHTML = '<div style="padding:1rem;color:var(--text-muted);font-size:13px;">No documents yet.</div>';
      return;
    }
    el.innerHTML = '';
    docs.forEach((d) => {
      const card = document.createElement('div');
      card.className = 'tl-card';
      card.dataset.id = d.id;
      card.dataset.docType = d.doc_type || 'other';
      card.innerHTML = `
        <span class="tl-card__year">${d.year || '—'}</span>
        <span class="tl-card__dot" style="background:${d.org_color || '#6B7280'}"></span>
        <span class="tl-card__title">${esc(d.title)}</span>
        <span class="tl-card__type">${d.doc_type || 'other'}</span>
      `;
      card.addEventListener('click', () => openPanel(d.id));
      el.appendChild(card);
    });
  }

  /* --- Index --- */
  function renderIndex() {
    const tbody = $('#index-body');
    if (!tbody) return;
    const docs = data.documents || [];
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">No data yet</td></tr>';
      return;
    }

    const stats = {};
    docs.forEach((d) => {
      const org = d.org || 'Other';
      if (!stats[org]) stats[org] = { org, color: d.org_color || '#6B7280', s: 0, e: 0, p: 0, cats: {} };
      if (d.doc_type === 'strategy') stats[org].s++;
      else if (d.doc_type === 'evaluation') stats[org].e++;
      (d.promises || []).forEach((pr) => {
        stats[org].p++;
        stats[org].cats[pr.category] = (stats[org].cats[pr.category] || 0) + 1;
      });
    });

    const rows = Object.values(stats).sort((a, b) => b.p - a.p);
    const maxP = Math.max(...rows.map((r) => r.p), 1);
    tbody.innerHTML = '';

    rows.forEach((r) => {
      let topCat = '—', topN = 0;
      Object.entries(r.cats).forEach(([c, n]) => { if (n > topN) { topN = n; topCat = LABELS[c] || c; } });
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="index-table__org" style="color:${r.color}">${esc(r.org)}</td>
        <td>${r.s}</td><td>${r.e}</td><td>${r.p}</td>
        <td>${esc(topCat)}</td>
        <td class="index-table__bar-cell"><div class="index-bar" style="width:${(r.p / maxP) * 100}%"></div></td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ============================================================
     PANEL
     ============================================================ */
  function openPanel(id) {
    const doc = (data.documents || []).find((d) => d.id === id);
    if (!doc) return;
    selectedDocId = id;
    const el = $('#panel-content');
    if (!el) return;

    let h = '';

    if (doc.auto_added && !doc.reviewed)
      h += '<div class="panel__review-badge">Pending editorial review</div>';

    h += `<div class="panel__org"><span class="panel__org-dot" style="background:${doc.org_color||'#6B7280'}"></span>
      <span class="panel__org-name">${esc(doc.org)}</span></div>`;
    h += `<h2 class="panel__title">${esc(doc.title)}</h2>`;
    h += `<div class="panel__chips"><span class="panel__chip">${doc.year||'—'}</span>
      <span class="panel__chip">${(doc.doc_type||'other').toUpperCase()}</span></div>`;
    h += '<div class="panel__visual" id="pv"></div>';

    if (doc.summary) h += `<p class="panel__summary">${esc(doc.summary)}</p>`;

    if (doc.promises && doc.promises.length) {
      h += '<div class="panel__section-head">Promises made</div>';
      doc.promises.forEach((p) => {
        const sc = p.credibility_score || 0;
        let dots = '';
        for (let i = 1; i <= 5; i++) dots += `<span class="cred-dot ${i<=sc?'filled':''}"></span>`;
        h += `<div class="panel__promise" data-cat="${p.category||''}">
          <div class="panel__quote-text">"${esc(p.quote)}"</div>
          <div class="panel__cred-dots">${dots}</div>
          ${p.adversarial_note ? `<div class="panel__adversarial">${esc(p.adversarial_note)}</div>` : ''}
        </div>`;
      });
    }

    if (doc.evaluation_findings && doc.evaluation_findings.length) {
      h += '<div class="panel__section-head">What the evaluation found</div>';
      h += '<div class="panel__eval-box">' +
        doc.evaluation_findings.map((f) => `<p>${esc(f)}</p>`).join('') + '</div>';
    }

    if (doc.url)
      h += `<a href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer" class="panel__source-btn">View source document →</a>`;

    el.innerHTML = h;

    // load visual
    const pv = document.getElementById('pv');
    if (pv) {
      if (doc.visual_type === 'illustration' && doc.visual_path) loadSVG(doc.visual_path, pv);
      else if (doc.visual_type === 'chart_reference') {
        const img = document.createElement('img');
        img.src = 'charts/promise_timeline.svg';
        img.alt = 'Timeline chart';
        pv.innerHTML = '';
        pv.appendChild(img);
      }
    }

    $('#panel').classList.add('open');
    $('#overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    selectedDocId = null;
    $('#panel').classList.remove('open');
    $('#overlay').classList.remove('active');
    document.body.style.overflow = '';
  }

  function setupPanel() {
    $('#panel-close').addEventListener('click', closePanel);
    $('#overlay').addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
  }

  /* ============================================================
     FILTERS
     ============================================================ */
  function setupFilters() {
    $$('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        if (f === 'all') {
          activeFilters.clear();
          activeFilters.add('all');
        } else {
          activeFilters.delete('all');
          activeFilters.has(f) ? activeFilters.delete(f) : activeFilters.add(f);
          if (!activeFilters.size) activeFilters.add('all');
        }
        $$('.filter-btn').forEach((b) => b.classList.toggle('active', activeFilters.has(b.dataset.filter)));
        applyFilters();
      });
    });
  }

  function applyFilters() {
    const all = activeFilters.has('all');
    $$('.timeline__dot').forEach((d) => {
      d.classList.toggle('timeline__dot--hidden', !all && !activeFilters.has(d.dataset.docType));
    });
    $$('.tl-card').forEach((c) => {
      c.style.display = all || activeFilters.has(c.dataset.docType) ? '' : 'none';
    });
  }

  /* ============================================================
     NAV SCROLL
     ============================================================ */
  function setupNav() {
    const nav = $('#nav');
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 10);
        ticking = false;
      });
    }, { passive: true });
  }

  /* ============================================================
     SCROLL REVEALS
     ============================================================ */
  function setupScrollReveals() {
    if (reducedMotion) {
      $$('.reveal').forEach((el) => el.classList.add('visible'));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach((el) => obs.observe(el));
  }

  /* ============================================================
     METHODOLOGY
     ============================================================ */
  async function loadMethodology() {
    try {
      const res = await fetch('methodology.md');
      if (!res.ok) return;
      let text = await res.text();
      // strip markdown heading
      text = text.replace(/^#\s+.*\n+/, '');
      const el = $('#methodology-text');
      if (!el) return;
      // split into paragraphs
      const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
      el.innerHTML = paragraphs.map((p) => `<p>${esc(p.trim())}</p>`).join('');
    } catch { /* non-critical */ }
  }

  /* ============================================================
     UTIL
     ============================================================ */
  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();

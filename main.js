/* ============================================================
   PROMISED, NOT DELIVERED — Main Application Logic
   ============================================================ */

(function () {
  'use strict';

  /* --- State --- */
  let appData = null;
  let selectedDocId = null;
  const activeFilters = new Set(['all']);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Promise category config --- */
  const CATEGORY_LABELS = {
    community_ownership: 'Communities will lead',
    context_sensitivity: 'Context-specific',
    participation: 'Participatory approach',
    sustainability: 'Sustainable beyond the project',
    equity: 'Reaching the most vulnerable',
  };

  const CATEGORY_ORDER = [
    'community_ownership',
    'context_sensitivity',
    'participation',
    'sustainability',
    'equity',
  ];

  /* --- DOM refs --- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  /* ============================================================
     INIT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindFilterButtons();
    bindPanelClose();

    try {
      const response = await fetch('data.json');
      if (!response.ok) throw new Error('Fetch failed');
      appData = await response.json();
      hideLoading();
      render();
    } catch (err) {
      console.error('Failed to load data:', err);
      showError();
      return;
    }

    // Load methodology
    try {
      const mdResp = await fetch('methodology.md');
      if (mdResp.ok) {
        const mdText = await mdResp.text();
        const methodBlock = $('#methodology-text');
        if (methodBlock) methodBlock.textContent = mdText;
      }
    } catch (_) {
      // non-critical
    }
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    renderHeroCounters();
    renderPromiseWall();
    renderDualVisual();
    renderTimeline();
    renderPromiseIndex();
    renderDataViz();
  }

  /* --- Hero Counters --- */
  function renderHeroCounters() {
    const totalDocs = appData.total_documents || 0;
    let totalPromises = 0;
    Object.values(appData.promise_counts || {}).forEach((v) => (totalPromises += v));

    const docEl = $('#counter-documents');
    const promEl = $('#counter-promises');

    if (prefersReducedMotion) {
      if (docEl) docEl.textContent = totalDocs;
      if (promEl) promEl.textContent = totalPromises;
    } else {
      animateCounter(docEl, totalDocs);
      animateCounter(promEl, totalPromises);
    }
  }

  function animateCounter(el, target) {
    if (!el || target === 0) {
      if (el) el.textContent = target;
      return;
    }
    const duration = 1800;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  /* --- Promise Frequency Wall --- */
  function renderPromiseWall() {
    const container = $('#promise-wall-grid');
    if (!container) return;
    container.innerHTML = '';

    CATEGORY_ORDER.forEach((cat) => {
      const count = (appData.promise_counts || {})[cat] || 0;
      const label = CATEGORY_LABELS[cat];

      // Find up to 3 example quotes for this category
      const exampleQuotes = [];
      for (const doc of appData.documents || []) {
        for (const p of doc.promises || []) {
          if (p.category === cat && exampleQuotes.length < 3) {
            exampleQuotes.push(p.quote);
          }
        }
        if (exampleQuotes.length >= 3) break;
      }

      const card = document.createElement('div');
      card.className = 'promise-card';
      card.dataset.category = cat;

      let quotesHTML = '';
      if (exampleQuotes.length > 0) {
        quotesHTML = '<div class="promise-card__quotes">';
        exampleQuotes.forEach((q) => {
          quotesHTML += `<div class="promise-card__quote">"${escapeHTML(q)}"</div>`;
        });
        quotesHTML += '</div>';
      }

      card.innerHTML = `
        <span class="promise-card__number" data-target="${count}" data-counted="false">0</span>
        <div class="promise-card__label">${label}</div>
        <div class="promise-card__key">${cat}</div>
        ${quotesHTML}
      `;

      container.appendChild(card);
    });

    // IntersectionObserver for count-up
    observeCountUp();
  }

  function observeCountUp() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const numEl = entry.target.querySelector('.promise-card__number');
            if (numEl && numEl.dataset.counted === 'false') {
              numEl.dataset.counted = 'true';
              const target = parseInt(numEl.dataset.target, 10);
              if (prefersReducedMotion) {
                numEl.textContent = target;
              } else {
                animateCounter(numEl, target);
              }
            }
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    $$('.promise-card').forEach((card) => observer.observe(card));
  }

  /* --- Dual Visual Showcase --- */
  function renderDualVisual() {
    const leftContainer = $('#dual-left-svg');
    const rightContainer = $('#dual-right-svg');

    // Left: random strategy document illustration
    const strategyDocs = (appData.documents || []).filter(
      (d) => d.visual_type === 'illustration' && d.visual_path
    );

    if (strategyDocs.length > 0 && leftContainer) {
      const randomDoc = strategyDocs[Math.floor(Math.random() * strategyDocs.length)];
      fetchSVG(randomDoc.visual_path, leftContainer);
      const captionEl = $('#dual-left-caption');
      if (captionEl) {
        captionEl.textContent = `${randomDoc.title} — ${randomDoc.org}, ${randomDoc.year || 'n.d.'}`;
      }
    } else if (leftContainer) {
      leftContainer.innerHTML = '<div style="color:var(--text-secondary);font-family:var(--font-mono);font-size:12px;padding:2rem;">No illustrations yet. Run the pipeline to populate.</div>';
    }

    // Right: timeline chart
    if (rightContainer) {
      const img = document.createElement('img');
      img.src = 'charts/promise_timeline.svg';
      img.alt = 'Promise timeline';
      img.onerror = function () {
        rightContainer.innerHTML = '<div style="color:var(--text-secondary);font-family:var(--font-mono);font-size:12px;padding:2rem;">Charts will appear after the first pipeline run.</div>';
      };
      rightContainer.innerHTML = '';
      rightContainer.appendChild(img);
    }
  }

  async function fetchSVG(path, container) {
    try {
      const resp = await fetch(path);
      if (resp.ok) {
        const svgText = await resp.text();
        container.innerHTML = svgText;
      }
    } catch (_) {
      container.innerHTML = '<div style="color:var(--text-secondary);font-family:var(--font-mono);font-size:12px;padding:2rem;">Could not load illustration.</div>';
    }
  }

  /* --- Timeline --- */
  function renderTimeline() {
    renderDesktopTimeline();
    renderMobileTimeline();
  }

  function renderDesktopTimeline() {
    const container = $('#timeline-container');
    const svgEl = $('#timeline-svg');
    if (!container || !svgEl) return;

    const docs = appData.documents || [];
    if (docs.length === 0) {
      container.innerHTML = '<div style="color:var(--text-secondary);font-family:var(--font-mono);font-size:12px;padding:2rem;text-align:center;">No documents yet.</div>';
      return;
    }

    const minYear = 1990;
    const maxYear = 2026;
    const totalWidth = 1400;
    const yBase = 100;

    svgEl.innerHTML = '';

    // Place dots
    const dotElements = {};
    const sortedDocs = [...docs].sort((a, b) => (a.year || 9999) - (b.year || 9999));

    // Track y offsets to avoid overlapping dots at the same year
    const yearCounts = {};

    sortedDocs.forEach((doc, i) => {
      const year = parseInt(doc.year) || 2024;
      const x = ((year - minYear) / (maxYear - minYear)) * (totalWidth - 100) + 50;

      if (!yearCounts[year]) yearCounts[year] = 0;
      const yOffset = yearCounts[year] * 14;
      yearCounts[year]++;

      const y = yBase - 20 - yOffset;

      const isStrategy = doc.doc_type === 'strategy';
      const color = doc.org_color || '#6B7280';

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', 5);
      circle.classList.add('timeline__dot');
      circle.dataset.id = doc.id;
      circle.dataset.docType = doc.doc_type || 'other';

      if (isStrategy) {
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', 'none');
      } else {
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', color);
        circle.setAttribute('stroke-width', '2');
      }

      // Staggered fade-in
      if (!prefersReducedMotion) {
        circle.style.opacity = '0';
        circle.style.transition = 'opacity 0.4s ease';
        setTimeout(() => {
          circle.style.opacity = '1';
        }, i * 25);
      }

      circle.addEventListener('click', () => openPanel(doc.id));
      svgEl.appendChild(circle);

      dotElements[doc.id] = circle;
    });

    // Draw arcs between paired docs
    docs.forEach((doc) => {
      if (doc.paired_evaluation_id && dotElements[doc.id] && dotElements[doc.paired_evaluation_id]) {
        const d1 = dotElements[doc.id];
        const d2 = dotElements[doc.paired_evaluation_id];
        const x1 = parseFloat(d1.getAttribute('cx'));
        const y1 = parseFloat(d1.getAttribute('cy'));
        const x2 = parseFloat(d2.getAttribute('cx'));
        const y2 = parseFloat(d2.getAttribute('cy'));
        const midX = (x1 + x2) / 2;
        const cpY = Math.min(y1, y2) - 30;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} Q ${midX} ${cpY} ${x2} ${y2}`);
        path.classList.add('timeline__arc');
        svgEl.insertBefore(path, svgEl.firstChild);
      }
    });

    // Decade markers
    const decadeContainer = container;
    [1990, 2000, 2010, 2020, 2026].forEach((year) => {
      const existing = container.querySelector(`.timeline__decade[data-year="${year}"]`);
      if (existing) return;
      const x = ((year - minYear) / (maxYear - minYear)) * (totalWidth - 100) + 50;
      const marker = document.createElement('div');
      marker.className = 'timeline__decade';
      marker.dataset.year = year;
      marker.style.left = x + 'px';
      marker.textContent = year;
      decadeContainer.appendChild(marker);
    });
  }

  function renderMobileTimeline() {
    const container = $('#timeline-mobile');
    if (!container) return;

    const docs = [...(appData.documents || [])].sort((a, b) => (b.year || 0) - (a.year || 0));

    if (docs.length === 0) {
      container.innerHTML = '<div style="color:var(--text-secondary);font-family:var(--font-mono);font-size:12px;padding:1rem;">No documents yet.</div>';
      return;
    }

    container.innerHTML = '';
    docs.forEach((doc) => {
      const card = document.createElement('div');
      card.className = 'timeline__mobile-card';
      card.dataset.id = doc.id;
      card.dataset.docType = doc.doc_type || 'other';
      card.innerHTML = `
        <span class="timeline__mobile-year">${doc.year || '—'}</span>
        <span class="timeline__mobile-org" style="background:${doc.org_color || '#6B7280'}"></span>
        <span class="timeline__mobile-title">${escapeHTML(doc.title)}</span>
        <span class="timeline__mobile-type">${doc.doc_type || 'other'}</span>
      `;
      card.addEventListener('click', () => openPanel(doc.id));
      container.appendChild(card);
    });
  }

  /* --- Side Panel --- */
  function openPanel(docId) {
    const doc = (appData.documents || []).find((d) => d.id === docId);
    if (!doc) return;

    selectedDocId = docId;
    const panel = $('#side-panel');
    const overlay = $('#panel-overlay');

    // Populate panel content
    const content = $('#panel-content');
    if (!content) return;

    let html = '';

    // Review badge
    if (doc.auto_added && !doc.reviewed) {
      html += '<div class="side-panel__badge-review">pending editorial review</div>';
    }

    // Org
    html += `<div class="side-panel__org">
      <span class="side-panel__org-dot" style="background:${doc.org_color || '#6B7280'}"></span>
      <span class="side-panel__org-name">${escapeHTML(doc.org)}</span>
    </div>`;

    // Title
    html += `<h2 class="side-panel__title">${escapeHTML(doc.title)}</h2>`;

    // Chips
    html += `<div class="side-panel__chips">
      <span class="side-panel__chip">${doc.year || '—'}</span>
      <span class="side-panel__chip">${(doc.doc_type || 'other').toUpperCase()}</span>
    </div>`;

    // Visual
    html += `<div class="side-panel__visual" id="panel-visual"></div>`;

    // Summary
    if (doc.summary) {
      html += `<p class="side-panel__summary">${escapeHTML(doc.summary)}</p>`;
    }

    // Promises
    if (doc.promises && doc.promises.length > 0) {
      html += `<div class="side-panel__section-head">Promises Made</div>`;
      doc.promises.forEach((p) => {
        const score = p.credibility_score || 0;
        let dotsHTML = '';
        for (let i = 1; i <= 5; i++) {
          dotsHTML += `<span class="side-panel__score-dot ${i <= score ? 'filled' : ''}"></span>`;
        }
        html += `<div class="side-panel__promise" data-category="${p.category || ''}">
          <div class="side-panel__quote">"${escapeHTML(p.quote)}"</div>
          <div class="side-panel__score">${dotsHTML}</div>
          ${p.adversarial_note ? `<div class="side-panel__adversarial-note">${escapeHTML(p.adversarial_note)}</div>` : ''}
        </div>`;
      });
    }

    // Evaluation findings
    if (doc.evaluation_findings && doc.evaluation_findings.length > 0) {
      html += `<div class="side-panel__section-head">What the evaluation found</div>`;
      html += `<div class="side-panel__evaluation-box">`;
      doc.evaluation_findings.forEach((f) => {
        html += `<p>${escapeHTML(f)}</p>`;
      });
      html += `</div>`;
    }

    // Source link
    if (doc.url) {
      html += `<a href="${escapeHTML(doc.url)}" target="_blank" rel="noopener noreferrer" class="side-panel__source-link">View source document</a>`;
    }

    content.innerHTML = html;

    // Load visual
    const visualEl = document.getElementById('panel-visual');
    if (visualEl) {
      if (doc.visual_type === 'illustration' && doc.visual_path) {
        fetchSVG(doc.visual_path, visualEl);
      } else if (doc.visual_type === 'chart_reference') {
        const img = document.createElement('img');
        img.src = 'charts/promise_timeline.svg';
        img.alt = 'Promise timeline chart';
        visualEl.innerHTML = '';
        visualEl.appendChild(img);
      }
    }

    // Open panel
    panel.classList.add('open');
    overlay.classList.add('active');
  }

  function closePanel() {
    selectedDocId = null;
    const panel = $('#side-panel');
    const overlay = $('#panel-overlay');
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  function bindPanelClose() {
    const closeBtn = $('#panel-close');
    const overlay = $('#panel-overlay');

    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (overlay) overlay.addEventListener('click', closePanel);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });
  }

  /* --- Filters --- */
  function bindFilterButtons() {
    $$('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;

        if (filter === 'all') {
          activeFilters.clear();
          activeFilters.add('all');
        } else {
          activeFilters.delete('all');
          if (activeFilters.has(filter)) {
            activeFilters.delete(filter);
            if (activeFilters.size === 0) activeFilters.add('all');
          } else {
            activeFilters.add(filter);
          }
        }

        // Update button styles
        $$('.filter-btn').forEach((b) => {
          b.classList.toggle('active', activeFilters.has(b.dataset.filter));
        });

        applyFilters();
      });
    });
  }

  function applyFilters() {
    const showAll = activeFilters.has('all');

    // Desktop timeline dots
    $$('.timeline__dot').forEach((dot) => {
      const type = dot.dataset.docType;
      if (showAll || activeFilters.has(type)) {
        dot.classList.remove('timeline__dot--hidden');
      } else {
        dot.classList.add('timeline__dot--hidden');
      }
    });

    // Mobile cards
    $$('.timeline__mobile-card').forEach((card) => {
      const type = card.dataset.docType;
      if (showAll || activeFilters.has(type)) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }

  /* --- Promise Index (Broken Promise Index table) --- */
  function renderPromiseIndex() {
    const tbody = $('#promise-index-body');
    if (!tbody) return;

    const docs = appData.documents || [];
    if (docs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">No data yet</td></tr>';
      return;
    }

    // Aggregate by org
    const orgStats = {};
    docs.forEach((d) => {
      const org = d.org || 'Other';
      if (!orgStats[org]) {
        orgStats[org] = {
          org,
          color: d.org_color || '#6B7280',
          strategy: 0,
          evaluation: 0,
          promises: 0,
          categoryCounts: {},
        };
      }
      if (d.doc_type === 'strategy') orgStats[org].strategy++;
      else if (d.doc_type === 'evaluation') orgStats[org].evaluation++;

      (d.promises || []).forEach((p) => {
        orgStats[org].promises++;
        const cat = p.category || 'other';
        orgStats[org].categoryCounts[cat] = (orgStats[org].categoryCounts[cat] || 0) + 1;
      });
    });

    const orgs = Object.values(orgStats).sort((a, b) => b.promises - a.promises);
    const maxPromises = Math.max(...orgs.map((o) => o.promises), 1);

    tbody.innerHTML = '';
    orgs.forEach((o) => {
      // Most common category
      let topCat = '—';
      let topCount = 0;
      Object.entries(o.categoryCounts).forEach(([cat, count]) => {
        if (count > topCount) {
          topCount = count;
          topCat = CATEGORY_LABELS[cat] || cat;
        }
      });

      const barWidth = (o.promises / maxPromises) * 100;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="promise-index__org-name" style="color:${o.color}">${escapeHTML(o.org)}</td>
        <td>${o.strategy}</td>
        <td>${o.evaluation}</td>
        <td>${o.promises}</td>
        <td>${escapeHTML(topCat)}</td>
        <td class="promise-index__bar-cell">
          <div class="promise-index__bar" style="width:${barWidth}%"></div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* --- Data Viz Section --- */
  function renderDataViz() {
    // Charts are static SVGs, just set the src
    // They are already in the HTML as img tags
    // Nothing dynamic to do here unless charts are missing
  }

  /* --- Utilities --- */
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function hideLoading() {
    const loadingEl = $('#loading-state');
    if (loadingEl) loadingEl.style.display = 'none';
    const mainEl = $('#main-content');
    if (mainEl) mainEl.style.display = '';
  }

  function showError() {
    const loadingEl = $('#loading-state');
    if (loadingEl) loadingEl.style.display = 'none';
    const errorEl = $('#error-state');
    if (errorEl) errorEl.classList.add('show');
  }
})();

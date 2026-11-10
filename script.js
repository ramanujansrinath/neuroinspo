/* neuroinspo — main script */

let allPapers    = [];
let currentSort  = 'upload';
let currentLayout = 'grid';
let activeDoi    = null;   // DOI of the paper whose panel is open

// ─── Data loading ────────────────────────────────────────────────────────────

async function loadPapers() {
  if (window.location.protocol === 'file:') {
    document.getElementById('loading').style.display = 'none';
    const el = document.getElementById('empty-state');
    el.querySelector('p').textContent = 'Open via a local server to browse papers.';
    el.querySelector('.empty-sub').innerHTML =
      'Run <code>python3 -m http.server</code> in the project folder, then visit <code>localhost:8000</code>.';
    el.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('papers.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allPapers = await res.json();
  } catch (err) {
    console.warn('Could not load papers.json:', err.message);
    allPapers = [];
  }

  document.getElementById('loading').style.display = 'none';

  if (allPapers.length === 0) {
    document.getElementById('empty-state').style.display = 'block';
    return;
  }

  renderPapers(true /* initial */);
}

// ─── Sort ────────────────────────────────────────────────────────────────────

function sorted(papers, by) {
  if (by === 'first-author' || by === 'last-author') {
    const key = by === 'first-author' ? 'first_author' : 'last_author';
    return [...papers].sort((a, b) =>
      (a[key] || '￿').localeCompare(b[key] || '￿', undefined, { sensitivity: 'base' })
    );
  }
  return [...papers].sort((a, b) => {
    const da = new Date(by === 'upload' ? a.upload_date : (a.pub_date ?? '1900-01-01'));
    const db = new Date(by === 'upload' ? b.upload_date : (b.pub_date ?? '1900-01-01'));
    return db - da;
  });
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function panelCitationHtml(paper) {
  const base = paper.full_citation || paper.citation;
  return paper.citation_journal
    ? `${base}, <em>${paper.citation_journal}</em>`
    : base;
}

const ABSTRACT_WORD_LIMIT = 150;

// Truncate to the last full sentence that ends at or before the word limit,
// so we never cut off mid-sentence. Falls back to a hard word cut (+ ellipsis)
// if there's no sentence break within the limit at all.
function truncateAbstract(text, wordLimit) {
  const words = text.trim().split(/\s+/);
  if (words.length <= wordLimit) return null;

  let cutAt = -1;
  for (let i = 0; i < wordLimit; i++) {
    if (/[.!?]["')]*$/.test(words[i])) cutAt = i;
  }

  return cutAt >= 0
    ? words.slice(0, cutAt + 1).join(' ')
    : words.slice(0, wordLimit).join(' ') + '…';
}

function panelBodyHtml(paper) {
  const escapedTitle = paper.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let abstractHtml = '';
  if (paper.abstract) {
    const shortText = truncateAbstract(paper.abstract, ABSTRACT_WORD_LIMIT);
    if (shortText !== null) {
      const shortEscaped = shortText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      abstractHtml = `
        <p class="panel-abstract" data-expanded="false">${shortEscaped}</p>
        <button class="abstract-toggle-btn" type="button" data-doi="${paper.doi}">Show more</button>`;
    } else {
      abstractHtml = `<p class="panel-abstract">${paper.abstract.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
    }
  }
  const journalHtml = paper.journal
    ? `<span class="panel-journal">${paper.journal}</span>`
    : '';
  const thumbnailHtml = paper.thumbnail
    ? `<button class="panel-thumbnail-btn" type="button" aria-label="View full-size image">
         <img class="panel-thumbnail" src="${paper.thumbnail}" alt="${escapedTitle}" loading="lazy">
       </button>`
    : '';
  return `
    <h2 class="panel-title">${escapedTitle}</h2>
    ${journalHtml}
    ${abstractHtml}
    ${thumbnailHtml}
    <p class="panel-doi">doi: <a href="${paper.url}" target="_blank" rel="noopener">${paper.doi}</a></p>
    <a class="pdf-action-btn" href="${paper.url}" target="_blank" rel="noopener">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M6 2H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V8M9 1h4m0 0v4m0-4L6 8"
              stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Open in new tab
    </a>`;
}

function buildPanel(paper) {
  const panel = document.createElement('div');
  panel.id        = 'pdf-panel';
  panel.className = 'pdf-panel';

  panel.innerHTML = `
    <div class="pdf-panel-handle"><div class="pdf-panel-handle-pill"></div></div>
    <div class="pdf-panel-header">
      <span class="pdf-panel-citation">${panelCitationHtml(paper)}</span>
      <button class="pdf-close-btn" title="Close">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="pdf-panel-body">${panelBodyHtml(paper)}</div>
  `;

  panel.querySelector('.pdf-close-btn').addEventListener('click', closePanel);
  panel.querySelector('.pdf-panel-handle').addEventListener('click', closePanel);
  document.body.appendChild(panel);
  return panel;
}

function openPanel(paper, clickedWrapper) {
  // Same card clicked again — close
  if (activeDoi === paper.doi) { closePanel(); return; }

  // Update active-card highlight
  activeDoi = paper.doi;
  document.querySelectorAll('.card-wrapper')
    .forEach(el => el.classList.toggle('active', el.dataset.doi === paper.doi));

  // If panel is already open, swap content in-place (no slide animation)
  const existing = document.getElementById('pdf-panel');
  if (existing && existing.classList.contains('open')) {
    existing.querySelector('.pdf-panel-citation').innerHTML = panelCitationHtml(paper);
    const body = existing.querySelector('.pdf-panel-body');
    body.innerHTML = panelBodyHtml(paper);
    body.scrollTop = 0;
    return;
  }

  // First open — slide in from right (desktop) or bottom (mobile)
  closePanel(true);

  // Add backdrop (mobile only — CSS hides it on desktop)
  const backdrop = document.createElement('div');
  backdrop.id        = 'pdf-backdrop';
  backdrop.className = 'pdf-backdrop';
  backdrop.addEventListener('click', closePanel);
  document.body.appendChild(backdrop);

  const panel = buildPanel(paper);

  requestAnimationFrame(() => {
    panel.classList.add('open');
    backdrop.classList.add('open');
  });
}

function closePanel(instant = false) {
  const panel    = document.getElementById('pdf-panel');
  const backdrop = document.getElementById('pdf-backdrop');
  if (!panel) return;

  document.querySelectorAll('.card-wrapper').forEach(el => el.classList.remove('active'));
  activeDoi = null;

  if (instant) {
    panel.remove();
    if (backdrop) backdrop.remove();
  } else {
    panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    setTimeout(() => { panel.remove(); if (backdrop) backdrop.remove(); }, 370);
  }
}

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('image-lightbox')) { closeLightbox(); return; }
  if (e.key === 'Escape' && activeDoi) closePanel();
});

// Close when clicking blank space (desktop — mobile uses the backdrop)
document.addEventListener('click', e => {
  if (!activeDoi) return;
  if (e.target.closest('.card-wrapper')) return;  // card handled by its own listener
  if (e.target.closest('#pdf-panel'))   return;  // inside the panel
  if (e.target.closest('.sort-select-wrap')) return;  // sort dropdown
  closePanel();
});

// ─── Image lightbox (tap a panel thumbnail to view it full-size) ─────────────

function openLightbox(src, alt) {
  const overlay = document.createElement('div');
  overlay.id        = 'image-lightbox';
  overlay.className = 'image-lightbox';
  overlay.innerHTML = `<img src="${src}" alt="${alt}">`;
  overlay.addEventListener('click', closeLightbox);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function closeLightbox() {
  const overlay = document.getElementById('image-lightbox');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 200);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.panel-thumbnail-btn');
  if (!btn) return;
  const img = btn.querySelector('img');
  openLightbox(img.src, img.alt);
});

// ─── Abstract "show more" toggle ──────────────────────────────────────────────

document.addEventListener('click', e => {
  const btn = e.target.closest('.abstract-toggle-btn');
  if (!btn) return;
  const paper = allPapers.find(p => p.doi === btn.dataset.doi);
  if (!paper) return;

  const p = btn.previousElementSibling;
  const expanded = p.dataset.expanded === 'true';
  if (expanded) {
    p.textContent = truncateAbstract(paper.abstract, ABSTRACT_WORD_LIMIT);
    p.dataset.expanded = 'false';
    btn.textContent = 'Show more';
  } else {
    p.textContent = paper.abstract;
    p.dataset.expanded = 'true';
    btn.textContent = 'Show less';
  }
});

// ─── Card factory ────────────────────────────────────────────────────────────

function makeCard(paper) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card-wrapper';
  wrapper.dataset.doi = paper.doi;
  if (paper.is_author) wrapper.classList.add('author-card');
  if (paper.doi === activeDoi) wrapper.classList.add('active');

  // Card face
  const card = document.createElement('div');
  card.className = 'card';

  if (paper.thumbnail) {
    const img = document.createElement('img');
    img.className  = 'card-thumbnail';
    img.src        = paper.thumbnail;
    img.alt        = paper.title;
    img.loading    = 'lazy';
    img.decoding   = 'async';
    card.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className  = 'card-thumbnail-missing';
    ph.textContent = '📄';
    card.appendChild(ph);
  }

  const info = document.createElement('div');
  info.className = 'card-info';

  const title = document.createElement('h2');
  title.className   = 'card-title';
  title.textContent = paper.title;
  info.appendChild(title);

  const cite = document.createElement('p');
  cite.className   = 'card-citation';
  cite.textContent = paper.citation;
  info.appendChild(cite);

  if (paper.journal) {
    const jrn = document.createElement('p');
    jrn.className   = 'card-journal';
    jrn.textContent = paper.journal;
    info.appendChild(jrn);
  }

  card.appendChild(info);
  wrapper.appendChild(card);

  wrapper.addEventListener('click', () => openPanel(paper, wrapper));
  return wrapper;
}

// ─── Render ──────────────────────────────────────────────────────────────────

// Columns grow with available width up to MAX_COLS; beyond that, cards
// widen to fill the space instead of adding more columns.
const MAX_COLS = 5;

function numColumns(containerWidth) {
  const colMin = 260, gap = 20;
  const fit = Math.floor((containerWidth + gap) / (colMin + gap));
  return Math.min(MAX_COLS, Math.max(1, fit));
}

function layoutColumns(papers, initial) {
  const grid = document.getElementById('papers-grid');
  const w = grid.offsetWidth || document.querySelector('main').offsetWidth || (window.innerWidth - 56);

  grid.innerHTML = '';

  if (currentLayout === 'grid') {
    grid.classList.add('grid-mode');
    grid.style.gridTemplateColumns = `repeat(${numColumns(w)}, 1fr)`;
    papers.forEach((paper, i) => {
      const el = makeCard(paper);
      grid.appendChild(el);
      setTimeout(() => el.classList.add('visible'), initial ? i * 55 : 0);
    });
    return;
  }

  grid.classList.remove('grid-mode');
  grid.style.gridTemplateColumns = '';
  const n = numColumns(w);
  const cols = Array.from({ length: n }, () => {
    const col = document.createElement('div');
    col.className = 'masonry-col';
    grid.appendChild(col);
    return col;
  });
  papers.forEach((paper, i) => {
    const el = makeCard(paper);
    cols[i % n].appendChild(el);
    setTimeout(() => el.classList.add('visible'), initial ? i * 55 : 0);
  });
}

function renderPapers(initial = false) {
  closePanel(true);
  const papers = sorted(allPapers, currentSort);
  layoutColumns(papers, initial);
}

// ─── Sort controls ───────────────────────────────────────────────────────────

document.getElementById('sort-select').addEventListener('change', e => {
  const sort = e.target.value;
  if (sort === currentSort) return;
  currentSort = sort;

  const grid = document.getElementById('papers-grid');
  grid.style.transition = 'opacity 0.18s ease';
  grid.style.opacity    = '0';
  setTimeout(() => {
    renderPapers(false);
    grid.querySelectorAll('.card-wrapper').forEach(el => el.classList.add('visible'));
    grid.style.opacity = '1';
  }, 180);
});

// ─── Layout toggle ───────────────────────────────────────────────────────────

document.querySelectorAll('.layout-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const layout = btn.dataset.layout;
    if (layout === currentLayout) return;
    currentLayout = layout;
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (allPapers.length) layoutColumns(sorted(allPapers, currentSort), false);
  });
});

// ─── Theme toggle ─────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  document.querySelectorAll('[data-theme]').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === theme)
  );
}

// Initialise from system preference
applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

document.querySelectorAll('[data-theme]').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

// ─── Resize ──────────────────────────────────────────────────────────────────

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (allPapers.length) layoutColumns(sorted(allPapers, currentSort), false);
  }, 150);
});

// ─── Boot ────────────────────────────────────────────────────────────────────

loadPapers();

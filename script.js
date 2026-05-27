/* neuroinspo — main script */

let allPapers  = [];
let currentSort = 'pub';
let activeDoi   = null;   // DOI of the paper whose panel is open

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
  return [...papers].sort((a, b) => {
    const da = new Date(by === 'upload' ? a.upload_date : (a.pub_date ?? '1900-01-01'));
    const db = new Date(by === 'upload' ? b.upload_date : (b.pub_date ?? '1900-01-01'));
    return db - da;
  });
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function panelBodyHtml(paper) {
  const escapedTitle = paper.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const abstractHtml = paper.abstract
    ? `<p class="panel-abstract">${paper.abstract.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
    : '';
  const journalHtml = paper.journal
    ? `<span class="panel-journal">${paper.journal}</span>`
    : '';
  return `
    <h2 class="panel-title">${escapedTitle}</h2>
    ${journalHtml}
    ${abstractHtml}
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
      <span class="pdf-panel-citation">${paper.citation}</span>
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
    existing.querySelector('.pdf-panel-citation').textContent = paper.citation;
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
  if (e.key === 'Escape' && activeDoi) closePanel();
});

// Close when clicking blank space (desktop — mobile uses the backdrop)
document.addEventListener('click', e => {
  if (!activeDoi) return;
  if (e.target.closest('.card-wrapper')) return;  // card handled by its own listener
  if (e.target.closest('#pdf-panel'))   return;  // inside the panel
  if (e.target.closest('.sort-toggle')) return;  // sort buttons
  closePanel();
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

function renderPapers(initial = false) {
  closePanel(true);
  const grid   = document.getElementById('papers-grid');
  const papers = sorted(allPapers, currentSort);

  grid.innerHTML = '';
  papers.forEach((paper, i) => {
    const el = makeCard(paper);
    grid.appendChild(el);
    const delay = initial ? i * 55 : 0;
    setTimeout(() => el.classList.add('visible'), delay);
  });
}

// ─── Sort controls ───────────────────────────────────────────────────────────

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sort = btn.dataset.sort;
    if (sort === currentSort) return;
    currentSort = sort;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const grid = document.getElementById('papers-grid');
    grid.style.transition = 'opacity 0.18s ease';
    grid.style.opacity    = '0';
    setTimeout(() => {
      renderPapers(false);
      grid.querySelectorAll('.card-wrapper').forEach(el => el.classList.add('visible'));
      grid.style.opacity = '1';
    }, 180);
  });
});

// ─── Boot ────────────────────────────────────────────────────────────────────

loadPapers();

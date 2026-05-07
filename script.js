/* neuroinspo — main script */

let allPapers  = [];
let currentSort = 'pub';
let activeDoi   = null;   // DOI of the paper whose panel is open

// ─── Data loading ────────────────────────────────────────────────────────────

async function loadPapers() {
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

function buildPanel(paper) {
  const panel = document.createElement('div');
  panel.id        = 'pdf-panel';
  panel.className = 'pdf-panel';

  const escapedTitle = paper.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const abstractHtml = paper.abstract
    ? `<p class="panel-abstract">${paper.abstract.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
    : '';
  const journalHtml = paper.journal
    ? `<span class="panel-journal">${paper.journal}</span>`
    : '';

  panel.innerHTML = `
    <div class="pdf-panel-bar">
      <div class="pdf-panel-meta">
        <span class="pdf-panel-citation">${paper.citation}</span>
      </div>
      <div class="pdf-panel-actions">
        <a class="pdf-action-btn" href="${paper.url}" target="_blank" rel="noopener" title="Open in new tab">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M6 2H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V8M9 1h4m0 0v4m0-4L6 8"
                  stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Open in new tab
        </a>
        <button class="pdf-action-btn pdf-close-btn" title="Close">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="panel-body">
      <h2 class="panel-title">${escapedTitle}</h2>
      ${journalHtml}
      ${abstractHtml}
      <p class="panel-doi">doi: <a href="${paper.url}" target="_blank" rel="noopener">${paper.doi}</a></p>
    </div>
  `;

  panel.querySelector('.pdf-close-btn').addEventListener('click', closePanel);
  return panel;
}

function lastCardInRow(clickedWrapper) {
  // Find the last card visually in the same grid row as the clicked card
  const grid    = document.getElementById('papers-grid');
  const cards   = Array.from(grid.querySelectorAll('.card-wrapper'));
  const rowTop  = clickedWrapper.getBoundingClientRect().top;
  let   last    = clickedWrapper;
  for (const card of cards) {
    if (Math.abs(card.getBoundingClientRect().top - rowTop) < 10) {
      last = card;
    }
  }
  return last;
}

function openPanel(paper, clickedWrapper) {
  // If same card clicked again, close
  if (activeDoi === paper.doi) { closePanel(); return; }

  closePanel(true /* instant */);
  activeDoi = paper.doi;

  // Mark active card
  document.querySelectorAll('.card-wrapper')
    .forEach(el => el.classList.toggle('active', el.dataset.doi === paper.doi));

  // Build and insert panel after the last card in the same row
  const panel     = buildPanel(paper);
  const insertAfter = lastCardInRow(clickedWrapper);
  insertAfter.insertAdjacentElement('afterend', panel);

  // Trigger open animation after a brief delay so the browser has painted the element
  setTimeout(() => panel.classList.add('open'), 20);

  // Scroll panel into view smoothly
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
}

function closePanel(instant = false) {
  const panel = document.getElementById('pdf-panel');
  if (!panel) return;

  document.querySelectorAll('.card-wrapper').forEach(el => el.classList.remove('active'));
  activeDoi = null;

  if (instant) {
    panel.remove();
  } else {
    panel.classList.remove('open');
    setTimeout(() => panel.remove(), 350);
  }
}

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && activeDoi) closePanel();
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

  if (paper.doi) {
    const doi = document.createElement('p');
    doi.className   = 'card-doi';
    doi.textContent = `doi: ${paper.doi}`;
    info.appendChild(doi);
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

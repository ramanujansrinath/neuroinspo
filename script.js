/* neuroinspo — main script */

let allPapers = [];
let currentSort = 'upload';
let activeFilename = null;   // which paper has the panel open

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

// ─── PDF panel ───────────────────────────────────────────────────────────────

function openPanel(paper) {
  const panel    = document.getElementById('pdf-panel');
  const frame    = document.getElementById('pdf-frame');
  const titleEl  = document.getElementById('pdf-panel-title');
  const citeEl   = document.getElementById('pdf-panel-citation');
  const dlBtn    = document.getElementById('pdf-download');

  // Update content
  titleEl.textContent = paper.title;
  citeEl.textContent  = paper.citation;
  dlBtn.href          = paper.pdf;

  // Swap iframe src only if switching papers (avoids reload flicker)
  if (frame.dataset.current !== paper.filename) {
    frame.src = paper.pdf;
    frame.dataset.current = paper.filename;
  }

  // Mark active card
  document.querySelectorAll('.card-wrapper').forEach(el => {
    el.classList.toggle('active', el.dataset.filename === paper.filename);
  });
  activeFilename = paper.filename;

  // Open panel
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');

  // Scroll panel into view smoothly
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closePanel() {
  const panel = document.getElementById('pdf-panel');
  const frame = document.getElementById('pdf-frame');

  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');

  document.querySelectorAll('.card-wrapper').forEach(el => el.classList.remove('active'));
  activeFilename = null;

  // Clear iframe after animation completes so it stops loading/rendering
  setTimeout(() => {
    if (!panel.classList.contains('open')) {
      frame.src = '';
      frame.dataset.current = '';
    }
  }, 460);
}

document.getElementById('pdf-close').addEventListener('click', closePanel);

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && activeFilename) closePanel();
});

// ─── Card factory ────────────────────────────────────────────────────────────

function makeCard(paper) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card-wrapper';
  wrapper.dataset.filename = paper.filename;
  if (paper.filename === activeFilename) wrapper.classList.add('active');

  // Fan layers (behind the card face)
  const p2 = document.createElement('div');
  p2.className = 'page-layer page-layer-2';
  const p1 = document.createElement('div');
  p1.className = 'page-layer page-layer-1';

  // Apply PDF page images if available
  const pages = paper.page_images || [];
  if (pages[0]) p1.style.backgroundImage = `url('${pages[0]}')`;
  if (pages[1]) p2.style.backgroundImage = `url('${pages[1]}')`;

  // Card face
  const card = document.createElement('div');
  card.className = 'card';

  if (paper.thumbnail) {
    const img = document.createElement('img');
    img.className = 'card-thumbnail';
    img.src = paper.thumbnail;
    img.alt = paper.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    card.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'card-thumbnail-missing';
    ph.textContent = '📄';
    card.appendChild(ph);
  }

  const info = document.createElement('div');
  info.className = 'card-info';

  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = paper.title;
  info.appendChild(title);

  const cite = document.createElement('p');
  cite.className = 'card-citation';
  cite.textContent = paper.citation;
  info.appendChild(cite);

  if (paper.journal) {
    const jrn = document.createElement('p');
    jrn.className = 'card-journal';
    jrn.textContent = paper.journal;
    info.appendChild(jrn);
  }

  if (paper.doi) {
    const doi = document.createElement('p');
    doi.className = 'card-doi';
    doi.textContent = `doi: ${paper.doi}`;
    info.appendChild(doi);
  }

  card.appendChild(info);

  // Click → toggle panel
  wrapper.addEventListener('click', () => {
    if (activeFilename === paper.filename) {
      closePanel();
    } else {
      openPanel(paper);
    }
  });

  wrapper.appendChild(p2);
  wrapper.appendChild(p1);
  wrapper.appendChild(card);

  return wrapper;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderPapers(initial = false) {
  const grid = document.getElementById('papers-grid');
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
    grid.style.opacity = '0';

    setTimeout(() => {
      renderPapers(false);
      grid.querySelectorAll('.card-wrapper').forEach(el => el.classList.add('visible'));
      grid.style.opacity = '1';
    }, 180);
  });
});

// ─── Boot ────────────────────────────────────────────────────────────────────

loadPapers();

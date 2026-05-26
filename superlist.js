/* superlist — main script */

let allLists  = [];
let activeUrl = null;   // URL of the reading list whose panel is open

// ─── Data loading ────────────────────────────────────────────────────────────

async function loadLists() {
  try {
    const res = await fetch('superlist.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allLists = await res.json();
  } catch (err) {
    console.warn('Could not load superlist.json:', err.message);
    allLists = [];
  }

  document.getElementById('loading').style.display = 'none';

  if (allLists.length === 0) {
    document.getElementById('empty-state').style.display = 'block';
    return;
  }

  renderLists();
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    // Add noon UTC to avoid timezone-shifting the date
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function buildPanel(list) {
  const panel = document.createElement('div');
  panel.id        = 'list-panel';
  panel.className = 'list-panel';

  const dateStr = formatDate(list.pub_date);

  const papersHtml = list.papers.map(p => {
    const metaParts = [
      p.authors,
      p.year   ? `(${p.year})` : '',
      p.journal ? `· ${p.journal}` : '',
    ].filter(Boolean).join(' ');

    return `
      <a class="paper-entry" href="${escHtml(p.url)}" target="_blank" rel="noopener">
        <div class="paper-entry-title">${escHtml(p.title)}</div>
        <div class="paper-entry-meta">${escHtml(metaParts)}</div>
      </a>`;
  }).join('');

  panel.innerHTML = `
    <div class="list-panel-bar">
      <div class="list-panel-meta">
        <span class="list-panel-title">${escHtml(list.title)}</span>
        <span class="list-panel-date">${escHtml(dateStr)}</span>
      </div>
      <div class="list-panel-actions">
        <a class="list-action-btn" href="${escHtml(list.url)}" target="_blank" rel="noopener" title="View original post">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M6 2H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V8M9 1h4m0 0v4m0-4L6 8"
                  stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          View on superlab.ca
        </a>
        <button class="list-action-btn list-close-btn" title="Close">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="panel-papers">${papersHtml}</div>
  `;

  panel.querySelector('.list-close-btn').addEventListener('click', closePanel);
  return panel;
}

function lastCardInRow(clickedWrapper) {
  const grid   = document.getElementById('lists-grid');
  const cards  = Array.from(grid.querySelectorAll('.card-wrapper'));
  const rowTop = clickedWrapper.getBoundingClientRect().top;
  let   last   = clickedWrapper;
  for (const card of cards) {
    if (Math.abs(card.getBoundingClientRect().top - rowTop) < 10) {
      last = card;
    }
  }
  return last;
}

function openPanel(list, clickedWrapper) {
  // Toggle closed if same card clicked again
  if (activeUrl === list.url) { closePanel(); return; }

  closePanel(true /* instant */);
  activeUrl = list.url;

  // Mark active card
  document.querySelectorAll('.card-wrapper')
    .forEach(el => el.classList.toggle('active', el.dataset.url === list.url));

  // Build and inject panel after the last card in the same grid row
  const panel       = buildPanel(list);
  const insertAfter = lastCardInRow(clickedWrapper);
  insertAfter.insertAdjacentElement('afterend', panel);

  // Animate open
  setTimeout(() => panel.classList.add('open'), 20);
  // Scroll into view — skip on mobile to avoid jarring jumps
  if (window.innerWidth > 540) {
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }
}

function closePanel(instant = false) {
  const panel = document.getElementById('list-panel');
  if (!panel) return;

  document.querySelectorAll('.card-wrapper').forEach(el => el.classList.remove('active'));
  activeUrl = null;

  if (instant) {
    panel.remove();
  } else {
    panel.classList.remove('open');
    setTimeout(() => panel.remove(), 350);
  }
}

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && activeUrl) closePanel();
});

// ─── Card factory ─────────────────────────────────────────────────────────────

function makeCard(list) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card-wrapper';
  wrapper.dataset.url = list.url;
  if (list.url === activeUrl) wrapper.classList.add('active');

  // Page layers (fan-out animation)
  const layer2 = document.createElement('div');
  layer2.className = 'page-layer page-layer-2';
  const layer1 = document.createElement('div');
  layer1.className = 'page-layer page-layer-1';

  // Card face
  const card = document.createElement('div');
  card.className = 'card';

  const dateStr      = formatDate(list.pub_date);
  const previewCount = 3;
  const preview      = list.papers.slice(0, previewCount);
  const remaining    = list.papers.length - preview.length;

  const previewHtml = preview.map(p =>
    `<li>${escHtml(p.title)}</li>`
  ).join('') + (remaining > 0
    ? `<li class="card-preview-more">+${remaining} more</li>`
    : '');

  card.innerHTML = `
    <div class="card-top">
      <span class="card-list-label">Reading List</span>
      <span class="card-list-num">${list.list_num}</span>
    </div>
    <div class="card-info">
      <div class="card-date">${escHtml(dateStr)}</div>
      <div class="card-count">${list.papers.length} paper${list.papers.length !== 1 ? 's' : ''}</div>
      <ul class="card-preview">${previewHtml}</ul>
    </div>
  `;

  wrapper.appendChild(layer2);
  wrapper.appendChild(layer1);
  wrapper.appendChild(card);

  wrapper.addEventListener('click', () => openPanel(list, wrapper));
  return wrapper;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderLists() {
  const grid = document.getElementById('lists-grid');
  grid.innerHTML = '';
  allLists.forEach((list, i) => {
    const el = makeCard(list);
    grid.appendChild(el);
    setTimeout(() => el.classList.add('visible'), i * 60);
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

loadLists();

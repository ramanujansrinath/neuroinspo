# NEUROINSPO

An inspiration board for neuroscience papers. Drop in a PDF and a figure thumbnail, run one script, and the paper appears as a pinned card with a fan-out page animation and an inline PDF viewer.

## Features

- **Masonry grid** of paper cards, each showing a figure thumbnail, title, and short citation
- **Fan-out animation** on hover — the two layers behind each card show pages 1 and 2 of the actual PDF
- **Inline PDF viewer** — click any card to open the paper full-width without leaving the page
- **Sort** by date added or publication date
- **Fully static** — no server required; deploy anywhere (Google Cloud Storage, Cloudflare Pages, Vercel, etc.)

## Setup

**Dependencies** (Python only, for the processing script):

```bash
pip install requests pymupdf
```

The site itself is plain HTML + CSS + JS with no build step.

## Adding a paper

1. Drop the PDF and a figure thumbnail PNG into `papers/`, using the same base filename:
   ```
   papers/
     smith2024.pdf
     smith2024.png
   ```

2. Run the processing script from the repo root:
   ```bash
   python3 process_papers.py
   ```
   This will:
   - Extract the DOI from the PDF text
   - Fetch title, authors, and publication date from CrossRef (arXiv fallback for preprints)
   - Render pages 1 & 2 as JPEGs for the fan animation
   - Write / update `papers.json`

3. Commit `papers.json` and the generated `*_page1.jpg` / `*_page2.jpg` files. The `papers/` folder itself (PDFs and PNGs) is gitignored — host those separately or add them to your deployment bundle.

## Deploying

The site is four static files: `index.html`, `style.css`, `script.js`, and `papers.json`, plus the `papers/` assets. Upload them anywhere that serves static files.

**Google Cloud Storage example:**
```bash
gsutil -m cp -r index.html style.css script.js papers.json papers/ gs://your-bucket/
gsutil web set -m index.html gs://your-bucket/
```

**Cloudflare Pages / Vercel / Netlify:** connect the repo and set the publish directory to `.` (repo root). Add `papers/` to your platform's ignore rules if you don't want to commit the PDFs.

## How `process_papers.py` works

| Step | Tool |
|------|------|
| DOI extraction | `strings` binary + regex (fast, handles large PDFs) |
| Metadata lookup | [CrossRef API](https://api.crossref.org/) with arXiv fallback |
| Page rendering | [PyMuPDF](https://pymupdf.readthedocs.io/) at 100 DPI |

Already-processed papers are skipped on subsequent runs, so you only hit the network for new additions.

## Project structure

```
.
├── index.html            # Single-page app shell
├── style.css             # Layout, card styles, animations
├── script.js             # Data loading, rendering, panel logic
├── process_papers.py     # PDF → papers.json pipeline
├── papers.json           # Generated metadata (commit this)
└── papers/               # PDFs, thumbnails, page images (gitignored)
```

## Tech stack

- Vanilla HTML / CSS / JS — no framework, no build step
- CSS Grid for the masonry layout
- CSS custom properties + `cubic-bezier` spring easing for animations
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) from Google Fonts

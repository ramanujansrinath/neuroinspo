# NEUROINSPO

A static inspiration board for neuroscience papers. Live at **[neuroinspo.site](https://neuroinspo.site)**.

Add a DOI and a thumbnail, run one script, and the paper appears as a card with a fan-out animation and an inline abstract panel.

## Pages

| Page | Description |
|------|-------------|
| `index.html` | Main board — personal collection of papers |
| `superlist.html` | Superlab reading lists — a personal mirror of the [Sensorimotor Superlab](https://superlab.ca/) weekly RSS feed, for my own browsing convenience |

## Adding a paper (`index.html`)

1. Append the DOI URL to `dois.text` (one per line):
   ```
   https://doi.org/10.1038/s41593-024-01234-5
   ```

2. Drop a thumbnail PNG into `thumbnails/` numbered to match the line:
   ```
   thumbnails/6.png
   ```

3. Run:
   ```bash
   python3 process_papers.py
   ```
   Fetches title, authors, abstract, and publication date from CrossRef (arXiv fallback for preprints) and writes `papers.json`. Already-fetched papers are cached and skipped.

## Refreshing the Superlab list (`superlist.html`)

```bash
python3 process_superlist.py
```

Fetches the latest posts from `superlab.ca/index.xml` and writes `superlist.json`. Already-fetched posts are cached.

## Automated nightly refresh

A GitHub Actions workflow (`.github/workflows/update-data.yml`) runs both scripts at 3 AM UTC every night and commits any changes to `papers.json` / `superlist.json`. Can also be triggered manually from the Actions tab.

## Dependencies

```bash
pip install -r requirements.txt   # just: requests
```

The site itself is plain HTML + CSS + JS — no framework, no build step.

## Project structure

```
.
├── index.html               # Main paper board
├── superlist.html           # Superlab reading list mirror
├── style.css / script.js    # Main board styles + logic
├── superlist.css / .js      # Superlist styles + logic
├── process_papers.py        # DOI → papers.json
├── process_superlist.py     # RSS → superlist.json
├── requirements.txt
├── dois.text                # One DOI URL per line
├── thumbnails/              # thumbnails/N.png (matches line N in dois.text)
└── .github/workflows/
    └── update-data.yml      # Nightly CI refresh
```

## Tech

- Vanilla HTML / CSS / JS — no framework, no build step
- CSS Grid + `cubic-bezier` spring easing for animations
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) via Google Fonts
- CrossRef API + arXiv fallback for metadata

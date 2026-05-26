# NEUROINSPO

A static inspiration board for neuroscience papers. Live at **[neuroinspo.site](https://neuroinspo.site)**.

Add a DOI and a thumbnail, run one script, and the paper appears as a card with a fan-out animation and an inline abstract panel.

## Pages

| Page | URL | Description |
|------|-----|-------------|
| `index.html` | `neuroinspo.site` | Main board — personal collection of papers |
| `superlist.html` | `neuroinspo.site/superlist.html` | Superlab reading lists — a personal mirror of the [Sensorimotor Superlab](https://superlab.ca/) weekly RSS feed, for my own browsing convenience |
| `spiro.html` | `neuroinspo.site/spiro.html` | Interactive [hypotrochoid](https://en.wikipedia.org/wiki/Hypotrochoid) spirograph generator.|


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
├── spiro.html               # Spirograph generator (standalone, no nav link)
├── style.css / script.js    # Main board styles + logic
├── superlist.css / .js      # Superlist styles + logic
├── process_papers.py        # DOI → papers.json
├── process_superlist.py     # RSS → superlist.json
├── requirements.txt
├── dois.text                # One DOI URL per line
├── thumbnails/              # thumbnails/N.png (matches line N in dois.text)
├── wrangler.jsonc           # Cloudflare Workers / Pages deployment config
└── .github/workflows/
    └── update-data.yml      # Nightly CI refresh
```

## Spirograph (`spiro.html`)

An interactive spirograph that draws a [hypotrochoid](https://en.wikipedia.org/wiki/Hypotrochoid) — the path traced by a point on a small circle rolling inside a larger circle:

```
x = (R − r) · cos(θ) + d · cos((R−r)/r · θ)
y = (R − r) · sin(θ) − d · sin((R−r)/r · θ)
```

Each frame, `θ` advances by the **Speed** value and a new point is drawn on an HTML `<canvas>` from a rolling point buffer (which is what makes trail length work).

| Control | What it does |
|---|---|
| **R** — outer radius | Radius of the fixed outer circle (10–300) |
| **r** — inner radius | Radius of the rolling inner circle (10–300) |
| **d** — pen distance | Distance from the inner circle's centre (10–400). Values larger than `r` produce loops. |
| **Speed** | How much `θ` advances per frame |
| **Trail length** | Points kept in the buffer — short = comet tail, long = full pattern |
| **Color** | Pen color for new segments; old segments keep their color |
| **⏸ / ▶** | Pause / resume |
| **⟳** | Clear and restart from `θ = 0` |

Adjusting a slider mid-draw lifts the pen for one frame, so new traces start cleanly without connecting back to the old position. A good workflow: let a pattern complete, hit **⏸**, change color and/or parameters, then hit **▶** to layer a new pattern on top.

## Deploying

The site is deployed on Cloudflare Workers via [Wrangler](https://developers.cloudflare.com/workers/wrangler/). `wrangler.jsonc` serves the whole repo root as static assets.

## Tech

- Vanilla HTML / CSS / JS — no framework, no build step
- CSS Grid + `cubic-bezier` spring easing for animations
- HTML `<canvas>` for the spirograph
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) via Google Fonts
- CrossRef API + arXiv fallback for metadata
- Cloudflare Workers for hosting

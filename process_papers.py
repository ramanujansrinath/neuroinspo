#!/usr/bin/env python3
"""
process_papers.py — Scan papers/ folder, extract DOIs, fetch metadata, write papers.json

Dependencies:
    pip install requests pymupdf
    (uses macOS/Linux 'strings' binary for DOI extraction)
"""

import json
import os
import re
import subprocess
import time
from pathlib import Path
from datetime import datetime

import fitz  # pymupdf
import requests

PAPERS_DIR = Path("papers")
OUTPUT_FILE = Path("papers.json")
CROSSREF_BASE = "https://api.crossref.org/works"
# Crossref asks that you identify yourself for the polite pool (faster, more reliable)
USER_AGENT = "neuroinspo/1.0 (mailto:changeme@example.com)"

DOI_PATTERN = re.compile(r'\b(10\.\d{4,9}/[^\s\"\'><\|\]\[]+)', re.IGNORECASE)


def extract_doi(pdf_path: Path) -> str | None:
    try:
        result = subprocess.run(
            ["strings", str(pdf_path)],
            capture_output=True, text=True, timeout=30,
        )
        matches = DOI_PATTERN.findall(result.stdout)
        if matches:
            return matches[0].rstrip(".,;)")
    except Exception as e:
        print(f"  ⚠ Could not read {pdf_path.name}: {e}")
    return None


def extract_page_images(pdf_path: Path, stem: str, out_dir: Path) -> list[str]:
    """Render pages 1 & 2 of a PDF as JPEGs for the fan-out animation."""
    paths = []
    try:
        doc = fitz.open(str(pdf_path))
        mat = fitz.Matrix(100 / 72, 100 / 72)  # 100 DPI
        for i in range(min(2, len(doc))):
            pix = doc[i].get_pixmap(matrix=mat)
            out_path = out_dir / f"{stem}_page{i + 1}.jpg"
            pix.save(str(out_path), output="jpeg", jpg_quality=72)
            paths.append(f"papers/{out_path.name}")
        doc.close()
    except Exception as e:
        print(f"  ⚠ Page image extraction failed: {e}")
    return paths


def fetch_crossref(doi: str) -> dict | None:
    url = f"{CROSSREF_BASE}/{doi}"
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=12)
        if resp.status_code == 200:
            return resp.json()["message"]
        print(f"  ⚠ CrossRef {resp.status_code} for {doi}")
    except Exception as e:
        print(f"  ⚠ CrossRef request failed: {e}")
    return None


def fetch_arxiv(arxiv_id: str) -> dict | None:
    """Fallback for arXiv preprints not indexed in CrossRef."""
    import xml.etree.ElementTree as ET
    url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=12)
        if resp.status_code != 200:
            return None
        ns = {
            "atom": "http://www.w3.org/2005/Atom",
            "arxiv": "http://arxiv.org/schemas/atom",
        }
        root = ET.fromstring(resp.text)
        entry = root.find("atom:entry", ns)
        if entry is None:
            return None
        title = (entry.findtext("atom:title", "", ns) or "").strip().replace("\n", " ")
        published = (entry.findtext("atom:published", "", ns) or "")[:10]
        authors = [
            {"family": a.findtext("atom:name", "", ns).split()[-1],
             "given":  " ".join(a.findtext("atom:name", "", ns).split()[:-1])}
            for a in entry.findall("atom:author", ns)
        ]
        # Normalise to CrossRef-like shape so the rest of the code is unchanged
        return {
            "title": [title],
            "author": authors,
            "published": {"date-parts": [[int(p) for p in published.split("-") if p]]},
            "container-title": ["arXiv"],
        }
    except Exception as e:
        print(f"  ⚠ arXiv lookup failed: {e}")
    return None


def format_citation(authors: list, year: str) -> str:
    last_names = [a.get("family", a.get("name", "Unknown")) for a in authors]
    if not last_names:
        return f"Unknown, {year}"
    if len(last_names) == 1:
        return f"{last_names[0]}, {year}"
    if len(last_names) == 2:
        return f"{last_names[0]} and {last_names[1]}, {year}"
    return f"{last_names[0]} et al., {year}"


def parse_pub_date(meta: dict) -> str | None:
    for key in ("published", "published-print", "published-online", "created"):
        parts = meta.get(key, {}).get("date-parts", [[None]])[0]
        if parts and parts[0]:
            y = parts[0]
            m = parts[1] if len(parts) > 1 else 1
            d = parts[2] if len(parts) > 2 else 1
            return f"{y:04d}-{m:02d}-{d:02d}"
    return None


def file_creation_date(path: Path) -> str:
    stat = os.stat(path)
    ts = getattr(stat, "st_birthtime", None) or stat.st_mtime
    return datetime.fromtimestamp(ts).isoformat()


def process():
    pdfs = sorted(PAPERS_DIR.glob("*.pdf"))
    if not pdfs:
        print("No PDFs found in papers/")
        return

    # Load existing records so we can skip already-processed files
    existing = {}
    if OUTPUT_FILE.exists():
        try:
            for rec in json.loads(OUTPUT_FILE.read_text()):
                existing[rec["filename"]] = rec
        except Exception:
            pass

    records = []
    for pdf_path in pdfs:
        stem = pdf_path.stem
        png_path = PAPERS_DIR / f"{stem}.png"

        print(f"→ {pdf_path.name}")

        if stem in existing:
            print("  ✓ already processed, skipping")
            records.append(existing[stem])
            continue

        thumbnail = f"papers/{png_path.name}" if png_path.exists() else None
        if not thumbnail:
            print("  ⚠ no thumbnail PNG found")

        # Extract page images for fan animation (skip if already present)
        page1 = PAPERS_DIR / f"{stem}_page1.jpg"
        page2 = PAPERS_DIR / f"{stem}_page2.jpg"
        if page1.exists() and page2.exists():
            page_images = [f"papers/{page1.name}", f"papers/{page2.name}"]
        else:
            page_images = extract_page_images(pdf_path, stem, PAPERS_DIR)
            if page_images:
                print(f"  ✓ extracted {len(page_images)} page image(s)")

        doi = extract_doi(pdf_path)
        print(f"  DOI: {doi}" if doi else "  ⚠ no DOI found")

        upload_date = file_creation_date(pdf_path)
        title = stem
        citation = "Unknown"
        pub_date = None
        journal = None

        if doi:
            time.sleep(0.5)  # stay in Crossref polite pool
            meta = fetch_crossref(doi)
            # arXiv preprints aren't in CrossRef — use arXiv API as fallback
            if meta is None and doi.lower().startswith("10.48550/arxiv."):
                # DOI is e.g. "10.48550/arXiv.2603.06557" → need just "2603.06557"
                arxiv_id = doi.split("/")[-1]
                if arxiv_id.lower().startswith("arxiv."):
                    arxiv_id = arxiv_id[6:]
                meta = fetch_arxiv(arxiv_id)
            if meta:
                titles = meta.get("title", [])
                title = titles[0] if titles else stem

                authors = meta.get("author", [])
                pub_date = parse_pub_date(meta)
                year = pub_date[:4] if pub_date else "n.d."
                citation = format_citation(authors, year)

                journals = meta.get("container-title", [])
                journal = journals[0] if journals else None

                print(f"  ✓ {citation}")
                print(f"  ✓ {title[:70]}{'...' if len(title) > 70 else ''}")

        records.append({
            "filename": stem,
            "pdf": f"papers/{pdf_path.name}",
            "thumbnail": thumbnail,
            "page_images": page_images,
            "doi": doi,
            "title": title,
            "citation": citation,
            "pub_date": pub_date,
            "upload_date": upload_date,
            "journal": journal,
        })
        print()

    OUTPUT_FILE.write_text(json.dumps(records, indent=2, ensure_ascii=False))
    print(f"\n✓ Wrote {len(records)} papers to {OUTPUT_FILE}")


if __name__ == "__main__":
    process()

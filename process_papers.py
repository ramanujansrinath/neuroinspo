#!/usr/bin/env python3
"""
process_papers.py — Read dois.text, fetch metadata from CrossRef/arXiv, write papers.json

Format of dois.text:
    One DOI per line, either bare (10.xxxx/...) or as a full URL (https://doi.org/10.xxxx/...)
    Thumbnail for line N is thumbnails/N.png

Dependencies:
    pip install requests
"""

import json
import os
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime

import requests

DOIS_FILE      = Path("dois.text")
THUMBNAILS_DIR = Path("thumbnails")
OUTPUT_FILE    = Path("papers.json")
CROSSREF_BASE  = "https://api.crossref.org/works"
USER_AGENT     = "neuroinspo/1.0 (mailto:changeme@example.com)"


# ─── API helpers ─────────────────────────────────────────────────────────────

def fetch_crossref(doi: str) -> dict | None:
    try:
        r = requests.get(f"{CROSSREF_BASE}/{doi}",
                         headers={"User-Agent": USER_AGENT}, timeout=12)
        if r.status_code == 200:
            return r.json()["message"]
        print(f"  ⚠ CrossRef {r.status_code}")
    except Exception as e:
        print(f"  ⚠ CrossRef error: {e}")
    return None


def fetch_arxiv(arxiv_id: str) -> dict | None:
    """Fallback metadata for arXiv preprints not indexed in CrossRef."""
    url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=12)
        if r.status_code != 200:
            return None
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(r.text)
        entry = root.find("atom:entry", ns)
        if entry is None:
            return None
        title     = (entry.findtext("atom:title", "", ns) or "").strip().replace("\n", " ")
        published = (entry.findtext("atom:published", "", ns) or "")[:10]
        authors   = [
            {"family": a.findtext("atom:name", "", ns).split()[-1],
             "given":  " ".join(a.findtext("atom:name", "", ns).split()[:-1])}
            for a in entry.findall("atom:author", ns)
        ]
        summary = (entry.findtext("atom:summary", "", ns) or "").strip().replace("\n", " ")
        return {
            "title":           [title],
            "author":          authors,
            "published":       {"date-parts": [[int(p) for p in published.split("-") if p]]},
            "container-title": ["arXiv"],
            "abstract":        summary,
        }
    except Exception as e:
        print(f"  ⚠ arXiv error: {e}")
    return None


# ─── Formatting helpers ───────────────────────────────────────────────────────

def parse_pub_date(meta: dict) -> str | None:
    for key in ("published", "published-print", "published-online", "created"):
        parts = meta.get(key, {}).get("date-parts", [[None]])[0]
        if parts and parts[0]:
            y = parts[0]
            m = parts[1] if len(parts) > 1 else 1
            d = parts[2] if len(parts) > 2 else 1
            return f"{y:04d}-{m:02d}-{d:02d}"
    return None


def format_citation(authors: list, year: str) -> str:
    names = [a.get("family", a.get("name", "Unknown")) for a in authors]
    if not names:
        return f"Unknown, {year}"
    if len(names) == 1:
        return f"{names[0]}, {year}"
    if len(names) == 2:
        return f"{names[0]} and {names[1]}, {year}"
    return f"{names[0]} et al., {year}"


def is_ramanujan_srinath(authors: list) -> bool:
    for a in authors:
        family = a.get("family", "").lower().strip()
        given  = a.get("given",  "").lower().strip()
        full   = a.get("name",   "").lower().strip()
        if family == "srinath" and (given.startswith("r") or "ramanujan" in given):
            return True
        if "srinath" in full and ("ramanujan" in full or full.split()[0].rstrip(".") == "r"):
            return True
    return False


# ─── Main ────────────────────────────────────────────────────────────────────

def parse_doi(line: str) -> str:
    """Strip URL prefix, return bare DOI."""
    line = line.strip()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
        if line.lower().startswith(prefix):
            return line[len(prefix):]
    return line


def process():
    if not DOIS_FILE.exists():
        print(f"Error: {DOIS_FILE} not found")
        return

    lines = [l for l in DOIS_FILE.read_text().splitlines() if l.strip()]
    if not lines:
        print("dois.text is empty")
        return

    # Load existing records (keyed by DOI) to skip already-fetched metadata
    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists():
        try:
            for rec in json.loads(OUTPUT_FILE.read_text()):
                existing[rec["doi"]] = rec
        except Exception:
            pass

    records = []
    for i, line in enumerate(lines, start=1):
        doi = parse_doi(line)
        print(f"→ [{i}] {doi}")

        thumb_path = THUMBNAILS_DIR / f"{i}.png"
        thumbnail  = f"thumbnails/{i}.png" if thumb_path.exists() else None
        if not thumbnail:
            print(f"  ⚠ no thumbnail at thumbnails/{i}.png")

        # Thumbnail mtime = "upload date" (when you added it to the board)
        if thumb_path.exists():
            stat = os.stat(thumb_path)
            upload_ts = getattr(stat, "st_birthtime", None) or stat.st_mtime
            upload_date = datetime.fromtimestamp(upload_ts).isoformat()
        else:
            upload_date = datetime.now().isoformat()

        # Serve cached metadata but always refresh thumbnail path & upload date
        # (in case dois.text was reordered)
        if doi in existing:
            rec = dict(existing[doi])
            rec["thumbnail"]   = thumbnail
            rec["upload_date"] = upload_date
            records.append(rec)
            print("  ✓ cached — skipping API call")
            continue

        # Fetch metadata
        title     = doi
        citation  = "Unknown"
        pub_date  = None
        journal   = None
        abstract  = None
        is_author = False

        time.sleep(0.5)  # stay in CrossRef polite pool
        meta = fetch_crossref(doi)

        if meta is None and doi.lower().startswith("10.48550/arxiv."):
            arxiv_id = doi.split("/")[-1]
            if arxiv_id.lower().startswith("arxiv."):
                arxiv_id = arxiv_id[6:]
            meta = fetch_arxiv(arxiv_id)

        if meta:
            titles   = meta.get("title", [])
            title    = titles[0] if titles else doi

            authors  = meta.get("author", [])
            pub_date = parse_pub_date(meta)
            year     = pub_date[:4] if pub_date else "n.d."
            citation = format_citation(authors, year)

            journals = meta.get("container-title", [])
            journal  = journals[0] if journals else None

            # Abstract — strip JATS XML tags and leading "Abstract" word
            raw_abstract = meta.get("abstract", "") or ""
            abstract = re.sub(r"<[^>]+>", " ", raw_abstract).strip()
            abstract = re.sub(r"\s+", " ", abstract)
            abstract = re.sub(r"^Abstract\s*", "", abstract)

            is_author = is_ramanujan_srinath(authors)
            if is_author:
                print("  ★ Ramanujan Srinath is an author")

            print(f"  ✓ {citation}")
            print(f"  ✓ {title[:70]}{'...' if len(title) > 70 else ''}")

        records.append({
            "doi":         doi,
            "url":         f"https://doi.org/{doi}",
            "thumbnail":   thumbnail,
            "title":       title,
            "citation":    citation,
            "pub_date":    pub_date,
            "upload_date": upload_date,
            "journal":     journal,
            "abstract":    abstract,
            "is_author":   is_author,
        })
        print()

    OUTPUT_FILE.write_text(json.dumps(records, indent=2, ensure_ascii=False))
    print(f"✓ Wrote {len(records)} papers to {OUTPUT_FILE}")


if __name__ == "__main__":
    process()

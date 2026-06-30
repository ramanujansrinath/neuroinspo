#!/usr/bin/env python3
"""
backfill_superlist.py — One-time script to scrape ALL reading list posts from
superlab.ca and merge them into superlist.json.

Run once to populate the full archive; process_superlist.py handles ongoing
weekly updates via RSS.

Two HTML formats exist on the site:
  - Lists 1–7 (early 2019):  <li><p>Authors (Year). <a href>Title</a>. Journal.</p></li>
  - Lists 8+  (Mar 2019+):   <strong>Title</strong><br>Authors (Year)<br><a href>Journal</a>
"""

import html as html_mod
import json
import re
import time
from pathlib import Path

import requests

BASE_URL    = "https://superlab.ca"
OUTPUT      = Path("superlist.json")
USER_AGENT  = "neuroinspo/1.0 (mailto:changeme@example.com)"
MIN_LIST    = 215   # earlier lists have inconsistent formatting

# ─── Patterns ────────────────────────────────────────────────────────────────

# Lists 8+ (majority of posts).
# Handles two sub-formats:
#   Standard:  <strong>T</strong><br>Authors (Year)<br><a href="URL">Journal</a>
#   Mid-era:   <strong>T</strong><br>Authors<br>Journal (Year) <a href="URL">url-text</a>
# Group 3 (pre_link) is empty in the standard case; contains journal+year in mid-era.
PATTERN_NEW = re.compile(
    r'<strong>(.*?)</strong>\s*<br\s*/?>\s*(.*?)\s*<br\s*/?>\s*([^<]*?)\s*<a\s+href="([^"]+)"[^>]*>(.*?)</a>',
    re.DOTALL | re.IGNORECASE,
)

# Lists 1–7 (early 2019): Authors (Year). <a href>Title</a>. Journal.
PATTERN_OLD = re.compile(
    r'<li[^>]*>\s*<p>(.*?)\s*\((\d{4})\)\.?\s*<a\s+href="([^"]+)"[^>]*>(.*?)</a>(?:\s*\.\s*(.*?))?\s*</p>',
    re.DOTALL | re.IGNORECASE,
)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def fetch(url: str) -> str:
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
    r.raise_for_status()
    return r.text


def strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", " ", s).strip()


def clean(s: str) -> str:
    s = strip_tags(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def split_authors_year(authors_year: str):
    """Split 'Smith J, Jones K (2024)' → ('Smith J, Jones K', '2024')."""
    year_m = re.search(r"\((\d{4})\)\s*$", authors_year)
    year   = year_m.group(1) if year_m else ""
    authors = re.sub(r"\s*\(\d{4}\)\s*$", "", authors_year).strip()
    return authors, year


def extract_doi(url: str):
    url = url.strip()
    # Explicit doi.org link
    m = re.search(r"doi\.org/(.+)", url)
    if m:
        return m.group(1).rstrip("/")
    # biorxiv/medrxiv: DOI is embedded as 10.XXXX/... in the path
    m = re.search(r"(?:biorxiv|medrxiv)\.org/content/(10\.[^?#]+?)(?:v\d+)?(?:\.abstract|\.full)?$", url)
    if m:
        return m.group(1)
    # arxiv: construct canonical DOI
    m = re.search(r"arxiv\.org/abs/([^?#/]+)", url)
    if m:
        return f"10.48550/arXiv.{m.group(1)}"
    return None


# ─── Page parsing ────────────────────────────────────────────────────────────

def parse_papers_from_page(body: str) -> list[dict]:
    papers = []

    # Try new format first
    for m in PATTERN_NEW.finditer(body):
        title      = clean(m.group(1))
        authors_yr = clean(m.group(2))
        pre_link   = clean(m.group(3))   # non-empty in mid-era format
        url        = m.group(4).strip()
        link_text  = clean(m.group(5))

        if pre_link:
            # Mid-era: journal+year sit before the <a>, link text is bare URL
            journal = re.sub(r"\s*\(\d{4}\)\s*", "", pre_link).strip()
            year_m  = re.search(r"\((\d{4})\)", pre_link)
            year    = year_m.group(1) if year_m else ""
            authors = re.sub(r"\s*\(\d{4}\)\s*$", "", authors_yr).strip()
        else:
            # Standard: journal is the link text, year is in the authors line
            journal = link_text
            authors, year = split_authors_year(authors_yr)

        if title:
            papers.append({
                "title":   title,
                "authors": authors,
                "year":    year,
                "journal": journal,
                "url":     url,
                "doi":     extract_doi(url),
            })

    # Fall back to old format if new matched nothing
    if not papers:
        for m in PATTERN_OLD.finditer(body):
            authors = clean(m.group(1))
            year    = m.group(2).strip()
            url     = m.group(3).strip()
            title   = clean(m.group(4))
            journal = clean(m.group(5) or "")
            if title:
                papers.append({
                    "title":   title,
                    "authors": authors,
                    "year":    year,
                    "journal": journal,
                    "url":     url,
                    "doi":     extract_doi(url),
                })

    return papers


def parse_post_page(url: str) -> dict:
    raw  = fetch(url)
    body = html_mod.unescape(raw)

    # Extract just the post body
    m = re.search(r"<(?:main|article)[^>]*>(.*?)</(?:main|article)>", body, re.DOTALL | re.IGNORECASE)
    content = m.group(1) if m else body

    # Date from URL slug (most reliable)
    date_m   = re.search(r"/(\d{4}-\d{2}-\d{2})-list", url)
    pub_date = date_m.group(1) if date_m else ""

    # List number from URL
    num_m    = re.search(r"-list(\d+)", url)
    list_num = int(num_m.group(1)) if num_m else 0

    # Title from <h1>
    title_m = re.search(r"<h1[^>]*>(.*?)</h1>", content, re.DOTALL | re.IGNORECASE)
    title   = clean(title_m.group(1)) if title_m else f"Reading List {list_num}"

    papers = parse_papers_from_page(content)

    return {
        "list_num": list_num,
        "title":    title,
        "pub_date": pub_date,
        "url":      url,
        "papers":   papers,
    }


# ─── Main ────────────────────────────────────────────────────────────────────

def get_all_post_urls() -> list[str]:
    html   = fetch(BASE_URL)
    slugs  = re.findall(r'href="\.?/posts/([\d]{4}-[\d]{2}-[\d]{2}-list\d+[^"]*)"', html)
    seen, result = set(), []
    for slug in slugs:
        slug = slug.rstrip("/")
        if slug not in seen:
            seen.add(slug)
            result.append(f"{BASE_URL}/posts/{slug}")
    return result


def main():
    # Load existing records keyed by URL
    existing: dict[str, dict] = {}
    if OUTPUT.exists():
        try:
            for rec in json.loads(OUTPUT.read_text()):
                existing[rec["url"]] = rec
        except Exception:
            pass
    print(f"Existing cached records: {len(existing)}")

    print("Fetching post list from superlab.ca…")
    all_urls = get_all_post_urls()
    print(f"Found {len(all_urls)} posts total\n")

    new_count = 0
    for i, url in enumerate(all_urls, 1):
        slug = url.split("/")[-1]
        num_m = re.search(r"-list(\d+)", slug)
        if num_m and int(num_m.group(1)) < MIN_LIST:
            continue
        if url in existing:
            print(f"  [{i:3}] ✓ cached  {slug}")
            continue

        print(f"  [{i:3}] → fetching {slug} …", end=" ", flush=True)
        try:
            rec = parse_post_page(url)
            existing[url] = rec
            print(f"{len(rec['papers'])} papers")
            new_count += 1
            time.sleep(0.3)
        except Exception as e:
            print(f"ERROR: {e}")

    # Sort newest-first (matches RSS order)
    records = sorted(existing.values(), key=lambda r: r.get("list_num", 0), reverse=True)

    OUTPUT.write_text(json.dumps(records, indent=2, ensure_ascii=False))
    print(f"\n✓ Wrote {len(records)} records ({new_count} new) to {OUTPUT}")


if __name__ == "__main__":
    main()

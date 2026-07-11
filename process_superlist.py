#!/usr/bin/env python3
"""
process_superlist.py — Fetch superlab.ca RSS feed, parse last 10 posts, write superlist.json

Dependencies:
    pip install requests
"""

import html as html_module
import io
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

import requests

RSS_URL    = "https://superlab.ca/index.xml"
OUTPUT     = Path("superlist.json")
USER_AGENT = "neuroinspo/1.0 (mailto:changeme@example.com)"
MAX_POSTS  = 9999   # fetch everything in the feed

# Common namespace URIs
CONTENT_NS_URI = "http://purl.org/rss/1.0/modules/content/"


# ─── Helpers ─────────────────────────────────────────────────────────────────

def fetch_feed() -> str:
    r = requests.get(RSS_URL, headers={"User-Agent": USER_AGENT}, timeout=15)
    r.raise_for_status()
    return r.text


def extract_doi(url: str) -> str | None:
    """Extract a bare DOI from common URL patterns."""
    url = url.strip()
    m = re.search(r'doi\.org/(.+)', url)
    if m:
        return m.group(1).rstrip('/')
    # bioRxiv content URLs (DOI embedded)
    m = re.search(r'biorxiv\.org/content/([^?#]+?)(?:v\d+)?(?:\.abstract|\.full)?$', url)
    if m:
        return m.group(1)
    return None


def strip_tags(s: str) -> str:
    return re.sub(r'<[^>]+>', '', s).strip()


def parse_papers_from_html(content: str) -> list[dict]:
    """
    Parse paper entries from the HTML content of a superlab post.

    Each paper block looks like:
        <strong>Title</strong><br/>\n
        Authors (Year)<br/>\n
        <a href="URL">Journal ref</a>
    """
    content = html_module.unescape(content)

    papers = []
    pattern = re.compile(
        r'<strong>(.*?)</strong>\s*<br\s*/?>\s*(.*?)\s*<br\s*/?>\s*<a\s+href="([^"]+)"[^>]*>(.*?)</a>',
        re.DOTALL | re.IGNORECASE,
    )

    for m in pattern.finditer(content):
        title          = strip_tags(m.group(1)).strip()
        authors_year   = strip_tags(m.group(2)).strip()
        url            = m.group(3).strip()
        journal_ref    = strip_tags(m.group(4)).strip()

        # Split "Smith J, Jones K (2026)" → authors / year
        year_m = re.search(r'\((\d{4})\)\s*$', authors_year)
        year   = year_m.group(1) if year_m else ''
        authors = re.sub(r'\s*\(\d{4}\)\s*$', '', authors_year).strip()

        doi = extract_doi(url)

        if title:
            papers.append({
                "title":   title,
                "authors": authors,
                "year":    year,
                "journal": journal_ref,
                "url":     url,
                "doi":     doi,
            })

    return papers


def parse_date_rfc2822(s: str) -> str:
    """Convert RFC 2822 date string → YYYY-MM-DD, or return ''."""
    try:
        return parsedate_to_datetime(s).strftime('%Y-%m-%d')
    except Exception:
        return ''


def get_item_content(item: ET.Element, content_ns_uri: str) -> str:
    """Return the HTML content of an RSS item, preferring content:encoded."""
    tag = f'{{{content_ns_uri}}}encoded'
    el  = item.find(tag)
    if el is not None and el.text:
        return el.text
    el = item.find('description')
    if el is not None and el.text:
        return el.text
    return ''


# ─── Main ────────────────────────────────────────────────────────────────────

def process():
    print("Fetching RSS feed…")
    xml_text = fetch_feed()

    # Discover namespace prefixes (so we can resolve content:encoded)
    ns_map: dict[str, str] = {}
    for event, (prefix, uri) in ET.iterparse(io.StringIO(xml_text), events=['start-ns']):
        ns_map[prefix] = uri

    content_ns = ns_map.get('content', CONTENT_NS_URI)

    root    = ET.fromstring(xml_text)
    channel = root.find('channel')
    if channel is None:
        print("Error: no <channel> found in RSS feed")
        return

    items = channel.findall('item')
    print(f"Found {len(items)} items — taking the latest {MAX_POSTS}")
    items = items[:MAX_POSTS]

    # Load cached records (keyed by post URL)
    existing: dict[str, dict] = {}
    if OUTPUT.exists():
        try:
            for rec in json.loads(OUTPUT.read_text()):
                existing[rec['url']] = rec
        except Exception:
            pass

    for item in items:
        link     = (item.findtext('link') or '').strip()
        title    = (item.findtext('title') or '').strip()
        pub_raw  = (item.findtext('pubDate') or '').strip()
        pub_date = parse_date_rfc2822(pub_raw) if pub_raw else ''

        print(f"→ {title}  ({pub_date})")

        if link in existing:
            print("  ✓ cached — reached already-processed lists, stopping")
            break

        num_m    = re.search(r'(\d+)', title)
        list_num = int(num_m.group(1)) if num_m else 0

        content = get_item_content(item, content_ns)
        papers  = parse_papers_from_html(content)
        print(f"  ✓ {len(papers)} papers")

        existing[link] = {
            "list_num": list_num,
            "title":    title,
            "pub_date": pub_date,
            "url":      link,
            "papers":   papers,
        }

    # Keep all cached lists, not just the ones in the current feed window
    records = sorted(existing.values(), key=lambda r: r.get("list_num", 0), reverse=True)

    OUTPUT.write_text(json.dumps(records, indent=2, ensure_ascii=False))
    print(f"\n✓ Wrote {len(records)} reading lists to {OUTPUT}")


if __name__ == '__main__':
    process()

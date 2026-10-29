#!/usr/bin/env python3
"""
backfill_citations.py — One-time script to fill in "full_citation" (all
authors spelled out plus the abbreviated journal name, instead of just
"First et al.") for existing papers.json records that predate that field.

process_papers.py computes full_citation for any paper it fetches fresh;
this script re-fetches metadata only for records missing it, unless
--force is passed to redo every record (e.g. after a format change).

Usage:
    python3 backfill_citations.py [--force]
"""

import json
import sys
import time
from pathlib import Path

from process_papers import (
    OUTPUT_FILE,
    fetch_arxiv,
    fetch_crossref,
    format_full_citation,
    parse_pub_date,
    pick_short_journal,
)


def main():
    if not OUTPUT_FILE.exists():
        print(f"Error: {OUTPUT_FILE} not found")
        return

    force   = "--force" in sys.argv
    records = json.loads(OUTPUT_FILE.read_text())

    todo = records if force else [r for r in records if not r.get("full_citation")]
    if not todo:
        print("Nothing to backfill — every record already has a full_citation.")
        print("(pass --force to recompute all of them)")
        return
    print(f"{len(todo)} of {len(records)} records need a full_citation\n")

    for rec in todo:
        doi = rec["doi"]
        print(f"→ {doi}", end=" ")

        time.sleep(0.5)  # stay in CrossRef polite pool
        meta = fetch_crossref(doi)

        if meta is None and doi.lower().startswith("10.48550/arxiv."):
            arxiv_id = doi.split("/")[-1]
            if arxiv_id.lower().startswith("arxiv."):
                arxiv_id = arxiv_id[6:]
            meta = fetch_arxiv(arxiv_id)

        if meta is None:
            print("⚠ could not fetch metadata — skipping")
            continue

        authors  = meta.get("author", [])
        pub_date = parse_pub_date(meta) or rec.get("pub_date")
        year     = pub_date[:4] if pub_date else "n.d."

        rec["full_citation"] = format_full_citation(authors, year, pick_short_journal(meta))
        print(f"✓ {rec['full_citation']}")

    OUTPUT_FILE.write_text(json.dumps(records, indent=2, ensure_ascii=False))
    print(f"\n✓ Wrote {len(records)} papers to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()

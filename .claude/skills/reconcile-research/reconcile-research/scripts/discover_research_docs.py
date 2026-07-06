#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Discover research documents inside any research/ subdirectory under an output folder."""

import argparse
import json
import re
import sys
from pathlib import Path


def extract_updated_date(path: Path) -> str | None:
    """Return the value of `updated:` from YAML frontmatter, or None."""
    try:
        content = path.read_text(encoding="utf-8")
        if not content.startswith("---"):
            return None
        end = content.find("---", 3)
        if end == -1:
            return None
        frontmatter = content[3:end]
        match = re.search(r"^updated:\s*(.+)$", frontmatter, re.MULTILINE)
        return match.group(1).strip() if match else None
    except OSError:
        return None


def discover(output_folder: Path) -> list[dict]:
    results = []
    for research_dir in sorted(output_folder.rglob("research")):
        if not research_dir.is_dir():
            continue
        for md_file in sorted(research_dir.glob("*.md")):
            results.append({
                "path": str(md_file),
                "filename": md_file.name,
                "updated_date": extract_updated_date(md_file),
            })
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-folder", required=True, help="Root output folder to scan")
    parser.add_argument("--verbose", action="store_true", help="Print diagnostics to stderr")
    args = parser.parse_args()

    output_folder = Path(args.output_folder)
    if not output_folder.is_dir():
        print(f"Error: not a directory: {output_folder}", file=sys.stderr)
        sys.exit(2)

    results = discover(output_folder)
    if args.verbose:
        print(f"Found {len(results)} document(s)", file=sys.stderr)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()

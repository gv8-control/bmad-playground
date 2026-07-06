import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
import discover_research_docs as m


def test_extract_updated_date_present(tmp_path):
    f = tmp_path / "doc.md"
    f.write_text("---\nupdated: 2026-06-12\n---\n# Content")
    assert m.extract_updated_date(f) == "2026-06-12"


def test_extract_updated_date_no_frontmatter(tmp_path):
    f = tmp_path / "doc.md"
    f.write_text("# No frontmatter")
    assert m.extract_updated_date(f) is None


def test_extract_updated_date_key_absent(tmp_path):
    f = tmp_path / "doc.md"
    f.write_text("---\ntitle: something\n---\n# Content")
    assert m.extract_updated_date(f) is None


def test_extract_updated_date_unclosed_frontmatter(tmp_path):
    f = tmp_path / "doc.md"
    f.write_text("---\nupdated: 2026-01-01\n# no closing fence")
    assert m.extract_updated_date(f) is None


def test_discover_flat_research_dir(tmp_path):
    research = tmp_path / "research"
    research.mkdir()
    (research / "technical-foo-2026-01-01.md").write_text("---\nupdated: 2026-01-01\n---")
    (research / "market-bar-2026-02-01.md").write_text("# no frontmatter")

    results = m.discover(tmp_path)
    assert len(results) == 2
    filenames = {r["filename"] for r in results}
    assert "technical-foo-2026-01-01.md" in filenames
    assert "market-bar-2026-02-01.md" in filenames


def test_discover_nested_research_dir(tmp_path):
    nested = tmp_path / "planning-artifacts" / "research"
    nested.mkdir(parents=True)
    (nested / "technical-baz.md").write_text("")

    results = m.discover(tmp_path)
    assert len(results) == 1
    assert results[0]["filename"] == "technical-baz.md"


def test_discover_both_research_dirs(tmp_path):
    (tmp_path / "research").mkdir()
    (tmp_path / "research" / "market-a.md").write_text("")
    nested = tmp_path / "planning-artifacts" / "research"
    nested.mkdir(parents=True)
    (nested / "technical-b.md").write_text("")

    results = m.discover(tmp_path)
    assert len(results) == 2


def test_discover_empty_folder(tmp_path):
    assert m.discover(tmp_path) == []


def test_discover_ignores_non_md_files(tmp_path):
    research = tmp_path / "research"
    research.mkdir()
    (research / "notes.txt").write_text("not markdown")
    (research / "doc.md").write_text("")

    results = m.discover(tmp_path)
    assert len(results) == 1
    assert results[0]["filename"] == "doc.md"


def test_discover_updated_date_in_result(tmp_path):
    research = tmp_path / "research"
    research.mkdir()
    (research / "technical-x.md").write_text("---\nupdated: 2026-06-14\n---")

    results = m.discover(tmp_path)
    assert results[0]["updated_date"] == "2026-06-14"


def test_discover_null_updated_date_when_absent(tmp_path):
    research = tmp_path / "research"
    research.mkdir()
    (research / "market-y.md").write_text("# just content")

    results = m.discover(tmp_path)
    assert results[0]["updated_date"] is None

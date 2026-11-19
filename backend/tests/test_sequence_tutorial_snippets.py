"""The tutorials teach sequences as `occurrence def` with typed instances (phase 3).

A sysml block with `occurrence def` is checked in one of two ways:
- with a marker `[//]: # (source: <path>)` on the line before it (the convention of
  fmea.md; an HTML comment would show up as text in the viewer) it must be an ordered
  subsequence of that file, so the tutorial quotes the model verbatim;
- without a marker it is self-contained and must parse without warnings.
"""

from __future__ import annotations

import re

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser

REPO = resolve_repo_root()
TUTORIALS = REPO / "docs" / "tutorials"
FILES = ("use-cases-and-scenarios.md", "cheatsheet.md", "mbse.md")
FENCE = re.compile(r"^(?P<indent>[ ]*)```(?P<lang>[\w-]*)[ ]*$")
MARKER = re.compile(r"^\[//\]: # \((?P<tag>[^)\n]*)\)$")


def fenced_blocks(text: str):
    """(tag, lang, body) of every fenced block; the tag is the marker on the line before."""
    lines = text.split("\n")
    out, i = [], 0
    while i < len(lines):
        m = FENCE.match(lines[i])
        if m and m["lang"]:
            tag = MARKER.match(lines[i - 1]) if i else None
            j = i + 1
            while j < len(lines) and not FENCE.match(lines[j]):
                j += 1
            body = "\n".join(ln[len(m["indent"]) :] if ln.startswith(m["indent"]) else ln for ln in lines[i + 1 : j])
            out.append((tag["tag"] if tag else "", m["lang"], body))
            i = j
        i += 1
    return out


def _blocks():
    out = []
    for name in FILES:
        text = (TUTORIALS / name).read_text(encoding="utf-8")
        for tag, lang, body in fenced_blocks(text):
            if lang == "sysml" and "occurrence def" in body:
                out.append(pytest.param(name, tag, body, id=f"{name}:{body.splitlines()[0][:30]}"))
    return out


BLOCKS = _blocks()


def _significant(text: str) -> list[str]:
    lines = [ln.strip() for ln in text.split("\n")]
    return [ln for ln in lines if ln and not ln.startswith("//")]


def test_every_tutorial_teaches_sequences_with_occurrence_defs():
    assert {b.values[0] for b in BLOCKS} == set(FILES)


@pytest.mark.parametrize("name,tag,body", [b for b in BLOCKS if not b.values[1]])
def test_sequence_snippets_parse_clean(name, tag, body):
    result = SubsetSysmlParser().parse(body, "snippet.sysml")
    assert result.warnings == []


@pytest.mark.parametrize("name,tag,body", [b for b in BLOCKS if b.values[1]])
def test_sequence_snippets_follow_source(name, tag, body):
    assert tag.startswith("source: "), tag
    source = _significant((REPO / tag[len("source: ") :]).read_text(encoding="utf-8"))
    it = iter(source)
    missing = [ln for ln in _significant(body) if ln not in it]
    assert missing == [], "lines not found, in order, in the source"


def test_no_tutorial_teaches_lifeline_as_primary():
    for name in FILES:
        text = (TUTORIALS / name).read_text(encoding="utf-8")
        assert "then #reply" not in text and "#reply message" not in text, name
        for _, lang, body in fenced_blocks(text):
            if lang == "sysml":
                assert not re.search(r"^\s*lifeline \w+;", body, re.M), name
                assert "interaction def" not in body, name

"""`def` declarations carry is_definition, usages do not (all kinds)."""

from __future__ import annotations

import pytest

from adapters.parser.subset_parser import SubsetSysmlParser

CASES = [
    ("part", "part def D;", "part u;"),
    ("port", "port def D;", "port u;"),
    ("attribute", "attribute def D;", "attribute u;"),
    ("action", "action def D;", "action u;"),
    ("state", "state def D;", "state u;"),
    ("requirement", "requirement def D;", "requirement u;"),
    ("use case", "use case def D;", "use case u;"),
    ("case", "case def D;", "case u;"),
    ("interaction", "interaction def D;", "interaction u;"),
    ("interface", "interface def D;", "interface u;"),
    ("actor", "actor def D;", "actor u;"),
    ("occurrence", "occurrence def D;", "occurrence u;"),
]


@pytest.mark.parametrize("name,definition,usage", CASES, ids=[c[0] for c in CASES])
def test_def_is_flagged_and_usage_is_not(name, definition, usage):
    result = SubsetSysmlParser().parse(f"package P {{ {definition} {usage} }}", "f")
    assert result.elements["P::D"].is_definition is True, name
    assert result.elements["P::u"].is_definition is False, name

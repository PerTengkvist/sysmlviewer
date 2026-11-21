"""The dependency tree climbs the derived realization chain like the explicit one."""

from __future__ import annotations

import pytest

from domain.dependency_tree import build_dependency_tree
from test_failure_realization import EXPLICIT, STEP, START, MOVE, SEC, DRIVE, with_links
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import SysmlFile


def elements(text: str):
    r = SubsetSysmlParser().parse_project(
        [SysmlFile(id="f.sysml", name="f.sysml", content=text, path="f.sysml")]
    )
    assert r.warnings == []
    return r.elements


def shape(node):
    """The tree below a node, without relation ids (those name different dependencies)."""
    return (
        node["id"], node["label"], node["alternatives"], node["repeated"],
        sorted((shape(c) for c in node["children"]), key=repr),
    )


def climb(tree):
    return [(n["id"], n["label"]) for n in tree["up"]]


ROOTS = [
    "Eq::Log::vc", "Eq::Log::bc", f"{SEC}::auth", f"{SEC}::immo", f"{DRIVE}::motor",
    SEC, DRIVE,
]


def test_use_case_has_the_same_refiners():
    """Below a use case the step form adds the function steps under the UC steps; the refiners match."""
    for uc in (START, MOVE):
        a = build_dependency_tree(elements(EXPLICIT), uc)
        b = build_dependency_tree(elements(STEP), uc)
        assert climb(a) == climb(b)
        refiners = lambda t: sorted(
            (c["id"], c["label"]) for c in t["down"]["children"] if c["label"] == "refine"
        )
        assert refiners(a) == refiners(b) != []


@pytest.mark.parametrize("root", ROOTS)
def test_tree_equal_for_equivalent_models(root):
    a = build_dependency_tree(elements(EXPLICIT), root)
    b = build_dependency_tree(elements(STEP), root)
    assert climb(a) == climb(b)
    assert shape(a["down"]) == shape(b["down"])
    assert a["truncated"] == b["truncated"]


def test_refine_label_is_kept():
    tree = build_dependency_tree(elements(STEP), f"{SEC}::auth")
    assert (START, "refine") in climb(tree)
    start_below = build_dependency_tree(elements(STEP), START)["down"]["children"]
    assert {(c["id"], c["label"]) for c in start_below} >= {(f"{SEC}::auth", "refine"), (SEC, "refine")}


def test_explicit_and_step_merged_in_tree():
    both = with_links(EXPLICIT, "  #refine dependency from F::Security::startFlow::checkKeyInCabin to UC::Start::check;\n")
    a = build_dependency_tree(elements(EXPLICIT), START)["down"]
    b = build_dependency_tree(elements(both), START)["down"]
    refined = lambda d: [c["id"] for c in d["children"] if c["label"] == "refine"]
    assert sorted(refined(a)) == sorted(refined(b))
    assert len(refined(b)) == len(set(refined(b)))


def test_included_use_case_gets_no_refiners_of_its_own():
    """Park only includes Start: auth, immo and Security reach it through the include."""
    for text in (EXPLICIT, STEP):
        park = build_dependency_tree(elements(text), "Eq::UC::Park")["down"]["children"]
        assert [(c["id"], c["label"]) for c in park if c["label"] == "refine"] == []


def test_climb_from_a_node_in_the_step_form():
    chain = climb(build_dependency_tree(elements(STEP), f"{SEC}::auth"))
    assert chain == climb(build_dependency_tree(elements(EXPLICIT), f"{SEC}::auth"))
    assert (START, "refine") in chain

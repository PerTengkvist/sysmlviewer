"""Coverage findings of the use case realization, opt-in per use case."""

from __future__ import annotations

from pathlib import Path

from adapters.api.static_paths import resolve_repo_root
from domain.realization import derive_realization
from test_realization_derive import (
    AUTH, BC, LOCK, LOCKS, P, SEC, START, START_FLOW, UNLOCK, VC, parse, probe,
)

OTHER = (
    "  package G { part def Other { part helper { perform flow.step; } "
    "action flow { action step; } } }"
)


def codes(r, code):
    return sorted((f.element_id, f.code) for f in r.findings if f.code == code)


def test_in_scope_by_step_links():
    assert derive_realization(probe()).in_scope == {START}


def test_unrealized_system_step():
    r = derive_realization(probe())
    assert codes(r, "unrealized-system-step") == [
        (f"{START}::askForBrake", "unrealized-system-step")
    ]


def test_untraced_function_step():
    r = derive_realization(probe())
    assert codes(r, "untraced-function-step") == [
        (f"{START_FLOW}::logStart", "untraced-function-step")
    ]


def test_refine_without_step():
    other = f"{P}::G::Other"
    r = derive_realization(probe(OTHER + f"  #refine dependency from {other} to {START};"))
    assert codes(r, "refine-without-step") == [(other, "refine-without-step")]
    out_of_scope = derive_realization(probe(OTHER + f"  #refine dependency from {other} to {LOCK};"))
    assert codes(out_of_scope, "refine-without-step") == []


def test_explicit_mismatch_both_directions():
    other_node = f"{P}::G::Other::helper"
    imm = f"{SEC}::immo"
    r = derive_realization(
        probe(
            OTHER
            + f"  #refine dependency from {other_node} to {START};"
            + f"  #refine dependency from {AUTH} to {START};"
        )
    )
    mismatches = codes(r, "explicit-mismatch")
    # declared but not derived, and derived but not declared (immo)
    assert (other_node, "explicit-mismatch") in mismatches
    assert (imm, "explicit-mismatch") in mismatches
    assert (AUTH, "explicit-mismatch") not in mismatches
    # no explicit node links, no mismatch
    assert codes(derive_realization(probe()), "explicit-mismatch") == []


def test_bad_realization_end():
    model = (
        "  package R { requirement def Need; }"
        f"  #refine dependency from {START}::checkKey to {P}::R::Need;"
        f"  #refine dependency from {START} to {P}::R::Need;"
        f"  #refine dependency from {AUTH} to {START}::checkKey;"
    )
    r = derive_realization(probe(model))
    bad = codes(r, "bad-realization-end")
    assert [e for e, _ in bad] == [f"{P}::dep5", f"{P}::dep7"]  # dep6: use case -> requirement is fine


def test_coarse_realization_covers_system_steps():
    r = derive_realization(probe(f"  #refine dependency from {SEC}::unlockFlow to {START};"))
    assert codes(r, "unrealized-system-step") == []
    assert f"{START}::askForBrake" not in r.step_realizers
    assert r.coarse_realizers[START] == [f"{SEC}::unlockFlow"]


def test_electric_car_has_no_findings():
    root = resolve_repo_root() / "examples" / "electric_car"
    from domain.models import SysmlFile
    from adapters.parser.subset_parser import SubsetSysmlParser

    files = [
        SysmlFile(id=p.relative_to(root).as_posix(), name=p.name, content=p.read_text(encoding="utf-8"),
                  path=p.relative_to(root).as_posix())
        for p in sorted(root.rglob("*.sysml"))
    ]
    r = derive_realization(SubsetSysmlParser().parse_project(files).elements)
    assert r.findings == []
    assert r.in_scope == set()

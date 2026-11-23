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
    assert r.in_scope  # the car realizes its use cases step by step (plan 2)


DECISION_MODEL = """
package D {
  use case def U {
    action a; action ok; action bad;
    first start; then a; then if g then ok else bad; then done;
  }
  part def F {
    part n { perform flow.s1; perform flow.s2; perform flow.s3; }
    action flow {
      action s1; action s2; action s3;
      first start; then s1; then if gate then s2 else s3; then done;
    }
  }
  allocate F::n to L::l;
  package L { part l; }
  #refine dependency from F::flow::s1 to U::a;
}
""".replace("F::flow::s1", "F::flow::s1")


def test_decision_nodes_are_not_steps():
    model = DECISION_MODEL.replace("F::flow::s1", "D::F::flow::s1").replace("to U::a", "to D::U::a")
    r = derive_realization(parse(model))
    assert r.system_steps["D::U"] == ["D::U::a", "D::U::ok", "D::U::bad"]
    assert "D::U::g" not in r.system_steps["D::U"]
    flagged = {f.element_id for f in r.findings}
    assert "D::U::g" not in flagged
    assert "D::F::flow::gate" not in flagged
    assert "D::F::flow::s1" not in flagged


def test_requirement_target_is_never_a_realization_finding():
    model = (
        "  package R { requirement def Need; }"
        f"  #refine dependency from {START_FLOW}::logStart to {P}::R::Need;"
    )
    r = derive_realization(probe(model))
    assert codes(r, "bad-realization-end") == []
    unscoped = derive_realization(parse(
        "package Q { requirement def Need; part def F { action fl { action s; } } use case def U { action a; }"
        " #refine dependency from F::fl::s to Need; #refine dependency from F::fl to Need; }"
    ))
    assert codes(unscoped, "bad-realization-end") == []


BIG = (
    "  package UC2 { use case def Big { include use case UC::%s; action d1; } }"
    f"  #refine dependency from {SEC}::unlockFlow::release to {P}::UC2::Big::d1;"
)


def test_included_explicit_function_is_not_refine_without_step():
    other = f"{P}::G::Other"
    r = derive_realization(
        probe(OTHER + f"  #refine dependency from {other} to {LOCK};" + BIG % "Lock")
    )
    assert f"{P}::UC2::Big" in r.in_scope
    assert r.via_include[f"{P}::UC2::Big"] >= {other}
    assert codes(r, "refine-without-step") == []


def test_included_nodes_are_not_explicit_mismatches():
    helper = f"{P}::G::Other::helper"
    r = derive_realization(
        probe(OTHER + f"  #refine dependency from {helper} to {P}::UC2::Big;" + BIG % "Start")
    )
    flagged = {f.element_id for f in r.findings if f.code == "explicit-mismatch"}
    assert {AUTH, f"{SEC}::immo"} <= set(r.via_include[f"{P}::UC2::Big"])
    assert AUTH not in flagged and f"{SEC}::immo" not in flagged
    assert helper in flagged  # a real mismatch is still reported

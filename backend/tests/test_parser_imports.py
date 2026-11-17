"""Imports: owner namespaces and endpoint resolution through imports."""

from __future__ import annotations

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind, SysmlFile


def _parse(text: str):
    return SubsetSysmlParser().parse(text, "f")


def test_import_in_package_records_owner():
    r = _parse("package App { private import Lib::*; }")
    assert r.imports == [
        {"fileId": "f", "visibility": "private", "path": "Lib::*", "line": 1, "ownerId": "App"}
    ]


def test_file_level_import_has_no_owner():
    r = _parse("private import Lib::*;\npackage App {}")
    assert r.imports[0]["ownerId"] is None


def test_nested_import_records_inner_owner():
    r = _parse("package Root { package App { import Lib::Sub; } }")
    assert r.imports[0]["ownerId"] == "Root::App"
    assert r.imports[0]["visibility"] == "public"


def test_import_in_part_def_records_owner():
    r = _parse("package P { part def D { private import Lib::*; } }")
    assert r.imports[0]["ownerId"] == "P::D"


def test_recursive_import_paths_are_kept():
    r = _parse("package App { import Lib::**; import Lib::*::**; }")
    assert [i["path"] for i in r.imports] == ["Lib::**", "Lib::*::**"]


def test_parse_project_records_owner_for_both_files():
    files = [
        SysmlFile(id="a", name="a", content="package A { import X::*; }", path="a"),
        SysmlFile(id="b", name="b", content="import Y::*;\npackage B { private import Z::*; }", path="b"),
    ]
    r = SubsetSysmlParser().parse_project(files)
    assert [(i["fileId"], i["ownerId"]) for i in r.imports] == [
        ("a", "A"),
        ("b", None),
        ("b", "B"),
    ]


# -- endpoint resolution through imports (step 4) ---------------------------

import pytest

from domain.models import ArtifactKind

LIB = "package Lib {\n  package Sub {\n    part def P;\n    part p;\n  }\n}"


def _project(*texts: str):
    files = [
        SysmlFile(id=f"f{i}", name=f"f{i}", content=t, path=f"f{i}")
        for i, t in enumerate(texts)
    ]
    return SubsetSysmlParser().parse_project(files)


def _app(*lines: str) -> str:
    return "package App {\n" + "\n".join(lines) + "\n}"


_DEP = "part a;\ndependency from a to {ref};"

VERIFIED_CASES = [
    # id, texts, dep id, expected source, expected target
    (1, [LIB, _app("private import Lib::*;", _DEP.format(ref="Sub::p"))],
     "App::dep1", "App::a", "Lib::Sub::p"),
    (2, [LIB, _app("private import Lib::Sub;", _DEP.format(ref="Sub::p"))],
     "App::dep1", "App::a", "Lib::Sub::p"),
    (3, [LIB, _app("private import Lib::Sub::*;", _DEP.format(ref="p"))],
     "App::dep1", "App::a", "Lib::Sub::p"),
    (4, [LIB, _app(_DEP.format(ref="Lib::Sub::p"))],
     "App::dep1", "App::a", "Lib::Sub::p"),
    (5, [LIB + "\nprivate import Lib::*;\n" + _app(_DEP.format(ref="Sub::p"))],
     "App::dep1", "App::a", "Lib::Sub::p"),
    (6, [_app(_DEP.format(ref="Sub::p"), "package Sub { part p; }")],
     "App::dep1", "App::a", "App::Sub::p"),
    (7, [LIB, _app("private import Lib::*;", "package Sub { part p; }",
                   _DEP.format(ref="Sub::p"))],
     "App::dep1", "App::a", "App::Sub::p"),
    (8, ["package A { part x; }\npackage B { part x; }\n"
         + _app("private import A::*;", _DEP.format(ref="x"))],
     "App::dep1", "App::a", "A::x"),
    (9, [LIB, "package Other { part p; }\n"
         + _app("private import Lib::Sub::*;", _DEP.format(ref="p"))],
     "App::dep1", "App::a", "Lib::Sub::p"),
    (10, [LIB, "package Root {\n package Sub { part p; }\n package App {\n"
          "  private import Lib::*;\n  " + _DEP.format(ref="Sub::p") + "\n }\n}"],
     "Root::App::dep1", "Root::App::a", "Lib::Sub::p"),
]


@pytest.mark.parametrize(
    "texts,dep_id,source,target",
    [c[1:] for c in VERIFIED_CASES],
    ids=[f"case{c[0]}" for c in VERIFIED_CASES],
)
def test_verified_case(texts, dep_id, source, target):
    result = _project(*texts)
    dep = result.elements[dep_id]
    assert (dep.source_id, dep.target_id) == (source, target)


@pytest.mark.parametrize("case", [5, 6, 8], ids=lambda n: f"case{n}")
def test_verified_single_file_case(case):
    _, texts, dep_id, source, target = next(c for c in VERIFIED_CASES if c[0] == case)
    dep = _parse(texts[0]).elements[dep_id]
    assert (dep.source_id, dep.target_id) == (source, target)


RELATION_LINES = [
    ("dependency", "dependency from a to p;", "target"),
    ("implements", "#implements dependency from a to p;", "target"),
    ("refine_short", "#refine dependency a to p;", "target"),
    ("satisfy", "satisfy p by a;", "target"),
    ("allocate", "allocate a to p;", "target"),
    ("connection", "connection c connect a to p;", "target"),
    ("bind", "bind a = p;", "target"),
    ("flow", "flow from a to p;", "target"),
    ("interface", "interface i connect a to p;", "target"),
]


@pytest.mark.parametrize(
    "line", [r[1] for r in RELATION_LINES], ids=[r[0] for r in RELATION_LINES]
)
def test_each_relation_kind_resolves_through_import(line):
    result = _project(LIB, _app("private import Lib::Sub::*;", "part a;", line))
    rels = [
        e
        for e in result.elements.values()
        if e.parent_id == "App" and e.source_id is not None and e.target_id is not None
    ]
    assert len(rels) == 1
    rel = rels[0]
    role = next(r[2] for r in RELATION_LINES if r[1] == line)
    other = "source" if role == "target" else "target"
    assert getattr(rel, f"{role}_id") == "Lib::Sub::p"
    assert getattr(rel, f"{other}_id") == "App::a"


def test_connection_end_head_through_import():
    result = _project(
        "package Lib { part hub { port y; } }",
        _app("private import Lib::*;", "part a { port x; }", "connection c connect a.x to hub.y;"),
    )
    c = result.elements["App::c"]
    assert c.source_id == "App::a::x"
    assert c.target_id == "Lib::hub::y"


def test_multi_target_dependency():
    result = _project(
        LIB,
        _app("private import Lib::*;", "part a;", "dependency from a to Sub::p, Sub::P;"),
    )
    assert result.elements["App::dep1"].target_id == "Lib::Sub::p"
    assert result.elements["App::dep2"].target_id == "Lib::Sub::P"


def test_relation_ids_unchanged():
    result = _project(
        LIB,
        _app(
            "private import Lib::Sub::*;",
            "part a;",
            "part req;",
            "dependency from a to p;",
            "connect a to p;",
            "allocate a to p;",
            "bind a = p;",
            "flow from a to p;",
            "satisfy p by a;",
        ),
    )
    ids = {e.id for e in result.elements.values() if e.id.startswith("App::")}
    assert {
        "App::dep1",
        "App::conn1",
        "App::alloc1",
        "App::bind1",
        "App::flow1",
        "App::satisfy_1",
    } <= ids


def test_inherited_relation_retargeted_after_link():
    usages = "package Main {\n  private import Types::*;\n  part rack : GenericRack;\n}\n"
    types = (
        "package Types {\n"
        "  part def PDU { port pwrIn; port pwrOut; }\n"
        "  part def GenericRack {\n"
        "    part pduA : PDU;\n    part pduB : PDU;\n"
        "    connection bus connect pduA.pwrOut to pduB.pwrIn;\n"
        "  }\n}\n"
    )
    bus = _project(usages, types).elements["Main::rack::bus"]
    assert bus.kind == ArtifactKind.CONNECTION
    assert bus.source_id == "Main::rack::pduA::pwrOut"
    assert bus.target_id == "Main::rack::pduB::pwrIn"


def test_local_flows_unchanged():
    text = (
        "package P {\n"
        "  use case def Buy {\n    first start;\n    then action a;\n    then done;\n"
        "    succession s1 first a then done;\n  }\n"
        "  action def Flow {\n    action x;\n    action y;\n    first x then y;\n  }\n}"
    )
    for result in (_parse(text), _project(text)):
        got = sorted(
            (e.id, e.source_id, e.target_id)
            for e in result.elements.values()
            if e.kind == ArtifactKind.SUCCESSION
        )
        assert got == [
            ("P::Buy::s1", "P::Buy::a", "P::Buy::done"),
            ("P::Buy::succ1", "P::Buy::start", "P::Buy::a"),
            ("P::Buy::succ2", "P::Buy::a", "P::Buy::done"),
            ("P::Flow::succ1", "P::Flow::x", "P::Flow::y"),
        ]


# -- warnings for unresolved and ambiguous ends (step 5) --------------------

AMBIGUOUS = (
    "package A { part x; }\n"
    "package B { part x; }\n"
    "package App {\n"
    "private import A::*;\n"
    "private import B::*;\n"
    "dependency from a to x;\n"
    "part a;\n"
    "}"
)


def test_ambiguous_endpoint_warns_with_candidates():
    result = _project(AMBIGUOUS)
    assert (
        "line 6: dependency target 'x' is ambiguous: "
        "A::x (import line 4), B::x (import line 5) (in 'App::dep1')"
    ) in result.warnings
    # Never a wrong element: the end keeps the legacy value.
    assert result.elements["App::dep1"].target_id == "App::x"


def test_unresolved_endpoint_warns_with_line():
    result = _project("package App {\npart a;\ndependency from a to nope;\n}")
    assert result.elements["App::dep1"].target_id == "App::nope"
    assert (
        "line 3: dependency target not found: nope (in 'App::dep1')"
    ) in result.warnings


def test_unique_name_fallback_removed():
    result = _project("package A { part q; } package B { part x; dependency from x to q; }")
    assert result.elements["B::dep1"].target_id == "B::q"
    assert "line 1: dependency target not found: q (in 'B::dep1')" in result.warnings


def test_unresolved_end_never_lands_on_real_element():
    # App has its own Sub (without p); the top-level Sub::p must not be picked up
    # by the legacy fallback of the unresolved reference.
    result = _project(
        "package Sub { part p; }\n"
        "package App {\npart a;\npackage Sub { }\ndependency from a to Sub::p;\n}"
    )
    target = result.elements["App::dep1"].target_id
    assert target != "Sub::p"
    assert target == "App::Sub::p"
    assert any("dependency target not found: Sub::p" in w for w in result.warnings)


def test_pending_path_into_inherited_port_is_silent():
    result = _project(
        "package P {\n"
        "  part def E { port powerIn; }\n"
        "  part def Car {\n    part engine : E;\n    part other;\n"
        "    connection c connect engine.powerIn to other;\n  }\n}"
    )
    c = result.elements["P::Car::c"]
    assert c.source_id == "P::Car::engine::powerIn"
    assert c.source_id in result.elements
    assert result.warnings == []


def test_pending_path_missing_after_inheritance_warns():
    content = (
        "package P {\n  port def hport { port hport_l1; }\n"
        "  part def Parent { port layered_port : hport; }\n"
        "  part a : Parent;\n  part b : Parent;\n"
        "  connection c connect a.layered_port.missing to b.layered_port.hport_l1;\n}"
    )
    result = _project(content)
    assert (
        "line 6: connection source not found: a.layered_port.missing (in 'P::c')"
    ) in result.warnings


def test_allocation_unresolved_warns():
    result = _project("package App {\npart a;\nallocate a to nope;\n}")
    assert any("allocation target not found: nope" in w for w in result.warnings)


def test_single_file_parse_warns_on_ambiguity_only():
    assert any("is ambiguous" in w for w in _parse(AMBIGUOUS).warnings)
    r = _parse("package App {\npart a;\ndependency from a to nope;\n}")
    assert not any("not found" in w for w in r.warnings)


def test_resolution_warning_goes_to_referencing_file():
    lib = SysmlFile(id="lib", name="lib", content=LIB, path="lib")
    app = SysmlFile(
        id="app",
        name="app",
        content="package App {\npart a;\ndependency from a to nope;\n}",
        path="app",
    )
    result = SubsetSysmlParser().parse_project([lib, app])
    assert any("target not found: nope" in w for w in result.file_warnings["app"])
    assert not any("nope" in w for w in result.file_warnings["lib"])


# -- include and objective (step 6) -----------------------------------------


def test_include_through_import():
    result = _project(
        "package Shared { use case def Login; }",
        "package App { private import Shared::*; use case def Buy { include use case Login; } }",
    )
    inc = result.elements["App::Buy::include_Login"]
    assert inc.target_id == "Shared::Login"
    assert inc.source_id == "App::Buy"


def test_objective_through_import():
    result = _project(
        "package Reqs { requirement def Fast; }",
        "package App { private import Reqs::*; use case def Go { objective Fast; } }",
    )
    assert result.elements["App::Go::objective_1"].target_id == "Reqs::Fast"


def test_include_unresolved_warns():
    result = _project(
        "package App {\nuse case def Buy {\ninclude use case Nope;\n}\n}"
    )
    assert (
        "line 3: include target not found: Nope (in 'App::Buy::include_Nope')"
    ) in result.warnings
    assert result.elements["App::Buy::include_Nope"].target_id == "App::Buy::Nope"


# -- types, specialization, subsetting and perform (step 9) -----------------


def test_type_ref_uses_import_not_first_same_name():
    result = _project(
        "package Other { part def Box { port wrong; } }\n"
        "package Types { part def Box { port out; } }\n"
        "package Main { private import Types::*; part box : Box; }"
    )
    assert "Main::box::out" in result.elements
    assert "Main::box::wrong" not in result.elements


def test_type_ref_through_member_import():
    result = _project(
        "package Other { part def Box { port wrong; } }\n"
        "package Types { part def Box { port out; } }\n"
        "package Main { private import Types::Box; part box : Box; }"
    )
    assert "Main::box::out" in result.elements
    assert "Main::box::wrong" not in result.elements


def test_own_definition_shadows_imported_type():
    result = _project(
        "package Types { part def Box { port imported; } }\n"
        "package Main { private import Types::*; "
        "part def Box { port own; } part box : Box; }"
    )
    assert "Main::box::own" in result.elements
    assert "Main::box::imported" not in result.elements


def test_type_ref_found_in_enclosing_namespace():
    result = _project(
        "package Other { part def Box { port wrong; } }\n"
        "package Outer { part def Box { port right; } "
        "package Inner { part box : Box; } }"
    )
    assert "Outer::Inner::box::right" in result.elements
    assert "Outer::Inner::box::wrong" not in result.elements


def test_ambiguous_type_ref_warns_and_picks_nothing():
    result = _project(
        "package A { part def Box { port fromA; } }\n"
        "package B { part def Box { port fromB; } }\n"
        "package Main { private import A::*; private import B::*; part box : Box; }"
    )
    assert "Main::box::fromA" not in result.elements
    assert "Main::box::fromB" not in result.elements
    assert any(
        "type reference 'Box'" in w and "ambiguous" in w and "A::Box" in w and "B::Box" in w
        for w in result.warnings
    )


def test_type_not_imported_is_not_found_by_name_elsewhere():
    result = _project(
        "package Other { part def Box { port wrong; } }\n"
        "package Main { part box : Box; }"
    )
    # Box lives in Other and is neither imported nor enclosing: unreachable.
    assert "Main::box::wrong" not in result.elements


def test_nested_copied_part_resolves_type_from_original_namespace():
    result = _project(
        "package Lib { part def Wheel { port hub; } "
        "part def Car { part w : Wheel; } }\n"
        "package Other { part def Wheel { port wrong; } }\n"
        "package App { private import Lib::*; part car : Car; }"
    )
    assert "App::car::w::hub" in result.elements
    assert "App::car::w::wrong" not in result.elements


def test_unresolved_library_type_warning_policy_unchanged():
    result = _project("package App { part p : Unknown; part v : GeneralView; }")
    assert any("Type reference 'Unknown'" in w for w in result.warnings)
    assert not any("GeneralView" in w for w in result.warnings)


def test_specialization_target_through_import():
    result = _project(
        "package Base { part def Vehicle; }",
        "package App { private import Base::*; part def Car :> Vehicle; }",
    )
    rel = result.elements["App::Car_specializes_Vehicle"]
    assert rel.kind == ArtifactKind.SPECIALIZATION
    assert rel.source_id == "App::Car"
    assert rel.target_id == "Base::Vehicle"


def test_subsetting_qualified_unchanged():
    result = _project(
        "package LogicalArchitecture { part def Car { part vehicleController; } }\n"
        "package P { #Logical ref part x :> LogicalArchitecture::Car::vehicleController; }"
    )
    rel = result.elements["P::x_subsets_LogicalArchitecture_Car_vehicleController"]
    assert rel.source_id == "P::x"
    assert rel.target_id == "LogicalArchitecture::Car::vehicleController"


def test_perform_import_respects_owner_namespace():
    result = _project(
        "package Lib { action payStep; }",
        "package Other { private import Lib::*; }\n"
        "package App { part def S { part c { perform payStep; } } }",
    )
    perform = next(
        e for e in result.elements.values() if "perform" in e.metadata_keywords
    )
    assert perform.perform_target_id is None
    # Deviation from the plan: `payStep` names an element somewhere, so the
    # unresolved perform is silent (the pre-existing name check); no warning.
    assert not any("perform target not found" in w for w in result.warnings)


def test_part_usage_records_resolved_type_target():
    result = _project(
        "package Other { part def Box; }\n"
        "package Types { part def Box; }\n"
        "package Main { private import Types::*; part box : Box; part n : Nope; }"
    )
    assert result.elements["Main::box"].type_target_id == "Types::Box"
    assert result.elements["Main::box"].to_dict()["typeTargetId"] == "Types::Box"
    assert result.elements["Main::n"].type_target_id is None
    assert "typeTargetId" not in result.elements["Main::n"].to_dict()


def test_type_target_id_survives_dict_roundtrip():
    from domain.models import SemanticElement

    result = _project("package P { part def B; part b : B; }")
    again = SemanticElement.from_dict(result.elements["P::b"].to_dict())
    assert again.type_target_id == "P::B"


def test_ambiguous_type_warning_is_reported_once():
    result = _project(
        "package A { part def Box { port a; } }\n"
        "package B { part def Box { port b; } }\n"
        "package Main { private import A::*; private import B::*; part box : Box; }"
    )
    hits = [w for w in result.warnings if "type reference 'Box'" in w and "ambiguous" in w]
    assert len(hits) == 1


def test_nested_ports_example_types_resolve_through_import():
    from pathlib import Path

    root = Path(__file__).resolve().parents[2] / "examples" / "diagrams"
    files = [
        SysmlFile(
            id=p.relative_to(root).as_posix(),
            name=p.name,
            content=p.read_text(encoding="utf-8"),
            path=p.relative_to(root).as_posix(),
        )
        for p in sorted(root.rglob("*.sysml"))
    ]
    els = SubsetSysmlParser().parse_project(files).elements
    pkg = "HierarchicalPartsPkg"
    assert (
        els[f"{pkg}::NestedPortsExample::serviceA"].type_target_id
        == f"{pkg}::NestedPorts::ServiceA"
    )
    assert (
        els[f"{pkg}::NestedPortsExample::client"].type_target_id
        == f"{pkg}::NestedPorts::Client"
    )


# -- review findings ----------------------------------------------------------


def test_declared_action_with_perform_keyword_is_not_hidden():
    result = _project(
        "package P { part x; action pay; "
        "action def Flow { action pay { action sub; } first start; "
        "then perform pay; dependency from pay to x; "
        "dependency from pay.sub to x; } }"
    )
    deps = [
        e for e in result.elements.values()
        if e.kind == ArtifactKind.DEPENDENCY and e.parent_id == "P::Flow"
    ]
    assert sorted(d.source_id for d in deps) == ["P::Flow::pay", "P::Flow::pay::sub"]


def test_recursive_import_ignores_perform_stubs():
    result = _project(
        "package Lib { use case def Accelerate; "
        "use case def Drive { action go; then perform Accelerate; } }\n"
        "package App { private import Lib::**; part a; dependency from a to Accelerate; }"
    )
    dep = result.elements["App::dep1"]
    assert dep.target_id == "Lib::Accelerate"
    assert not any("ambiguous" in w for w in result.warnings)


def test_recursive_import_follows_public_reexport():
    result = _project(
        "package Base { part b; }\n"
        "package Lib { public import Base::*; }\n"
        "package App { private import Lib::**; part a; dependency from a to b; }"
    )
    assert result.elements["App::dep1"].target_id == "Base::b"


def test_unresolved_simple_name_never_lands_on_perform_stub():
    result = _project(
        "package P { part x; action def Flow { first start; then perform pay; "
        "dependency from x to pay; } }"
    )
    dep = next(e for e in result.elements.values() if e.kind == ArtifactKind.DEPENDENCY)
    assert dep.target_id != "P::Flow::pay"
    assert any("dependency target not found: pay" in w for w in result.warnings)


def test_unresolved_simple_name_never_lands_on_stub_at_file_level():
    result = _parse(
        "package App { part x; action def Flow { first start; then perform pay; "
        "dependency from x to pay; } }"
    )
    dep = next(e for e in result.elements.values() if e.kind == ArtifactKind.DEPENDENCY)
    assert dep.target_id != "App::Flow::pay"


def test_ambiguous_tail_segment_is_reported_ambiguous():
    result = _project(
        "package A { part x; }\npackage B { part x; }\n"
        "package Lib { public import A::*; public import B::*; }\n"
        "package App { part a; dependency from a to Lib::x; }"
    )
    assert any(
        "dependency target 'Lib::x' is ambiguous" in w and "A::x" in w and "B::x" in w
        for w in result.warnings
    )
    assert not any("not found: Lib::x" in w for w in result.warnings)


def test_pending_ref_does_not_overwrite_element_from_another_file():
    result = _project(
        "package App { part a; part b; dependency from a to b; }",
        "package App { part dep1; }",
    )
    part = result.elements["App::dep1"]
    assert part.kind == ArtifactKind.PART
    assert part.source_id is None and part.target_id is None


def test_chain_head_inherited_in_typed_part_beats_outer_namesake():
    result = _project(
        "package P {\n"
        "  part def E { port powerIn; part sub { port q; } }\n"
        "  part sub { port q; }\n"
        "  part def Car { part engine : E; part c; "
        "connection k connect c to engine.sub.q; }\n"
        "}"
    )
    k = result.elements["P::Car::k"]
    assert k.target_id == "P::Car::engine::sub::q"


def test_typed_by_resolved_for_ports_attributes_and_other_usages():
    result = _project(
        "package Other { port def Pd; }\n"
        "package Lib { port def Pd; attribute def At; "
        "use case def Uc; action def Ac; requirement def Rq; }\n"
        "package App { private import Lib::*; "
        "part def Q { port p : Pd; attribute a : At; } "
        "action act : Ac; requirement rq : Rq; use case uc : Uc; }"
    )
    els = result.elements
    assert els["App::Q::p"].type_target_id == "Lib::Pd"
    assert els["App::Q::a"].type_target_id == "Lib::At"
    assert els["App::act"].type_target_id == "Lib::Ac"
    assert els["App::rq"].type_target_id == "Lib::Rq"
    assert els["App::uc"].type_target_id == "Lib::Uc"


def test_typed_by_requires_matching_kind():
    result = _project(
        "package Lib { part def Pd; }\n"
        "package App { private import Lib::*; part def Q { port p : Pd; } }"
    )
    assert result.elements["App::Q::p"].type_target_id is None


# -- second review ------------------------------------------------------------


def test_usage_named_like_its_type_still_resolves_outwards():
    result = _project(
        "package P { port def sP1; part def Car { port sP1 : sP1; "
        "part Engine : Engine; } part def Engine { port p; } }"
    )
    assert result.elements["P::Car::sP1"].type_target_id == "P::sP1"
    assert result.elements["P::Car::Engine"].type_target_id == "P::Engine"
    assert "P::Car::Engine::p" in result.elements


def test_usage_named_like_its_type_resolves_through_import():
    result = _project(
        "package Lib { part def Engine { port p; } }",
        "package App { private import Lib::*; part def Car { part Engine : Engine; } }",
    )
    assert result.elements["App::Car::Engine"].type_target_id == "Lib::Engine"
    assert "App::Car::Engine::p" in result.elements


def test_untyped_usage_is_not_a_definition():
    result = _project(
        "package Lib { part def Engine { port p; } }\n"
        "package App { private import Lib::*; part Engine; "
        "part car { part e : Engine; } }"
    )
    assert result.elements["App::car::e"].type_target_id == "Lib::Engine"


def test_specialized_attribute_def_is_accepted_as_type():
    result = _project(
        "package P { attribute def M; attribute def Mass :> M; "
        "part def Q { attribute m : Mass; } }"
    )
    assert result.elements["P::Q::m"].type_target_id == "P::Mass"


def test_unreachable_type_warns_with_line_in_the_referencing_file():
    result = _project(
        "package Other { part def Box; }",
        "package Main {\n  part box : Box;\n}",
    )
    text = (
        "line 2: type 'Box' is not visible from 'Main::box' "
        "(Other::Box exists; add an import or qualify the name)"
    )
    assert text in result.warnings
    assert text in result.file_warnings["f1"]
    assert text not in result.file_warnings.get("f0", [])


def test_unreachable_type_warning_scenario_from_review():
    result = _project(
        "package Types { part def Car { part engine { port p; } } }\n"
        "package App { part engine { port p; } part x; "
        "part car : Car { connection k connect engine.p to x; } }"
    )
    assert any("type 'Car' is not visible from 'App::car'" in w for w in result.warnings)


def test_ambiguous_type_warning_has_line_and_file_for_any_kind():
    result = _project(
        "package A { port def Pd; }\npackage B { port def Pd; }",
        "package Main {\n  private import A::*;\n  private import B::*;\n"
        "  part def Q { port p : Pd; }\n}",
    )
    ws = [w for w in result.file_warnings["f1"] if "ambiguous" in w and "'Pd'" in w]
    assert len(ws) == 1 and ws[0].startswith("line 4: type reference 'Pd' is ambiguous")
    assert not [w for w in result.file_warnings.get("f0", []) if "ambiguous" in w]


def test_qualified_type_gives_no_false_unresolved_warning():
    result = _project(
        "package Lib { part def Box; }\npackage App { part b : Lib::Box; }"
    )
    assert not any("could not be resolved" in w for w in result.warnings)


def test_reachable_and_library_types_give_no_visibility_warning():
    result = _project(
        "package Lib { part def Box; }\n"
        "package App { private import Lib::*; part b : Box; view v : GeneralView; }"
    )
    assert not any("not visible" in w for w in result.warnings)


def test_free_id_never_collides():
    from adapters.parser.subset_parser import _free_id

    taken = {"S::x", "?x", "?x#2"}
    assert _free_id(["S::x", "?x"], taken) == "?x#3"
    assert _free_id(["S::y", "?y"], taken) == "S::y"


# -- third review ---------------------------------------------------------------


def test_qualified_unresolved_type_gets_no_visibility_warning():
    result = _project(
        "package Other { part def Box; }\npackage App { part b : StdLib::Box; }"
    )
    assert not any("not visible" in w for w in result.warnings)


def test_old_unresolved_warning_is_silent_after_a_visibility_warning():
    result = _project(
        "package Other { part def Box; }\npackage App { part b : Box; }"
    )
    assert any("type 'Box' is not visible" in w for w in result.warnings)
    assert not any("Type reference 'Box'" in w for w in result.warnings)


def test_old_unresolved_warning_is_silent_after_an_ambiguity_warning():
    result = _project(
        "package A { part def Box; }\npackage B { part def Box; }\n"
        "package Main { private import A::*; private import B::*; part b : Box; }"
    )
    assert any("ambiguous" in w for w in result.warnings)
    assert not any("Type reference 'Box'" in w for w in result.warnings)


def test_visibility_warning_says_exist_for_several_candidates():
    result = _project(
        "package A { part def Box; }\npackage B { part def Box; }\n"
        "package Main { part b : Box; }"
    )
    w = next(w for w in result.warnings if "not visible" in w)
    assert "exist;" in w and "exists" not in w


def test_specialization_of_same_named_def_resolves_to_the_import():
    result = _project(
        "package Lib { part def Engine { port p; } }",
        "package App { private import Lib::*; part def Engine :> Engine; "
        "part e : Engine; }",
    )
    rel = result.elements["App::Engine_specializes_Engine"]
    assert rel.source_id == "App::Engine"
    assert rel.target_id == "Lib::Engine"
    assert result.elements["App::e"].type_target_id == "App::Engine"
    assert "App::e::p" in result.elements


def test_def_typed_by_itself_name_skips_itself():
    result = _project(
        "package Lib { part def Engine { port p; } }",
        "package App { private import Lib::*; part def Engine :> Engine; "
        "part e : Lib::Engine; }",
    )
    assert result.elements["App::e"].type_target_id == "Lib::Engine"


def test_parse_returns_a_plain_dict():
    result = _parse("package P { part def A; }")
    assert type(result.elements) is dict

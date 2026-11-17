"""Imports: owner namespaces and endpoint resolution through imports."""

from __future__ import annotations

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import SysmlFile


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
    ends = {rel.source_id, rel.target_id}
    assert ends == {"App::a", "Lib::Sub::p"}


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

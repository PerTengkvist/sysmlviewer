"""Domain-level name resolution: namespaces, imports, re-export."""

from __future__ import annotations

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.name_resolution import ImportSpec, NameResolver, Resolution

LIB = "package Lib { package Sub { part def P; part p; } }"


def _model(*texts: str) -> NameResolver:
    """Parse each text as file f0, f1, ... without the link phase (pre-inheritance)."""
    elements = {}
    imports = []
    for i, text in enumerate(texts):
        state = SubsetSysmlParser()._parse_declarations(text, f"f{i}", defer_link=True)
        elements.update(state.elements)
        imports.extend(
            ImportSpec(
                owner_id=imp.owner_id,
                file_id=imp.file_id,
                path=imp.path,
                visibility=imp.visibility,
                line=imp.line,
            )
            for imp in state.imports
        )
    return NameResolver(elements, imports)


def _id(res: Resolution) -> str | None:
    return res.element_id


def test_owned_member():
    r = _model("package P { part a; part b; }")
    assert _id(r.resolve_name("b", "P", "f0")) == "P::b"


def test_enclosing_namespace():
    r = _model("package P { part x; package Q { } }")
    assert _id(r.resolve_name("x", "P::Q", "f0")) == "P::x"


def test_inner_member_shadows_outer():
    r = _model("package P { part x; package Q { part x; } }")
    assert _id(r.resolve_name("x", "P::Q", "f0")) == "P::Q::x"


def test_root_sees_top_level_of_other_file():
    r = _model(LIB, "package App { }")
    assert _id(r.resolve_name("Lib", "App", "f1")) == "Lib"


def test_qualified_follows_ownership():
    r = _model(LIB, "package App { }")
    assert _id(r.resolve_name("Lib::Sub::p", "App", "f1")) == "Lib::Sub::p"


def test_qualified_does_not_backtrack():
    r = _model(LIB, "package App { package Sub { } }")
    assert _id(r.resolve_name("Sub::p", "App", "f1")) is None


def test_unknown_name():
    r = _model("package P { }")
    assert r.resolve_name("nope", "P", "f0") == Resolution(None, (), False)


def test_inherited_member_counts_as_own():
    r = _model("package P { part x; part def D { part x; } part u : D { } }")
    res = r.resolve_name("x", "P::u", "f0")
    assert _id(res) == "P::u::x"


def test_feature_chain_relative_to_owner():
    r = _model("package P { part def Car { part engine { port powerIn; } } }")
    res = r.resolve_feature_ref("engine.powerIn", "P::Car", "f0")
    assert _id(res) == "P::Car::engine::powerIn"
    assert res.pending_path is False


def test_feature_chain_pending_tail():
    r = _model(
        "package P { part def E { port powerIn; } part def Car { part engine : E; } }"
    )
    res = r.resolve_feature_ref("engine.powerIn", "P::Car", "f0")
    assert _id(res) == "P::Car::engine::powerIn"
    assert res.pending_path is True


def test_feature_chain_unresolved_head():
    r = _model("package P { part def Car { part engine; } }")
    assert _id(r.resolve_feature_ref("motor.p", "P::Car", "f0")) is None


def test_qualified_head_with_chain():
    r = _model(
        "package Arch { part def Car { part engine { port powerIn; } } }",
        "package Req { }",
    )
    res = r.resolve_feature_ref("Arch::Car::engine.powerIn", "Req", "f1")
    assert _id(res) == "Arch::Car::engine::powerIn"


# -- imports (step 3) -------------------------------------------------------


def _app(*lines: str, extra: str = "") -> str:
    return "package App {\n" + "\n".join(lines) + "\n}\n" + extra


def test_case_1_import_star_makes_subpackage_visible():
    r = _model(LIB, _app("private import Lib::*;", "part a;"))
    assert _id(r.resolve_name("Sub::p", "App", "f1")) == "Lib::Sub::p"


def test_case_2_member_import():
    r = _model(LIB, _app("private import Lib::Sub;", "part a;"))
    assert _id(r.resolve_name("Sub::p", "App", "f1")) == "Lib::Sub::p"


def test_case_3_namespace_import():
    r = _model(LIB, _app("private import Lib::Sub::*;", "part a;"))
    assert _id(r.resolve_name("p", "App", "f1")) == "Lib::Sub::p"


def test_case_5_file_level_import():
    r = _model(LIB + "\nprivate import Lib::*;\n" + _app("part a;"))
    assert _id(r.resolve_name("Sub::p", "App", "f0")) == "Lib::Sub::p"


def test_case_7_own_member_shadows_import():
    r = _model(
        LIB,
        _app("private import Lib::*;", "package Sub { part p; }", "part a;"),
    )
    assert _id(r.resolve_name("Sub::p", "App", "f1")) == "App::Sub::p"


def test_case_8_imported_member_in_single_file():
    r = _model(
        "package A { part x; }\npackage B { part x; }\n"
        + _app("private import A::*;", "part a;")
    )
    assert _id(r.resolve_name("x", "App", "f0")) == "A::x"


def test_case_9_unrelated_package_is_not_visible():
    r = _model(
        LIB,
        "package Other { part p; }\n" + _app("private import Lib::Sub::*;", "part a;"),
    )
    assert _id(r.resolve_name("p", "App", "f1")) == "Lib::Sub::p"


def test_case_10_import_goes_before_enclosing_namespace():
    r = _model(
        LIB,
        "package Root {\n package Sub { part p; }\n package App {\n"
        " private import Lib::*;\n part a;\n }\n}",
    )
    assert _id(r.resolve_name("Sub::p", "Root::App", "f1")) == "Lib::Sub::p"


def test_import_visible_in_nested_namespace():
    r = _model(
        LIB, _app("private import Lib::*;", "package Inner { part z; }", "part a;")
    )
    assert _id(r.resolve_name("Sub::p", "App::Inner", "f1")) == "Lib::Sub::p"


def test_recursive_import_reaches_any_depth():
    r = _model(
        "package Lib { package A { package B { part deep; } } }",
        _app("import Lib::**;"),
    )
    assert _id(r.resolve_name("deep", "App", "f1")) == "Lib::A::B::deep"


def test_recursive_import_includes_namespace_itself():
    r = _model(LIB, _app("import Lib::Sub::**;"))
    assert _id(r.resolve_name("Sub", "App", "f1")) == "Lib::Sub"


def test_members_recursive_excludes_namespace_itself():
    r = _model(LIB, _app("import Lib::Sub::*::**;"))
    assert _id(r.resolve_name("Sub", "App", "f1")) is None
    assert _id(r.resolve_name("p", "App", "f1")) == "Lib::Sub::p"


def test_recursive_import_ambiguity():
    r = _model(
        "package Lib { package A { part x; } package B { part x; } }",
        _app("import Lib::**;"),
    )
    res = r.resolve_name("x", "App", "f1")
    assert res.element_id is None
    assert res.candidates == (("Lib::A::x", 2), ("Lib::B::x", 2))


BASE = "package Base { part b; }\n"


def test_public_reexport():
    r = _model(
        BASE,
        "package Lib { public import Base::*; }",
        _app("private import Lib::*;"),
    )
    assert _id(r.resolve_name("b", "App", "f2")) == "Base::b"


def test_private_not_reexported():
    r = _model(
        BASE,
        "package Lib { private import Base::*; }",
        _app("private import Lib::*;"),
    )
    assert _id(r.resolve_name("b", "App", "f2")) is None


def test_bare_import_reexports():
    r = _model(
        BASE, "package Lib { import Base::*; }", _app("private import Lib::*;")
    )
    assert _id(r.resolve_name("b", "App", "f2")) == "Base::b"


def test_transitive_public_reexport():
    r = _model(
        BASE,
        "package Mid { public import Base::*; }",
        "package Lib { public import Mid::*; }",
        _app("private import Lib::*;"),
    )
    assert _id(r.resolve_name("b", "App", "f3")) == "Base::b"


def test_qualified_through_public_reexport():
    r = _model(BASE, "package Lib { public import Base::*; }", _app("part a;"))
    assert _id(r.resolve_name("Lib::b", "App", "f2")) == "Base::b"


def test_reexport_cycle_terminates():
    r = _model(
        "package A { public import B::*; part a; }\n"
        "package B { public import A::*; part b; }"
    )
    assert _id(r.resolve_name("b", "A", "f0")) == "B::b"
    assert _id(r.resolve_name("zzz", "A", "f0")) is None


def test_two_imports_same_level_ambiguous():
    r = _model(
        "package A { part x; }\npackage B { part x; }\n"
        "package App {\nprivate import A::*;\nprivate import B::*;\npart a;\n}"
    )
    res = r.resolve_name("x", "App", "f0")
    assert res.element_id is None
    assert res.candidates == (("A::x", 4), ("B::x", 5))


def test_same_element_twice_not_ambiguous():
    r = _model(
        "package A { part x; }\n"
        "package App {\nprivate import A::*;\nprivate import A::x;\n}"
    )
    assert _id(r.resolve_name("x", "App", "f0")) == "A::x"


def test_inner_level_wins_over_ambiguous_outer():
    r = _model(
        "package A { part x; }\npackage B { part x; }\n"
        "package Outer {\nprivate import A::*;\nprivate import B::*;\n"
        "package App {\nprivate import A::*;\n}\n}"
    )
    assert _id(r.resolve_name("x", "Outer::App", "f0")) == "A::x"


def test_own_member_beats_ambiguous_imports():
    r = _model(
        "package A { part x; }\npackage B { part x; }\n"
        "package App {\nprivate import A::*;\nprivate import B::*;\npart x;\n}"
    )
    assert _id(r.resolve_name("x", "App", "f0")) == "App::x"


def test_import_in_other_package_does_not_apply():
    r = _model(
        LIB,
        "package Other { private import Lib::Sub::*; }\n" + _app("part a;"),
    )
    assert _id(r.resolve_name("p", "App", "f1")) is None


def test_file_level_import_only_in_its_file():
    r = _model(LIB, "private import Lib::*;\npackage X { }", "package Y { }")
    assert _id(r.resolve_name("Sub", "X", "f1")) == "Lib::Sub"
    assert _id(r.resolve_name("Sub", "Y", "f2")) is None


def test_unresolvable_import_path_is_ignored():
    r = _model(_app("import Nope::*;"))
    assert _id(r.resolve_name("x", "App", "f0")) is None

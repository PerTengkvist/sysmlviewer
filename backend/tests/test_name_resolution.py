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

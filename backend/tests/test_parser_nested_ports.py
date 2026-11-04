from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind


def _parse(content: str, file_id: str = "nested.sysml"):
    return SubsetSysmlParser().parse(content, file_id=file_id)


NESTED_PORT_MODEL = """
package P {
  port def l1;
  port def l2;
  port def hport {
    port hport_l1 : l1;
    port hport_l2 : l2;
  }
  part def Child {
    port l1p : l1;
  }
  part def Parent {
    port layered_port : hport;
    part c1 : Child;
    bind layered_port.hport_l1 = c1.l1p;
  }
  part a : Parent;
  part b : Parent;
  connection c connect a.layered_port.hport_l1 to b.layered_port.hport_l1;
}
"""


def test_port_def_body_creates_nested_ports():
    result = _parse(NESTED_PORT_MODEL)
    els = result.elements

    assert "P::hport" in els
    assert els["P::hport"].kind == ArtifactKind.PORT
    assert els["P::hport"].type_ref is None

    l1 = els["P::hport::hport_l1"]
    l2 = els["P::hport::hport_l2"]
    assert l1.kind == ArtifactKind.PORT
    assert l1.parent_id == "P::hport"
    assert l1.type_ref == "l1"
    assert l2.kind == ArtifactKind.PORT
    assert l2.parent_id == "P::hport"
    assert l2.type_ref == "l2"


def test_port_usage_expands_nested_ports_after_inheritance():
    result = _parse(NESTED_PORT_MODEL)
    els = result.elements

    for owner in ("P::Parent", "P::a", "P::b"):
        usage = els[f"{owner}::layered_port"]
        assert usage.kind == ArtifactKind.PORT
        assert usage.type_ref == "hport"
        nested_l1 = els[f"{owner}::layered_port::hport_l1"]
        nested_l2 = els[f"{owner}::layered_port::hport_l2"]
        assert nested_l1.parent_id == f"{owner}::layered_port"
        assert nested_l2.parent_id == f"{owner}::layered_port"
        assert nested_l1.type_ref == "l1"
        assert nested_l2.type_ref == "l2"


def test_bind_resolves_nested_port_endpoints():
    result = _parse(NESTED_PORT_MODEL)
    bindings = [
        e for e in result.elements.values() if e.kind == ArtifactKind.BINDING
    ]
    assert len(bindings) >= 1
    # Binding on Parent def; usages may also inherit copies.
    parent_bind = next(
        b for b in bindings if b.parent_id == "P::Parent" or "Parent" in (b.id or "")
    )
    assert parent_bind.source_id == "P::Parent::layered_port::hport_l1"
    assert parent_bind.target_id == "P::Parent::c1::l1p"
    assert parent_bind.source_id in result.elements
    assert parent_bind.target_id in result.elements


def test_connection_resolves_nested_port_endpoints():
    result = _parse(NESTED_PORT_MODEL)
    conns = [
        e for e in result.elements.values() if e.kind == ArtifactKind.CONNECTION
    ]
    assert len(conns) >= 1
    c = next(e for e in conns if e.name == "c")
    assert c.source_id == "P::a::layered_port::hport_l1"
    assert c.target_id == "P::b::layered_port::hport_l1"
    assert c.source_id in result.elements
    assert c.target_id in result.elements


def test_inherited_bind_to_nested_port_copies_onto_usage():
    """Bindings that target nested port leaves must copy onto typed usages."""
    content = """
package P {
  port def l1;
  port def hport {
    port hport_l1 : l1;
  }
  part def Child {
    port l1p : l1;
  }
  part def Parent {
    port layered_port : hport;
    part c1 : Child;
    bind layered_port.hport_l1 = c1.l1p;
  }
  part a : Parent;
}
"""
    result = _parse(content)
    bind = result.elements.get("P::a::bind1") or next(
        (
            e
            for e in result.elements.values()
            if e.kind == ArtifactKind.BINDING and e.parent_id == "P::a"
        ),
        None,
    )
    assert bind is not None, sorted(
        k for k in result.elements if k.startswith("P::a")
    )
    assert bind.source_id == "P::a::layered_port::hport_l1"
    assert bind.target_id == "P::a::c1::l1p"
    assert bind.source_id in result.elements
    assert bind.target_id in result.elements


def test_collect_depth_includes_nested_ports_under_usages():
    from domain.details import collect_artifacts_to_depth

    result = _parse(NESTED_PORT_MODEL)
    included = collect_artifacts_to_depth(result.elements, "P", 3)
    assert "P::a::layered_port::hport_l1" in included
    assert "P::b::layered_port::hport_l1" in included
    assert any(
        e.kind == ArtifactKind.CONNECTION
        and e.id in included
        for e in result.elements.values()
    )


def test_unresolved_nested_endpoint_warns():
    from domain.models import SysmlFile

    content = """
package P {
  port def hport {
    port hport_l1;
  }
  part def Parent {
    port layered_port : hport;
  }
  part a : Parent;
  part b : Parent;
  connection c connect a.layered_port.missing to b.layered_port.hport_l1;
}
"""
    # Endpoint warnings fire at project link time (same as satisfy/dependency).
    result = SubsetSysmlParser().parse_project(
        [
            SysmlFile(
                id="nested.sysml",
                name="nested.sysml",
                content=content,
                path="nested.sysml",
            )
        ]
    )
    assert any(
        "connection source not found" in w and "missing" in w for w in result.warnings
    ), result.warnings

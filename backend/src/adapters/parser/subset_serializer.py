"""Emit SysML v2 textual subset from semantic elements for one file."""

from __future__ import annotations

from domain.models import ArtifactKind, SemanticElement


def serialize_file(
    semantic: dict[str, SemanticElement],
    file_id: str,
) -> str:
    """Regenerate SysML text for all elements belonging to file_id."""
    roots = [
        e
        for e in semantic.values()
        if e.file_id == file_id and (not e.parent_id or semantic.get(e.parent_id) is None or semantic[e.parent_id].file_id != file_id)
    ]
    # Prefer true roots (no parent) among file elements
    file_els = [e for e in semantic.values() if e.file_id == file_id]
    roots = [e for e in file_els if not e.parent_id or e.parent_id not in {x.id for x in file_els}]
    roots.sort(key=lambda e: e.id)

    lines: list[str] = []
    for root in roots:
        _emit_element(semantic, root, lines, indent=0)
        lines.append("")
    text = "\n".join(lines).rstrip() + "\n"
    return text


def _emit_element(
    semantic: dict[str, SemanticElement],
    el: SemanticElement,
    lines: list[str],
    indent: int,
) -> None:
    pad = "  " * indent
    if el.kind == ArtifactKind.PACKAGE:
        lines.append(f"{pad}package {el.name} {{")
        _emit_children(semantic, el, lines, indent + 1)
        lines.append(f"{pad}}}")
        return

    if el.kind == ArtifactKind.PART:
        parent = semantic.get(el.parent_id) if el.parent_id else None
        nested = _structural_children(semantic, el)
        if el.type_ref:
            if nested:
                lines.append(f"{pad}part {el.name} : {el.type_ref} {{")
                _emit_children(semantic, el, lines, indent + 1)
                lines.append(f"{pad}}}")
            else:
                lines.append(f"{pad}part {el.name} : {el.type_ref};")
            return
        # Nested under a part without type → usage/composite part (not a def)
        if parent and parent.kind == ArtifactKind.PART:
            if nested:
                lines.append(f"{pad}part {el.name} {{")
                _emit_children(semantic, el, lines, indent + 1)
                lines.append(f"{pad}}}")
            else:
                lines.append(f"{pad}part {el.name};")
            return
        lines.append(f"{pad}part def {el.name} {{")
        _emit_children(semantic, el, lines, indent + 1)
        lines.append(f"{pad}}}")
        return

    if el.kind == ArtifactKind.PORT:
        bits = [f"{pad}port {el.name}"]
        if el.type_ref:
            bits.append(f" : {el.type_ref}")
        if el.default_value:
            bits.append(f" = {el.default_value}")
        lines.append("".join(bits) + ";")
        return

    if el.kind == ArtifactKind.ATTRIBUTE:
        if el.type_ref or el.default_value:
            bits = [f"{pad}attribute {el.name}"]
            if el.type_ref:
                bits.append(f" : {el.type_ref}")
            if el.default_value:
                bits.append(f" = {el.default_value}")
            lines.append("".join(bits) + ";")
        else:
            lines.append(f"{pad}attribute def {el.name};")
        return

    if el.kind == ArtifactKind.CONNECTION:
        src = _endpoint_ref(semantic, el, el.source_id)
        tgt = _endpoint_ref(semantic, el, el.target_id)
        if src and tgt:
            lines.append(f"{pad}connection {el.name} connect {src} to {tgt};")
        return

    if el.kind == ArtifactKind.VIEW:
        type_bit = f" : {el.type_ref}" if el.type_ref else ""
        lines.append(f"{pad}view {el.name}{type_bit} {{")
        if el.expose_ref:
            exposed = semantic.get(el.expose_ref)
            name = exposed.name if exposed else el.expose_ref.split("::")[-1]
            lines.append(f"{pad}  expose {name};")
        _emit_children(semantic, el, lines, indent + 1, skip_kinds=set())
        lines.append(f"{pad}}}")
        return


def _structural_children(
    semantic: dict[str, SemanticElement], el: SemanticElement
) -> list[SemanticElement]:
    out = []
    for cid in el.children:
        child = semantic.get(cid)
        if child and child.kind != ArtifactKind.VIEW:
            out.append(child)
    return out


def _emit_children(
    semantic: dict[str, SemanticElement],
    el: SemanticElement,
    lines: list[str],
    indent: int,
    skip_kinds: set[ArtifactKind] | None = None,
) -> None:
    skip_kinds = skip_kinds or set()
    children = []
    for cid in el.children:
        child = semantic.get(cid)
        if not child or child.kind in skip_kinds:
            continue
        children.append(child)
    # Stable order: parts, ports, attributes, connections, views
    order = {
        ArtifactKind.PART: 0,
        ArtifactKind.PORT: 1,
        ArtifactKind.ATTRIBUTE: 2,
        ArtifactKind.CONNECTION: 3,
        ArtifactKind.VIEW: 4,
        ArtifactKind.PACKAGE: 5,
    }
    children.sort(key=lambda c: (order.get(c.kind, 9), c.id))
    for child in children:
        _emit_element(semantic, child, lines, indent)


def _endpoint_ref(
    semantic: dict[str, SemanticElement],
    conn: SemanticElement,
    port_id: str | None,
) -> str | None:
    if not port_id:
        return None
    port = semantic.get(port_id)
    if not port:
        return port_id.split("::")[-1]
    # Relative to connection parent: childPart.port or port
    parent_id = conn.parent_id
    if port.parent_id and port.parent_id != parent_id:
        owner = semantic.get(port.parent_id)
        if owner:
            return f"{owner.name}.{port.name}"
    return port.name

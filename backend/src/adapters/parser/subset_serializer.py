"""Emit SysML v2 textual subset from semantic elements for one file."""

from __future__ import annotations

import re

from domain.models import ArtifactKind, SemanticElement


_IMPORT_LINE_RE = re.compile(
    r"^\s*(?:(?:private|public)\s+)?import\s+.+?;\s*$", re.MULTILINE
)


def extract_import_block(content: str) -> str:
    """Return leading import statements from existing SysML text."""
    if not content:
        return ""
    lines: list[str] = []
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            if lines:
                break
            continue
        if _IMPORT_LINE_RE.match(stripped) or stripped.startswith("//"):
            lines.append(line.rstrip())
            continue
        break
    if not lines:
        return ""
    return "\n".join(lines).rstrip() + "\n\n"


def serialize_file(
    semantic: dict[str, SemanticElement],
    file_id: str,
    *,
    previous_content: str | None = None,
) -> str:
    """Regenerate SysML text for all elements belonging to file_id."""
    # Prefer true roots (no parent) among file elements
    file_els = [e for e in semantic.values() if e.file_id == file_id]
    roots = [
        e
        for e in file_els
        if not e.parent_id or e.parent_id not in {x.id for x in file_els}
    ]
    roots.sort(key=lambda e: e.id)

    lines: list[str] = []
    for root in roots:
        _emit_element(semantic, root, lines, indent=0)
        lines.append("")
    body = "\n".join(lines).rstrip() + "\n"
    prefix = extract_import_block(previous_content or "")
    return prefix + body


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
        mult = f" [{el.multiplicity}]" if el.multiplicity else ""
        if el.type_ref:
            if nested:
                lines.append(f"{pad}part {el.name}{mult} : {el.type_ref} {{")
                _emit_children(semantic, el, lines, indent + 1)
                lines.append(f"{pad}}}")
            else:
                lines.append(f"{pad}part {el.name}{mult} : {el.type_ref};")
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

    if el.kind == ArtifactKind.DEPENDENCY:
        src = _endpoint_ref(semantic, el, el.source_id)
        tgt = _endpoint_ref(semantic, el, el.target_id)
        if src and tgt:
            lines.append(f"{pad}dependency {el.name} from {src} to {tgt};")
        return

    if el.kind == ArtifactKind.ALLOCATION:
        src = _endpoint_ref(semantic, el, el.source_id)
        tgt = _endpoint_ref(semantic, el, el.target_id)
        if src and tgt:
            lines.append(f"{pad}allocate {src} to {tgt};")
        return

    if el.kind == ArtifactKind.BINDING:
        src = _endpoint_ref(semantic, el, el.source_id)
        tgt = _endpoint_ref(semantic, el, el.target_id)
        if src and tgt:
            lines.append(f"{pad}bind {src} = {tgt};")
        return

    if el.kind == ArtifactKind.FLOW:
        src = _endpoint_ref(semantic, el, el.source_id)
        tgt = _endpoint_ref(semantic, el, el.target_id)
        if src and tgt:
            lines.append(f"{pad}flow {el.name} from {src} to {tgt};")
        return

    if el.kind == ArtifactKind.SPECIALIZATION:
        return

    if el.kind == ArtifactKind.SUBSETTING:
        return

    if el.kind == ArtifactKind.REDEFINITION:
        return

    if el.kind == ArtifactKind.VIEW:
        type_bit = f" : {el.type_ref}" if el.type_ref else ""
        lines.append(f"{pad}view def {el.name}{type_bit} {{")
        if el.expose_ref:
            exposed = semantic.get(el.expose_ref)
            name = exposed.name if exposed else el.expose_ref.split("::")[-1]
            lines.append(f"{pad}  expose {name};")
        _emit_children(semantic, el, lines, indent + 1, skip_kinds=set())
        lines.append(f"{pad}}}")
        return

    if el.kind == ArtifactKind.INTERACTION:
        type_bit = f" : {el.type_ref}" if el.type_ref else ""
        lines.append(f"{pad}interaction def {el.name}{type_bit} {{")
        _emit_children(semantic, el, lines, indent + 1)
        lines.append(f"{pad}}}")
        return

    if el.kind == ArtifactKind.LIFELINE:
        lines.append(f"{pad}lifeline {el.name};")
        return

    if el.kind == ArtifactKind.MESSAGE:
        src = semantic.get(el.source_id) if el.source_id else None
        tgt = semantic.get(el.target_id) if el.target_id else None
        src_n = src.name if src else (el.source_id or "?").split("::")[-1]
        tgt_n = tgt.name if tgt else (el.target_id or "?").split("::")[-1]
        payload = el.type_ref or el.name
        lines.append(f"{pad}message {payload} from {src_n} to {tgt_n};")
        return

    if el.kind == ArtifactKind.STATE:
        nested = _structural_children(semantic, el)
        type_bit = f" : {el.type_ref}" if el.type_ref else ""
        if nested or any(
            semantic.get(cid) and semantic[cid].kind == ArtifactKind.TRANSITION
            for cid in el.children
        ):
            keyword = "state def" if not el.parent_id or (
                semantic.get(el.parent_id) and semantic[el.parent_id].kind == ArtifactKind.PACKAGE
            ) else "state"
            if el.parent_id and semantic.get(el.parent_id) and semantic[el.parent_id].kind == ArtifactKind.STATE:
                keyword = "state"
            lines.append(f"{pad}{keyword} {el.name}{type_bit} {{")
            _emit_children(semantic, el, lines, indent + 1)
            lines.append(f"{pad}}}")
        else:
            lines.append(f"{pad}state {el.name}{type_bit};")
        return

    if el.kind == ArtifactKind.TRANSITION:
        src = semantic.get(el.source_id) if el.source_id else None
        tgt = semantic.get(el.target_id) if el.target_id else None
        src_n = src.name if src else (el.source_id or "?").split("::")[-1]
        tgt_n = tgt.name if tgt else (el.target_id or "?").split("::")[-1]
        lines.append(f"{pad}transition {el.name} from {src_n} to {tgt_n};")
        return

    if el.kind == ArtifactKind.ACTION:
        nested = _structural_children(semantic, el)
        type_bit = f" : {el.type_ref}" if el.type_ref else ""
        parent = semantic.get(el.parent_id) if el.parent_id else None
        if nested or any(
            semantic.get(cid)
            and semantic[cid].kind
            in {ArtifactKind.SUCCESSION, ArtifactKind.ACTION}
            for cid in el.children
        ):
            keyword = "action def" if not parent or parent.kind == ArtifactKind.PACKAGE else "action"
            lines.append(f"{pad}{keyword} {el.name}{type_bit} {{")
            _emit_children(semantic, el, lines, indent + 1)
            lines.append(f"{pad}}}")
        else:
            lines.append(f"{pad}action {el.name}{type_bit};")
        return

    if el.kind == ArtifactKind.SUCCESSION:
        src = semantic.get(el.source_id) if el.source_id else None
        tgt = semantic.get(el.target_id) if el.target_id else None
        src_n = src.name if src else (el.source_id or "?").split("::")[-1]
        tgt_n = tgt.name if tgt else (el.target_id or "?").split("::")[-1]
        lines.append(f"{pad}succession {el.name} first {src_n} then {tgt_n};")
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
        ArtifactKind.DEPENDENCY: 4,
        ArtifactKind.ALLOCATION: 5,
        ArtifactKind.BINDING: 6,
        ArtifactKind.FLOW: 7,
        ArtifactKind.INTERACTION: 8,
        ArtifactKind.LIFELINE: 9,
        ArtifactKind.MESSAGE: 10,
        ArtifactKind.STATE: 11,
        ArtifactKind.TRANSITION: 12,
        ArtifactKind.ACTION: 13,
        ArtifactKind.SUCCESSION: 14,
        ArtifactKind.VIEW: 15,
        ArtifactKind.PACKAGE: 16,
    }
    children.sort(key=lambda c: (order.get(c.kind, 9), c.id))
    for child in children:
        _emit_element(semantic, child, lines, indent)


def _endpoint_ref(
    semantic: dict[str, SemanticElement],
    conn: SemanticElement,
    endpoint_id: str | None,
) -> str | None:
    if not endpoint_id:
        return None
    endpoint = semantic.get(endpoint_id)
    if not endpoint:
        return endpoint_id.split("::")[-1]
    # Relative to connection parent: childPart.port or port
    parent_id = conn.parent_id
    if endpoint.parent_id and endpoint.parent_id != parent_id:
        owner = semantic.get(endpoint.parent_id)
        if owner and owner.parent_id == parent_id:
            return f"{owner.name}.{endpoint.name}"
        if owner:
            return f"{owner.name}.{endpoint.name}"
    return endpoint.name

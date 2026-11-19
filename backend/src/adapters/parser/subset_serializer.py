"""Emit SysML v2 textual subset from semantic elements for one file."""

from __future__ import annotations

import re

from domain.expose import SUFFIX as EXPOSE_SUFFIX
from domain.expose import kind_of
from domain.models import ArtifactKind, SemanticElement
from domain.occurrence import MATERIALIZED, in_occurrence


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
        sequence_part = in_occurrence(semantic, el.id)
        if sequence_part and _is_materialized(semantic, el):
            return
        nested = _structural_children(semantic, el)
        if sequence_part:
            nested = [
                c
                for c in nested
                if c.kind not in _RELATION_KINDS and not _is_materialized(semantic, c)
            ]
        links = _feature_links(semantic, el) if sequence_part else ""
        mult = f" [{el.multiplicity}]" if el.multiplicity else ""
        meta = "".join(f"#{kw} " for kw in el.metadata_keywords)
        ref = "ref " if el.is_reference else ""
        # `abstract` comes before prefix metadata (`abstract #kw part def X`).
        meta = _abstract_prefix(el) + meta
        if el.type_ref:
            if nested:
                lines.append(
                    f"{pad}{meta}{ref}part {el.name}{mult} : {el.type_ref}{links} {{"
                )
                _emit_children(semantic, el, lines, indent + 1)
                lines.append(f"{pad}}}")
            else:
                lines.append(
                    f"{pad}{meta}{ref}part {el.name}{mult} : {el.type_ref}{links};"
                )
            return
        # Nested under a part without type → usage/composite part (not a def)
        if parent and parent.kind in (ArtifactKind.PART, ArtifactKind.OCCURRENCE):
            if nested:
                lines.append(f"{pad}{meta}{ref}part {el.name}{links} {{")
                _emit_children(semantic, el, lines, indent + 1)
                lines.append(f"{pad}}}")
            else:
                lines.append(f"{pad}{meta}{ref}part {el.name}{links};")
            return
        lines.append(f"{pad}{meta}{ref}part def {el.name} {{")
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

    if el.kind == ArtifactKind.INTERFACE:
        if el.source_id and el.target_id:
            src = _endpoint_ref(semantic, el, el.source_id)
            tgt = _endpoint_ref(semantic, el, el.target_id)
            if src and tgt:
                type_bit = f":{el.type_ref}" if el.type_ref else ""
                lines.append(
                    f"{pad}interface {el.name}{type_bit} connect {src} to {tgt};"
                )
            return
        type_bit = f" : {el.type_ref}" if el.type_ref else ""
        lines.append(f"{pad}interface {el.name}{type_bit};")
        return

    if el.kind == ArtifactKind.DEPENDENCY:
        src = _endpoint_ref(semantic, el, el.source_id)
        tgt = _endpoint_ref(semantic, el, el.target_id)
        if src and tgt:
            prefix = "".join(f"#{kw} " for kw in el.metadata_keywords)
            auto_name = bool(re.fullmatch(r"dep\d+", el.name or ""))
            if auto_name:
                lines.append(f"{pad}{prefix}dependency from {src} to {tgt};")
            else:
                lines.append(f"{pad}{prefix}dependency {el.name} from {src} to {tgt};")
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
        refs = list(el.expose_refs) or (
            [el.expose_ref] if el.expose_ref else []
        )
        for ref in refs:
            exposed = semantic.get(ref)
            name = exposed.name if exposed else ref.split("::")[-1]
            suffix = EXPOSE_SUFFIX.get(kind_of(el.expose_kinds, ref), "")
            lines.append(f"{pad}  expose {name}{suffix};")
        for filt in el.view_filters or []:
            op = filt.get("op")
            if op == "metaclass" and filt.get("ref"):
                lines.append(f"{pad}  filter @{filt['ref']};")
            elif op == "metaclassAny" and filt.get("refs"):
                joined = " or ".join(f"@{r}" for r in filt["refs"])
                lines.append(f"{pad}  filter {joined};")
            elif op == "nameStartsWith" and "prefix" in filt:
                prefix = str(filt["prefix"]).replace('"', '\\"')
                lines.append(f'{pad}  filter name.startsWith("{prefix}");')
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

    if el.kind == ArtifactKind.OCCURRENCE:
        type_bit = f" {':>' if el.is_definition else ':'} {el.type_ref}" if el.type_ref else ""
        keyword = "occurrence def" if el.is_definition else "occurrence"
        if el.children:
            lines.append(f"{pad}{keyword} {el.name}{type_bit} {{")
            _emit_children(semantic, el, lines, indent + 1)
            lines.append(f"{pad}}}")
        else:
            lines.append(f"{pad}{keyword} {el.name}{type_bit};")
        return

    if el.kind == ArtifactKind.EVENT_OCCURRENCE:
        type_bit = f" : {el.type_ref}" if el.type_ref else ""
        lines.append(f"{pad}event occurrence {el.name}{type_bit};")
        return

    if el.kind == ArtifactKind.MESSAGE and _occurrence_message(semantic, el):
        occ_id = el.parent_id or ""
        prefix = "".join(f"#{kw} " for kw in (el.metadata_keywords or []))
        name = "" if re.fullmatch(r"msg\d+", el.name) else f" {el.name}"
        payload = f" of {el.type_ref}" if el.type_ref else ""
        src = _message_end(occ_id, el.source_id, el.source_event_id)
        tgt = _message_end(occ_id, el.target_id, el.target_event_id)
        lines.append(f"{pad}{prefix}message{name}{payload} from {src} to {tgt};")
        return

    if el.kind == ArtifactKind.MESSAGE:
        src = semantic.get(el.source_id) if el.source_id else None
        tgt = semantic.get(el.target_id) if el.target_id else None
        src_n = src.name if src else (el.source_id or "?").split("::")[-1]
        tgt_n = tgt.name if tgt else (el.target_id or "?").split("::")[-1]
        payload = el.type_ref or el.name
        prefix = "".join(f"#{kw} " for kw in (el.metadata_keywords or []))
        lines.append(f"{pad}{prefix}message {payload} from {src_n} to {tgt_n};")
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
            lines.append(f"{pad}{_abstract_prefix(el)}{keyword} {el.name}{type_bit} {{")
            _emit_children(semantic, el, lines, indent + 1)
            lines.append(f"{pad}}}")
        elif el.is_abstract:
            lines.append(f"{pad}abstract action def {el.name}{type_bit};")
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


_RELATION_KINDS = {
    ArtifactKind.SPECIALIZATION,
    ArtifactKind.SUBSETTING,
    ArtifactKind.REDEFINITION,
}


def _is_materialized(semantic: dict[str, SemanticElement], part: SemanticElement) -> bool:
    """A part the parser made for a feature a message end passes through."""
    return part.kind == ArtifactKind.PART and any(
        rel.kind == ArtifactKind.REDEFINITION
        and rel.source_id == part.id
        and MATERIALIZED in rel.metadata_keywords
        for rel in (semantic.get(c) for c in semantic.get(part.parent_id or "", part).children)
        if rel is not None
    )


def _feature_links(semantic: dict[str, SemanticElement], part: SemanticElement) -> str:
    """` :> target` / ` :>> target` for the subsetting and redefinition of a part."""
    parent = semantic.get(part.parent_id or "")
    out = ""
    for cid in parent.children if parent else []:
        rel = semantic.get(cid)
        if (
            rel is None
            or rel.source_id != part.id
            or rel.kind not in (ArtifactKind.SUBSETTING, ArtifactKind.REDEFINITION)
            or MATERIALIZED in rel.metadata_keywords
        ):
            continue
        target = rel.type_ref or rel.target_id or ""  # a chain is kept as written
        if target not in semantic and not rel.type_ref:
            prefix = (part.parent_id or "") + "::"
            target = target[len(prefix) :] if target.startswith(prefix) else target.lstrip("?")
        op = ":>" if rel.kind == ArtifactKind.SUBSETTING else ":>>"
        out += f" {op} {target}"
    return out


def _occurrence_message(semantic: dict[str, SemanticElement], msg: SemanticElement) -> bool:
    parent = semantic.get(msg.parent_id or "")
    return parent is not None and parent.kind == ArtifactKind.OCCURRENCE


def _message_end(occ_id: str, part_id: str | None, event_id: str | None) -> str:
    prefix = occ_id + "::"
    path = (part_id or "?")
    path = path[len(prefix) :] if path.startswith(prefix) else path.split("::")[-1]
    path = path.replace("::", ".")
    if event_id:
        path += "." + event_id.rsplit("::", 1)[-1]
    return path


def _abstract_prefix(el: SemanticElement) -> str:
    return "abstract " if el.is_abstract else ""


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
    order[ArtifactKind.OCCURRENCE] = 8
    order[ArtifactKind.EVENT_OCCURRENCE] = 2.5
    # Messages keep their declaration order (sorting on id puts msg10 before msg2).
    children.sort(
        key=lambda c: (order.get(c.kind, 9), "" if c.kind == ArtifactKind.MESSAGE else c.id)
    )
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

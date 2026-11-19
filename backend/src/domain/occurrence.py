"""Sequence diagrams written as `occurrence def` (SysML v2).

An occurrence def owns the participants of a scenario as part usages; the
parts that messages reference are the lifelines. This module finds the owning
occurrence of an element, follows feature chains (`car.keyFob`) and resolves
the ends of a message (`from a.sent to car.keyFob.pressed`) to a lifeline and
an event. Pure domain logic: it reads the semantic graph and decides, the
parser creates what is asked for.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from domain.models import ArtifactKind, SemanticElement
from domain.name_resolution import NameResolver

# Metadata keyword on the redefinition that ties a parser-made part to its original.
MATERIALIZED = "materialized"

_PART = frozenset({ArtifactKind.PART})
_EVENT = frozenset({ArtifactKind.EVENT_OCCURRENCE})


def owning_occurrence(
    semantic: Mapping[str, SemanticElement], element_id: str
) -> str | None:
    """Nearest ancestor of kind OCCURRENCE (through `parent_id`), else None."""
    seen: set[str] = set()
    el = semantic.get(element_id)
    while el is not None and el.parent_id and el.parent_id not in seen:
        seen.add(el.parent_id)
        parent = semantic.get(el.parent_id)
        if parent is None:
            return None
        if parent.kind == ArtifactKind.OCCURRENCE:
            return parent.id
        el = parent
    return None


def in_occurrence(semantic: Mapping[str, SemanticElement], element_id: str) -> bool:
    return owning_occurrence(semantic, element_id) is not None


class FeatureIndex:
    """Member lookup through type, generals, subsetting and redefinition targets."""

    def __init__(self, semantic: Mapping[str, SemanticElement]) -> None:
        self.semantic = semantic
        # Relationship elements by source id; the target is read when used, so a
        # target the parser fixes up later (a feature chain) is seen.
        self._generals: dict[str, list[SemanticElement]] = {}
        self._links: dict[str, list[SemanticElement]] = {}
        # Set while a lookup passes a type or target the graph does not hold.
        self.foreign = False
        for el in semantic.values():
            self.register(el)

    def register(self, el: SemanticElement) -> None:
        """Take a relationship element into the index (also ones added later)."""
        if not el.source_id:
            return
        if el.kind == ArtifactKind.SPECIALIZATION:
            self._generals.setdefault(el.source_id, []).append(el)
        elif el.kind in (ArtifactKind.SUBSETTING, ArtifactKind.REDEFINITION):
            self._links.setdefault(el.source_id, []).append(el)

    def member(
        self,
        owner_id: str,
        name: str,
        kinds: frozenset[ArtifactKind],
        _seen: set[str] | None = None,
    ) -> str | None:
        """First feature `name` of `owner_id`: own, then its type and generals,
        then the targets of its subsetting and redefinition. Cycle safe."""
        seen = _seen if _seen is not None else set()
        if owner_id in seen:
            return None
        seen.add(owner_id)
        owner = self.semantic.get(owner_id)
        if owner is None:
            self.foreign = True
            return None
        for cid in owner.children:
            child = self.semantic.get(cid)
            if child is not None and child.name == name and child.kind in kinds:
                return child.id
        if owner.type_ref and not owner.type_target_id:
            self.foreign = True
        candidates = [owner.type_target_id] if owner.type_target_id else []
        candidates += [r.target_id for r in self._generals.get(owner_id, []) if r.target_id]
        candidates += [r.target_id for r in self._links.get(owner_id, []) if r.target_id]
        for target in candidates:
            hit = self.member(target, name, kinds, seen)
            if hit is not None:
                return hit
        return None

    def chain_end(
        self, resolver: NameResolver, ref: str, scope_id: str | None, file_id: str
    ) -> str | None:
        head, *tail = ref.split(".")
        res = resolver.resolve_name(head, scope_id, file_id)
        current = res.element_id
        if current is None or current not in self.semantic:
            return None
        for seg in (s for s in tail if s):
            nxt = self.member(current, seg, _PART)
            if nxt is None:
                return None
            current = nxt
        return current


@dataclass(frozen=True)
class MessageEnd:
    part_id: str  # the lifeline (or the fallback `<occ>::<head>`)
    event_id: str | None
    warning: str | None  # without the "line N: " prefix
    # (new id, original id): parts the parser creates, inherited from a type
    materialize: tuple[tuple[str, str], ...] = ()


def resolve_message_end(
    semantic: Mapping[str, SemanticElement],
    occurrence_id: str,
    path: str,
    *,
    message_name: str,
    quiet_if_foreign: bool,
    index: FeatureIndex | None = None,
) -> MessageEnd:
    """Resolve one end (`a`, `a.sent`, `car.keyFob.pressed`) of a message.

    The head is a part of the occurrence. The path goes on through parts; the
    deepest part is the lifeline and a trailing event names where on it the
    message is drawn. Features inherited from a type are materialised under
    the part the path went through. Nothing here refuses: what does not
    resolve falls back to the part, with a warning.
    """
    idx = index or FeatureIndex(semantic)
    idx.foreign = False
    segments = [s for s in path.split(".") if s]
    head = segments[0] if segments else path
    current = f"{occurrence_id}::{head}"
    head_el = semantic.get(current)
    if head_el is None or head_el.kind != ArtifactKind.PART:
        return MessageEnd(
            current,
            None,
            f"message '{message_name}' end '{path}' is not a part of '{occurrence_id}'",
        )
    lookup_owner = current  # where features are searched (the original, if materialised)
    materialize: list[tuple[str, str]] = []
    rest = segments[1:]
    for pos, seg in enumerate(rest):
        child_id = f"{current}::{seg}"
        local = semantic.get(child_id)
        if local is not None and local.kind == ArtifactKind.PART:
            lookup_owner = child_id
            current = child_id
            continue
        idx.foreign = False
        inherited = idx.member(lookup_owner, seg, _PART) if local is None else None
        part_foreign = idx.foreign
        if inherited is not None:
            materialize.append((child_id, inherited))
            lookup_owner = inherited
            current = child_id
            continue
        label = current.rsplit("::", 1)[-1]
        if pos < len(rest) - 1:
            warning = (
                f"message '{message_name}' end '{path}': '{seg}' is not a part of "
                f"'{label}'; drawn on '{label}'"
            )
            if part_foreign and quiet_if_foreign:
                warning = None
            return MessageEnd(current, None, warning, tuple(materialize))
        idx.foreign = False
        event = idx.member(lookup_owner, seg, _EVENT)
        if event is not None:
            return MessageEnd(current, event, None, tuple(materialize))
        warning = (
            f"message '{message_name}' end '{path}': no event '{seg}' on '{label}'; "
            f"drawn on the part"
        )
        if idx.foreign and quiet_if_foreign:
            warning = None
        return MessageEnd(current, f"{current}::{seg}", warning, tuple(materialize))
    return MessageEnd(current, None, None, tuple(materialize))


def sequence_lifelines(
    semantic: Mapping[str, SemanticElement], occurrence_id: str
) -> list[str]:
    """Part ids the occurrence's messages use as ends, unique, in the order of
    first appearance (declaration order, source before target)."""
    occ = semantic.get(occurrence_id)
    if occ is None:
        return []
    out: list[str] = []
    for cid in occ.children:
        msg = semantic.get(cid)
        if msg is None or msg.kind != ArtifactKind.MESSAGE:
            continue
        for end in (msg.source_id, msg.target_id):
            part = semantic.get(end) if end else None
            if part is not None and part.kind == ArtifactKind.PART and end not in out:
                out.append(end)
    return out

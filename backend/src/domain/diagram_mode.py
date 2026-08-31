"""Resolve diagramMode from SysML view typeRef + exposed root kind."""

from __future__ import annotations

from domain.models import ArtifactKind, SemanticElement, ViewDef

TYPE_REF_TO_MODE: dict[str, str] = {
    "SequenceView": "sequence",
    "StateTransitionView": "state",
    "ActionFlowView": "actionFlow",
    "TreeView": "tree",
    "GeneralView": "general",
    "InterconnectionView": "general",
    "AllocationView": "allocation",
}


def resolve_diagram_mode(view: ViewDef, root: SemanticElement) -> str:
    """Map view typeRef (and root kind fallback) to a frontend diagramMode string."""
    type_ref = view.type_ref
    if type_ref and type_ref in TYPE_REF_TO_MODE:
        mapped = TYPE_REF_TO_MODE[type_ref]
        if mapped != "general":
            return mapped

    # GeneralView / unknown / artifact:: fallback — structure vs whitebox by root
    if root.kind == ArtifactKind.PART:
        return "whitebox"
    return "structure"


def expected_root_kinds(diagram_mode: str) -> set[ArtifactKind] | None:
    """Kinds required as expose target for a mode, or None if any kind is ok."""
    if diagram_mode == "sequence":
        return {ArtifactKind.INTERACTION}
    if diagram_mode == "state":
        return {ArtifactKind.STATE}
    if diagram_mode == "actionFlow":
        return {ArtifactKind.ACTION}
    if diagram_mode == "tree":
        return None
    return None

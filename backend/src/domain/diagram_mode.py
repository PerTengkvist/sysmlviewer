"""Resolve diagramMode from SysML view typeRef + exposed root kind."""

from __future__ import annotations

from collections.abc import Collection

from domain.models import ArtifactKind, SemanticElement, ViewDef

TYPE_REF_TO_MODE: dict[str, str] = {
    "SequenceView": "sequence",
    "StateTransitionView": "state",
    "ActionFlowView": "actionFlow",
    "TreeView": "tree",
    "GeneralView": "general",
    "InterconnectionView": "general",
    "AllocationView": "allocation",
    "GridView": "requirementTable",
    "UseCaseView": "useCase",
}


def resolve_diagram_mode(
    view: ViewDef,
    root: SemanticElement,
    exposed_kinds: Collection[ArtifactKind] | None = None,
    realization_chain: bool = False,
) -> str:
    """Map view typeRef (and root kind fallback) to a frontend diagramMode string.

    `exposed_kinds` (kinds of the exposed elements) lets a `GridView` choose by content:
    use cases and no requirements give the realization matrix, anything else the
    requirements table. An `AllocationView` draws the realization chain when
    `realization_chain` is set (see `realization_chain.is_chain_view`); otherwise it stays
    the logical -> physical allocation. An `ActionFlowView` whose exposes include use cases and
    no actions draws the white-box activity of a use case with swimlanes.
    """
    type_ref = view.type_ref
    if (
        type_ref == "GridView"
        and exposed_kinds is not None
        and ArtifactKind.USE_CASE in exposed_kinds
        and ArtifactKind.REQUIREMENT not in exposed_kinds
    ):
        return "realizationMatrix"
    if (
        type_ref == "ActionFlowView"
        and exposed_kinds is not None
        and ArtifactKind.USE_CASE in exposed_kinds
        and ArtifactKind.ACTION not in exposed_kinds
    ):
        return "useCaseRealization"
    if type_ref == "AllocationView" and realization_chain:
        return "realizationChain"
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
        return {ArtifactKind.INTERACTION, ArtifactKind.OCCURRENCE}
    if diagram_mode == "state":
        return {ArtifactKind.STATE}
    if diagram_mode == "actionFlow":
        return {ArtifactKind.ACTION}
    if diagram_mode == "useCaseRealization":
        return {ArtifactKind.USE_CASE}
    if diagram_mode == "tree":
        return None
    return None

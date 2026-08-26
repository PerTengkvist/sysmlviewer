"""S_entity / U_entity interface naming policy (sci/scp/rcp and siblings).

Service entity (S) provides an interface; Using entity (U) consumes it as a resource.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from domain.models import SemanticElement


class InterfaceKind(str, Enum):
    CONTROL = "control"
    API = "api"
    METRICS = "metrics"
    PROVISION = "provision"
    STORAGE = "storage"
    NETWORK = "network"
    COMPUTE = "compute"


# type suffix, service-port suffix, resource-port suffix
KIND_SUFFIX: dict[InterfaceKind, tuple[str, str, str]] = {
    InterfaceKind.CONTROL: ("sci", "scp", "rcp"),
    InterfaceKind.API: ("sai", "sap", "rap"),
    InterfaceKind.METRICS: ("smi", "smp", "rmp"),
    InterfaceKind.PROVISION: ("spi", "spp", "rpp"),
    InterfaceKind.STORAGE: ("ssi", "ssp", "rsp"),
    InterfaceKind.NETWORK: ("sni", "snp", "rnp"),
    InterfaceKind.COMPUTE: ("svi", "svp", "rvp"),
}

_IFACE_SUFFIXES = {v[0] for v in KIND_SUFFIX.values()}
_SERVICE_PORT_SUFFIXES = {v[1] for v in KIND_SUFFIX.values()}
_RESOURCE_PORT_SUFFIXES = {v[2] for v in KIND_SUFFIX.values()}

_SUFFIX_TO_KIND: dict[str, InterfaceKind] = {}
for _kind, (_ti, _sp, _rp) in KIND_SUFFIX.items():
    _SUFFIX_TO_KIND[_ti] = _kind
    _SUFFIX_TO_KIND[_sp] = _kind
    _SUFFIX_TO_KIND[_rp] = _kind

_NAME_RE = re.compile(
    r"^(?P<stem>[A-Za-z][A-Za-z0-9]*)_(?P<suffix>sci|scp|rcp|sai|sap|rap|smi|smp|rmp|spi|spp|rpp|ssi|ssp|rsp|sni|snp|rnp|svi|svp|rvp)$"
)
_MULTI_RCP_RE = re.compile(
    r"^(?P<u>[A-Za-z][A-Za-z0-9]*)_(?P<idx>[A-Z])_(?P<suffix>rcp|rap|rmp|rpp|rsp|rnp|rvp)$"
)


def service_iface_type(s_entity: str, kind: InterfaceKind) -> str:
    return f"{s_entity}_{KIND_SUFFIX[kind][0]}"


def service_port_name(s_entity: str, kind: InterfaceKind) -> str:
    return f"{s_entity}_{KIND_SUFFIX[kind][1]}"


def resource_port_name(
    s_entity: str,
    u_entity: str,
    kind: InterfaceKind,
    index: str | None = None,
) -> str:
    """1:1 → ``<S>_r?p``; multi → ``<U>_<A|B>_r?p``."""
    r_suffix = KIND_SUFFIX[kind][2]
    if index is None:
        return f"{s_entity}_{r_suffix}"
    idx = index.upper()
    if len(idx) != 1 or not idx.isalpha():
        raise ValueError(f"index must be a single letter A-Z, got {index!r}")
    return f"{u_entity}_{idx}_{r_suffix}"


def connection_name(s_entity: str, kind: InterfaceKind) -> str:
    return service_iface_type(s_entity, kind)


def parse_policy_name(name: str) -> tuple[str, InterfaceKind, str] | None:
    """Return (stem, kind, role) where role is 'iface'|'service_port'|'resource_port'."""
    m = _NAME_RE.match(name)
    if not m:
        return None
    stem = m.group("stem")
    suffix = m.group("suffix")
    kind = _SUFFIX_TO_KIND.get(suffix)
    if kind is None:
        return None
    ti, sp, rp = KIND_SUFFIX[kind]
    if suffix == ti:
        return stem, kind, "iface"
    if suffix == sp:
        return stem, kind, "service_port"
    return stem, kind, "resource_port"


def parse_multi_resource_port(name: str) -> tuple[str, str, InterfaceKind] | None:
    """Return (u_entity, index, kind) for ``U_A_rcp``-style names."""
    m = _MULTI_RCP_RE.match(name)
    if not m:
        return None
    kind = _SUFFIX_TO_KIND.get(m.group("suffix"))
    if kind is None:
        return None
    return m.group("u"), m.group("idx"), kind


def kind_from_iface_suffix(suffix: str) -> InterfaceKind | None:
    if suffix in _IFACE_SUFFIXES:
        return _SUFFIX_TO_KIND[suffix]
    return None


def _simple_name(qualified_or_simple: str | None) -> str | None:
    if not qualified_or_simple:
        return None
    return qualified_or_simple.rsplit("::", 1)[-1]


def _port_stem_and_role(port_name: str) -> tuple[str, InterfaceKind, str] | None:
    multi = parse_multi_resource_port(port_name)
    if multi:
        u, _idx, kind = multi
        return u, kind, "resource_port"
    return parse_policy_name(port_name)


def suggest_connection_name(
    source_port: SemanticElement,
    target_port: SemanticElement,
    semantic: dict[str, SemanticElement],
) -> str | None:
    """Derive ``<S>_*i`` from endpoints; None if policy cannot be applied."""
    for port in (source_port, target_port):
        parsed = _port_stem_and_role(port.name)
        if parsed and parsed[2] == "service_port":
            s_entity, kind, _ = parsed
            return connection_name(s_entity, kind)

    for port in (source_port, target_port):
        type_ref = _simple_name(port.type_ref)
        if not type_ref:
            continue
        parsed = parse_policy_name(type_ref)
        if parsed and parsed[2] == "iface":
            s_entity, kind, _ = parsed
            return connection_name(s_entity, kind)

    # Resource port name ``S_rcp`` encodes S even without typeRef
    for port in (source_port, target_port):
        parsed = parse_policy_name(port.name)
        if parsed and parsed[2] == "resource_port":
            s_entity, kind, _ = parsed
            return connection_name(s_entity, kind)

    _ = semantic  # reserved for richer heuristics later
    return None


def suggest_port_name_for_type(
    type_ref: str | None,
    parent_name: str | None,
    parent_type_ref: str | None = None,
) -> str | None:
    """If typeRef is ``S_*i``, suggest scp when parent is S, else rcp."""
    simple = _simple_name(type_ref)
    if not simple:
        return None
    parsed = parse_policy_name(simple)
    if not parsed or parsed[2] != "iface":
        return None
    s_entity, kind, _ = parsed
    parent_simple = _simple_name(parent_name) if parent_name else None
    parent_type = _simple_name(parent_type_ref) if parent_type_ref else None
    if parent_simple == s_entity or parent_type == s_entity:
        return service_port_name(s_entity, kind)
    return resource_port_name(s_entity, parent_simple or "User", kind)


def expected_port_names_for_type(type_ref: str | None) -> set[str]:
    """Valid port names for a given ``S_*i`` typeRef (1:1 forms only)."""
    simple = _simple_name(type_ref)
    if not simple:
        return set()
    parsed = parse_policy_name(simple)
    if not parsed or parsed[2] != "iface":
        return set()
    s_entity, kind, _ = parsed
    return {
        service_port_name(s_entity, kind),
        resource_port_name(s_entity, s_entity, kind),
    }


def is_valid_resource_port_name(name: str, type_ref: str | None) -> bool:
    simple = _simple_name(type_ref)
    if not simple:
        return False
    parsed_t = parse_policy_name(simple)
    if not parsed_t or parsed_t[2] != "iface":
        return False
    s_entity, kind, _ = parsed_t
    if name == resource_port_name(s_entity, s_entity, kind):
        return True
    if name == service_port_name(s_entity, kind):
        return True
    multi = parse_multi_resource_port(name)
    if multi and multi[2] == kind:
        return True
    return False


def lint_interface_naming(
    semantic: dict[str, SemanticElement],
) -> list[tuple[str | None, str]]:
    """Return (file_id, warning) pairs; non-blocking policy checks."""
    from domain.models import ArtifactKind

    warnings: list[tuple[str | None, str]] = []
    for el in semantic.values():
        if el.kind == ArtifactKind.PORT and el.type_ref:
            type_simple = _simple_name(el.type_ref)
            parsed = parse_policy_name(type_simple or "")
            if parsed and parsed[2] == "iface":
                if not is_valid_resource_port_name(el.name, el.type_ref):
                    s_entity, kind, _ = parsed
                    expected = (
                        f"{service_port_name(s_entity, kind)} or "
                        f"{resource_port_name(s_entity, s_entity, kind)} "
                        f"(or U_A_{KIND_SUFFIX[kind][2]})"
                    )
                    warnings.append(
                        (
                            el.file_id,
                            f"port {el.id}: name {el.name!r} does not match "
                            f"policy for type {type_simple} (expected {expected})",
                        )
                    )

        if el.kind == ArtifactKind.CONNECTION and el.source_id and el.target_id:
            src = semantic.get(el.source_id)
            tgt = semantic.get(el.target_id)
            if not src or not tgt:
                continue
            suggested = suggest_connection_name(src, tgt, semantic)
            if suggested and el.name != suggested:
                # Only warn when endpoints already look policy-shaped
                src_ok = _port_stem_and_role(src.name) is not None or (
                    src.type_ref and parse_policy_name(_simple_name(src.type_ref) or "")
                )
                tgt_ok = _port_stem_and_role(tgt.name) is not None or (
                    tgt.type_ref and parse_policy_name(_simple_name(tgt.type_ref) or "")
                )
                if src_ok and tgt_ok:
                    warnings.append(
                        (
                            el.file_id,
                            f"connection {el.id}: name {el.name!r} should be "
                            f"{suggested!r} per interface naming policy",
                        )
                    )
    return warnings

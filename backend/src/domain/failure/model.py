"""Data model of the failure-impact engine. Pure domain code."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

EPS = 1e-9


class FailureKind(str, Enum):
    LOSS = "loss"
    DEGRADED = "degraded"
    ERRONEOUS = "erroneous"


class Status(str, Enum):
    OK = "OK"
    DEGRADED = "DEGRADED"
    LOST = "LOST"


class Layer(str, Enum):
    PHYSICAL = "physical"
    LOGICAL = "logical"
    FUNCTION_NODE = "functionNode"
    FUNCTION = "function"
    USE_CASE = "useCase"
    REQUIREMENT = "requirement"


class GateKind(str, Enum):
    AND = "and"
    POOL = "pool"
    KOFN = "kofn"
    CONTAIN = "contain"


@dataclass(frozen=True)
class Failure:
    part_id: str
    kind: FailureKind
    fraction: float | None = None  # degraded
    instances: int | None = None  # None = all instances


@dataclass(frozen=True)
class Gate:
    kind: GateKind
    n: int
    required: float  # capacity (pool) or k (kofn)
    capacities: tuple[float, ...]  # per instance


@dataclass(frozen=True)
class Edge:
    source: str  # input (upstream)
    label: str  # "implements", "allocate", "#Energy", ...
    soft: bool = False


@dataclass
class Node:
    id: str
    name: str
    layer: Layer
    gate: Gate | None = None


@dataclass
class ImpactGraph:
    nodes: dict[str, Node]
    inputs: dict[str, list[Edge]]  # dependent node -> inputs, in model order
    parent: dict[str, str]  # containment between parts in the graph
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Impact:
    capability: float
    status: Status
    limited_by: tuple[str, str] | None
    flags: frozenset[str]


def status_of(capability: float) -> Status:
    if capability >= 1 - EPS:
        return Status.OK
    if capability <= EPS:
        return Status.LOST
    return Status.DEGRADED


def _parse_count(text: str) -> int:
    try:
        value = int(text)
    except ValueError:
        value = 0
    if value < 1:
        raise ValueError(f"count must be a positive integer, got {text!r}")
    return value


def parse_failure_spec(text: str) -> tuple[str, FailureKind, float | None, int | None]:
    """Parse `<name>:<kind>[:<fraction>][:<count>]`.

    The fraction is only given (and required) for `degraded`.
    """
    parts = text.split(":")
    if len(parts) < 2 or not parts[0] or not parts[1]:
        raise ValueError(f"bad failure spec {text!r}: expected <name>:<kind>[:<arg>[:<count>]]")
    name, kind_text, rest = parts[0], parts[1], parts[2:]
    try:
        kind = FailureKind(kind_text)
    except ValueError:
        raise ValueError(f"bad failure spec {text!r}: unknown kind {kind_text!r}") from None
    fraction: float | None = None
    if kind is FailureKind.DEGRADED:
        if not rest:
            raise ValueError(f"bad failure spec {text!r}: degraded needs a fraction")
        try:
            fraction = float(rest[0])
        except ValueError:
            fraction = -1.0
        if not 0 < fraction < 1:
            raise ValueError(
                f"bad failure spec {text!r}: fraction must be in (0, 1), got {rest[0]!r}"
            )
        rest = rest[1:]
    if len(rest) > 1:
        raise ValueError(f"bad failure spec {text!r}: too many fields")
    count = _parse_count(rest[0]) if rest else None
    return name, kind, fraction, count

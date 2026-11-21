"""Derive use case realization from step-level `#refine` links."""

from __future__ import annotations

from pathlib import Path

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import SysmlFile
from domain.realization import derive_realization

FIXTURE = Path(__file__).parent / "fixtures" / "realization_probe.sysml"
P = "RealizationProbe"
START, UNLOCK, LOCK, DRIVE = (f"{P}::UC::{n}" for n in ("Start", "Unlock", "Lock", "Drive"))
SEC = f"{P}::F::Security"
START_FLOW = f"{SEC}::startFlow"
AUTH, IMMO, LOCKS = f"{SEC}::auth", f"{SEC}::immo", f"{SEC}::locks"
VC, BC = f"{P}::L::vc", f"{P}::L::bc"


def parse(text: str):
    result = SubsetSysmlParser().parse_project(
        [SysmlFile(id="f.sysml", name="f.sysml", content=text, path="f.sysml")]
    )
    assert result.warnings == []
    return result.elements


def probe(extra: str = "") -> dict:
    text = FIXTURE.read_text(encoding="utf-8")
    if extra:
        text = text.rstrip().removesuffix("}") + extra + "\n}\n"
    return parse(text)


def test_actor_and_system_steps():
    r = derive_realization(probe())
    assert r.actor_steps[START] == {f"{START}::pressStart": f"{START}::Driver"}
    assert r.system_steps[START] == [
        f"{START}::checkKey", f"{START}::showReady", f"{START}::askForBrake",
    ]


def test_include_steps_are_not_system_steps():
    r = derive_realization(probe())
    assert r.system_steps.get(DRIVE, []) == []
    assert r.actor_steps.get(DRIVE, {}) == {}


def test_step_links():
    r = derive_realization(probe())
    steps = [(l.source_id, l.target_id) for l in r.links if l.precision == "step"]
    assert steps == [
        (f"{START_FLOW}::checkKeyInCabin", f"{START}::checkKey"),
        (f"{START_FLOW}::releaseImmobilizer", f"{START}::showReady"),
    ]
    assert [l.precision for l in r.links] == ["step", "step", "coarse", "explicit"]


def test_step_realizers():
    r = derive_realization(probe())
    assert r.step_realizers == {
        f"{START}::checkKey": [f"{START_FLOW}::checkKeyInCabin"],
        f"{START}::showReady": [f"{START_FLOW}::releaseImmobilizer"],
    }


def test_coarse_flow_to_use_case():
    r = derive_realization(probe())
    assert r.coarse_realizers[UNLOCK] == [f"{SEC}::unlockFlow"]
    assert r.uc_nodes[UNLOCK] == {LOCKS: "coarse"}
    assert r.uc_functions[UNLOCK] == {SEC: "coarse"}
    assert r.uc_parts[UNLOCK] == {BC: "coarse"}


def test_explicit_function_link():
    r = derive_realization(probe())
    assert r.uc_functions[LOCK] == {SEC: "explicit"}
    assert r.uc_nodes.get(LOCK, {}) == {}


def test_derived_nodes_functions_parts():
    r = derive_realization(probe())
    assert r.uc_nodes[START] == {AUTH: "step", IMMO: "step"}
    assert r.uc_functions[START] == {SEC: "step"}
    assert r.uc_parts[START] == {VC: "step"}


def test_best_precision_wins_and_explicit_is_remembered():
    r = derive_realization(probe(f"  #refine dependency from {AUTH} to {START};"))
    assert r.uc_nodes[START][AUTH] == "step"
    assert (START, AUTH) in r.declared
    assert (START, IMMO) not in r.declared


def test_explicit_node_link_gives_node_and_part():
    r = derive_realization(probe(f"  #refine dependency from {LOCKS} to {LOCK};"))
    assert r.uc_nodes[LOCK] == {LOCKS: "explicit"}
    assert r.uc_parts[LOCK] == {BC: "explicit"}


def test_include_union():
    r = derive_realization(probe())
    assert r.uc_nodes[DRIVE] == {AUTH: "step", IMMO: "step", LOCKS: "coarse"}
    assert r.uc_functions[DRIVE] == {SEC: "step"}
    assert r.uc_parts[DRIVE] == {VC: "step", BC: "coarse"}
    assert r.via_include[DRIVE] == {AUTH, IMMO, LOCKS, SEC, VC, BC}
    assert START not in r.via_include


def test_roles_from_relations_not_names():
    renamed = (
        FIXTURE.read_text(encoding="utf-8")
        .replace("Security", "Alpha").replace("startFlow", "goFlow")
        .replace("auth", "ax").replace("immo", "bx").replace("locks", "cx")
        .replace("UC", "Cases").replace("F::", "Z::").replace("package F", "package Z")
        .replace("RealizationProbe", "Q")
    )
    a = derive_realization(parse(renamed))
    b = derive_realization(probe())

    def shape(r):
        return (
            sorted(l.precision for l in r.links),
            sorted(map(len, r.uc_nodes.values())),
            sorted(map(len, r.uc_parts.values())),
            sorted(map(len, r.system_steps.values())),
            len(r.in_scope),
        )

    assert shape(a) == shape(b)


def test_occurrence_parts_ignored():
    r = derive_realization(
        probe(
            "  occurrence def Scenario { part ghost { perform "
            f"{START_FLOW}.logStart; }} }}"
        )
    )
    assert not any("Scenario" in n for nodes in r.uc_nodes.values() for n in nodes)


def test_deterministic():
    a = derive_realization(probe())
    b = derive_realization(probe())
    assert a == b
    assert list(a.uc_nodes[START]) == [AUTH, IMMO]
    assert [l.refine_id for l in a.links] == [f"{P}::dep{i}" for i in (1, 2, 3, 4)]

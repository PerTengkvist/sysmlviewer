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
    text = FIXTURE.read_text(encoding="utf-8")
    renames = [
        ("Security", "Alpha"), ("startFlow", "goFlow"), ("auth", "ax"), ("immo", "bx"),
        ("locks", "cx"), ("UC::", "Cases::"), ("package UC", "package Cases"),
        ("package F ", "package Z "), ("F::", "Z::"), ("L::", "M::"), ("package L ", "package M "),
        ("RealizationProbe", "Q"),
    ]
    for old, new in renames:
        text = text.replace(old, new)

    def mapped(value):
        if isinstance(value, str):
            for old, new in renames:
                value = value.replace(old, new)
            return value
        if isinstance(value, dict):
            return {mapped(k): mapped(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return type(value)(mapped(v) for v in value)
        if isinstance(value, set):
            return {mapped(v) for v in value}
        return value

    a = derive_realization(parse(text))
    b = derive_realization(probe())
    for name in ("actor_steps", "system_steps", "step_realizers", "coarse_realizers",
                 "uc_functions", "uc_nodes", "uc_parts", "in_scope", "via_include"):
        assert getattr(a, name) == mapped(getattr(b, name)), name
    assert [(l.source_id, l.target_id, l.precision) for l in a.links] == [
        (mapped(l.source_id), mapped(l.target_id), l.precision) for l in b.links
    ]


def test_occurrence_parts_ignored():
    r = derive_realization(
        probe(
            "  occurrence def Scenario { part ghost { perform "
            f"{START_FLOW}.checkKeyInCabin; }} }}"
        )
    )
    assert r.uc_nodes[START] == {AUTH: "step", IMMO: "step"}


def test_deterministic():
    a = derive_realization(probe())
    b = derive_realization(probe())
    assert a == b
    assert list(a.uc_nodes[START]) == [AUTH, IMMO]
    assert [l.refine_id for l in a.links] == [f"{P}::dep{i}" for i in (1, 2, 3, 4)]


def test_function_nodes_in_model_order_with_their_function():
    from domain.realization import FunctionNode, function_nodes

    assert function_nodes(probe()) == [
        FunctionNode(AUTH, SEC),
        FunctionNode(IMMO, SEC),
        FunctionNode(LOCKS, SEC),
    ]


def test_function_nodes_skip_parts_that_only_allocate():
    from domain.realization import function_nodes

    sem = probe("part lg; part ph; allocate lg to ph;")
    assert [n.id for n in function_nodes(sem)] == [AUTH, IMMO, LOCKS]


def test_explicit_function_link_projects_onto_its_nodes():
    r = derive_realization(probe())
    assert r.uc_function_nodes[LOCK] == {AUTH: SEC, IMMO: SEC, LOCKS: SEC}
    # Nothing else changes: the nodes are not realizers of Lock.
    assert r.uc_nodes.get(LOCK, {}) == {}
    assert r.uc_parts.get(LOCK, {}) == {}
    assert START not in r.uc_function_nodes and UNLOCK not in r.uc_function_nodes


def test_no_projection_when_a_node_of_the_function_serves_the_use_case_itself():
    # The electric car form: the function and its nodes both refine the use case.
    both = probe(f"#refine dependency from {AUTH} to {LOCK};")
    r = derive_realization(both)
    assert LOCK not in r.uc_function_nodes
    steps = derive_realization(probe())
    # A step-level link of one node of the function also stops it (Start has step links).
    assert START not in steps.uc_function_nodes
    explicit_and_steps = derive_realization(probe(f"#refine dependency from {SEC} to {START};"))
    assert START not in explicit_and_steps.uc_function_nodes


def test_projection_through_include_is_inherited():
    r = derive_realization(probe("use case def Big { include use case UC::Lock; }"))
    big = f"{P}::Big"
    assert r.uc_function_nodes[big] == {AUTH: SEC, IMMO: SEC, LOCKS: SEC}
    assert SEC in r.via_include[big]


def test_electric_car_projects_no_function_onto_nodes():
    """There the function and its nodes both refine the use case: no cell is projected."""
    from adapters.api.static_paths import resolve_repo_root

    root = resolve_repo_root() / "examples" / "electric_car"
    files = [
        SysmlFile(
            id=p.relative_to(root).as_posix(), name=p.name,
            content=p.read_text(encoding="utf-8"), path=p.relative_to(root).as_posix(),
        )
        for p in sorted(root.rglob("*.sysml"))
    ]
    r = derive_realization(SubsetSysmlParser().parse_project(files).elements)
    assert r.uc_function_nodes == {}

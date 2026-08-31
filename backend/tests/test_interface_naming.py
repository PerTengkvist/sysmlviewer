"""TDD: S_entity / U_entity interface naming policy."""

from domain.interface_naming import (
    InterfaceKind,
    connection_name,
    lint_interface_naming,
    parse_multi_resource_port,
    parse_policy_name,
    resource_port_name,
    service_iface_type,
    service_port_name,
    suggest_connection_name,
    suggest_port_name_for_type,
)
from domain.models import ArtifactKind, SemanticElement


def test_suffix_table_control_api_metrics():
    assert service_iface_type("Cluster", InterfaceKind.CONTROL) == "Cluster_sci"
    assert service_port_name("Cluster", InterfaceKind.CONTROL) == "Cluster_scp"
    assert resource_port_name("Cluster", "Orch", InterfaceKind.CONTROL) == "Cluster_rcp"

    assert service_iface_type("Cluster", InterfaceKind.API) == "Cluster_sai"
    assert service_port_name("Cluster", InterfaceKind.API) == "Cluster_sap"
    assert resource_port_name("Cluster", "Orch", InterfaceKind.API) == "Cluster_rap"

    assert connection_name("Cluster", InterfaceKind.METRICS) == "Cluster_smi"


def test_all_kinds_have_three_suffixes():
    for kind in InterfaceKind:
        assert service_iface_type("S", kind).endswith("i")
        assert service_port_name("S", kind).endswith("p")
        assert resource_port_name("S", "U", kind).endswith("p")
        assert connection_name("S", kind) == service_iface_type("S", kind)


def test_multi_resource_port_index():
    assert (
        resource_port_name("Cluster", "Orchestrator", InterfaceKind.CONTROL, index="A")
        == "Orchestrator_A_rcp"
    )
    assert (
        resource_port_name("Cluster", "Orchestrator", InterfaceKind.API, index="B")
        == "Orchestrator_B_rap"
    )
    parsed = parse_multi_resource_port("Orchestrator_A_rcp")
    assert parsed == ("Orchestrator", "A", InterfaceKind.CONTROL)


def test_parse_policy_name():
    assert parse_policy_name("KubernetesCluster_sci") == (
        "KubernetesCluster",
        InterfaceKind.CONTROL,
        "iface",
    )
    assert parse_policy_name("KubernetesCluster_scp")[2] == "service_port"
    assert parse_policy_name("KubernetesCluster_rcp")[2] == "resource_port"
    assert parse_policy_name("foo") is None


def test_suggest_connection_from_service_port():
    src = SemanticElement(
        id="P::U::Cluster_rcp",
        kind=ArtifactKind.PORT,
        name="Cluster_rcp",
        parent_id="P::U",
        type_ref="Cluster_sci",
    )
    tgt = SemanticElement(
        id="P::S::Cluster_scp",
        kind=ArtifactKind.PORT,
        name="Cluster_scp",
        parent_id="P::S",
        type_ref="Cluster_sci",
    )
    semantic = {src.id: src, tgt.id: tgt}
    assert suggest_connection_name(src, tgt, semantic) == "Cluster_sci"


def test_suggest_connection_from_type_ref_only():
    src = SemanticElement(
        id="P::U::x",
        kind=ArtifactKind.PORT,
        name="x",
        type_ref="Orchestrator_sai",
    )
    tgt = SemanticElement(
        id="P::S::y",
        kind=ArtifactKind.PORT,
        name="y",
        type_ref="Orchestrator_sai",
    )
    assert suggest_connection_name(src, tgt, {src.id: src, tgt.id: tgt}) == (
        "Orchestrator_sai"
    )


def test_suggest_port_name_service_vs_resource():
    assert (
        suggest_port_name_for_type("Cluster_sci", "Cluster") == "Cluster_scp"
    )
    assert (
        suggest_port_name_for_type("Cluster_sci", "Orchestrator") == "Cluster_rcp"
    )


def test_lint_flags_bad_port_and_connection_names():
    bad_port = SemanticElement(
        id="P::Cluster::weird",
        kind=ArtifactKind.PORT,
        name="weird",
        parent_id="P::Cluster",
        type_ref="Cluster_sci",
        file_id="f1",
    )
    scp = SemanticElement(
        id="P::Cluster::Cluster_scp",
        kind=ArtifactKind.PORT,
        name="Cluster_scp",
        type_ref="Cluster_sci",
        file_id="f1",
    )
    rcp = SemanticElement(
        id="P::Orch::Cluster_rcp",
        kind=ArtifactKind.PORT,
        name="Cluster_rcp",
        type_ref="Cluster_sci",
        file_id="f1",
    )
    conn = SemanticElement(
        id="P::c1",
        kind=ArtifactKind.CONNECTION,
        name="wrongName",
        source_id=rcp.id,
        target_id=scp.id,
        file_id="f1",
    )
    semantic = {
        bad_port.id: bad_port,
        scp.id: scp,
        rcp.id: rcp,
        conn.id: conn,
    }
    warns = lint_interface_naming(semantic)
    texts = [w for _, w in warns]
    assert any("weird" in t for t in texts)
    assert any("wrongName" in t and "Cluster_sci" in t for t in texts)

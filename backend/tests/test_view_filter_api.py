"""Integration: get_view applies SysML view filters after depth collection."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url

MODEL = """
package FilterApiPkg {
  part Car {
    part battery;
    part motor;
    part unused;
    connection powerBus connect battery to motor;
    connection powerAux connect battery to unused;
    connection signalX connect battery to motor;
    dependency d1 from battery to motor;
  }

  view def ConnectionsOnly : GeneralView {
    expose Car;
    filter @ConnectionUsage;
  }

  view def PowerConnections : GeneralView {
    expose Car;
    filter @SysML::ConnectionUsage;
    filter name.startsWith("power");
  }

  view def NoFilter : GeneralView {
    expose Car;
  }

  view def DropEndpoint : GeneralView {
    expose Car;
    filter name.startsWith("battery");
  }
}
"""


def _client(tmp_path: Path) -> tuple[TestClient, str]:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "F"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "filters.sysml", MODEL)
    return client, project_id


def test_connection_usage_filter_keeps_connections_drops_dependency(tmp_path: Path):
    client, project_id = _client(tmp_path)
    payload = client.get(
        api_url(f"/projects/{project_id}/views/FilterApiPkg::ConnectionsOnly"),
        params={"levels": 3},
    ).json()
    kinds = {e["kind"] for e in payload["semantic"].values()}
    assert "connection" in kinds
    assert "dependency" not in kinds
    names = {
        e["name"]
        for e in payload["semantic"].values()
        if e["kind"] == "connection"
    }
    assert "powerBus" in names
    assert "signalX" in names


def test_metaclass_and_name_startswith_power_only(tmp_path: Path):
    client, project_id = _client(tmp_path)
    payload = client.get(
        api_url(f"/projects/{project_id}/views/FilterApiPkg::PowerConnections"),
        params={"levels": 3},
    ).json()
    conn_names = {
        e["name"]
        for e in payload["semantic"].values()
        if e["kind"] == "connection"
    }
    assert conn_names == {"powerBus", "powerAux"}
    assert not any(
        e["kind"] == "dependency" for e in payload["semantic"].values()
    )


def test_view_without_filter_unchanged(tmp_path: Path):
    client, project_id = _client(tmp_path)
    payload = client.get(
        api_url(f"/projects/{project_id}/views/FilterApiPkg::NoFilter"),
        params={"levels": 3},
    ).json()
    kinds = {e["kind"] for e in payload["semantic"].values()}
    assert "connection" in kinds
    assert "dependency" in kinds
    assert "part" in kinds


def test_filtered_endpoint_hides_relation(tmp_path: Path):
    """name.startsWith('battery') keeps battery part; connections to motor are clipped."""
    client, project_id = _client(tmp_path)
    payload = client.get(
        api_url(f"/projects/{project_id}/views/FilterApiPkg::DropEndpoint"),
        params={"levels": 3},
    ).json()
    # Root always kept; battery matches name filter; motor does not.
    assert "FilterApiPkg::Car" in payload["semantic"]
    assert "FilterApiPkg::Car::battery" in payload["semantic"]
    assert "FilterApiPkg::Car::motor" not in payload["semantic"]
    # Connections need both endpoints → clipped by hidden_relations
    assert not any(
        e["kind"] == "connection" for e in payload["semantic"].values()
    )

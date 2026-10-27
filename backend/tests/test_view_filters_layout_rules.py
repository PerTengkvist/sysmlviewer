"""Persist and round-trip viewFilters / layoutRules on view layout files."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url

SIMPLE = """
package Pkg {
  part def Root {
    part engine;
    part wheel;
  }
  view def SimpleView : GeneralView {
    expose Root;
  }
}
"""


def _client(tmp_path: Path) -> tuple[TestClient, str, str]:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "F"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "simple.sysml", SIMPLE)
    return client, project_id, "Pkg::SimpleView"


def test_view_filters_roundtrip(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    filters = [
        {
            "id": "f1",
            "kind": "part",
            "matchField": "name",
            "namePattern": "Eng*",
            "enabled": True,
        }
    ]
    patched = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "viewFilters": filters,
            "structureNotation": "sysmlv2",
        },
    )
    assert patched.status_code == 200

    payload = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    assert payload["viewFilters"] == filters


def test_geometry_patch_preserves_view_filters(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    filters = [
        {
            "id": "f1",
            "kind": "part",
            "matchField": "name",
            "namePattern": "*",
            "enabled": False,
        }
    ]
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "viewFilters": filters,
            "structureNotation": "sysmlv2",
        },
    )
    engine_id = "Pkg::Root::engine"
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "structureNotation": "sysmlv2",
            "nodes": {engine_id: {"x": 120, "y": 80}},
        },
    )
    payload = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    assert payload["viewFilters"] == filters
    assert payload["visualization"]["nodes"][engine_id]["x"] == 120


def test_layout_rules_roundtrip_and_preserve(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    rules = [
        {
            "id": "r1",
            "kind": "part",
            "namePattern": "engine",
            "placement": "below",
            "peerKind": "part",
            "peerNamePattern": "wheel",
        }
    ]
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "layoutRules": rules,
            "structureNotation": "sysmlv2",
        },
    )
    payload = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    assert payload["layoutRules"] == rules

    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "structureNotation": "sysmlv2",
            "nodes": {"Pkg::Root::engine": {"x": 10, "y": 20}},
        },
    )
    payload2 = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    assert payload2["layoutRules"] == rules


def test_patch_dependency_metadata_keywords(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "D"}).json()["id"]
    sample = """
package P {
  part def Root {
    part a;
    part b;
    #Energy dependency from a to b;
  }
}
"""
    add_content_file(client, project_id, tmp_path, "d.sysml", sample)
    deps = [
        (eid, el)
        for eid, el in client.get(api_url(f"/projects/{project_id}")).json()["semantic"].items()
        if el["kind"] == "dependency"
    ]
    assert len(deps) == 1
    dep_id, dep = deps[0]
    assert dep["metadataKeywords"] == ["Energy"]

    patched = client.patch(
        api_url(f"/projects/{project_id}/semantic/{dep_id}"),
        json={"metadataKeywords": ["Mount"]},
    )
    assert patched.status_code == 200
    assert patched.json()["semantic"][dep_id]["metadataKeywords"] == ["Mount"]


def test_layered_layout_roundtrip_and_preserve(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    layered = {
        "enabled": True,
        "scopes": [
            {
                "id": "s1",
                "scopePattern": "*",
                "direction": "top-down",
                "layers": [{"id": "l1", "name": "Sensors"}, {"id": "l2", "name": ""}],
            }
        ],
    }
    patched = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "layeredLayout": layered,
            "structureNotation": "sysmlv2",
        },
    )
    assert patched.status_code == 200
    payload = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    # Empty layer names default to the layer's ordinal.
    assert payload["layeredLayout"] == {
        "enabled": True,
        "scopes": [
            {
                "id": "s1",
                "scopePattern": "*",
                "direction": "top-down",
                "layers": [{"id": "l1", "name": "Sensors"}, {"id": "l2", "name": "2"}],
            }
        ],
    }

    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "structureNotation": "sysmlv2",
            "nodes": {"Pkg::Root::engine": {"x": 10, "y": 20}},
        },
    )
    payload2 = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    assert payload2["layeredLayout"]["scopes"][0]["layers"][0]["name"] == "Sensors"

    # Persisted in the per-view layout file, not state.json.
    view_file = next((tmp_path).rglob("views/SimpleView.json"))
    import json

    assert json.loads(view_file.read_text())["layeredLayout"]["enabled"] is True


def test_layered_layout_normalizes_direction_and_clears(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "layeredLayout": {
                "enabled": "yes",
                "scopes": [{"direction": "diagonal", "layers": "x"}],
            },
            "structureNotation": "sysmlv2",
        },
    )
    payload = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    assert payload["layeredLayout"] == {
        "enabled": True,
        "scopes": [
            {"id": "scope-1", "scopePattern": "*", "direction": "top-down", "layers": []}
        ],
    }

    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "layeredLayout": None, "structureNotation": "sysmlv2"},
    )
    payload2 = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    assert payload2["layeredLayout"] is None


def test_belong_to_layer_rule_roundtrip(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    rules = [
        {
            "id": "r1",
            "kind": "part",
            "namePattern": "engine",
            "placement": "belong to",
            "peerKind": "layer",
            "peerNamePattern": "Sensors",
        }
    ]
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "layoutRules": rules, "structureNotation": "sysmlv2"},
    )
    payload = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    assert payload["layoutRules"] == rules


def test_layered_layout_scopes_roundtrip(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    layered = {
        "enabled": True,
        "scopes": [
            {
                "id": "s1",
                "scopePattern": "*",
                "direction": "top-down",
                "layers": [{"id": "l1", "name": "A"}, {"id": "l2", "name": "B"}],
            },
            {
                "id": "s2",
                "scopePattern": "infotainmentEcu",
                "direction": "left-right",
                "layers": [{"id": "l1", "name": "UI"}, {"id": "l2", "name": ""}],
            },
        ],
    }
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "layeredLayout": layered, "structureNotation": "sysmlv2"},
    )
    payload = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    scopes = payload["layeredLayout"]["scopes"]
    assert [s["scopePattern"] for s in scopes] == ["*", "infotainmentEcu"]
    assert scopes[1]["direction"] == "left-right"
    assert scopes[1]["layers"] == [{"id": "l1", "name": "UI"}, {"id": "l2", "name": "2"}]


def test_layered_layout_legacy_shape_is_migrated(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    legacy = {
        "enabled": True,
        "direction": "left-right",
        "layers": [{"id": "l1", "name": "Front"}, {"id": "l2", "name": "Back"}],
    }
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "layeredLayout": legacy, "structureNotation": "sysmlv2"},
    )
    payload = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()
    assert payload["layeredLayout"] == {
        "enabled": True,
        "scopes": [
            {
                "id": "scope-1",
                "scopePattern": "*",
                "direction": "left-right",
                "layers": [{"id": "l1", "name": "Front"}, {"id": "l2", "name": "Back"}],
            }
        ],
    }


def test_layered_layout_scope_normalization(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    raw = {
        "enabled": True,
        "scopes": [
            {"scopePattern": "ecu", "direction": "sideways", "layers": [{"name": "x"}]},
            {"id": "dup", "scopePattern": "ecu", "layers": []},
            {"id": "dup", "layers": []},
            "junk",
        ],
    }
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "layeredLayout": raw, "structureNotation": "sysmlv2"},
    )
    scopes = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 5},
    ).json()["layeredLayout"]["scopes"]
    assert [s["scopePattern"] for s in scopes] == ["ecu", "ecu", "*"]
    assert scopes[0]["direction"] == "top-down"
    assert scopes[0]["layers"] == [{"id": "layer-1", "name": "x"}]
    assert scopes[0]["id"] == "scope-1"
    assert len({s["id"] for s in scopes}) == 3

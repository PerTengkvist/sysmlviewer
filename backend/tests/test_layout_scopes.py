"""Layout Rules scopes: one tab per scope, each with its own rules and layers."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.view_layouts import ViewLayout
from helpers import add_content_file, api_url

MODEL = """
package Pkg {
  part def Root {
    part engine;
    part wheel;
    part infotainmentEcu {
      part climateControlSw;
      part mediaSw;
    }
  }
  view def SimpleView : GeneralView {
    expose Root;
  }
}
"""

VIEW = "Pkg::SimpleView"
ECU = "Pkg::Root::infotainmentEcu"

RULE = {
    "id": "r1",
    "kind": "part",
    "namePattern": "engine",
    "placement": "below",
    "peerKind": "part",
    "peerNamePattern": "wheel",
}


def _client(tmp_path: Path) -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "S"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "simple.sysml", MODEL)
    return client, project_id


def _patch(client: TestClient, project_id: str, body: dict) -> None:
    res = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": VIEW, "structureNotation": "sysmlv2", **body},
    )
    assert res.status_code == 200, res.text


def _view(client: TestClient, project_id: str) -> dict:
    return client.get(
        api_url(f"/projects/{project_id}/views/{VIEW}"), params={"levels": 5}
    ).json()


def _scope(**over) -> dict:
    scope = {
        "id": "s1",
        "target": {"kind": "diagram"},
        "enabled": True,
        "layering": {
            "enabled": True,
            "direction": "left-right",
            "layers": [{"id": "l1", "name": "Front"}, {"id": "l2", "name": "Back"}],
        },
        "rules": [RULE],
    }
    scope.update(over)
    return scope


def test_scopes_round_trip_through_patch_and_view_file(tmp_path: Path):
    client, project_id = _client(tmp_path)
    scopes = [
        _scope(),
        _scope(
            id="s2",
            target={"kind": "element", "id": ECU},
            enabled=False,
            layering={"enabled": False, "direction": "top-down", "layers": []},
            rules=[],
        ),
    ]
    _patch(client, project_id, {"layoutScopes": scopes})
    assert _view(client, project_id)["layoutScopes"] == scopes

    view_file = next(tmp_path.rglob("views/SimpleView.json"))
    doc = json.loads(view_file.read_text())
    assert doc["layoutScopes"] == scopes
    assert "layoutRules" not in doc and "layeredLayout" not in doc


def test_scopes_are_normalized():
    layout = ViewLayout.from_dict(
        {
            "layoutScopes": [
                {"id": "a", "target": {"kind": "diagram"}, "layering": {"direction": "diagonal"}},
                {"id": "b"},  # no target: dropped
                {"id": "c", "target": {"kind": "diagram"}},  # same target: first wins
                {"id": "d", "target": {"kind": "element", "id": ECU}, "rules": [{"id": "x"}]},
            ]
        }
    )
    assert layout.layout_scopes == [
        {
            "id": "a",
            "target": {"kind": "diagram"},
            "enabled": True,
            "layering": {"enabled": False, "direction": "top-down", "layers": []},
            "rules": [],
        },
        {
            "id": "d",
            "target": {"kind": "element", "id": ECU},
            "enabled": True,
            "layering": {"enabled": False, "direction": "top-down", "layers": []},
            # A rule without kind or placement is dropped.
            "rules": [],
        },
    ]


def test_legacy_rules_and_layers_are_migrated_to_scopes(tmp_path: Path):
    """The shape the autolayout e2e used to seed: a root and a container scope."""
    client, project_id = _client(tmp_path)
    _patch(
        client,
        project_id,
        {
            "layeredLayout": {
                "enabled": True,
                "scopes": [
                    {
                        "id": "s1",
                        "scopePattern": "*",
                        "direction": "top-down",
                        "layers": [{"id": "l1", "name": "Top"}],
                    },
                    {
                        "id": "s2",
                        "scopePattern": "infotainmentEcu",
                        "direction": "left-right",
                        "layers": [
                            {"id": "l1", "name": "Comfort"},
                            {"id": "l2", "name": "Media"},
                        ],
                    },
                ],
            },
            "layoutRules": [
                RULE,
                {
                    "id": "r4",
                    "kind": "part",
                    "namePattern": "climateControlSw",
                    "placement": "belong to",
                    "peerKind": "layer",
                    "peerNamePattern": "Comfort",
                },
            ],
        },
    )
    scopes = _view(client, project_id)["layoutScopes"]
    assert [s["target"] for s in scopes] == [
        {"kind": "diagram"},
        {"kind": "element", "id": ECU},
    ]
    diagram, ecu = scopes
    assert diagram["layering"]["enabled"] is True
    assert diagram["layering"]["layers"] == [{"id": "l1", "name": "Top"}]
    assert [r["id"] for r in diagram["rules"]] == ["r1"]
    assert ecu["layering"]["direction"] == "left-right"
    assert [r["id"] for r in ecu["rules"]] == ["r4"]


def test_geometry_patch_keeps_scopes(tmp_path: Path):
    client, project_id = _client(tmp_path)
    _patch(client, project_id, {"layoutScopes": [_scope()]})
    _patch(client, project_id, {"nodes": {"Pkg::Root::engine": {"x": 10, "y": 20}}})
    assert _view(client, project_id)["layoutScopes"] == [_scope()]


def test_removing_every_scope_sticks(tmp_path: Path):
    client, project_id = _client(tmp_path)
    _patch(client, project_id, {"layoutScopes": [_scope()]})
    _patch(client, project_id, {"layoutScopes": []})
    assert _view(client, project_id)["layoutScopes"] == []


def test_a_legacy_scope_matching_no_container_is_dropped(tmp_path: Path):
    client, project_id = _client(tmp_path)
    _patch(
        client,
        project_id,
        {
            "layeredLayout": {
                "enabled": True,
                "scopes": [
                    {"id": "s9", "scopePattern": "nothingLikeThis", "layers": []}
                ],
            }
        },
    )
    scopes = _view(client, project_id)["layoutScopes"]
    assert [s["target"] for s in scopes] == [{"kind": "diagram"}]

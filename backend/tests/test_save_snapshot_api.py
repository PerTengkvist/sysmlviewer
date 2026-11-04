"""SAVE writes the diagram's geometry, reads it back and logs what it found."""

from __future__ import annotations

import json
import os
import shutil
from dataclasses import asdict
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.persistence.view_file_store import find_view_file, read_for_view
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from domain.view_layouts import ViewNodeLayout
from domain.view_verification import snapshot_from_view_payload
from helpers import add_content_file, api_url

SAMPLE = """\
package Sample {
  port def P;
  part def Inner {
    port p : P;
  }
  part def Outer {
    port q : P;
    part a : Inner;
    part b : Inner;
    connect a.p to b.p;
    bind q = a.p;
  }
  view def OuterView : InterconnectionView {
    expose Outer;
  }
  view def Table : GridView {
    expose Outer;
  }
}
"""
VIEW = "Sample::OuterView"
PART_A = "Sample::Outer::a"
PORT_Q = "Sample::Outer::q"
CONN = "Sample::Outer::conn1"
BIND = "Sample::Outer::bind1"


def _setup(tmp_path: Path) -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "Save"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "s.sysml", SAMPLE)
    return client, project_id


def _snapshot(**overrides: object) -> dict:
    return {
        "structureNotation": "sysmlv2",
        "levels": 3,
        "parts": {PART_A: {"x": 111.0, "y": 222.0, "width": 180.0, "height": 110.0}},
        "ports": {PORT_Q: {"side": "right", "offset": 0.25}},
        "edges": {
            CONN: {
                "routing": "angular",
                "waypoints": [{"x": 10.0, "y": 20.0}, {"x": 30.0, "y": 20.0}],
                "labelOffset": {"x": 0.0, "y": 0.0},
            },
            BIND: {
                "routing": "direct",
                "waypoints": [],
                "labelOffset": {"x": 0.0, "y": 0.0},
            },
        },
        **overrides,
    }


def _save(
    client: TestClient,
    project_id: str,
    snapshot: dict | None = None,
    view: str = VIEW,
):
    return client.post(
        api_url(f"/projects/{project_id}/views/{view}/save-snapshot"),
        json=snapshot if snapshot is not None else _snapshot(),
    )


def _compare(client: TestClient, project_id: str, snapshot: dict, view: str = VIEW):
    return client.post(
        api_url(f"/projects/{project_id}/views/{view}/compare"), json=snapshot
    )


def _codes(result: dict) -> list[str]:
    return [event["code"] for event in result["events"]]


def _event(result: dict, code: str) -> dict:
    return next(event for event in result["events"] if event["code"] == code)


def test_save_snapshot_writes_all_geometry_and_confirms(tmp_path: Path):
    client, project_id = _setup(tmp_path)

    response = _save(client, project_id)

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "confirmed"
    assert result["mismatches"] == []
    assert _codes(result) == [
        "file.permissions.ok",
        "parts.confirmed",
        "connections.confirmed",
        "save.successful",
    ]
    saved = read_for_view(tmp_path, VIEW)
    assert saved is not None
    assert (saved.nodes[PART_A].x, saved.nodes[PART_A].y) == (111.0, 222.0)
    assert (saved.nodes[PORT_Q].side, saved.nodes[PORT_Q].offset) == ("right", 0.25)
    assert [w.x for w in saved.edges[CONN].waypoints] == [10.0, 30.0]


def test_confirmed_events_name_the_diagram_and_counts(tmp_path: Path):
    client, project_id = _setup(tmp_path)

    result = _save(client, project_id).json()

    assert _event(result, "parts.confirmed")["message"] == (
        "Parts positions confirmed for diagram OuterView (1 parts, 1 ports)"
    )
    assert _event(result, "connections.confirmed")["message"] == (
        "Connections and bindings confirmed for diagram OuterView (2)"
    )
    assert _event(result, "save.successful")["message"] == (
        "Save successful: OuterView.json"
    )
    assert _event(result, "file.permissions.ok")["message"] == (
        "File permissions OK: OuterView.json"
    )


def test_second_save_of_same_geometry_reports_no_drift(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)

    result = _save(client, project_id).json()

    assert "drift.before_save" not in _codes(result)


def test_drift_before_save_is_logged_as_warning(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    moved = _snapshot(
        parts={PART_A: {"x": 500.0, "y": 222.0, "width": 180.0, "height": 110.0}}
    )

    result = _save(client, project_id, moved).json()

    drift = _event(result, "drift.before_save")
    assert drift["level"] == "warning"
    assert drift["details"][0]["id"] == PART_A
    assert drift["details"][0]["field"] == "x"
    assert (drift["details"][0]["canvas"], drift["details"][0]["saved"]) == (500.0, 111.0)
    assert result["status"] == "confirmed"


def test_read_back_mismatch_emits_named_mismatch_and_no_success(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    client, project_id = _setup(tmp_path)
    original = WorkspaceProjectRepository.save_view_layout

    def corrupting_save(self, view_id, name, layout, **kwargs):
        layout.nodes[PART_A] = ViewNodeLayout(
            x=1.0, y=222.0, width=180.0, height=110.0
        )
        layout.nodes[PORT_Q] = ViewNodeLayout(side="left", offset=0.25)
        return original(self, view_id, name, layout, **kwargs)

    monkeypatch.setattr(
        WorkspaceProjectRepository, "save_view_layout", corrupting_save
    )

    result = _save(client, project_id).json()

    assert result["status"] == "mismatch"
    codes = _codes(result)
    assert "save.successful" not in codes
    assert "parts.confirmed" not in codes
    assert "save.unverified" in codes
    mismatch = _event(result, "parts.mismatch")
    assert mismatch["level"] == "error"
    assert "part a" in mismatch["message"]
    assert "port q" in mismatch["message"]
    disk = [d for d in mismatch["details"] if d["source"] == "disk"]
    assert {(d["element"], d["name"], d["field"]) for d in disk} == {
        ("part", "a", "x"),
        ("port", "q", "side"),
    }


def test_served_mismatch_is_reported_with_source_served(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    ghost = "Sample::Outer::ghost"
    snapshot = _snapshot(
        parts={ghost: {"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0}}
    )

    result = _save(client, project_id, snapshot).json()

    assert result["status"] == "mismatch"
    [detail] = _event(result, "parts.mismatch")["details"]
    assert (detail["id"], detail["field"], detail["source"]) == (ghost, "entry", "served")
    assert detail["saved"] is None


def test_bindings_and_connections_are_classified(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    drifted = _snapshot()
    drifted["edges"][CONN]["routing"] = "spline"
    drifted["edges"][BIND]["routing"] = "spline"

    result = _compare(client, project_id, drifted).json()

    details = _event(result, "connections.mismatch")["details"]
    assert {(d["element"], d["id"]) for d in details} == {
        ("connection", CONN),
        ("binding", BIND),
    }


@pytest.mark.skipif(os.geteuid() == 0, reason="root ignores file permissions")
def test_read_only_view_file_emits_permission_event_and_fails(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    path = find_view_file(tmp_path, VIEW)
    assert path is not None
    before = path.read_text(encoding="utf-8")
    path.chmod(0o444)

    response = _save(client, project_id)

    assert response.status_code == 403
    assert path.read_text(encoding="utf-8") == before
    events = client.get(api_url(f"/projects/{project_id}/events")).json()["events"]
    codes = [event["code"] for event in events]
    assert "file.permissions.denied" in codes
    assert "save.failed" in codes
    denied = next(e for e in events if e["code"] == "file.permissions.denied")
    assert path.name in denied["message"]


@pytest.mark.skipif(os.geteuid() == 0, reason="root ignores file permissions")
def test_read_only_views_folder_emits_permission_event(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    views = tmp_path / "views"
    views.chmod(0o555)
    try:
        for path in views.iterdir():
            path.chmod(0o644)
        response = _save(client, project_id)
    finally:
        views.chmod(0o755)

    assert response.status_code == 403
    events = client.get(api_url(f"/projects/{project_id}/events")).json()["events"]
    denied = next(e for e in events if e["code"] == "file.permissions.denied")
    assert "views" in denied["message"]


def test_arcadia_snapshot_writes_arcadia_file(tmp_path: Path):
    client, project_id = _setup(tmp_path)

    result = _save(
        client, project_id, _snapshot(structureNotation="arcadia")
    ).json()

    assert result["status"] == "confirmed"
    assert (tmp_path / "views" / "OuterView.arcadia.json").is_file()
    assert not (tmp_path / "views" / "OuterView.json").exists()


def test_snapshot_for_mode_without_geometry_is_skipped(tmp_path: Path):
    client, project_id = _setup(tmp_path)

    result = _save(client, project_id, view="Sample::Table").json()

    assert result["status"] == "skipped"
    assert _codes(result) == ["verify.skipped"]
    assert read_for_view(tmp_path, "Sample::Table") is None


def test_artifact_view_snapshot_uses_the_same_file_as_a_patch(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    view = "artifact::Sample::Outer"
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view, "nodes": {PART_A: {"x": 1, "y": 2}}},
    )
    before = sorted(p.name for p in (tmp_path / "views").iterdir())

    _save(client, project_id, view=view)

    assert sorted(p.name for p in (tmp_path / "views").iterdir()) == before


def test_new_artifact_view_snapshot_is_named_like_a_patch(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    view = "artifact::Sample::Outer"

    _save(client, project_id, view=view)

    assert find_view_file(tmp_path, view).name == "artifact__Sample__Outer.json"


def test_unknown_view_returns_404(tmp_path: Path):
    client, project_id = _setup(tmp_path)

    assert _save(client, project_id, view="Sample::Nope").status_code == 404


def test_snapshot_keeps_view_settings_and_hidden_geometry(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": VIEW,
            "hierarchicalLevelsOverride": 3,
            "nodes": {"Sample::Outer::b": {"x": 7, "y": 8}},
        },
    )

    _save(client, project_id)

    saved = read_for_view(tmp_path, VIEW)
    assert saved is not None
    assert saved.hierarchical_levels_override == 3
    assert saved.nodes["Sample::Outer::b"].x == 7.0


def test_compare_endpoint_logs_without_writing(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    path = find_view_file(tmp_path, VIEW)
    assert path is not None
    before = path.read_bytes()
    moved = _snapshot(
        parts={PART_A: {"x": 500.0, "y": 222.0, "width": 180.0, "height": 110.0}}
    )

    result = _compare(client, project_id, moved).json()

    assert result["status"] == "mismatch"
    assert _event(result, "parts.mismatch")["details"][0]["field"] == "x"
    assert path.read_bytes() == before


def test_compare_confirms_matching_diagram(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)

    result = _compare(client, project_id, _snapshot()).json()

    assert result["status"] == "confirmed"
    assert _codes(result) == ["parts.confirmed", "connections.confirmed"]


def test_restore_compare_is_silent_when_saved_values_match(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    unsaved_part = "Sample::Outer::b"
    snapshot = _snapshot(trigger="restore")
    snapshot["parts"][unsaved_part] = {
        "x": 9.0,
        "y": 9.0,
        "width": 9.0,
        "height": 9.0,
    }

    result = _compare(client, project_id, snapshot).json()

    assert result["status"] == "confirmed"
    assert result["events"] == []


def test_restore_compare_reports_warning_with_restored_source(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    moved = _snapshot(
        trigger="restore",
        parts={PART_A: {"x": 500.0, "y": 222.0, "width": 180.0, "height": 110.0}},
    )

    result = _compare(client, project_id, moved).json()

    assert result["status"] == "mismatch"
    [event] = result["events"]
    assert (event["code"], event["level"]) == ("restore.mismatch", "warning")
    assert event["details"][0]["source"] == "restored"
    assert "part a" in event["message"]


def test_mismatch_message_lists_at_most_ten_elements_but_details_hold_all(
    tmp_path: Path,
):
    client, project_id = _setup(tmp_path)
    ghosts = {
        f"Sample::Outer::ghost{i}": {"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0}
        for i in range(12)
    }

    result = _save(client, project_id, _snapshot(parts=ghosts)).json()

    event = _event(result, "parts.mismatch")
    assert "and 2 more" in event["message"]
    assert len(event["details"]) == 12


def test_log_and_api_return_identical_event(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    moved = _snapshot(
        parts={PART_A: {"x": 500.0, "y": 222.0, "width": 180.0, "height": 110.0}}
    )
    _compare(client, project_id, moved)

    lines = (tmp_path / ".sysmlviewer" / "events.jsonl").read_text(
        encoding="utf-8"
    ).splitlines()
    from_file = [json.loads(line) for line in lines]
    from_api = client.get(api_url(f"/projects/{project_id}/events")).json()["events"]

    assert from_api == from_file


@pytest.mark.parametrize("example", ["diagrams", "electric_car"])
def test_saving_served_geometry_confirms_for_every_example_view(
    tmp_path: Path, example: str
):
    source = Path(__file__).resolve().parents[2] / "examples" / example
    workspace = tmp_path / example
    shutil.copytree(source, workspace)
    client = TestClient(create_app(workspace=workspace))
    project = client.get(api_url("/session")).json()["project"]
    assert project is not None
    project_id = project["id"]

    failures: dict[str, list] = {}
    confirmed = 0
    for view in project["views"]:
        url = api_url(f"/projects/{project_id}/views/{view['id']}")
        payload = client.get(url, params={"levels": 4}).json()
        if payload.get("modeError"):
            continue
        snapshot = asdict(snapshot_from_view_payload(payload))
        snapshot["levels"] = 4
        result = _save(client, project_id, snapshot, view=view["id"]).json()
        if result["status"] == "confirmed":
            confirmed += 1
        elif result["status"] != "skipped":
            failures[view["id"]] = result["mismatches"][:5]

    assert failures == {}
    assert confirmed >= 5


def test_project_save_is_logged(tmp_path: Path):
    client, project_id = _setup(tmp_path)

    response = client.put(api_url(f"/projects/{project_id}"), json={"name": "Save"})

    assert response.status_code == 200
    events = client.get(api_url(f"/projects/{project_id}/events")).json()["events"]
    assert [(e["code"], e["level"]) for e in events] == [("project.saved", "info")]


def test_failed_project_save_is_logged(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    client, project_id = _setup(tmp_path)

    def fail(*_args: object, **_kwargs: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(WorkspaceProjectRepository, "save", fail)

    response = TestClient(client.app, raise_server_exceptions=False).put(
        api_url(f"/projects/{project_id}"), json={"name": "Save"}
    )

    assert response.status_code == 500
    events = client.get(api_url(f"/projects/{project_id}/events")).json()["events"]
    assert [e["code"] for e in events] == ["save.failed"]


def test_same_restore_difference_is_logged_once(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    moved = _snapshot(
        trigger="restore",
        parts={PART_A: {"x": 500.0, "y": 222.0, "width": 180.0, "height": 110.0}},
    )

    first = _compare(client, project_id, moved).json()
    second = _compare(client, project_id, moved).json()

    assert first["events"] and first["status"] == "mismatch"
    assert second["events"] == []
    assert second["status"] == "mismatch"


def test_new_restore_difference_is_logged(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    _save(client, project_id)
    size = {"y": 222.0, "width": 180.0, "height": 110.0}

    _compare(
        client,
        project_id,
        _snapshot(trigger="restore", parts={PART_A: {"x": 500.0, **size}}),
    )
    other = _compare(
        client,
        project_id,
        _snapshot(trigger="restore", parts={PART_A: {"x": 600.0, **size}}),
    ).json()

    assert len(other["events"]) == 1


def _saved_port(client: TestClient, project_id: str) -> dict:
    view = client.get(api_url(f"/projects/{project_id}/views/{VIEW}")).json()
    return view["visualization"]["nodes"][PORT_Q]


def test_patched_port_label_offset_is_served_and_can_be_cleared(tmp_path: Path):
    client, project_id = _setup(tmp_path)

    def patch(label_offset: dict | None) -> None:
        response = client.patch(
            api_url(f"/projects/{project_id}/visualization"),
            json={
                "viewId": VIEW,
                "nodes": {PORT_Q: {"labelOffset": label_offset}},
            },
        )
        assert response.status_code == 200

    patch({"x": 30.0, "y": -12.0})
    assert _saved_port(client, project_id)["labelOffset"] == {"x": 30.0, "y": -12.0}

    patch(None)
    assert "labelOffset" not in _saved_port(client, project_id)


def test_save_confirms_moved_port_label(tmp_path: Path):
    client, project_id = _setup(tmp_path)
    snapshot = _snapshot(
        ports={
            PORT_Q: {
                "side": "right",
                "offset": 0.25,
                "labelOffset": {"x": 30.0, "y": -12.0},
            }
        }
    )

    result = _save(client, project_id, snapshot).json()

    assert result["status"] == "confirmed"
    assert _saved_port(client, project_id)["labelOffset"] == {"x": 30.0, "y": -12.0}

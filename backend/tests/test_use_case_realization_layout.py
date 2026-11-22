"""Per-view layout of a useCaseRealization view: lane mode, lane order per mode, lane widths."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.view_layouts import ViewLayout, normalize_use_case_realization_layout
from helpers import add_content_file, api_url

PROBE = (Path(__file__).parent / "fixtures" / "realization_probe.sysml").read_text(
    encoding="utf-8"
)
VIEWS = """\
package FlowViews {
  view StartFlow : ActionFlowView { expose RealizationProbe::UC::Start; }
  view SecurityFlow : ActionFlowView { expose RealizationProbe::F::Security::startFlow; }
}
"""
P = "RealizationProbe"
VIEW = "FlowViews::StartFlow"
AUTH = f"{P}::F::Security::auth"
IMMO = f"{P}::F::Security::immo"
DRIVER = f"{P}::UC::Start::Driver"


def _client(tmp_path: Path, extra: str = "") -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "L"}).json()["id"]
    add_content_file(client, pid, tmp_path, "probe.sysml", PROBE + extra)
    add_content_file(client, pid, tmp_path, "views.sysml", VIEWS)
    return client, pid


def _view(client: TestClient, pid: str, view_id: str = VIEW) -> dict:
    res = client.get(api_url(f"/projects/{pid}/views/{view_id}"))
    assert res.status_code == 200, res.text
    return res.json()


def _patch(client: TestClient, pid: str, **extra) -> None:
    res = client.patch(
        api_url(f"/projects/{pid}/visualization"),
        json={"viewId": VIEW, "structureNotation": "sysmlv2", **extra},
    )
    assert res.status_code == 200, res.text


def test_normalize_keeps_valid_parts():
    assert normalize_use_case_realization_layout(
        {
            "lanes": "logical",
            "order": {"whitebox": ["a", "b", 3, "a"], "logical": "x", "nonsense": ["c"]},
            "widths": {"a": 150, "b": "x", "c": -4, "d": True},
        }
    ) == {"lanes": "logical", "order": {"whitebox": ["a", "b"]}, "widths": {"a": 150.0}}


def test_normalize_unknown_mode_is_whitebox_and_absent_parts_stay_absent():
    assert normalize_use_case_realization_layout({"lanes": "sideways"}) == {"lanes": "whitebox"}
    assert normalize_use_case_realization_layout({"order": {"blackbox": ["a"]}}) == {
        "order": {"blackbox": ["a"]}
    }
    assert normalize_use_case_realization_layout({}) == {}
    assert normalize_use_case_realization_layout(None) is None
    assert normalize_use_case_realization_layout("junk") is None


def test_view_layout_roundtrip_and_absent_when_unset():
    raw = {"lanes": "blackbox", "order": {"blackbox": ["b", "a"]}, "widths": {"a": 140}}
    layout = ViewLayout.from_dict({"nodes": {}, "useCaseRealizationLayout": raw})
    assert layout.to_dict()["useCaseRealizationLayout"] == {
        "lanes": "blackbox",
        "order": {"blackbox": ["b", "a"]},
        "widths": {"a": 140.0},
    }
    assert "useCaseRealizationLayout" not in ViewLayout.from_dict({"nodes": {}}).to_dict()


def test_api_roundtrip_per_field_and_clear(tmp_path: Path):
    client, pid = _client(tmp_path)
    assert _view(client, pid)["useCaseRealizationLayout"] is None

    layout = {"lanes": "logical", "order": {"logical": [DRIVER, "system"]}, "widths": {DRIVER: 200.0}}
    _patch(client, pid, useCaseRealizationLayout=layout)
    assert _view(client, pid)["useCaseRealizationLayout"] == layout

    # Another field of the patch (nodes) leaves it alone.
    _patch(client, pid, nodes={f"{P}::UC::Start::checkKey": {"x": 1, "y": 2}})
    assert _view(client, pid)["useCaseRealizationLayout"] == layout

    # The file of the view holds it.
    view_file = next(tmp_path.rglob("views/StartFlow.json"))
    assert json.loads(view_file.read_text())["useCaseRealizationLayout"] == layout

    # A patch replaces the whole value; null clears it.
    _patch(client, pid, useCaseRealizationLayout={"lanes": "blackbox"})
    assert _view(client, pid)["useCaseRealizationLayout"] == {"lanes": "blackbox"}
    _patch(client, pid, useCaseRealizationLayout=None)
    assert _view(client, pid)["useCaseRealizationLayout"] is None
    assert "useCaseRealizationLayout" not in json.loads(view_file.read_text())


def test_survives_a_new_session(tmp_path: Path):
    client, pid = _client(tmp_path)
    layout = {"lanes": "logical", "order": {"whitebox": [IMMO, AUTH]}}
    _patch(client, pid, useCaseRealizationLayout=layout)
    again = TestClient(create_app(data_dir=tmp_path))
    pid2 = again.get(api_url("/projects")).json()[0]["id"]
    assert _view(again, pid2)["useCaseRealizationLayout"] == layout


def test_an_unknown_lane_mode_is_whitebox(tmp_path: Path):
    client, pid = _client(tmp_path)
    _patch(client, pid, useCaseRealizationLayout={"lanes": "sideways", "widths": {AUTH: 120}})
    assert _view(client, pid)["useCaseRealizationLayout"] == {
        "lanes": "whitebox",
        "widths": {AUTH: 120.0},
    }


def test_lanes_that_are_no_longer_in_the_model_are_cleared(tmp_path: Path):
    client, pid = _client(tmp_path)
    layout = {
        "lanes": "whitebox",
        "order": {"whitebox": [DRIVER, f"{P}::Gone::part", AUTH, "system"]},
        "widths": {AUTH: 180, f"{P}::Gone::part": 99},
    }
    _patch(client, pid, useCaseRealizationLayout=layout)
    saved = _view(client, pid)["useCaseRealizationLayout"]
    assert saved["order"]["whitebox"] == [DRIVER, AUTH, "system"]
    assert saved["widths"] == {AUTH: 180.0}
    # What is in the file is cleaned on the next write, but a stale id never reaches the client.
    view_file = next(tmp_path.rglob("views/StartFlow.json"))
    on_disk = json.loads(view_file.read_text())["useCaseRealizationLayout"]
    assert f"{P}::Gone::part" not in on_disk["order"]["whitebox"]
    assert f"{P}::Gone::part" not in on_disk["widths"]


def test_a_stale_lane_in_the_file_does_not_reach_the_client(tmp_path: Path):
    client, pid = _client(tmp_path)
    _patch(client, pid, useCaseRealizationLayout={"order": {"whitebox": [AUTH, "system"]}})
    view_file = next(tmp_path.rglob("views/StartFlow.json"))
    doc = json.loads(view_file.read_text())
    doc["useCaseRealizationLayout"]["order"]["whitebox"] = ["Old::Gone", AUTH, "system"]
    doc["useCaseRealizationLayout"]["widths"] = {"Old::Gone": 120, AUTH: 160}
    view_file.write_text(json.dumps(doc))
    again = TestClient(create_app(data_dir=tmp_path))
    pid2 = again.get(api_url("/projects")).json()[0]["id"]
    saved = _view(again, pid2)["useCaseRealizationLayout"]
    assert saved["order"]["whitebox"] == [AUTH, "system"]
    assert saved["widths"] == {AUTH: 160.0}


def test_sequence_layout_is_not_touched(tmp_path: Path):
    client, pid = _client(tmp_path)
    seq = {"order": ["x", "y"], "widths": {"x": 120.0}}
    _patch(client, pid, sequenceLayout=seq)
    _patch(client, pid, useCaseRealizationLayout={"lanes": "blackbox"})
    body = _view(client, pid)
    assert body["sequenceLayout"] == seq
    assert body["useCaseRealizationLayout"] == {"lanes": "blackbox"}
    _patch(client, pid, sequenceLayout=None)
    assert _view(client, pid)["useCaseRealizationLayout"] == {"lanes": "blackbox"}


def test_other_views_carry_no_such_key(tmp_path: Path):
    client, pid = _client(tmp_path)
    assert "useCaseRealizationLayout" not in _view(client, pid, "FlowViews::SecurityFlow")

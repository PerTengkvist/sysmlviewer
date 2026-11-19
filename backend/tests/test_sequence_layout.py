"""Per-view sequence diagram layout: lifeline order and header widths."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.view_layouts import ViewLayout, normalize_sequence_layout
from helpers import add_content_file, api_url

SIMPLE = """
package Pkg {
  part def Root {
    part engine;
  }
  view SimpleView : GeneralView {
    expose Root;
  }
}
"""


def _client(tmp_path: Path) -> tuple[TestClient, str, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "F"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "simple.sysml", SIMPLE)
    return client, project_id, "Pkg::SimpleView"


def _view(client: TestClient, project_id: str, view_id: str) -> dict:
    return client.get(api_url(f"/projects/{project_id}/views/{view_id}")).json()


def _patch(client: TestClient, project_id: str, view_id: str, **extra) -> None:
    res = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "structureNotation": "sysmlv2", **extra},
    )
    assert res.status_code == 200


def test_normalize_keeps_valid_order_and_widths():
    assert normalize_sequence_layout(
        {"order": ["a", "b", 3, "a"], "widths": {"a": 150, "b": "x", "c": -4}}
    ) == {"order": ["a", "b"], "widths": {"a": 150.0}}


def test_normalize_omits_absent_parts_and_none_when_empty():
    assert normalize_sequence_layout({"order": ["a"]}) == {"order": ["a"]}
    assert normalize_sequence_layout({"widths": {"a": 90}}) == {"widths": {"a": 90.0}}
    assert normalize_sequence_layout(None) is None
    assert normalize_sequence_layout("junk") is None
    assert normalize_sequence_layout({}) == {}


def test_view_layout_roundtrip_and_absent_when_unset():
    layout = ViewLayout.from_dict(
        {"nodes": {}, "sequenceLayout": {"order": ["b", "a"], "widths": {"a": 140}}}
    )
    assert layout.to_dict()["sequenceLayout"] == {
        "order": ["b", "a"],
        "widths": {"a": 140.0},
    }
    assert "sequenceLayout" not in ViewLayout.from_dict({"nodes": {}}).to_dict()


def test_sequence_layout_api_roundtrip_preserve_and_clear(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    assert _view(client, project_id, view_id)["sequenceLayout"] is None

    seq = {"order": ["Pkg::I::B", "Pkg::I::A"], "widths": {"Pkg::I::A": 150.0}}
    _patch(client, project_id, view_id, sequenceLayout=seq)
    assert _view(client, project_id, view_id)["sequenceLayout"] == seq

    # A later geometry patch keeps the choice.
    _patch(client, project_id, view_id, nodes={"Pkg::Root::engine": {"x": 10, "y": 20}})
    assert _view(client, project_id, view_id)["sequenceLayout"] == seq

    view_file = next(tmp_path.rglob("views/SimpleView.json"))
    assert json.loads(view_file.read_text())["sequenceLayout"] == seq

    _patch(client, project_id, view_id, sequenceLayout=None)
    assert _view(client, project_id, view_id)["sequenceLayout"] is None
    assert "sequenceLayout" not in json.loads(view_file.read_text())


def test_view_payload_keeps_declaration_order_of_lifelines_and_messages(tmp_path: Path):
    """The frontend relies on `semantic` order = declaration order (msg10 after msg9)."""
    names = ["Zed", "alpha", "mid"]
    msgs = "\n".join(
        f"    then message m{i:02d} from {names[i % 3]} to {names[(i + 1) % 3]};"
        for i in range(12)
    )
    src = f"""
package Pkg {{
  interaction def Seq {{
    lifeline {names[0]};
    lifeline {names[1]};
    lifeline {names[2]};
{msgs}
  }}
  view SeqView : SequenceView {{
    expose Seq;
  }}
}}
"""
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "S"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "seq.sysml", src)
    sem = _view(client, project_id, "Pkg::SeqView")["semantic"]
    kinds = {k: v["kind"] for k, v in sem.items()}
    lifelines = [k for k, v in kinds.items() if v == "lifeline"]
    messages = [k for k, v in kinds.items() if v == "message"]
    assert [k.split("::")[-1] for k in lifelines] == names
    assert [sem[k]["name"] for k in messages] == [f"m{i:02d}" for i in range(12)]


def test_electric_car_drive_sequence_declaration_order():
    from adapters.api.static_paths import resolve_repo_root
    from adapters.parser.subset_parser import SubsetSysmlParser
    from domain.models import SysmlFile

    root = resolve_repo_root() / "examples" / "electric_car"
    files = [
        SysmlFile(
            id=p.relative_to(root).as_posix(),
            name=p.name,
            content=p.read_text(encoding="utf-8"),
            path=p.relative_to(root).as_posix(),
        )
        for p in sorted(root.rglob("*.sysml"))
    ]
    elements = SubsetSysmlParser().parse_project(files).elements
    owner = "Dynamics::DriveSequence"
    # The lifelines are the parts of the occurrence def, declared in this order.
    lifelines = [e.name for e in elements.values() if e.parent_id == owner and e.kind.value == "part"]
    messages = [e.name for e in elements.values() if e.parent_id == owner and e.kind.value == "message"]
    assert lifelines[0] == "Driver"
    assert messages[:3] == ["pressStart", "startRequest", "releaseImmobilizer"]
    assert messages[-1] == "indicatePark"
    assert len(messages) == 16

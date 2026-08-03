from pathlib import Path

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.parser.subset_serializer import serialize_file
from domain.details import classify_children, collect_artifacts_to_depth
from domain.models import ArtifactKind
from fastapi.testclient import TestClient

from adapters.api.app import create_app


def test_parse_attributes():
    content = """
package P {
  part def Box {
    attribute def mass;
    attribute color : String = "red";
    port out : Power = null;
  }
}
"""
    result = SubsetSysmlParser().parse(content, "f1")
    assert "P::Box::mass" in result.elements
    assert result.elements["P::Box::mass"].kind == ArtifactKind.ATTRIBUTE
    assert "P::Box::color" in result.elements
    color = result.elements["P::Box::color"]
    assert color.type_ref == "String"
    assert color.default_value == '"red"'
    out = result.elements["P::Box::out"]
    assert out.type_ref == "Power"
    assert out.default_value == "null"
    assert not any("attribute" in w and "ignored" in w for w in result.warnings)


def test_inherit_attributes_onto_usages():
    content = """
package P {
  part def Engine {
    attribute def rpm;
    port out;
  }
  part def Vehicle {
    part engine : Engine;
  }
}
"""
    result = SubsetSysmlParser().parse(content, "f1")
    assert "P::Vehicle::engine::rpm" in result.elements
    assert result.elements["P::Vehicle::engine::rpm"].kind == ArtifactKind.ATTRIBUTE
    assert "P::Vehicle::engine::out" in result.elements


def test_serialize_roundtrip_minimal():
    sample = Path(__file__).resolve().parents[2] / "examples" / "vehicle.sysml"
    content = sample.read_text(encoding="utf-8")
    parsed = SubsetSysmlParser().parse(content, "f1")
    text = serialize_file(parsed.elements, "f1")
    again = SubsetSysmlParser().parse(text, "f1")
    kinds_a = {(e.id, e.kind) for e in parsed.elements.values()}
    kinds_b = {(e.id, e.kind) for e in again.elements.values()}
    # Core structural ids should survive
    assert ("Example", ArtifactKind.PACKAGE) in kinds_b
    assert ("Example::Vehicle", ArtifactKind.PART) in kinds_b
    assert len(kinds_b) >= len([k for k in kinds_a if k[1] != ArtifactKind.ATTRIBUTE])


def test_classify_children_buckets():
    content = """
package P {
  part def A {
    port p1;
    attribute def a1;
    part child;
    connection c1 connect p1 to child.p1;
  }
  part def child { port p1; }
}
"""
    # Simpler fixture via parser of nested structure
    content = """
package P {
  part def A {
    port p1;
    attribute def a1;
    part child {
      port p1;
    }
    connection c1 connect p1 to child.p1;
  }
}
"""
    els = SubsetSysmlParser().parse(content, "f1").elements
    buckets = classify_children(els, "P::A")
    assert any(p.name == "p1" for p in buckets["ports"])
    assert any(a.name == "a1" for a in buckets["attributes"])
    assert any(s.name == "child" for s in buckets["subParts"])
    assert any(r.name == "c1" for r in buckets["relations"])


def test_collect_depth():
    content = """
package P {
  part def Root {
    part mid {
      part leaf;
    }
  }
}
"""
    els = SubsetSysmlParser().parse(content, "f1").elements
    d1 = collect_artifacts_to_depth(els, "P::Root", 1)
    assert "P::Root" in d1
    assert "P::Root::mid" not in d1
    d2 = collect_artifacts_to_depth(els, "P::Root", 2)
    assert "P::Root::mid" in d2
    assert "P::Root::mid::leaf" not in d2


def test_editor_crud_updates_file_content(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "E"}).json()["id"]
    sample = b"package P { part def Box { port p; } }\n"
    uploaded = client.post(
        f"/projects/{project_id}/files",
        files={"file": ("t.sysml", sample, "text/plain")},
    ).json()
    assert "P::Box" in uploaded["semantic"]

    added = client.post(
        f"/projects/{project_id}/parts",
        json={"parentId": "P::Box", "name": "wheel"},
    ).json()
    assert "P::Box::wheel" in added["semantic"]
    assert "part wheel" in added["files"][0]["content"]

    ported = client.post(
        f"/projects/{project_id}/ports",
        json={"parentId": "P::Box", "name": "in2"},
    ).json()
    assert "port in2" in ported["files"][0]["content"]

    attributed = client.post(
        f"/projects/{project_id}/attributes",
        json={"parentId": "P::Box", "name": "mass"},
    ).json()
    assert "attribute def mass" in attributed["files"][0]["content"] or "attribute mass" in attributed["files"][0]["content"]

    renamed = client.patch(
        f"/projects/{project_id}/semantic/P::Box::in2",
        json={"name": "powerIn"},
    ).json()
    assert renamed["semantic"]["P::Box::in2"]["name"] == "powerIn"
    assert "port powerIn" in renamed["files"][0]["content"]

    deleted = client.delete(f"/projects/{project_id}/semantic/P::Box::wheel").json()
    assert "P::Box::wheel" not in deleted["semantic"]
    assert "wheel" not in deleted["files"][0]["content"]


def test_add_connection_updates_file_content(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "C"}).json()["id"]
    sample = b"""
package P {
  part def Box {
    part a { port out; }
    part b { port in; }
  }
}
"""
    client.post(
        f"/projects/{project_id}/files",
        files={"file": ("t.sysml", sample, "text/plain")},
    )
    created = client.post(
        f"/projects/{project_id}/connections",
        json={
            "sourceId": "P::Box::a::out",
            "targetId": "P::Box::b::in",
            "name": "link1",
        },
    ).json()
    assert "connect" in created["files"][0]["content"]
    assert "link1" in created["files"][0]["content"]


def test_waypoints_patch_roundtrip(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "W"}).json()["id"]
    sample = Path(__file__).resolve().parents[2] / "examples" / "vehicle.sysml"
    uploaded = client.post(
        f"/projects/{project_id}/files",
        files={"file": ("vehicle.sysml", sample.read_bytes(), "text/plain")},
    ).json()
    conn_id = next(
        k for k, v in uploaded["semantic"].items() if v["kind"] == "connection"
    )
    patched = client.patch(
        f"/projects/{project_id}/visualization",
        json={
            "edges": {
                conn_id: {
                    "waypoints": [{"x": 10, "y": 20}, {"x": 30, "y": 40}],
                }
            }
        },
    ).json()
    wps = patched["visualization"]["edges"][conn_id]["waypoints"]
    assert len(wps) == 2
    assert wps[0]["x"] == 10

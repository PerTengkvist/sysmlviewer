from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.parser.subset_serializer import extract_import_block, serialize_file
from domain.models import SysmlFile
from helpers import add_content_file


def test_project_folder_layout_on_disk(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "Folder"}).json()["id"]

    add_content_file(
        client,
        project_id,
        tmp_path,
        "lib/main.sysml",
        "package Main { part A; }\n",
    )

    assert (tmp_path / "project.json").exists()
    manifest = (tmp_path / "project.json").read_text(encoding="utf-8")
    assert '"projektnamn": "Folder"' in manifest
    assert '"sysmlfiles"' in manifest
    assert (tmp_path / "lib" / "main.sysml").exists()
    assert (tmp_path / "state.json").exists()
    assert not (tmp_path / project_id).exists()


def test_delete_and_rename_file(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "Files"}).json()["id"]

    uploaded = add_content_file(
        client, project_id, tmp_path, "a.sysml", "package A { part X; }\n"
    )
    file_id = uploaded["files"][0]["id"]
    assert (tmp_path / "a.sysml").exists()

    renamed = client.patch(
        f"/projects/{project_id}/files/item/{file_id}",
        json={"name": "renamed.sysml"},
    ).json()
    assert renamed["files"][0]["name"] == "renamed.sysml"
    assert renamed["files"][0]["path"] == "renamed.sysml"
    assert (tmp_path / "renamed.sysml").exists()
    assert not (tmp_path / "a.sysml").exists()

    deleted = client.delete(f"/projects/{project_id}/files/item/{file_id}").json()
    assert deleted["files"] == []
    assert deleted["semantic"] == {}
    assert not (tmp_path / "renamed.sysml").exists()


def test_parse_project_cross_file_import_and_inheritance():
    types = SysmlFile(
        id="f-types",
        name="types.sysml",
        content="package Types {\n  part def Box {\n    port out;\n  }\n}\n",
        path="types.sysml",
    )
    main = SysmlFile(
        id="f-main",
        name="main.sysml",
        content=(
            "private import Types::*;\n"
            "package Main {\n"
            "  part box : Box;\n"
            "}\n"
        ),
        path="main.sysml",
    )
    result = SubsetSysmlParser().parse_project([types, main])
    assert "Types::Box" in result.elements
    assert "Main::box" in result.elements
    assert result.elements["Main::box"].type_ref == "Box"
    assert "Main::box::out" in result.elements
    unresolved = [
        w for w in result.warnings if "Box" in w and "could not be resolved" in w
    ]
    assert unresolved == []
    assert any(i["path"] == "Types::*" for i in result.imports)


def test_serializer_preserves_imports():
    previous = "private import Types::*;\n\npackage Main { part box : Box; }\n"
    semantic = SubsetSysmlParser().parse(previous, "f1").elements
    out = serialize_file(semantic, "f1", previous_content=previous)
    assert out.startswith("private import Types::*;")
    assert "package Main" in out


def test_extract_import_block():
    text = "// note\nprivate import A::*;\nimport B::C;\npackage X {}\n"
    block = extract_import_block(text)
    assert "private import A::*;" in block
    assert "import B::C;" in block
    assert "package" not in block


def test_visualization_style_patch(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "Style"}).json()["id"]
    add_content_file(
        client,
        project_id,
        tmp_path,
        "s.sysml",
        "package S { part def Box { port p; } part b : Box; }\n",
    )

    patched = client.patch(
        f"/projects/{project_id}/visualization",
        json={
            "nodes": {
                "S::b": {
                    "style": {
                        "light": {
                            "backgroundColor": "#ffeeee",
                            "lineColor": "#aa0000",
                            "textColor": "#220000",
                            "lineThickness": 3,
                        },
                        "dark": {
                            "backgroundColor": "#331111",
                            "lineThickness": 4,
                        },
                    }
                }
            }
        },
    ).json()
    style = patched["visualization"]["nodes"]["S::b"]["style"]
    assert style["light"]["backgroundColor"] == "#ffeeee"
    assert style["light"]["lineThickness"] == 3
    assert style["dark"]["backgroundColor"] == "#331111"

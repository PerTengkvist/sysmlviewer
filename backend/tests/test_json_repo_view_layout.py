"""JsonFileProjectRepository must resolve view layouts under project_id/views/."""

from __future__ import annotations

import json
from pathlib import Path

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.json_repo import JsonFileProjectRepository
from adapters.persistence import view_file_store
from application.project_service import ProjectService
from domain.merge import merge_visualization, rebuild_views
from domain.models import Project, SysmlFile, VisualizationModel
from domain.view_layouts import ViewEdgeLayout, ViewLayout, ViewLayouts


SAMPLE = """\
package Rel {
  part def A;
  part def B;
  part def System {
    part a : A;
    part b : B;
  }
  view def RelView {
    expose System;
  }
}
"""


def _seed_project(tmp_path: Path) -> tuple[ProjectService, str, str]:
    repo = JsonFileProjectRepository(tmp_path)
    service = ProjectService(repo, SubsetSysmlParser())
    project = Project.create(name="JsonArc")
    sysml = SysmlFile(id="rel.sysml", name="rel.sysml", content=SAMPLE, path="rel.sysml")
    project.files = [sysml]
    result = SubsetSysmlParser().parse(SAMPLE, "rel.sysml")
    project.semantic = result.elements
    project.views = rebuild_views(result.elements)
    project.visualization = merge_visualization(
        result.elements, VisualizationModel()
    )
    repo.save(project)
    # Ensure SysML is on disk under the project folder
    repo.write_sysml("rel.sysml", SAMPLE, project_id=project.id)

    view_id = next(v.id for v in project.views if "RelView" in v.name)
    edge_id = "viz::composition::Rel::System::Rel::System::a"
    layout = ViewLayout(
        edges={
            edge_id: ViewEdgeLayout(source_side="left", source_offset=0.4),
        }
    )
    view_file_store.write_one(
        repo._project_dir(project.id),
        view_id,
        "RelView",
        layout,
        structure_notation="arcadia",
    )
    return service, project.id, view_id


def test_json_repo_get_view_loads_arcadia_layout_from_project_dir(tmp_path: Path):
    service, project_id, view_id = _seed_project(tmp_path)
    edge_id = "viz::composition::Rel::System::Rel::System::a"

    # Prove the file is under <root>/<project_id>/views, not <root>/views
    arc = tmp_path / project_id / "views" / "RelView.arcadia.json"
    assert arc.is_file()
    assert not (tmp_path / "views" / "RelView.arcadia.json").exists()

    loaded = service.get_view(
        project_id, view_id, structure_notation="arcadia"
    )
    assert loaded is not None
    edges = loaded["visualization"]["edges"]
    assert edge_id in edges, f"missing edge; got {list(edges)}"
    assert edges[edge_id]["sourceSide"] == "left"
    assert edges[edge_id]["sourceOffset"] == 0.4

"""editLocked round-trip and visualization patches."""

from pathlib import Path

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.json_repo import JsonFileProjectRepository
from application.project_service import ProjectService
from domain.merge import merge_visualization, rebuild_views
from domain.models import (
    ArtifactKind,
    Project,
    RoutingType,
    SysmlFile,
    VisualizationEdge,
    VisualizationModel,
    VisualizationNode,
    Waypoint,
)

SAMPLE = """\
package Rel {
  part def A {
    port p;
  }
  part def B {
    port p;
  }
  part def System {
    part a : A;
    part b : B;
    connection c connect a.p to b.p;
  }
  view def RelView {
    expose System;
  }
  view def OtherView {
    expose System;
  }
}
"""


def test_edit_locked_roundtrip_on_node_and_edge():
    node = VisualizationNode(artifact_id="Pkg::Part", x=1, y=2, edit_locked=True)
    again = VisualizationNode.from_dict(node.to_dict())
    assert again.edit_locked is True
    assert again.x == 1
    assert again.y == 2
    assert "editLocked" not in VisualizationNode(artifact_id="Pkg::Part").to_dict()

    edge = VisualizationEdge(
        artifact_id="Pkg::conn",
        routing=RoutingType.DIRECT,
        waypoints=[Waypoint(x=10, y=20, locked=True)],
        edit_locked=True,
    )
    edge_again = VisualizationEdge.from_dict(edge.to_dict())
    assert edge_again.edit_locked is True
    assert edge_again.routing == RoutingType.DIRECT
    assert edge_again.waypoints[0].x == 10
    assert edge_again.waypoints[0].locked is True
    assert "editLocked" not in VisualizationEdge(artifact_id="Pkg::conn").to_dict()


def _service(tmp_path: Path) -> tuple[ProjectService, str, str, str, str]:
    repo = JsonFileProjectRepository(tmp_path)
    service = ProjectService(repo, SubsetSysmlParser())
    project = Project.create(name="Lock")
    sysml = SysmlFile(id="rel.sysml", name="rel.sysml", content=SAMPLE, path="rel.sysml")
    project.files = [sysml]
    result = SubsetSysmlParser().parse(SAMPLE, "rel.sysml")
    project.semantic = result.elements
    project.views = rebuild_views(result.elements)
    project.visualization = merge_visualization(result.elements, VisualizationModel())
    repo.save(project)
    repo.write_sysml("rel.sysml", SAMPLE, project_id=project.id)
    views = {v.name: v.id for v in project.views}
    return service, project.id, views["RelView"], views["OtherView"], "Rel::System"


def test_patch_visualization_sets_and_clears_edit_locked(tmp_path: Path):
    service, project_id, _rel, _other, part_id = _service(tmp_path)
    project = service.get_project(project_id)
    assert project is not None
    edge_id = next(
        eid
        for eid, el in project.semantic.items()
        if el.kind == ArtifactKind.CONNECTION
    )
    service.update_visualization(
        project_id,
        {
            "nodes": {part_id: {"x": 12, "y": 34}},
            "edges": {
                edge_id: {
                    "routing": "direct",
                    "waypoints": [{"x": 5, "y": 6, "locked": True}],
                }
            },
        },
    )
    service.update_visualization(
        project_id,
        {
            "nodes": {part_id: {"editLocked": True}},
            "edges": {edge_id: {"editLocked": True}},
        },
    )
    project = service.get_project(project_id)
    assert project is not None
    node = project.visualization.nodes[part_id]
    edge = project.visualization.edges[edge_id]
    assert node.edit_locked is True
    assert node.x == 12
    assert node.y == 34
    assert edge.edit_locked is True
    assert edge.routing == RoutingType.DIRECT
    assert [(w.x, w.y, w.locked) for w in edge.waypoints] == [(5.0, 6.0, True)]

    service.update_visualization(
        project_id,
        {
            "nodes": {part_id: {"editLocked": False}},
            "edges": {edge_id: {"editLocked": False}},
        },
    )
    project = service.get_project(project_id)
    assert project is not None
    node = project.visualization.nodes[part_id]
    edge = project.visualization.edges[edge_id]
    assert node.edit_locked is False
    assert node.x == 12
    assert node.y == 34
    assert "editLocked" not in node.to_dict()
    assert edge.edit_locked is False
    assert edge.routing == RoutingType.DIRECT
    assert [(w.x, w.y, w.locked) for w in edge.waypoints] == [(5.0, 6.0, True)]
    assert "editLocked" not in edge.to_dict()


def test_edit_locked_with_view_id_stays_on_that_view(tmp_path: Path):
    service, project_id, rel_id, other_id, part_id = _service(tmp_path)
    service.update_visualization(
        project_id,
        {"nodes": {part_id: {"x": 8, "y": 9}}},
    )
    service.update_visualization(
        project_id,
        {"viewId": rel_id, "nodes": {part_id: {"editLocked": True}}},
    )
    project = service.get_project(project_id)
    assert project is not None
    assert project.visualization.nodes[part_id].edit_locked is False
    assert project.visualization.nodes[part_id].x == 8

    rel = service.get_view(project_id, rel_id)
    other = service.get_view(project_id, other_id)
    assert rel is not None and other is not None
    assert rel["visualization"]["nodes"][part_id]["editLocked"] is True
    assert rel["visualization"]["nodes"][part_id]["x"] == 8
    assert "editLocked" not in other["visualization"]["nodes"][part_id]

    service.update_visualization(
        project_id,
        {"viewId": rel_id, "nodes": {part_id: {"editLocked": False}}},
    )
    rel = service.get_view(project_id, rel_id)
    assert rel is not None
    assert "editLocked" not in rel["visualization"]["nodes"][part_id]
    assert rel["visualization"]["nodes"][part_id]["x"] == 8

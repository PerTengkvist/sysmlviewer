"""SysML v2 views: a `view def` is a definition, a `view` usage is the diagram."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.merge import rebuild_views
from domain.models import SemanticElement
from domain.view_usage import (
    effective_view,
    is_diagram_view,
    legacy_definition_warnings,
)
from helpers import add_content_file, api_url

MODEL = """\
package P {
  part def Car;
  part car : Car {
    part engine;
  }
  interaction drive {
    lifeline driver;
  }
  view def CarViewDef :> GeneralView;
  view carView : CarViewDef { expose P::car; }
  view def SeqDef :> SequenceView;
  view seq : SeqDef { expose P::drive; }
}
"""


def _parse(text: str) -> dict[str, SemanticElement]:
    return SubsetSysmlParser().parse(text, "f").elements


def _views(text: str) -> dict[str, str | None]:
    return {v.id: v.type_ref for v in rebuild_views(_parse(text))}


# Parser


def test_view_def_is_marked_as_definition():
    elements = _parse(MODEL)

    assert elements["P::CarViewDef"].is_definition is True
    assert elements["P::carView"].is_definition is False


def test_qualified_view_type_keeps_the_last_name():
    elements = _parse(
        "package P { part a; view v : StandardViews::GeneralView { expose P::a; } }"
    )

    assert elements["P::v"].type_ref == "GeneralView"


def test_bodiless_view_usage_is_parsed():
    elements = _parse(
        "package P { part a; view def D :> GeneralView { expose P::a; } view v : D; }"
    )

    assert elements["P::v"].type_ref == "D"
    assert "P::a" not in elements["P::v"].expose_refs


def test_definition_flag_round_trips_through_json():
    element = _parse(MODEL)["P::CarViewDef"]

    assert element.to_dict()["isDefinition"] is True
    assert SemanticElement.from_dict(element.to_dict()).is_definition is True
    assert "isDefinition" not in _parse(MODEL)["P::carView"].to_dict()


# Which views are diagrams


def test_used_definition_is_not_a_diagram_but_its_usage_is():
    assert _views(MODEL) == {"P::carView": "GeneralView", "P::seq": "SequenceView"}


def test_definition_used_through_a_specialization_is_not_a_diagram():
    text = """\
package P {
  part a;
  view def Base :> InterconnectionView;
  view def Special :> Base;
  view v : Special { expose P::a; }
}
"""
    assert _views(text) == {"P::v": "InterconnectionView"}


def test_unused_definition_is_still_a_diagram():
    text = """\
package P {
  part a;
  view def Old : GeneralView { expose P::a; }
  view def Bare : GeneralView;
}
"""
    assert _views(text) == {"P::Bare": "GeneralView", "P::Old": "GeneralView"}


def test_usage_typed_by_a_standard_view_is_a_diagram():
    elements = _parse("package P { part a; view v : GeneralView { expose P::a; } }")

    assert is_diagram_view(elements["P::v"], elements)


# What a usage inherits


def test_usage_inherits_expose_and_filters_from_its_definition():
    text = """\
package P {
  part a;
  part b;
  view def D :> GeneralView {
    expose P::a;
    filter @SysML::PartUsage;
  }
  view v : D;
}
"""
    elements = _parse(text)

    view_type, exposed, filters = effective_view(elements["P::v"], elements)

    assert view_type == "GeneralView"
    assert exposed == ["P::a"]
    assert filters == elements["P::D"].view_filters
    assert filters


def test_usage_keeps_its_own_expose():
    text = """\
package P {
  part a;
  part b;
  view def D :> GeneralView { expose P::a; }
  view v : D { expose P::b; }
}
"""
    elements = _parse(text)

    assert effective_view(elements["P::v"], elements)[1] == ["P::b"]


def test_cyclic_or_unknown_types_fall_back():
    text = """\
package P {
  part a;
  view def A :> B;
  view def B :> A;
  view v : A { expose P::a; }
  view w : Unknown { expose P::a; }
}
"""
    elements = _parse(text)

    assert effective_view(elements["P::v"], elements)[0] is None
    assert effective_view(elements["P::w"], elements)[0] == "Unknown"


# Warnings


def test_definition_shown_as_diagram_is_warned_about():
    text = """\
package P {
  part a;
  view def Old : GeneralView { expose P::a; }
}
"""
    warnings = legacy_definition_warnings(_parse(text))

    assert len(warnings) == 1
    file_id, message = warnings[0]
    assert file_id == "f"
    assert "view def 'Old' is shown as a diagram" in message
    assert "view Old : GeneralView" in message


def test_standard_views_are_not_warned_about():
    assert legacy_definition_warnings(_parse(MODEL)) == []


# Through the API


def _project(tmp_path: Path, text: str) -> tuple[TestClient, str, dict]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "V"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "m.sysml", text)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    return client, project_id, project


def test_project_lists_usages_as_diagrams(tmp_path: Path):
    _, _, project = _project(tmp_path, MODEL)

    assert sorted(v["id"] for v in project["views"]) == ["P::carView", "P::seq"]
    assert project["semantic"]["P::CarViewDef"]["isDefinition"] is True


def test_usage_opens_with_the_type_of_its_definition(tmp_path: Path):
    client, project_id, _ = _project(tmp_path, MODEL)

    car = client.get(api_url(f"/projects/{project_id}/views/P::carView")).json()
    seq = client.get(api_url(f"/projects/{project_id}/views/P::seq")).json()

    assert car["view"]["rootArtifactId"] == "P::car"
    assert car["diagramMode"] == "whitebox"
    assert "P::car::engine" in car["semantic"]
    assert seq["diagramMode"] == "sequence"
    assert seq["view"]["typeRef"] == "SequenceView"


def test_usage_without_expose_shows_what_its_definition_exposes(tmp_path: Path):
    text = """\
package P {
  part car { part engine; }
  part other;
  view def D :> GeneralView { expose P::car; }
  view v : D;
}
"""
    client, project_id, _ = _project(tmp_path, text)

    view = client.get(api_url(f"/projects/{project_id}/views/P::v")).json()

    assert view["view"]["rootArtifactId"] == "P::car"
    assert "P::other" not in view["semantic"]


def test_package_opens_its_usage(tmp_path: Path):
    client, project_id, _ = _project(tmp_path, MODEL)

    view = client.get(api_url(f"/projects/{project_id}/views/artifact::P")).json()

    assert view["view"]["id"] == "P::carView"


def test_legacy_definition_warning_reaches_the_file(tmp_path: Path):
    text = "package P { part a; view def Old : GeneralView { expose P::a; } }"
    _, _, project = _project(tmp_path, text)

    warnings = project["files"][0]["warnings"]

    assert sum("view def 'Old' is shown as a diagram" in w for w in warnings) == 1

"""Qualified expose paths resolve to distinct view roots."""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.merge import rebuild_views


NESTED = """
package HierarchicalPartsPkg {
  package PartDefinitions {
    part FD1 { part F1; }
    part FD2 { part F2; }
    part FD3 { part F3; }
  }

  view def HierarchicalPartsView : GeneralView {
    expose PartDefinitions;
  }

  view def FD1View : GeneralView {
    expose PartDefinitions::FD1;
  }

  view def FD2View : GeneralView {
    expose PartDefinitions::FD2;
  }

  view def FD3View : GeneralView {
    expose PartDefinitions::FD3;
  }
}
"""


def test_qualified_expose_resolves_nested_parts():
    result = SubsetSysmlParser().parse(NESTED, "f1")
    assert (
        result.elements["HierarchicalPartsPkg::HierarchicalPartsView"].expose_ref
        == "HierarchicalPartsPkg::PartDefinitions"
    )
    assert (
        result.elements["HierarchicalPartsPkg::FD1View"].expose_ref
        == "HierarchicalPartsPkg::PartDefinitions::FD1"
    )
    assert (
        result.elements["HierarchicalPartsPkg::FD2View"].expose_ref
        == "HierarchicalPartsPkg::PartDefinitions::FD2"
    )
    assert (
        result.elements["HierarchicalPartsPkg::FD3View"].expose_ref
        == "HierarchicalPartsPkg::PartDefinitions::FD3"
    )

    views = {v.name: v for v in rebuild_views(result.elements)}
    assert views["FD1View"].root_artifact_id.endswith("::FD1")
    assert views["FD2View"].root_artifact_id.endswith("::FD2")
    assert views["FD3View"].root_artifact_id.endswith("::FD3")
    assert views["FD1View"].root_artifact_id != views["FD2View"].root_artifact_id

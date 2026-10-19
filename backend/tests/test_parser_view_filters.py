"""Parser stores SysML view filter clauses (alpha subset)."""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind


SRC = """
package FilterPkg {
  part Car {
    part battery;
    part motor;
    connection powerBus connect battery to motor;
    connection signalX connect battery to motor;
    dependency d1 from battery to motor;
  }

  view def ConnectionsOnly : GeneralView {
    expose Car;
    filter @ConnectionUsage;
  }

  view def QualifiedMeta : GeneralView {
    expose Car;
    filter @SysML::ConnectionUsage;
  }

  view def PowerConnections : GeneralView {
    expose Car;
    filter @SysML::ConnectionUsage;
    filter name.startsWith("power");
  }

  view def NameOnly : GeneralView {
    expose Car;
    filter name.startsWith("power");
  }

  view def BadThenGood : GeneralView {
    expose Car;
    filter not @ConnectionUsage;
    filter @ConnectionUsage;
  }

  view def PlainView : GeneralView {
    expose Car;
  }

  view def PartsPortsConnections : GeneralView {
    expose Car;
    filter @PartUsage or @PortUsage or @ConnectionUsage;
  }
}
"""


def test_filter_at_connection_usage_short():
    result = SubsetSysmlParser().parse(SRC, "f1")
    view = result.elements["FilterPkg::ConnectionsOnly"]
    assert view.kind == ArtifactKind.VIEW
    assert view.view_filters == [{"op": "metaclass", "ref": "ConnectionUsage"}]
    assert not any("'filter' ignored" in w for w in result.warnings)


def test_filter_at_qualified_connection_usage():
    result = SubsetSysmlParser().parse(SRC, "f1")
    view = result.elements["FilterPkg::QualifiedMeta"]
    assert view.view_filters == [
        {"op": "metaclass", "ref": "SysML::ConnectionUsage"}
    ]


def test_filter_name_startswith():
    result = SubsetSysmlParser().parse(SRC, "f1")
    view = result.elements["FilterPkg::NameOnly"]
    assert view.view_filters == [
        {"op": "nameStartsWith", "prefix": "power"}
    ]


def test_two_filters_preserved_in_order():
    result = SubsetSysmlParser().parse(SRC, "f1")
    view = result.elements["FilterPkg::PowerConnections"]
    assert view.view_filters == [
        {"op": "metaclass", "ref": "SysML::ConnectionUsage"},
        {"op": "nameStartsWith", "prefix": "power"},
    ]


def test_unsupported_filter_warns_and_keeps_next():
    result = SubsetSysmlParser().parse(SRC, "f1")
    view = result.elements["FilterPkg::BadThenGood"]
    assert view.view_filters == [{"op": "metaclass", "ref": "ConnectionUsage"}]
    assert any("unsupported filter" in w for w in result.warnings)


def test_view_without_filter_has_empty_list():
    result = SubsetSysmlParser().parse(SRC, "f1")
    view = result.elements["FilterPkg::PlainView"]
    assert view.view_filters == []


def test_filter_metaclass_or_chain():
    result = SubsetSysmlParser().parse(SRC, "f1")
    view = result.elements["FilterPkg::PartsPortsConnections"]
    assert view.view_filters == [
        {
            "op": "metaclassAny",
            "refs": ["PartUsage", "PortUsage", "ConnectionUsage"],
        }
    ]


def test_hbox_or_metadata_filter_unsupported_not_ignored_keyword():
    """examples/diagrams/hbox.sysml uses `filter @status or @eventlog` (v1 unsupported)."""
    from helpers import resolve_example_path

    content = resolve_example_path("hbox.sysml").read_text(encoding="utf-8")
    result = SubsetSysmlParser().parse(content, "hbox")
    assert not any("'filter' ignored" in w for w in result.warnings)
    assert any("unsupported filter expression" in w for w in result.warnings)
    view = result.elements.get("hbox::HBoxView")
    assert view is not None
    assert view.view_filters == []

"""`perform` references: `perform action x;`, `perform flow.step;`, `perform A::b.c;`."""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind


def _parse(content: str, file_id: str = "f1"):
    return SubsetSysmlParser().parse(content, file_id=file_id)


def _performs(result, parent_id: str):
    return [
        e
        for e in result.elements.values()
        if e.kind == ArtifactKind.ACTION
        and e.parent_id == parent_id
        and "perform" in (e.metadata_keywords or [])
    ]


FLOW = """
    action flow {
      action step;
      action other;
      first start;
      then step;
      then other;
      then done;
    }
"""


def test_perform_action_keyword_names_the_action():
    result = _parse(
        """
        package P {
          action x;
          part def A {
            perform action x;
          }
        }
        """
    )
    (perf,) = _performs(result, "P::A")
    assert perf.name == "x"
    assert perf.type_ref == "x"
    assert perf.metadata_keywords == ["perform"]
    assert "P::A::action" not in result.elements
    assert result.warnings == []


def test_perform_dotted_reference():
    result = _parse(
        f"""
        package P {{
          part def F {{
            part a {{
              perform flow.step;
            }}
            {FLOW}
          }}
        }}
        """
    )
    (perf,) = _performs(result, "P::F::a")
    assert perf.id == "P::F::a::step"
    assert perf.name == "step"
    assert perf.type_ref == "flow.step"
    assert result.warnings == []


def test_perform_qualified_and_dotted_reference():
    result = _parse(
        f"""
        package Pkg {{
          part def Fn {{
            {FLOW}
          }}
          part def B {{
            perform Pkg::Fn::flow.step;
          }}
        }}
        """
    )
    (perf,) = _performs(result, "Pkg::B")
    assert perf.name == "step"
    assert perf.type_ref == "Pkg::Fn::flow.step"
    assert result.warnings == []


def test_performs_in_a_part_are_not_chained_into_successions():
    result = _parse(
        f"""
        package P {{
          part def F {{
            part a {{
              perform flow.step;
              perform flow.other;
            }}
            {FLOW}
          }}
        }}
        """
    )
    assert {p.name for p in _performs(result, "P::F::a")} == {"step", "other"}
    succ_in_part = [
        e
        for e in result.elements.values()
        if e.kind == ArtifactKind.SUCCESSION and e.parent_id == "P::F::a"
    ]
    assert succ_in_part == []


def test_then_perform_in_an_action_still_links_the_flow():
    result = _parse(
        """
        package P {
          action def Sub;
          action flow {
            first start;
            then perform Sub;
            then done;
          }
        }
        """
    )
    (perf,) = _performs(result, "P::flow")
    assert perf.type_ref == "Sub"
    pairs = {
        (e.source_id, e.target_id)
        for e in result.elements.values()
        if e.kind == ArtifactKind.SUCCESSION and e.parent_id == "P::flow"
    }
    assert ("P::flow::start", "P::flow::Sub") in pairs
    assert ("P::flow::Sub", "P::flow::done") in pairs


def test_standalone_perform_in_an_action_still_links_the_flow():
    result = _parse(
        """
        package P {
          action def Sub;
          action flow {
            first start;
            perform Sub;
            then done;
          }
        }
        """
    )
    pairs = {
        (e.source_id, e.target_id)
        for e in result.elements.values()
        if e.kind == ArtifactKind.SUCCESSION and e.parent_id == "P::flow"
    }
    assert ("P::flow::start", "P::flow::Sub") in pairs

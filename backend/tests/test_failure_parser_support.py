"""Characterisation of the parser support the failure-impact engine relies on."""

from __future__ import annotations

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import SysmlFile

POOL_MODEL = """
package P {
  part def M { attribute capacityKWh = 7.5; }
  part def V {
    part pack {
      #Pool part modules[8] : M;
      attribute required = 45;
    }
  }
}
"""

LIBRARY = """
package FailureModel {
  enum def FailureKind { loss; degraded; erroneous; }
  metadata def Single;
  metadata def Pool;
  metadata def Redundant;
  metadata def Soft;
}
"""


def _project(*texts: str):
    files = [
        SysmlFile(id=f"f{i}.sysml", name=f"f{i}.sysml", content=t, path=f"f{i}.sysml")
        for i, t in enumerate(texts)
    ]
    return SubsetSysmlParser().parse_project(files)


def test_pool_usage_keeps_keyword_multiplicity_and_type():
    el = _project(POOL_MODEL).elements["P::V::pack::modules"]
    assert el.metadata_keywords == ["Pool"]
    assert el.multiplicity == "8"
    assert el.type_target_id == "P::M"


def test_capacity_is_inherited_onto_pool_usage():
    elements = _project(POOL_MODEL).elements
    assert elements["P::V::pack::modules::capacityKWh"].default_value == "7.5"
    assert elements["P::V::pack::required"].default_value == "45"


def test_redundant_usage_and_named_required():
    elements = _project(
        "package P { part def B; part def V { #Redundant part brakeCircuits[2] : B;"
        " attribute brakeCircuitsRequired = 1; } }"
    ).elements
    bc = elements["P::V::brakeCircuits"]
    assert bc.metadata_keywords == ["Redundant"]
    assert bc.multiplicity == "2"
    assert elements["P::V::brakeCircuitsRequired"].default_value == "1"


def test_metadata_and_enum_defs_are_silent():
    parser = SubsetSysmlParser()
    single = parser.parse(LIBRARY, "lib.sysml")
    assert single.warnings == []
    assert set(single.elements) == {"FailureModel"}
    project = _project(LIBRARY)
    assert project.warnings == []
    assert set(project.elements) == {"FailureModel"}


def test_private_import_of_metadata_library_is_silent():
    app = "package App { private import FailureModel::*; part def X { #Pool part a[2]; } }"
    result = _project(LIBRARY, app)
    assert result.warnings == []


def test_analysis_case_is_skipped_silently():
    result = _project("package A { analysis motorLoss { subject = X; } }")
    assert result.warnings == []
    assert set(result.elements) == {"A"}


def test_metadata_body_values_are_not_kept():
    result = _project("package A { part def X { #Pool part a[2] { @Pool { required = 1; } } } }")
    assert not any(e.name == "required" for e in result.elements.values())

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind


def test_derive_and_refine_metadata():
    content = """
    package P {
      requirement def R1;
      requirement def R2;
      #derive dependency R2 to R1;
      #refine dependency R2 to R1;
    }
    """
    result = SubsetSysmlParser().parse(content, file_id="f1")
    deps = [e for e in result.elements.values() if e.kind == ArtifactKind.DEPENDENCY]
    keywords = sorted(kw for d in deps for kw in (d.metadata_keywords or []))
    assert "derive" in keywords
    assert "refine" in keywords


# --- Link-time endpoint resolution (parse_project) ---------------------------

from domain.models import SysmlFile  # noqa: E402


def _project(*contents: str):
    files = [
        SysmlFile(id=f"f{i}", name=f"f{i}.sysml", content=c, path=f"f{i}.sysml")
        for i, c in enumerate(contents, start=1)
    ]
    return SubsetSysmlParser().parse_project(files)


REQS = """
package Requirements {
  requirement def R1;
  requirement def R2;
  #refine dependency from R2 to R1;
  satisfy R1 by Arch::Car::engine;
  #refine dependency from R2 to Arch::Car::wheels;
}
"""

ARCH_OK = """
package Arch {
  part def Car {
    part engine;
    part wheels;
  }
}
"""

ARCH_FLAT = """
package Arch {
  part def Car {
    part motor;
  }
}
"""


def test_satisfy_resolved_source_is_silent():
    result = _project(REQS, ARCH_OK)
    assert result.warnings == []


def test_satisfy_unresolved_source_warns_at_link_time():
    result = _project(REQS, ARCH_FLAT)
    assert any(
        "satisfy source not found: Arch::Car::engine" in w for w in result.warnings
    ), result.warnings


def test_dependency_unresolved_target_warns_at_link_time():
    result = _project(REQS, ARCH_FLAT)
    assert any(
        "dependency target not found: Arch::Car::wheels" in w for w in result.warnings
    ), result.warnings
    # The in-package refine still resolves and stays silent.
    assert not any("Requirements::R1" in w for w in result.warnings)


def test_single_file_parse_does_not_warn_on_cross_file_endpoints():
    result = SubsetSysmlParser().parse(REQS, file_id="f1")
    assert not any("not found" in w for w in result.warnings)

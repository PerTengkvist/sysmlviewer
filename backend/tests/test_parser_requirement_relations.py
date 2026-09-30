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

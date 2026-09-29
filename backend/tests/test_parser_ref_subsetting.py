"""Parser tests for ref part, usage :>, qualified names, multiplicity-after-type."""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind


def _parse(content: str, file_id: str = "f1"):
    return SubsetSysmlParser().parse(content, file_id=file_id)


def _rels(result, kind: ArtifactKind):
    return [e for e in result.elements.values() if e.kind == kind]


def test_ref_part_creates_part_with_is_reference():
    content = """
    package P {
      part def T;
      part owner {
        ref part shared : T;
      }
    }
    """
    result = _parse(content)
    el = result.elements["P::owner::shared"]
    assert el.kind == ArtifactKind.PART
    assert el.is_reference is True
    assert el.type_ref == "T"
    assert result.elements["P::owner"].is_reference is False


def test_usage_colon_gt_creates_subsetting_edge():
    content = """
    package P {
      part def T;
      part other {
        part x : T;
      }
      part owner {
        part x : T :> other::x;
      }
    }
    """
    result = _parse(content)
    subsets = _rels(result, ArtifactKind.SUBSETTING)
    assert len(subsets) == 1
    assert subsets[0].source_id == "P::owner::x"
    assert subsets[0].target_id == "P::other::x"
    assert result.elements["P::owner::x"].type_ref == "T"


def test_subsets_qualified_name():
    content = """
    package P {
      part def FeatureHolder {
        part feat;
      }
      part consumer {
        part feat subsets FeatureHolder::feat;
      }
    }
    """
    result = _parse(content)
    subsets = _rels(result, ArtifactKind.SUBSETTING)
    assert len(subsets) == 1
    assert subsets[0].source_id == "P::consumer::feat"
    assert subsets[0].target_id == "P::FeatureHolder::feat"


def test_multiplicity_after_type():
    content = """
    package P {
      part def T;
      part owner {
        part items : T [0..*];
      }
    }
    """
    result = _parse(content)
    el = result.elements["P::owner::items"]
    assert el.type_ref == "T"
    assert el.multiplicity == "0..*"


def test_ref_part_full_arcadia_example():
    content = """
    package P {
      part def myparttype;
      part def MyAggregationPart {
        part myobj : myparttype;
      }
      part consumer {
        ref part myobj : myparttype [0..*] :> MyAggregationPart::myobj;
      }
    }
    """
    result = _parse(content)
    el = result.elements["P::consumer::myobj"]
    assert el.is_reference is True
    assert el.type_ref == "myparttype"
    assert el.multiplicity == "0..*"
    subsets = _rels(result, ArtifactKind.SUBSETTING)
    assert len(subsets) == 1
    assert subsets[0].source_id == "P::consumer::myobj"
    assert subsets[0].target_id == "P::MyAggregationPart::myobj"


def test_part_def_colon_gt_still_specialization():
    content = """
    package P {
      part def Base;
      part def Small :> Base;
    }
    """
    result = _parse(content)
    specs = _rels(result, ArtifactKind.SPECIALIZATION)
    assert len(specs) == 1
    assert specs[0].source_id == "P::Small"
    assert specs[0].target_id == "P::Base"
    assert not _rels(result, ArtifactKind.SUBSETTING)


def test_metadata_keyword_on_part_def():
    content = """
    package P {
      #mystereotype part def MyFunction;
    }
    """
    result = _parse(content)
    el = result.elements["P::MyFunction"]
    assert el.kind == ArtifactKind.PART
    assert el.metadata_keywords == ["mystereotype"]
    assert result.warnings == []


def test_metadata_keyword_on_part_usage_and_ref_part():
    content = """
    package P {
      part def T;
      part owner {
        #function part f : T;
        #shared ref part r : T;
      }
    }
    """
    result = _parse(content)
    f = result.elements["P::owner::f"]
    r = result.elements["P::owner::r"]
    assert f.metadata_keywords == ["function"]
    assert r.metadata_keywords == ["shared"]
    assert r.is_reference is True
    assert result.warnings == []


def test_multiple_metadata_keywords_on_part():
    content = """
    package P {
      #a #b part def X;
    }
    """
    result = _parse(content)
    assert result.elements["P::X"].metadata_keywords == ["a", "b"]


def test_serialize_part_with_metadata_keywords():
    from adapters.parser.subset_serializer import serialize_file
    from domain.models import SemanticElement

    semantic = {
        "P": SemanticElement(id="P", kind=ArtifactKind.PACKAGE, name="P", file_id="f1"),
        "P::MyFunction": SemanticElement(
            id="P::MyFunction",
            kind=ArtifactKind.PART,
            name="MyFunction",
            parent_id="P",
            file_id="f1",
            metadata_keywords=["mystereotype"],
        ),
    }
    semantic["P"].children = ["P::MyFunction"]
    text = serialize_file(semantic, "f1")
    assert "#mystereotype part def MyFunction {" in text

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind


def _parse(content: str, file_id: str = "f1"):
    return SubsetSysmlParser().parse(content, file_id=file_id)


def test_requirement_def_without_type():
    content = """
    package P {
      requirement def Safety;
    }
    """
    result = _parse(content)
    el = result.elements["P::Safety"]
    assert el.kind == ArtifactKind.REQUIREMENT
    assert el.type_ref is None
    assert not any("requirement" in w and "ignored" in w for w in result.warnings)


def test_requirement_type_attribute_user_story():
    content = """
    package P {
      requirement def Story {
        attribute Type = "UserStory";
      }
    }
    """
    result = _parse(content)
    el = result.elements["P::Story"]
    assert el.kind == ArtifactKind.REQUIREMENT
    attr = result.elements["P::Story::Type"]
    assert attr.kind == ArtifactKind.ATTRIBUTE
    assert attr.name == "Type"
    assert attr.default_value == '"UserStory"'


def test_requirement_usage_keeps_type_ref_and_type_attribute():
    content = """
    package P {
      requirement def SomeDef;
      requirement r1 : SomeDef {
        attribute Type = "Functional";
      }
    }
    """
    result = _parse(content)
    el = result.elements["P::r1"]
    assert el.kind == ArtifactKind.REQUIREMENT
    assert el.type_ref == "SomeDef"
    assert "P::r1::Type" in result.elements
    assert result.elements["P::r1::Type"].default_value == '"Functional"'


def test_requirement_doc_sets_documentation():
    content = """
    package P {
      requirement def Safety {
        doc /* Must shut down safely */
      }
    }
    """
    result = _parse(content)
    el = result.elements["P::Safety"]
    assert el.kind == ArtifactKind.REQUIREMENT
    assert el.documentation == "Must shut down safely"
    assert not any("doc" in w and "ignored" in w for w in result.warnings)


def test_requirement_doc_and_description_attribute_coexist():
    content = """
    package P {
      requirement def Safety {
        attribute description = "From attribute";
        doc /* From doc block */
      }
    }
    """
    result = _parse(content)
    el = result.elements["P::Safety"]
    assert el.documentation == "From doc block"
    attr = result.elements["P::Safety::description"]
    assert attr.kind == ArtifactKind.ATTRIBUTE
    assert attr.default_value == '"From attribute"'


def test_requirement_short_id():
    content = """
    package P {
      requirement def <'R-01'> Safety;
    }
    """
    result = _parse(content)
    el = result.elements["P::Safety"]
    assert el.kind == ArtifactKind.REQUIREMENT
    assert el.short_id == "R-01"
    assert el.name == "Safety"


def test_nested_requirement_parent_id():
    content = """
    package P {
      requirement def Parent {
        requirement child;
      }
    }
    """
    result = _parse(content)
    child = result.elements["P::Parent::child"]
    assert child.kind == ArtifactKind.REQUIREMENT
    assert child.parent_id == "P::Parent"
    assert "P::Parent::child" in result.elements["P::Parent"].children

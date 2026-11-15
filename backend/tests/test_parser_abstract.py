"""`abstract` prefix on definitions (part def, action def, …)."""

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.parser.subset_serializer import serialize_file
from domain.models import ArtifactKind, SemanticElement


def _parse(content: str, file_id: str = "f1"):
    return SubsetSysmlParser().parse(content, file_id=file_id)


def test_abstract_part_def_without_body():
    result = _parse(
        """
        package P {
          abstract part def FunctionNode;
        }
        """
    )
    el = result.elements["P::FunctionNode"]
    assert el.kind == ArtifactKind.PART
    assert el.is_abstract is True
    assert result.warnings == []


def test_abstract_part_def_with_body():
    result = _parse(
        """
        package P {
          abstract part def X {
            doc /* An abstract base. */
            part inner;
          }
        }
        """
    )
    el = result.elements["P::X"]
    assert el.kind == ArtifactKind.PART
    assert el.is_abstract is True
    assert el.documentation == "An abstract base."
    assert "P::X::inner" in el.children
    assert result.elements["P::X::inner"].is_abstract is False
    assert result.warnings == []


def test_usage_typed_by_abstract_def_resolves():
    result = _parse(
        """
        package P {
          abstract part def FunctionNode;
          part def F {
            part a : FunctionNode;
          }
        }
        """
    )
    assert result.elements["P::F::a"].type_ref == "FunctionNode"
    assert result.elements["P::F::a"].is_abstract is False
    assert result.warnings == []


def test_abstract_action_def():
    result = _parse(
        """
        package P {
          abstract action def F;
          abstract action def G {
            action step;
          }
        }
        """
    )
    assert result.elements["P::F"].kind == ArtifactKind.ACTION
    assert result.elements["P::F"].is_abstract is True
    assert result.elements["P::G"].is_abstract is True
    assert result.elements["P::G::step"].is_abstract is False
    assert result.warnings == []


def test_abstract_flag_does_not_leak_to_next_declaration():
    result = _parse(
        """
        package P {
          abstract part def A;
          part def B;
        }
        """
    )
    assert result.elements["P::A"].is_abstract is True
    assert result.elements["P::B"].is_abstract is False


def test_is_abstract_json_only_when_true():
    abstract = SemanticElement(
        id="A", kind=ArtifactKind.PART, name="A", is_abstract=True
    )
    concrete = SemanticElement(id="B", kind=ArtifactKind.PART, name="B")
    assert abstract.to_dict()["isAbstract"] is True
    assert "isAbstract" not in concrete.to_dict()
    assert SemanticElement.from_dict(abstract.to_dict()).is_abstract is True
    assert SemanticElement.from_dict(concrete.to_dict()).is_abstract is False


def test_serializer_round_trips_abstract():
    content = """package P {
  abstract part def FunctionNode {
  }
  abstract action def F {
    action step;
  }
}
"""
    result = _parse(content)
    text = serialize_file(result.elements, "f1")
    lines = [line.strip() for line in text.splitlines()]
    assert "abstract part def FunctionNode {" in lines
    assert "abstract action def F {" in lines
    again = _parse(text)
    assert again.elements["P::FunctionNode"].is_abstract is True
    assert again.elements["P::F"].is_abstract is True
    assert again.warnings == []

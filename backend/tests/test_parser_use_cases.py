from adapters.parser.subset_parser import SubsetSysmlParser
from domain.merge import merge_visualization
from domain.models import ArtifactKind, VisualizationModel, VisualizationNode


def _parse(content: str, file_id: str = "f1"):
    return SubsetSysmlParser().parse(content, file_id=file_id)


def test_use_case_def_and_usage():
    content = """
    package P {
      use case def Login;
      use case uc1 : Login;
    }
    """
    result = _parse(content)
    assert result.elements["P::Login"].kind == ArtifactKind.USE_CASE
    assert result.elements["P::Login"].type_ref is None
    assert result.elements["P::uc1"].kind == ArtifactKind.USE_CASE
    assert result.elements["P::uc1"].type_ref == "Login"
    assert not any("use" in w and "ignored" in w for w in result.warnings)


def test_actor_inside_use_case():
    content = """
    package P {
      use case def Login {
        actor a : Driver;
      }
    }
    """
    result = _parse(content)
    actor = result.elements["P::Login::a"]
    assert actor.kind == ArtifactKind.ACTOR
    assert actor.parent_id == "P::Login"
    assert actor.type_ref == "Driver"
    assert "P::Login::a" in result.elements["P::Login"].children


def test_subject_inside_use_case():
    content = """
    package P {
      use case def Drive {
        subject vehicle : Vehicle;
      }
    }
    """
    result = _parse(content)
    subject = result.elements["P::Drive::vehicle"]
    assert subject.kind == ArtifactKind.PART
    assert subject.parent_id == "P::Drive"
    assert subject.type_ref == "Vehicle"
    assert subject.metadata_keywords == ["subject"]


def test_include_use_case():
    content = """
    package P {
      use case def Auth;
      use case def Login {
        include use case Auth;
      }
    }
    """
    result = _parse(content)
    includes = [
        e for e in result.elements.values() if e.kind == ArtifactKind.INCLUDE
    ]
    assert len(includes) == 1
    assert includes[0].source_id == "P::Login"
    assert includes[0].target_id == "P::Auth"
    assert includes[0].id == "P::Login::include_Auth"


def test_extend_dependency_metadata():
    content = """
    package P {
      use case def A;
      use case def B;
      #extend dependency A to B;
    }
    """
    result = _parse(content)
    deps = [
        e for e in result.elements.values() if e.kind == ArtifactKind.DEPENDENCY
    ]
    assert len(deps) == 1
    assert deps[0].metadata_keywords == ["extend"]
    assert deps[0].source_id == "P::A"
    assert deps[0].target_id == "P::B"


def test_objective_points_to_requirement():
    content = """
    package P {
      requirement def R1;
      use case def Login {
        objective R1;
      }
    }
    """
    result = _parse(content)
    objs = [
        e
        for e in result.elements.values()
        if e.kind == ArtifactKind.DEPENDENCY
        and "objective" in (e.metadata_keywords or [])
    ]
    assert len(objs) == 1
    assert objs[0].source_id == "P::Login"
    assert objs[0].target_id == "P::R1"


def test_use_case_merge_preserves_layout():
    content = """
    package P {
      use case def Login;
      use case def Auth;
    }
    """
    result = _parse(content)
    existing = VisualizationModel(
        nodes={
            "P::Login": VisualizationNode(
                artifact_id="P::Login", x=10, y=20, width=120, height=60
            )
        }
    )
    merged = merge_visualization(result.elements, existing)
    assert merged.nodes["P::Login"].x == 10
    assert merged.nodes["P::Login"].y == 20
    assert "P::Auth" in merged.nodes

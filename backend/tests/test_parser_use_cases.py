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


def test_case_scenario_perform_and_branch_flow():
    content = """
    package P {
      case def CaseScenario;
      case scenarioA : CaseScenario {
        first start;
        then action doA;
        then done;
      }
      use case def Pay {
        subject system : System;
        actor user : Person;
        objective {
          doc /* Pay the fare */
        }
        first start;
        then perform scenarioA;
        then if chooseC then stepC else stepD;
        then done;
        action stepC;
        action stepD;
      }
    }
    """
    result = _parse(content)
    assert result.elements["P::CaseScenario"].kind == ArtifactKind.CASE
    scenario = result.elements["P::scenarioA"]
    assert scenario.kind == ArtifactKind.CASE
    assert scenario.type_ref == "CaseScenario"
    succ_a = [
        e
        for e in result.elements.values()
        if e.kind == ArtifactKind.SUCCESSION and e.parent_id == "P::scenarioA"
    ]
    assert any(e.source_id == "P::scenarioA::start" and e.target_id == "P::scenarioA::doA" for e in succ_a)
    assert any(e.source_id == "P::scenarioA::doA" and e.target_id == "P::scenarioA::done" for e in succ_a)

    pay = result.elements["P::Pay"]
    assert pay.kind == ArtifactKind.USE_CASE
    assert "Pay the fare" in (pay.documentation or "")
    assert result.elements["P::Pay::system"].metadata_keywords == ["subject"]
    assert result.elements["P::Pay::user"].kind == ArtifactKind.ACTOR

    performs = [
        e
        for e in result.elements.values()
        if e.kind == ArtifactKind.ACTION
        and e.parent_id == "P::Pay"
        and "perform" in (e.metadata_keywords or [])
    ]
    assert any(e.type_ref == "scenarioA" or e.name == "scenarioA" for e in performs)

    decide = [
        e
        for e in result.elements.values()
        if e.kind == ArtifactKind.ACTION
        and e.parent_id == "P::Pay"
        and (e.type_ref or "").lower() in {"decide", "decision", "condition"}
    ]
    assert decide, "expected a decide node for if/else"
    branches = [
        e
        for e in result.elements.values()
        if e.kind == ArtifactKind.SUCCESSION and e.parent_id == "P::Pay"
    ]
    assert any(e.target_id == "P::Pay::stepC" for e in branches)
    assert any(e.target_id == "P::Pay::stepD" for e in branches)


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

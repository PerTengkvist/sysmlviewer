"""Which part performs which flow action (`perform flow.step;` in a part)."""

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import SysmlFile
from domain.perform import resolve_performers

from helpers import add_content_file, api_url

MODEL = """
package Functions {
  abstract part def FunctionNode;
  part def Security {
    part authenticate : FunctionNode {
      perform securityFlow.checkCredential;
      perform securityFlow.rejectKey;
    }
    part lockControl : FunctionNode {
      perform Functions::Security::securityFlow.unlockDoors;
    }
    action securityFlow {
      action checkCredential;
      action unlockDoors;
      action rejectKey;
      first start;
      then checkCredential;
      then if credentialValid then unlockDoors else rejectKey;
      then done;
    }
  }
  view SecurityFlowView : ActionFlowView {
    expose Security::securityFlow;
  }
}
"""

FLOW = "Functions::Security::securityFlow"


def _parse_project(*contents: str):
    files = [
        SysmlFile(id=f"f{i}.sysml", name=f"f{i}.sysml", content=c, path=f"f{i}.sysml")
        for i, c in enumerate(contents)
    ]
    return SubsetSysmlParser().parse_project(files)


def test_resolve_performers_maps_flow_actions_to_parts():
    result = _parse_project(MODEL)
    performers = resolve_performers(result.elements)
    assert performers == {
        f"{FLOW}::checkCredential": ["Functions::Security::authenticate"],
        f"{FLOW}::rejectKey": ["Functions::Security::authenticate"],
        f"{FLOW}::unlockDoors": ["Functions::Security::lockControl"],
    }
    assert result.warnings == []


def test_first_segment_is_searched_up_through_the_owners():
    nested = """
    package P {
      part def F {
        action flow { action step; }
        part outer {
          part inner {
            perform flow.step;
          }
        }
      }
    }
    """
    performers = resolve_performers(_parse_project(nested).elements)
    assert performers == {"P::F::flow::step": ["P::F::outer::inner"]}


def test_two_parts_can_perform_the_same_action():
    model = """
    package P {
      part def F {
        action flow { action step; }
        part a { perform flow.step; }
        part b { perform flow.step; }
      }
    }
    """
    performers = resolve_performers(_parse_project(model).elements)
    assert performers == {"P::F::flow::step": ["P::F::a", "P::F::b"]}


def test_perform_in_another_file_resolves():
    flow_file = """
    package P {
      part def F {
        action flow { action step; }
      }
    }
    """
    part_file = """
    package Q {
      part def G {
        part a { perform P::F::flow.step; }
      }
    }
    """
    result = _parse_project(flow_file, part_file)
    assert resolve_performers(result.elements) == {"P::F::flow::step": ["Q::G::a"]}
    assert result.warnings == []


def test_unresolved_perform_warns_in_parse_project():
    model = """
    package P {
      part def F {
        action flow { action step; }
        part a { perform flow.missing; }
      }
    }
    """
    result = _parse_project(model)
    assert resolve_performers(result.elements) == {}
    assert any(
        "perform" in w and "flow.missing" in w and "P::F::a" in w
        for w in result.warnings
    ), result.warnings
    assert len(result.warnings) == 1, result.warnings


def test_then_perform_in_a_use_case_does_not_warn():
    model = """
    package P {
      case def CaseScenario;
      case scenarioA : CaseScenario;
      use case def Pay {
        first start;
        then perform scenarioA;
        then done;
      }
    }
    """
    result = _parse_project(model)
    assert result.warnings == []
    assert resolve_performers(result.elements) == {}


def test_action_flow_view_payload_has_performers(tmp_path):
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "Perf"}).json()["id"]
    add_content_file(client, pid, tmp_path, "functions.sysml", MODEL)

    res = client.get(api_url(f"/projects/{pid}/views/Functions::SecurityFlowView"))
    assert res.status_code == 200, res.text
    view = res.json()
    assert view["diagramMode"] == "actionFlow"
    assert "modeError" not in view
    assert view["performers"] == {
        f"{FLOW}::checkCredential": ["Functions::Security::authenticate"],
        f"{FLOW}::rejectKey": ["Functions::Security::authenticate"],
        f"{FLOW}::unlockDoors": ["Functions::Security::lockControl"],
    }
    # Performer parts are in the payload so their names can be shown.
    assert view["semantic"]["Functions::Security::authenticate"]["name"] == "authenticate"
    assert view["semantic"]["Functions::Security::lockControl"]["name"] == "lockControl"
    # A new view has no layout of its own; positions come from the project.
    assert view["hasViewLayout"] is False


# --- Imports, fallback, line numbers ----------------------------------------

LIB = """
package Lib {
  action payStep;
}
"""


def test_perform_through_a_wildcard_import_in_a_use_case_does_not_warn():
    app = """
    package App {
      private import Lib::*;
      use case def Buy {
        first start;
        then perform payStep;
        then done;
      }
    }
    """
    result = _parse_project(LIB, app)
    assert result.warnings == []
    assert result.elements["App::Buy::payStep"].perform_target_id == "Lib::payStep"


def test_perform_through_an_import_in_a_part_has_a_performer():
    app = """
    package App {
      private import Lib::*;
      part def Shop {
        part clerk { perform payStep; }
      }
    }
    """
    result = _parse_project(LIB, app)
    assert result.warnings == []
    assert resolve_performers(result.elements) == {"Lib::payStep": ["App::Shop::clerk"]}


def test_perform_through_a_member_import():
    app = """
    package App {
      import Lib::payStep;
      part def Shop {
        part clerk { perform payStep; }
      }
    }
    """
    result = _parse_project(LIB, app)
    assert result.warnings == []
    assert resolve_performers(result.elements) == {"Lib::payStep": ["App::Shop::clerk"]}


def test_perform_falls_back_to_the_name_check_before_warning():
    # `elsewhere.step` does not resolve as a path, but `step` names an action.
    model = """
    package P {
      action flow { action step; }
      part def F {
        part a { perform elsewhere.step; }
      }
    }
    """
    result = _parse_project(model)
    assert result.warnings == []
    assert resolve_performers(result.elements) == {}


def test_unresolved_perform_warning_has_a_line_number():
    model = """package P {
  part def F {
    action flow { action step; }
    part a {
      perform flow.missing;
    }
  }
}
"""
    result = _parse_project(model)
    assert result.warnings == [
        "line 5: perform target not found: flow.missing (in 'P::F::a')"
    ]
    single = SubsetSysmlParser().parse(model, file_id="f0.sysml")
    assert single.warnings == [
        "line 5: perform target not found: flow.missing (in 'P::F::a')"
    ]


def test_perform_target_id_is_written_only_when_set():
    result = _parse_project(MODEL)
    perform = result.elements["Functions::Security::authenticate::perform_securityFlow_checkCredential"]
    assert perform.to_dict()["performTargetId"] == f"{FLOW}::checkCredential"
    assert "performTargetId" not in result.elements[f"{FLOW}::checkCredential"].to_dict()
    from domain.models import SemanticElement

    assert SemanticElement.from_dict(perform.to_dict()).perform_target_id == (
        f"{FLOW}::checkCredential"
    )

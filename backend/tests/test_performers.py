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

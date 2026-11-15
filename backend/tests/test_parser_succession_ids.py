"""Anonymous successions, messages and transitions are numbered per owner.

Their ids (`<owner>::succN`, `<owner>::msgN`, `<owner>::tN`) are artifact ids that
view layouts and the visualization key on, so editing one flow must not rename the
edges of another flow in the same file.
"""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind


def _parse(content: str):
    result = SubsetSysmlParser().parse(content, file_id="f1")
    assert result.warnings == []
    return result


def _ids(result, kind: ArtifactKind, parent: str) -> list[str]:
    return sorted(
        e.id
        for e in result.elements.values()
        if e.kind == kind and e.parent_id == parent
    )


def _succ(result, parent: str) -> list[str]:
    return _ids(result, ArtifactKind.SUCCESSION, parent)


def _flow_use_case(name: str) -> str:
    return f"""
      use case def {name} {{
        first start;
        then action a;
        then action b;
        then done;
      }}
    """


def test_two_use_cases_in_one_file_number_their_successions_from_one():
    result = _parse(
        "package P {" + _flow_use_case("First") + _flow_use_case("Second") + "}"
    )
    for uc in ("P::First", "P::Second"):
        assert _succ(result, uc) == [f"{uc}::succ1", f"{uc}::succ2", f"{uc}::succ3"]


def test_adding_a_flow_before_another_keeps_its_ids():
    alone = _parse("package P {" + _flow_use_case("Charge") + "}")
    with_brake = _parse(
        "package P {" + _flow_use_case("Brake") + _flow_use_case("Charge") + "}"
    )
    before = {
        e.id: (e.source_id, e.target_id)
        for e in alone.elements.values()
        if e.kind == ArtifactKind.SUCCESSION
    }
    after = {
        e.id: (e.source_id, e.target_id)
        for e in with_brake.elements.values()
        if e.kind == ArtifactKind.SUCCESSION and e.parent_id == "P::Charge"
    }
    assert after == before


def test_function_flow_and_use_case_flow_are_numbered_per_owner():
    result = _parse(
        """
        package P {
          part def Security {
            action securityFlow {
              action check;
              action unlock;
              first start;
              then check;
              then unlock;
              then done;
            }
          }
          part def Charging {
            action chargingFlow {
              action plug;
              action charge;
              first start;
              then plug;
              then charge;
              then done;
            }
          }
          use case def Charge {
            first start;
            then action plugIn;
            then done;
          }
        }
        """
    )
    for flow in ("P::Security::securityFlow", "P::Charging::chargingFlow"):
        assert _succ(result, flow) == [f"{flow}::succ{i}" for i in (1, 2, 3)]
    assert _succ(result, "P::Charge") == ["P::Charge::succ1", "P::Charge::succ2"]


def test_first_then_and_succession_statements_share_the_owner_counter():
    result = _parse(
        """
        package P {
          action def One {
            action a;
            action b;
            action c;
            first a then b;
            succession first b then c;
          }
          action def Two {
            action x;
            action y;
            succession first x then y;
          }
        }
        """
    )
    assert _succ(result, "P::One") == ["P::One::succ1", "P::One::succ2"]
    assert _succ(result, "P::Two") == ["P::Two::succ1"]


def test_named_successions_and_branches_keep_their_names():
    result = _parse(
        """
        package P {
          action def Flow {
            action a;
            action b;
            action yes;
            action no;
            first start;
            then a;
            succession aToB first a then b;
            then if ok then yes else no;
            first yes then done;
            first no then done;
          }
        }
        """
    )
    assert _succ(result, "P::Flow") == sorted(
        [
            "P::Flow::succ1",  # start -> a
            "P::Flow::aToB",
            "P::Flow::succ2",  # b -> ok (the guard follows the last step)
            "P::Flow::if_ok_yes",
            "P::Flow::if_ok_else",
            "P::Flow::succ3",  # yes -> done
            "P::Flow::succ4",  # no -> done
        ]
    )


def test_messages_are_numbered_per_interaction():
    def seq(name: str) -> str:
        return f"""
          interaction def {name} {{
            lifeline A;
            lifeline B;
            message ping from A to B;
            then message pong from B to A;
          }}
        """

    result = _parse("package P {" + seq("Unlock") + seq("Lock") + "}")
    for owner in ("P::Unlock", "P::Lock"):
        assert _ids(result, ArtifactKind.MESSAGE, owner) == [
            f"{owner}::msg1",
            f"{owner}::msg2",
        ]


def test_anonymous_transitions_are_numbered_per_state_def():
    def machine(name: str) -> str:
        return f"""
          state def {name} {{
            state Off;
            state On;
            transition from Off to On;
            transition from On to Off;
          }}
        """

    result = _parse("package P {" + machine("Door") + machine("Window") + "}")
    for owner in ("P::Door", "P::Window"):
        assert _ids(result, ArtifactKind.TRANSITION, owner) == [
            f"{owner}::t1",
            f"{owner}::t2",
        ]

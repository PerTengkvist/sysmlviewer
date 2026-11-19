"""Message ends in an occurrence: lifeline, event, materialised features."""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind, SysmlFile
from domain.occurrence import sequence_lifelines

DEFS = """
  part def KeyFob { event occurrence pressed; }
  part def Car { part keyFob : KeyFob; part locks; part battery; }
  part def Base { event occurrence ping; }
  part def Sub :> Base;
  part def PartA { event occurrence sent; }
  part def PartB { event occurrence received; }
"""


def _parse(body: str, defs: str = DEFS):
    return SubsetSysmlParser().parse(
        f"package P {{ {defs} occurrence def S {{ {body} }} }}", "f1"
    )


def _project(files: dict[str, str]):
    return SubsetSysmlParser().parse_project(
        [SysmlFile(id=k, name=k, content=v) for k, v in files.items()]
    )


def _redefs(r):
    return [e for e in r.elements.values() if e.kind == ArtifactKind.REDEFINITION]


def test_reference_example_resolves():
    text = """
    package P {
      part def PartA { event occurrence sent; }
      part def PartB { event occurrence received; }
      part partA : PartA;
      part partB : PartB;
      occurrence def sequenceA {
         part a :>> partA;
         part b :>> partB;
         message msg from a.sent to b.received;
      }
    }"""
    r = SubsetSysmlParser().parse(text, "f1")
    msg = r.elements["P::sequenceA::msg"]
    assert (msg.source_id, msg.target_id) == ("P::sequenceA::a", "P::sequenceA::b")
    assert (msg.source_event_id, msg.target_event_id) == (
        "P::PartA::sent",
        "P::PartB::received",
    )
    assert r.warnings == []


def test_reference_example_without_context_warns_but_draws():
    text = """
    part def PartA { event occurrence sent; }
    part def PartB { event occurrence received; }
    occurrence def sequenceA {
       part a :>> partA;
       part b :>> partB;
       message msg from a.sent to b.received;
    }"""
    r = _project({"f1": text})
    msg = r.elements["sequenceA::msg"]
    assert (msg.source_id, msg.target_id) == ("sequenceA::a", "sequenceA::b")
    assert msg.source_event_id == "sequenceA::a::sent"
    warnings = [w for w in r.warnings if "no event" in w]
    assert len(warnings) == 2
    assert "no event 'sent' on 'a'; drawn on the part" in warnings[0]
    # a one-file parse cannot see the missing context, so it stays quiet
    assert SubsetSysmlParser().parse(text, "f1").warnings == []


def test_event_via_type():
    r = _parse("ref part keyFob : KeyFob; part b; message m from keyFob.pressed to b;")
    assert r.elements["P::S::m"].source_event_id == "P::KeyFob::pressed"
    assert r.warnings == []


def test_event_via_specialized_type():
    r = _parse("ref part s : Sub; part b; message m from s.ping to b;")
    assert r.elements["P::S::m"].source_event_id == "P::Base::ping"
    assert r.warnings == []


def test_event_in_local_part_body():
    r = _parse(
        "ref part a : PartA { event occurrence ping; } part b; "
        "message m from a.ping to b;"
    )
    assert r.elements["P::S::m"].source_event_id == "P::S::a::ping"
    assert r.warnings == []


def test_event_via_chain_subsetting():
    r = _parse(
        "ref part car : Car; ref part keyFob :> car.keyFob; part b; "
        "message m from keyFob.pressed to b;"
    )
    assert r.elements["P::S::m"].source_event_id == "P::KeyFob::pressed"
    assert r.warnings == []


def test_event_via_qualified_subsetting():
    r = _parse(
        "ref part keyFob :> P::Car::keyFob; part b; message m from keyFob.pressed to b;"
    )
    assert r.elements["P::S::m"].source_event_id == "P::KeyFob::pressed"
    assert r.warnings == []


def test_event_via_typed_and_subsetting_type_wins():
    defs = DEFS + """
      part def Other { event occurrence pressed; }
      part def Holder { part keyFob : Other; }
    """
    r = _parse(
        "ref part h : Holder; ref part k : KeyFob :> h.keyFob; part b; "
        "message m from k.pressed to b;",
        defs,
    )
    assert r.elements["P::S::m"].source_event_id == "P::KeyFob::pressed"


def test_end_without_event():
    r = _parse("message m from a to b;")
    msg = r.elements["P::S::m"]
    assert msg.source_event_id is None and msg.target_event_id is None


def test_unknown_part_end():
    r = _parse("message m from zz to b;")
    assert r.elements["P::S::m"].source_id == "P::S::zz"
    assert any("is not a part of 'P::S'" in w for w in r.warnings)


def test_nested_local_part_is_the_lifeline():
    r = _parse(
        "ref part vehicle { part cc { event occurrence r; } } part a; "
        "message m from a to vehicle.cc.r;"
    )
    msg = r.elements["P::S::m"]
    assert msg.target_id == "P::S::vehicle::cc"
    assert msg.target_event_id == "P::S::vehicle::cc::r"
    assert not [i for i in r.elements if i.startswith("P::S::a::")]
    assert r.warnings == []


def test_nested_end_materializes_inherited_feature():
    r = _parse(
        "ref part car : Car; message m from car.keyFob.pressed to car.locks;"
    )
    msg = r.elements["P::S::m"]
    assert msg.source_id == "P::S::car::keyFob"
    assert msg.target_id == "P::S::car::locks"
    kf = r.elements["P::S::car::keyFob"]
    assert (kf.kind, kf.parent_id, kf.type_target_id) == (
        ArtifactKind.PART,
        "P::S::car",
        "P::KeyFob",
    )
    assert any(
        e.source_id == "P::S::car::keyFob" and e.target_id == "P::Car::keyFob"
        for e in _redefs(r)
    )
    assert msg.source_event_id == "P::KeyFob::pressed"
    assert "P::S::car::battery" not in r.elements
    assert r.warnings == []


def test_path_through_non_part_warns():
    r = _parse("ref part car : Car; message m from a to car.nope.r;")
    assert r.elements["P::S::m"].target_id == "P::S::car"
    assert any("'nope' is not a part of 'car'; drawn on 'car'" in w for w in r.warnings)


def test_cross_file_events_with_import():
    defs = "package Defs { part def PartA { event occurrence sent; } }"
    occ = (
        "package Seq { private import Defs::*; occurrence def S { ref part a : PartA; "
        "part b; message m from a.sent to b; } }"
    )
    r = _project({"defs.sysml": defs, "seq.sysml": occ})
    assert r.elements["Seq::S::m"].source_event_id == "Defs::PartA::sent"
    assert r.warnings == []
    assert SubsetSysmlParser().parse(occ, "seq.sysml").warnings == []


def test_payload_type_target():
    r = _parse(
        "message hello of Greeting from a to b;", "attribute def Greeting;"
    )
    assert r.elements["P::S::hello"].type_target_id == "P::Greeting"
    r2 = _parse("message hello of Nope from a to b;")
    assert any(
        "Type reference 'Nope' for 'hello' could not be resolved" in w
        for w in r2.warnings
    )


def test_sequence_lifelines_order_and_unreferenced():
    r = SubsetSysmlParser().parse(
        "package P { occurrence def S { part a; part b; part c; part d; "
        "message m1 from b to a; message m2 from a to d; } }",
        "f1",
    )
    assert sequence_lifelines(r.elements, "P::S") == ["P::S::b", "P::S::a", "P::S::d"]
    assert r.warnings == []


def test_legacy_messages_are_not_touched():
    r = SubsetSysmlParser().parse(
        "package P { interaction def I { lifeline A; lifeline B; message hi from A to B; }"
        " occurrence def S { part a; part b; message m from a to b; } }",
        "f1",
    )
    legacy = r.elements["P::I::msg1"]
    assert (legacy.source_id, legacy.target_id) == ("P::I::A", "P::I::B")
    assert legacy.source_event_id is None

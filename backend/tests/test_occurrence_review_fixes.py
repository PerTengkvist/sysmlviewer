"""Review findings on the occurrence parser: ids, clashes, types across packages."""

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.parser.subset_serializer import serialize_file
from domain.models import ArtifactKind, SysmlFile

LIB = """package L {
  part def KeyFob { event occurrence pressed; }
  part def Car { part keyFob : KeyFob; part locks; }
}"""
SEQ = """package D {
  occurrence def S {
    ref part car : L::Car;
    message m from car.keyFob.pressed to car.locks;
  }
}"""


def _project(*texts):
    files = [SysmlFile(id=f"f{i}", name=f"f{i}", content=t) for i, t in enumerate(texts)]
    return SubsetSysmlParser().parse_project(files)


def _check_cross_package(r):
    kf = r.elements["D::S::car::keyFob"]
    assert kf.type_target_id == "L::KeyFob"
    assert r.elements["D::S::m"].source_event_id == "L::KeyFob::pressed"
    assert r.warnings == []


def test_materialized_part_keeps_its_type_across_files():
    _check_cross_package(_project(LIB, SEQ))


def test_materialized_part_keeps_its_type_in_one_file():
    _check_cross_package(SubsetSysmlParser().parse(LIB + "\n" + SEQ, "f"))


def _occ(body: str, outside: str = ""):
    return SubsetSysmlParser().parse(
        f"package P {{ {outside} occurrence def S {{ {body} }} }}", "f"
    )


def test_anonymous_message_skips_taken_ids():
    r = _occ("part a; part b; message msg1 from a to b; message from b to a;")
    assert r.elements["P::S::msg1"].source_id == "P::S::a"
    assert r.elements["P::S::msg2"].source_id == "P::S::b"
    r = _occ("part msg1; part a; part b; message from a to b;")
    assert r.elements["P::S::msg1"].kind == ArtifactKind.PART
    assert r.elements["P::S::msg2"].kind == ArtifactKind.MESSAGE


def test_message_declared_before_a_part_of_the_same_name():
    r = _occ("message a from a to b; part a; part b;")
    assert r.elements["P::S::a"].kind == ArtifactKind.PART
    assert r.elements["P::S::a"].source_id is None
    msg = r.elements["P::S::a#2"]
    assert (msg.kind, msg.source_id, msg.target_id) == (
        ArtifactKind.MESSAGE, "P::S::a", "P::S::b"
    )
    assert "P::S::a#2" in r.elements["P::S"].children
    assert any("message name 'a' already names a member of 'P::S'" in w for w in r.warnings)


def test_chain_subsetting_through_a_package_level_part_is_not_redirected():
    r = _occ(
        "ref part k :> myCar.keyFob;",
        "part def KeyFob; part def Car { part keyFob : KeyFob; } part myCar : Car;",
    )
    assert r.elements["P::S::k_subsets_myCar_keyFob"].target_id == "P::myCar::keyFob"


def test_written_msg_name_survives_a_round_trip():
    r = _occ("part a; part b; message msg5 from a to b; message from b to a;")
    again = SubsetSysmlParser().parse(serialize_file(r.elements, "f"), "f")
    ids = [c for c in again.elements["P::S"].children if c.startswith("P::S::msg")]
    assert ids == ["P::S::msg5", "P::S::msg1"]


def test_payload_type_must_be_a_definition():
    r = _occ("part a; part b; part n; message m of n from a to b;")
    assert r.elements["P::S::m"].type_target_id is None
    assert any("payload type 'n' is not a definition" in w for w in r.warnings)


def test_dead_wrappers_are_gone():
    import domain.occurrence as occ

    assert not hasattr(occ, "feature_chain_end")
    assert not hasattr(occ, "resolve_event")

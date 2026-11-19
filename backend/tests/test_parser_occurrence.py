"""`occurrence def`, occurrence usages, `event occurrence`, and parts in an occurrence."""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind
from domain.occurrence import in_occurrence, owning_occurrence


def _parse(text: str):
    return SubsetSysmlParser().parse(text, file_id="f1")


def _rels(result, kind):
    return {e.id: e for e in result.elements.values() if e.kind == kind}


def test_occurrence_def_is_an_element():
    r = _parse("package P { occurrence def S { doc /* Scenario. */ } }")
    el = r.elements["P::S"]
    assert el.kind == ArtifactKind.OCCURRENCE
    assert el.is_definition is True
    assert el.documentation == "Scenario."
    assert r.warnings == []


def test_occurrence_usage_is_typed():
    r = _parse("package P { occurrence def S; occurrence run : S; }")
    run = r.elements["P::run"]
    assert run.kind == ArtifactKind.OCCURRENCE
    assert run.is_definition is False
    assert run.type_target_id == "P::S"
    assert r.warnings == []


def test_occurrence_def_specializes():
    r = _parse("package P { occurrence def S; occurrence def T :> S; }")
    specs = _rels(r, ArtifactKind.SPECIALIZATION)
    assert [(s.source_id, s.target_id) for s in specs.values()] == [("P::T", "P::S")]


def test_event_occurrence_in_part_def():
    r = _parse(
        "package P { part def PartA { event occurrence sent; "
        "event occurrence typed : Signal; } attribute def Signal; }"
    )
    events = [
        r.elements[c]
        for c in r.elements["P::PartA"].children
        if r.elements[c].kind == ArtifactKind.EVENT_OCCURRENCE
    ]
    assert [e.id for e in events] == ["P::PartA::sent", "P::PartA::typed"]
    assert events[0].type_ref is None
    assert events[1].type_ref == "Signal"
    assert r.warnings == []


def test_event_occurrence_with_body():
    r = _parse("package P { part def A { event occurrence e { doc /* d */ } } }")
    assert r.elements["P::A::e"].documentation == "d"
    assert r.warnings == []


def test_plain_event_statement_is_unchanged():
    r = _parse("package P { part def X { event e; port p; } }")
    assert "P::X::e" not in r.elements
    assert "P::X::p" in r.elements
    assert r.warnings == []


def test_metadata_def_reply_is_silent():
    r = _parse("package P { metadata def Reply; }")
    assert set(r.elements) == {"P"}
    assert r.warnings == []


# -- parts in an occurrence (steg 3) -------------------------------------

MODEL = """
package P {
  part def KeyFob; part def Plant { part controller : Ctl; part valve; } part def Ctl;
  part def Car { part keyFob : KeyFob; part locks; }
  part partC;
  %s
}
"""


def _in_occ(body: str):
    return _parse(MODEL % f"occurrence def S {{ {body} }}")


def test_form_typed_part():
    r = _in_occ("part keyFob : KeyFob;")
    el = r.elements["P::S::keyFob"]
    assert (el.kind, el.is_definition, el.is_reference) == (ArtifactKind.PART, False, False)
    assert el.type_target_id == "P::KeyFob"
    assert not _rels(r, ArtifactKind.SUBSETTING) and not _rels(r, ArtifactKind.REDEFINITION)
    assert r.warnings == []


def test_form_typed_ref_part():
    r = _in_occ("ref part keyFob : KeyFob;")
    el = r.elements["P::S::keyFob"]
    assert el.is_reference is True and el.is_definition is False
    assert el.type_target_id == "P::KeyFob"
    assert r.warnings == []


def test_form_chain_subsetting():
    r = _in_occ("ref part car : Car; ref part keyFob :> car.keyFob;")
    sub = r.elements["P::S::keyFob_subsets_car_keyFob"]
    assert sub.kind == ArtifactKind.SUBSETTING
    assert sub.source_id == "P::S::keyFob"
    assert sub.target_id == "P::Car::keyFob"
    assert "P::S::car::keyFob" not in r.elements
    assert r.warnings == []


def test_form_qualified_subsetting():
    r = _in_occ("ref part locks :> P::Car::locks;")
    sub = r.elements["P::S::locks_subsets_P_Car_locks"]
    assert sub.kind == ArtifactKind.SUBSETTING
    assert sub.target_id == "P::Car::locks"
    assert r.warnings == []


def test_form_redefinition():
    r = _in_occ("part c :>> partC; ref part :>> d;")
    red = r.elements["P::S::c_redefines_partC"]
    assert red.kind == ArtifactKind.REDEFINITION
    assert red.target_id == "P::partC"
    d = r.elements["P::S::d"]
    assert d.is_reference is True
    assert any(
        e.kind == ArtifactKind.REDEFINITION and e.source_id == "P::S::d"
        for e in r.elements.values()
    )
    assert r.warnings == []


def test_form_typed_and_subsetting():
    r = _in_occ("ref part plant : Plant; ref part ctl : Ctl :> plant.controller;")
    ctl = r.elements["P::S::ctl"]
    assert ctl.type_target_id == "P::Ctl"
    sub = r.elements["P::S::ctl_subsets_plant_controller"]
    assert sub.target_id == "P::Plant::controller"
    assert r.warnings == []


def test_chain_subsetting_outside_occurrence():
    r = _parse(
        "package P { part def KeyFob; part def Car { part keyFob : KeyFob; } "
        "part def W { part car : Car; part k :> car.keyFob; } }"
    )
    sub = r.elements["P::W::k_subsets_car_keyFob"]
    assert sub.target_id == "P::W::car::keyFob"
    assert r.warnings == []


def test_unnamed_redefinition_takes_the_feature_name():
    r = _parse("package P { part def V { part :>> wheels; } }")
    assert "P::V::wheels" in r.elements
    assert not any("part without name" in w for w in r.warnings)
    r2 = _parse("package P { part def V { part ; } }")
    assert any("part without name" in w for w in r2.warnings)


def test_typed_part_in_occurrence_gets_no_copied_features():
    r = _in_occ("ref part car : Car;")
    assert not [i for i in r.elements if i.startswith("P::S::car::")]
    r2 = _parse(MODEL % "part def W { part car : Car; }")
    assert "P::W::car::keyFob" in r2.elements


def test_owning_occurrence():
    r = _in_occ("ref part car : Car; part a { part inner; }")
    el = r.elements
    assert owning_occurrence(el, "P::S::car") == "P::S"
    assert owning_occurrence(el, "P::S::a::inner") == "P::S"
    assert owning_occurrence(el, "P::Car::keyFob") is None
    assert in_occurrence(el, "P::S::car") is True
    assert in_occurrence(el, "P::S") is False

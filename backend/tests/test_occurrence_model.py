"""Occurrence kinds and the event ids a message carries."""

from domain.models import ArtifactKind, SemanticElement


def test_new_kind_values():
    assert ArtifactKind("occurrence") is ArtifactKind.OCCURRENCE
    assert ArtifactKind("eventOccurrence") is ArtifactKind.EVENT_OCCURRENCE


def test_message_event_ids_round_trip():
    el = SemanticElement(
        id="P::S::m",
        kind=ArtifactKind.MESSAGE,
        name="m",
        source_event_id="P::A::sent",
        target_event_id="P::B::received",
    )
    data = el.to_dict()
    assert data["sourceEventId"] == "P::A::sent"
    assert data["targetEventId"] == "P::B::received"
    back = SemanticElement.from_dict(data)
    assert back.source_event_id == "P::A::sent"
    assert back.target_event_id == "P::B::received"


def test_event_keys_absent_when_unset():
    el = SemanticElement(id="P::S::m", kind=ArtifactKind.MESSAGE, name="m")
    data = el.to_dict()
    assert "sourceEventId" not in data
    assert "targetEventId" not in data
    back = SemanticElement.from_dict({k: v for k, v in data.items()})
    assert back.source_event_id is None and back.target_event_id is None

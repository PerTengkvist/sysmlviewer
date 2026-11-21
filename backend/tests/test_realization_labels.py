"""One rule for unambiguous labels (B11), served to the chain and the matrix.

The cases are those of the TypeScript port that the matrix used (labels.test.ts) and of
test_failure_labels.py; the clients now only read `chainLabels` and `matrixLabels`.
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.models import ArtifactKind, SemanticElement
from domain.realization_chain import unambiguous_labels
from helpers import add_content_file, api_url


def _sem(*items: tuple[str, str | None]) -> dict[str, SemanticElement]:
    return {
        i: SemanticElement(id=i, kind=ArtifactKind.PART, name=i.split("::")[-1], short_id=s)
        for i, s in items
    }


def test_tag_stays_in_front_of_the_suffix():
    sem = _sem(("Uc::A::Brake", "UC1"), ("Uc::B::Brake", "UC1"), ("Uc::A::Park", "UC2"))
    assert unambiguous_labels(sem, list(sem)) == {
        "Uc::A::Brake": "UC1 A::Brake",
        "Uc::B::Brake": "UC1 B::Brake",
        "Uc::A::Park": "UC2 Park",
    }


def test_tagged_and_untagged_plain_forms():
    sem = _sem(("Uc::Start", "UCA"), ("Uc::Lock", None))
    assert list(unambiguous_labels(sem, list(sem)).values()) == ["UCA Start", "Lock"]


def test_name_style_ignores_tags_and_grows_until_unique():
    sem = _sem(("X::a::F", "T"), ("Y::a::F", None), ("Y::b::F", None))
    assert unambiguous_labels(sem, list(sem), tagged=False) == {
        "X::a::F": "X::a::F",
        "Y::a::F": "Y::a::F",
        "Y::b::F": "b::F",
    }


def test_mixed_depth_and_unique_names():
    sem = _sem(("F", None), ("A::F", None), ("B::A::F", None), ("A::G", None))
    assert unambiguous_labels(sem, list(sem), tagged=False) == {
        "F": "F",
        "A::F": "A::F",
        "B::A::F": "B::A::F",
        "A::G": "G",
    }


def test_name_shared_across_layers_is_qualified():
    sem = _sem(("Funcs::Brake", None), ("Log::Brake", None))
    assert unambiguous_labels(sem, list(sem), tagged=False) == {
        "Funcs::Brake": "Funcs::Brake",
        "Log::Brake": "Log::Brake",
    }


MODEL = """\
package P1 { use case def <'UC1'> Start { action a; } part def Alpha { part x { perform f.s; } action f { action s; } } part logical { part lp; } }
package P2 { use case def <'UC2'> Start { action b; } part def Alpha { part x { perform g.t; } action g { action t; } } part logical { part lp; } }
allocate P1::Alpha::x to P1::logical::lp;
allocate P2::Alpha::x to P2::logical::lp;
package V { view M : GridView { expose P1::Start; expose P2::Start; } }
"""


def test_matrix_labels_are_served_unambiguous(tmp_path: Path):
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "L"}).json()["id"]
    add_content_file(client, pid, tmp_path, "l.sysml", MODEL)
    view = client.get(api_url(f"/projects/{pid}/views/V::M")).json()
    assert view["diagramMode"] == "realizationMatrix"
    labels = view["matrixLabels"]
    assert labels["rows"] == {"P1::Start": "UC1 Start", "P2::Start": "UC2 Start"}
    assert labels["nodes"] == {"P1::Alpha::x": "P1::Alpha::x", "P2::Alpha::x": "P2::Alpha::x"}
    assert labels["functions"] == {"P1::Alpha": "P1::Alpha", "P2::Alpha": "P2::Alpha"}
    assert labels["parts"] == {"P1::logical::lp": "P1::logical::lp", "P2::logical::lp": "P2::logical::lp"}

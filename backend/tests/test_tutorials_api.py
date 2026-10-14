from fastapi.testclient import TestClient

from adapters.api.app import create_api_app


def test_list_and_get_tutorials():
    app = create_api_app()
    client = TestClient(app)
    listed = client.get("/tutorials")
    assert listed.status_code == 200
    items = listed.json()
    ids = {i["id"] for i in items}
    assert "sysml-v2" in ids
    assert "cheatsheet" in ids
    assert "use-cases-and-scenarios" in ids
    assert "mbse" in ids

    one = client.get("/tutorials/use-cases-and-scenarios")
    assert one.status_code == 200
    body = one.json()
    assert "content" in body
    assert "Use Cases and Scenarios" in body["content"]


def test_tutorial_path_traversal_rejected():
    app = create_api_app()
    client = TestClient(app)
    res = client.get("/tutorials/../../etc/passwd")
    assert res.status_code in {400, 404}

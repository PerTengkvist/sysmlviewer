from domain.models import ElementStyle, ElementStyleMode


def test_element_style_mode_roundtrip_background_regions():
    mode = ElementStyleMode(
        background_color="#ff0000",
        background_header=True,
        background_body=False,
    )
    d = mode.to_dict()
    assert d["backgroundColor"] == "#ff0000"
    assert d["backgroundHeader"] is True
    assert d["backgroundBody"] is False
    again = ElementStyleMode.from_dict(d)
    assert again is not None
    assert again.background_header is True
    assert again.background_body is False


def test_element_style_mode_omits_none_region_flags():
    mode = ElementStyleMode(background_color="#abc")
    d = mode.to_dict()
    assert "backgroundHeader" not in d
    assert "backgroundBody" not in d


def test_element_style_merge_regions():
    style = ElementStyle(light=ElementStyleMode(background_color="#111"))
    style.merge({"light": {"backgroundHeader": False, "backgroundBody": True}})
    assert style.light is not None
    assert style.light.background_header is False
    assert style.light.background_body is True

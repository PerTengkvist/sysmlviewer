"""Curated icon library catalog and settings merge."""

from domain.icon_catalog import (
    CURATED_LIBRARIES,
    catalog_payload,
    default_library_settings,
    merge_library_settings,
)


def test_curated_includes_iconmind_and_iconoven():
    assert "iconmind" in CURATED_LIBRARIES
    assert "iconoven" in CURATED_LIBRARIES


def test_defaults_both_enabled():
    defaults = default_library_settings()
    assert defaults["iconmind"]["enabled"] is True
    assert defaults["iconoven"]["enabled"] is True
    assert defaults["iconoven"]["style"] == "round"


def test_merge_ignores_unknown_lib_and_invalid_style():
    merged = merge_library_settings(
        {
            "iconoven": {"enabled": False, "style": "sharp"},
            "evil": {"enabled": True, "style": "x"},
            "iconmind": {"style": "not-a-variant"},
        }
    )
    assert "evil" not in merged
    assert merged["iconoven"]["enabled"] is False
    assert merged["iconoven"]["style"] == "sharp"
    assert merged["iconmind"]["style"] == "outline-regular"


def test_catalog_payload_shapes_api():
    rows = catalog_payload(
        merge_library_settings({"iconoven": {"style": "sharp"}})
    )
    by_id = {r["id"]: r for r in rows}
    assert by_id["iconoven"]["style"] == "sharp"
    assert by_id["iconoven"]["styles"] == ["round", "sharp"]
    assert by_id["iconmind"]["prefix"] == "iconmind/"

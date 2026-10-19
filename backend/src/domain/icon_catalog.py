"""Curated remote icon libraries (allowlist — not free-form CDN URLs)."""

from __future__ import annotations

from typing import Any, TypedDict


class IconLibraryDef(TypedDict):
    id: str
    label: str
    enabled_default: bool
    style_key: str
    styles: list[str]
    default_style: str
    prefix: str
    description: str


CURATED_LIBRARIES: dict[str, IconLibraryDef] = {
    "iconmind": {
        "id": "iconmind",
        "label": "IconMind",
        "enabled_default": True,
        "style_key": "variant",
        "styles": ["outline-regular"],
        "default_style": "outline-regular",
        "prefix": "iconmind/",
        "description": "AI-era icons via @iconmind/icons (outline-regular).",
    },
    "iconoven": {
        "id": "iconoven",
        "label": "IconOven",
        "enabled_default": True,
        "style_key": "corners",
        "styles": ["round", "sharp"],
        "default_style": "round",
        "prefix": "iconoven/",
        "description": "UI Stroke icons via @iconoven/svg (round or sharp).",
    },
}


def curated_ids() -> frozenset[str]:
    return frozenset(CURATED_LIBRARIES)


def default_library_settings() -> dict[str, dict[str, Any]]:
    """Per-library settings used when no workspace override exists."""
    return {
        lib_id: {
            "enabled": spec["enabled_default"],
            "style": spec["default_style"],
        }
        for lib_id, spec in CURATED_LIBRARIES.items()
    }


def merge_library_settings(
    overrides: dict[str, Any] | None,
) -> dict[str, dict[str, Any]]:
    """Merge user overrides onto curated defaults; drop unknown libs."""
    merged = default_library_settings()
    if not overrides:
        return merged
    for lib_id, raw in overrides.items():
        if lib_id not in CURATED_LIBRARIES or not isinstance(raw, dict):
            continue
        spec = CURATED_LIBRARIES[lib_id]
        enabled = raw.get("enabled")
        style = raw.get("style")
        entry = merged[lib_id]
        if isinstance(enabled, bool):
            entry["enabled"] = enabled
        if isinstance(style, str) and style in spec["styles"]:
            entry["style"] = style
    return merged


def catalog_payload(settings: dict[str, dict[str, Any]] | None = None) -> list[dict]:
    """API-facing list of curated libraries with active settings."""
    active = settings if settings is not None else default_library_settings()
    rows: list[dict] = []
    for lib_id, spec in CURATED_LIBRARIES.items():
        conf = active.get(lib_id) or {
            "enabled": spec["enabled_default"],
            "style": spec["default_style"],
        }
        rows.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "prefix": spec["prefix"],
                "description": spec["description"],
                "styleKey": spec["style_key"],
                "styles": list(spec["styles"]),
                "enabled": bool(conf.get("enabled", spec["enabled_default"])),
                "style": conf.get("style", spec["default_style"]),
            }
        )
    return rows

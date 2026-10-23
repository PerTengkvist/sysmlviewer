"""Fetch IconMind SVGs from the pinned jsDelivr npm mirror."""

from __future__ import annotations

from typing import Any, Callable

import httpx

ICONMIND_PACKAGE = "@iconmind/icons"
ICONMIND_VERSION = "0.8.1"
ICONMIND_VARIANT = "outline-regular"
ICONMIND_VARIANTS = frozenset(
    {
        "outline-regular",
        "outline-thin",
        "duotone-regular",
    }
)
CDN_ROOT = f"https://cdn.jsdelivr.net/npm/{ICONMIND_PACKAGE}@{ICONMIND_VERSION}"


class IconMindError(Exception):
    """IconMind fetch or resolution failed."""


class IconMindFetcher:
    """Resolve slug → category via metadata, then download an SVG variant."""

    def __init__(
        self,
        *,
        style: str = ICONMIND_VARIANT,
        client: httpx.Client | None = None,
        metadata: dict[str, Any] | None = None,
        get: Callable[[str], httpx.Response] | None = None,
    ) -> None:
        cleaned = (style or ICONMIND_VARIANT).strip().lower()
        if cleaned not in ICONMIND_VARIANTS:
            raise IconMindError(
                f"invalid IconMind style {style!r}; expected one of "
                f"{sorted(ICONMIND_VARIANTS)}"
            )
        self.style = cleaned
        self._client = client
        self._owns_client = client is None and get is None
        self._get = get
        self._metadata = metadata
        self._slug_to_category: dict[str, str] | None = None
        if metadata is not None:
            self._slug_to_category = self._index_metadata(metadata)

    def close(self) -> None:
        if self._owns_client and self._client is not None:
            self._client.close()

    def _http_get(self, url: str) -> httpx.Response:
        if self._get is not None:
            return self._get(url)
        if self._client is None:
            self._client = httpx.Client(timeout=30.0)
            self._owns_client = True
        return self._client.get(url)

    @staticmethod
    def _index_metadata(metadata: dict[str, Any]) -> dict[str, str]:
        icons = metadata.get("icons") or []
        index: dict[str, str] = {}
        for entry in icons:
            if not isinstance(entry, dict):
                continue
            slug = entry.get("slug")
            category = entry.get("category")
            if isinstance(slug, str) and isinstance(category, str):
                index[slug] = category
                for alias in entry.get("aliases") or []:
                    if isinstance(alias, str):
                        index[alias] = category
        return index

    def _ensure_index(self) -> dict[str, str]:
        if self._slug_to_category is not None:
            return self._slug_to_category
        url = f"{CDN_ROOT}/dist/metadata.json"
        try:
            response = self._http_get(url)
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise IconMindError(f"failed to load IconMind metadata: {exc}") from exc
        if not isinstance(data, dict):
            raise IconMindError("IconMind metadata is not an object")
        self._metadata = data
        self._slug_to_category = self._index_metadata(data)
        return self._slug_to_category

    def category_for(self, slug: str) -> str:
        index = self._ensure_index()
        category = index.get(slug)
        if category is None:
            raise IconMindError(f"unknown IconMind slug: {slug}")
        return category

    def svg_url(self, slug: str) -> str:
        category = self.category_for(slug)
        return f"{CDN_ROOT}/icons/{category}/{slug}/{self.style}.svg"

    def fetch(self, slug: str) -> str:
        url = self.svg_url(slug)
        try:
            response = self._http_get(url)
        except httpx.HTTPError as exc:
            raise IconMindError(f"network error fetching {slug}: {exc}") from exc
        if response.status_code != 200:
            raise IconMindError(
                f"IconMind HTTP {response.status_code} for {slug}"
            )
        body = response.text.lstrip("\ufeff").strip()
        if not body.lower().startswith("<svg"):
            raise IconMindError(f"response for {slug} is not SVG")
        return body

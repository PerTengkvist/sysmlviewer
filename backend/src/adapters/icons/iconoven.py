"""Fetch IconOven SVGs from the pinned jsDelivr npm mirror."""

from __future__ import annotations

from typing import Callable

import httpx

ICONOVEN_PACKAGE = "@iconoven/svg"
ICONOVEN_VERSION = "1"
ICONOVEN_STYLES = frozenset({"round", "sharp"})
DEFAULT_STYLE = "round"
CDN_ROOT = f"https://cdn.jsdelivr.net/npm/{ICONOVEN_PACKAGE}@{ICONOVEN_VERSION}"


class IconOvenError(Exception):
    """IconOven fetch or configuration failed."""


class IconOvenFetcher:
    """Download a free Stroke SVG by slug and corner style (round|sharp)."""

    def __init__(
        self,
        *,
        style: str = DEFAULT_STYLE,
        client: httpx.Client | None = None,
        get: Callable[[str], httpx.Response] | None = None,
    ) -> None:
        cleaned = (style or DEFAULT_STYLE).strip().lower()
        if cleaned not in ICONOVEN_STYLES:
            raise IconOvenError(
                f"invalid IconOven style {style!r}; expected one of "
                f"{sorted(ICONOVEN_STYLES)}"
            )
        self.style = cleaned
        self._client = client
        self._owns_client = client is None and get is None
        self._get = get

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

    def svg_url(self, slug: str) -> str:
        return f"{CDN_ROOT}/{self.style}/{slug}.svg"

    def fetch(self, slug: str) -> str:
        url = self.svg_url(slug)
        try:
            response = self._http_get(url)
        except httpx.HTTPError as exc:
            raise IconOvenError(f"network error fetching {slug}: {exc}") from exc
        if response.status_code != 200:
            raise IconOvenError(f"IconOven HTTP {response.status_code} for {slug}")
        body = response.text.lstrip("\ufeff").strip()
        if not body.lower().startswith("<svg"):
            raise IconOvenError(f"response for {slug} is not SVG")
        return body

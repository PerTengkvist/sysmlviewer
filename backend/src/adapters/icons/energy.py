"""Fetch Energy Icons SVGs from the pinned jsDelivr npm mirror."""

from __future__ import annotations

from typing import Callable

import httpx

ENERGY_PACKAGE = "energy-icons"
ENERGY_VERSION = "1"
ENERGY_STYLES = frozenset({"20", "48", "20-bold", "48-bold"})
DEFAULT_STYLE = "20"
CDN_ROOT = f"https://cdn.jsdelivr.net/npm/{ENERGY_PACKAGE}@{ENERGY_VERSION}"


class EnergyIconsError(Exception):
    """Energy Icons fetch or configuration failed."""


class EnergyIconsFetcher:
    """Download an MIT Energy Icons SVG by slug and optical master."""

    def __init__(
        self,
        *,
        style: str = DEFAULT_STYLE,
        client: httpx.Client | None = None,
        get: Callable[[str], httpx.Response] | None = None,
    ) -> None:
        cleaned = (style or DEFAULT_STYLE).strip().lower()
        if cleaned not in ENERGY_STYLES:
            raise EnergyIconsError(
                f"invalid Energy Icons style {style!r}; expected one of "
                f"{sorted(ENERGY_STYLES)}"
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
        return f"{CDN_ROOT}/svg/{slug}/{self.style}.svg"

    def fetch(self, slug: str) -> str:
        url = self.svg_url(slug)
        try:
            response = self._http_get(url)
        except httpx.HTTPError as exc:
            raise EnergyIconsError(f"network error fetching {slug}: {exc}") from exc
        if response.status_code != 200:
            raise EnergyIconsError(
                f"Energy Icons HTTP {response.status_code} for {slug}"
            )
        body = response.text.lstrip("\ufeff").strip()
        if not body.lower().startswith("<svg"):
            raise EnergyIconsError(f"response for {slug} is not SVG")
        return body

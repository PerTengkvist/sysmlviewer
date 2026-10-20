"""Fetch Energy Icons SVGs via the Iconify API.

Iconify publishes this set as ``energy-icons:<slug>-<master>`` (e.g.
``energy-icons:busbar-20``). See https://icon-sets.iconify.design/energy-icons/
"""

from __future__ import annotations

from typing import Callable

import httpx

ICONIFY_API = "https://api.iconify.design"
ICONIFY_PREFIX = "energy-icons"
ENERGY_STYLES = frozenset({"20", "48", "20-bold", "48-bold"})
DEFAULT_STYLE = "20"


class EnergyIconsError(Exception):
    """Energy Icons fetch or configuration failed."""


def resolve_iconify_name(slug: str, style: str) -> str:
    """Map SysML slug + settings master to an Iconify icon name.

    ``busbar`` + ``20`` → ``busbar-20``
    ``busbar-20`` + any style → ``busbar-20`` (suffix already present)
    """
    cleaned = slug.strip()
    for suffix in sorted(ENERGY_STYLES, key=len, reverse=True):
        if cleaned.endswith(f"-{suffix}"):
            return cleaned
    return f"{cleaned}-{style}"


class EnergyIconsFetcher:
    """Download Energy Icons from Iconify by slug and optical master."""

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

    def iconify_name(self, slug: str) -> str:
        return resolve_iconify_name(slug, self.style)

    def svg_url(self, slug: str) -> str:
        name = self.iconify_name(slug)
        return f"{ICONIFY_API}/{ICONIFY_PREFIX}/{name}.svg"

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

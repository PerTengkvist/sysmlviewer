"""Registry of curated remote icon library fetchers."""

from __future__ import annotations

from typing import Callable, Protocol

from adapters.icons.energy import DEFAULT_STYLE as ENERGY_DEFAULT_STYLE
from adapters.icons.energy import EnergyIconsFetcher
from adapters.icons.iconmind import ICONMIND_VARIANT, IconMindFetcher
from adapters.icons.iconoven import DEFAULT_STYLE as ICONOVEN_DEFAULT_STYLE
from adapters.icons.iconoven import IconOvenFetcher
from domain.icon_catalog import curated_ids


class IconFetcher(Protocol):
    def fetch(self, slug: str) -> str: ...


FetcherFactory = Callable[[str], IconFetcher]

_REGISTRY: dict[str, FetcherFactory] = {}


def _iconmind_factory(style: str) -> IconMindFetcher:
    return IconMindFetcher(style=style or ICONMIND_VARIANT)


def _iconoven_factory(style: str) -> IconOvenFetcher:
    return IconOvenFetcher(style=style or ICONOVEN_DEFAULT_STYLE)


def _energy_factory(style: str) -> EnergyIconsFetcher:
    return EnergyIconsFetcher(style=style or ENERGY_DEFAULT_STYLE)


def register_fetcher(library: str, factory: FetcherFactory) -> None:
    _REGISTRY[library.strip().lower()] = factory


def get_fetcher(library: str, *, style: str | None = None) -> IconFetcher | None:
    key = library.strip().lower()
    if key not in curated_ids() and key not in _REGISTRY:
        # Allow test-registered libs outside the curated catalog.
        pass
    factory = _REGISTRY.get(key)
    if factory is None:
        return None
    return factory(style or "")


def clear_registry() -> None:
    """Reset registry to built-in curated defaults (for tests)."""
    _REGISTRY.clear()
    register_fetcher("iconmind", _iconmind_factory)
    register_fetcher("iconoven", _iconoven_factory)
    register_fetcher("energy", _energy_factory)


# Built-in registration
clear_registry()

"""IconMind fetcher: URL building, SVG validation, failure modes."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from adapters.icons.iconmind import (
    ICONMIND_PACKAGE,
    ICONMIND_VERSION,
    IconMindError,
    IconMindFetcher,
)


SAMPLE_METADATA = {
    "version": "0.8.1",
    "icons": [
        {"slug": "agent", "category": "agents"},
        {"slug": "vector-database", "category": "data"},
    ],
}


class FakeTransport(httpx.BaseTransport):
    def __init__(self, routes: dict[str, tuple[int, str]]) -> None:
        self.routes = routes
        self.requests: list[str] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.requests.append(url)
        if url in self.routes:
            status, body = self.routes[url]
            return httpx.Response(status, text=body, request=request)
        return httpx.Response(404, text="not found", request=request)


def _fetcher(
    routes: dict[str, tuple[int, str]] | None = None,
    *,
    metadata: dict[str, Any] | None = SAMPLE_METADATA,
) -> tuple[IconMindFetcher, FakeTransport]:
    transport = FakeTransport(routes or {})
    client = httpx.Client(transport=transport)
    return IconMindFetcher(client=client, metadata=metadata), transport


def test_svg_url_uses_pinned_version_and_outline_regular():
    fetcher, _ = _fetcher()
    url = fetcher.svg_url("agent")
    assert ICONMIND_VERSION in url
    assert ICONMIND_PACKAGE in url
    assert url.endswith("/icons/agents/agent/outline-regular.svg")
    assert url.startswith("https://cdn.jsdelivr.net/npm/")


def test_fetch_returns_trimmed_svg():
    fetcher, transport = _fetcher()
    url = fetcher.svg_url("agent")
    transport.routes[url] = (200, "  \n<svg xmlns='http://www.w3.org/2000/svg'></svg>\n")
    body = fetcher.fetch("agent")
    assert body.startswith("<svg")
    assert body.endswith("</svg>")


def test_fetch_http_404_raises():
    fetcher, transport = _fetcher()
    url = fetcher.svg_url("agent")
    transport.routes[url] = (404, "missing")
    with pytest.raises(IconMindError):
        fetcher.fetch("agent")


def test_fetch_non_svg_raises():
    fetcher, transport = _fetcher()
    url = fetcher.svg_url("agent")
    transport.routes[url] = (200, '{"not":"svg"}')
    with pytest.raises(IconMindError):
        fetcher.fetch("agent")


def test_fetch_network_error_raises():
    class BoomTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom", request=request)

    client = httpx.Client(transport=BoomTransport())
    fetcher = IconMindFetcher(client=client, metadata=SAMPLE_METADATA)
    with pytest.raises(IconMindError):
        fetcher.fetch("agent")


def test_unknown_slug_raises_without_request():
    fetcher, transport = _fetcher()
    with pytest.raises(IconMindError):
        fetcher.fetch("does-not-exist")
    assert transport.requests == []


def test_loads_metadata_from_cdn_when_not_injected():
    meta_url = (
        f"https://cdn.jsdelivr.net/npm/{ICONMIND_PACKAGE}@{ICONMIND_VERSION}"
        "/dist/metadata.json"
    )
    routes = {
        meta_url: (200, '{"icons":[{"slug":"agent","category":"agents"}]}'),
    }
    transport = FakeTransport(routes)
    client = httpx.Client(transport=transport)
    fetcher = IconMindFetcher(client=client, metadata=None)
    url = fetcher.svg_url("agent")
    assert url.endswith("/icons/agents/agent/outline-regular.svg")
    assert meta_url in transport.requests

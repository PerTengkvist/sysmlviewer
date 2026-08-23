#!/usr/bin/env python3
"""Extract wildcard string occurrences from a PDF into a Markdown table."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Search a PDF for strings with a single '*' wildcard "
            "(prefix: 'foo*' or suffix: '*foo'). "
            "Matches are bounded by a leading (-l) and trailing (-t) character."
        )
    )
    p.add_argument("-f", "--file", required=True, help="Path to the PDF file")
    p.add_argument(
        "-s",
        "--search",
        required=True,
        help='Search pattern, e.g. "foo*" (prefix) or "*foo" (suffix)',
    )
    p.add_argument(
        "-l",
        "--leading",
        default=" ",
        help='Leading character before the match (default: " ")',
    )
    p.add_argument(
        "-t",
        "--trailing",
        default=" ",
        help='Trailing character after the match (default: " ")',
    )
    p.add_argument(
        "-a",
        "--annotate",
        action="store_true",
        help=(
            "Include remaining text on the same line after "
            "<leading>+item+<trailing> as a Title column"
        ),
    )
    p.add_argument(
        "-o",
        "--output",
        default=None,
        help=(
            "Output Markdown file "
            "(default: same path as -f with .md instead of .pdf)"
        ),
    )
    return p.parse_args()


def load_pdf_pages(path: Path) -> list[tuple[int, str]]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: pypdf. Install with: pip install pypdf"
        ) from exc

    reader = PdfReader(str(path))
    pages: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages.append((i, text))
    return pages


def compile_search_regex(search: str, leading: str, trailing: str) -> re.Pattern[str]:
    """Build a regex that captures ITEM in: <leading> ITEM <trailing>."""
    if search.count("*") > 1:
        raise SystemExit("Only one '*' wildcard is supported in -s")

    if "*" in search and not (search.startswith("*") or search.endswith("*")):
        raise SystemExit(
            "Wildcard '*' must be a prefix ('*foo') or suffix ('foo*')"
        )

    if len(leading) != 1:
        raise SystemExit("-l must be a single character")
    if len(trailing) != 1:
        raise SystemExit("-t must be a single character")

    # Content may not include the trailing delimiter.
    not_trail = f"[^{re.escape(trailing)}]*"

    if search.endswith("*") and not search.startswith("*"):
        prefix = search[:-1]
        if not prefix:
            raise SystemExit("Prefix before '*' must not be empty")
        body = re.escape(prefix) + not_trail
    elif search.startswith("*") and not search.endswith("*"):
        suffix = search[1:]
        if not suffix:
            raise SystemExit("Suffix after '*' must not be empty")
        body = not_trail + re.escape(suffix)
    elif search.startswith("*") and search.endswith("*"):
        # '*foo*' — contains (allowed as convenient extension)
        mid = search[1:-1]
        if not mid:
            raise SystemExit("Pattern '*…*' must contain a non-empty middle")
        body = not_trail + re.escape(mid) + not_trail
    else:
        body = re.escape(search)

    if leading == " ":
        # Space or start-of-string / start-of-line
        lead_pat = r"(?:(?<=\s)|^)"
    else:
        lead_pat = f"(?<={re.escape(leading)})"

    if trailing == " ":
        trail_pat = r"(?=\s|$)"
    else:
        trail_pat = f"(?={re.escape(trailing)})"

    return re.compile(lead_pat + f"({body})" + trail_pat)


def line_rest_after_match(text: str, match: re.Match[str], trailing: str) -> str:
    """Text on the same line after leading+item+trailing."""
    # match.end() is right after ITEM; trailing is a lookahead so not consumed.
    after_item = match.end()
    if trailing == " ":
        # Skip the whitespace that satisfied the trailing lookahead
        m = re.match(r"\s*", text[after_item:])
        pos = after_item + (m.end() if m else 0)
    else:
        # Consume the trailing delimiter if present
        if after_item < len(text) and text[after_item] == trailing:
            pos = after_item + 1
        else:
            pos = after_item

    # Rest of the current line only
    line_end = text.find("\n", pos)
    if line_end < 0:
        rest = text[pos:]
    else:
        rest = text[pos:line_end]
    return rest.strip()


def find_occurrences(
    pages: list[tuple[int, str]],
    pattern: re.Pattern[str],
    trailing: str,
    annotate: bool,
) -> list[tuple[int, str, int, str]]:
    """Return list of (seq, item, page, title)."""
    hits: list[tuple[int, str, int, str]] = []
    seq = 0
    for page_no, text in pages:
        for match in pattern.finditer(text):
            item = match.group(1)
            if item is None or item == "":
                continue
            seq += 1
            title = line_rest_after_match(text, match, trailing) if annotate else ""
            hits.append((seq, item, page_no, title))
    return hits


def md_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def to_markdown(
    source: Path,
    search: str,
    hits: list[tuple[int, str, int, str]],
    annotate: bool,
) -> str:
    lines = [
        "# Occurrences",
        "",
        f"- **file:** `{source}`",
        f"- **searchstring:** `{search}`",
        f"- **matches:** {len(hits)}",
        "",
    ]
    if annotate:
        lines.append("| sequence number | item | page | Title |")
        lines.append("| ---: | --- | ---: | --- |")
        for seq, item, page, title in hits:
            lines.append(
                f"| {seq} | `{md_cell(item)}` | {page} | {md_cell(title)} |"
            )
    else:
        lines.append("| sequence number | item | page |")
        lines.append("| ---: | --- | ---: |")
        for seq, item, page, _title in hits:
            lines.append(f"| {seq} | `{md_cell(item)}` | {page} |")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    pdf_path = Path(args.file).expanduser().resolve()
    if not pdf_path.is_file():
        print(f"error: file not found: {pdf_path}", file=sys.stderr)
        return 1
    if pdf_path.suffix.lower() != ".pdf":
        print(f"warning: expected a .pdf file, got {pdf_path.suffix}", file=sys.stderr)

    pattern = compile_search_regex(args.search, args.leading, args.trailing)
    pages = load_pdf_pages(pdf_path)
    hits = find_occurrences(pages, pattern, args.trailing, args.annotate)
    md = to_markdown(pdf_path, args.search, hits, args.annotate)

    if args.output:
        out = Path(args.output).expanduser().resolve()
    else:
        # Same basename as input, .md instead of .pdf (or append .md)
        out = pdf_path.with_suffix(".md")

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(md, encoding="utf-8")
    print(f"wrote {len(hits)} match(es) to {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

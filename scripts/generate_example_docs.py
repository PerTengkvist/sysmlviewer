"""Generate <Package>[.<Sub>].<name>.md docs for an example project from its model.

Usage (from the repo root or backend/):
    uv run --project backend python scripts/generate_example_docs.py examples/electric_car [--force] [--only=folder,folder]

Writes one doc per package, part, view, requirement, use case, actor and
interaction, next to the .sysml file in a docs/ folder, with the element's doc
comment, its relations, the diagrams it appears in and its ports. Only missing
files are written unless --force is given. --only limits the run to the listed
top-level folders of the example.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "src"))
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind as K, SysmlFile

root = Path(sys.argv[1]).resolve()
force = "--force" in sys.argv
only = [a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")]
only = only[0] if only else None
files = [
    SysmlFile(id=str(f.relative_to(root)), name=f.name, content=f.read_text(), path=str(f.relative_to(root)))
    for f in sorted(root.rglob("*.sysml"))
]
els = SubsetSysmlParser().parse_project(files).elements
DOCUMENTED = {K.PACKAGE, K.PART, K.VIEW, K.REQUIREMENT, K.USE_CASE, K.ACTOR, K.INTERACTION}


def name(eid):
    e = els.get(eid)
    return e.name if e else (eid or "?").split("::")[-1]


def kw(e):
    return ", ".join(f"«{k}»" for k in (e.metadata_keywords or []))


def relations(el):
    out = []
    for e in els.values():
        if e.kind == K.DEPENDENCY:
            keys = e.metadata_keywords or []
            if e.source_id == el.id:
                if "implements" in keys:
                    out.append(f"- Implements `{name(e.target_id)}`.")
                elif "objective" in keys:
                    out.append(f"- Pursues requirement `{name(e.target_id)}`.")
                elif "refine" in keys:
                    out.append(f"- Refines `{name(e.target_id)}`.")
                elif "extend" in keys:
                    out.append(f"- Extends `{name(e.target_id)}`.")
                elif "subject" in keys:
                    pass
                else:
                    out.append(f"- Depends on `{name(e.target_id)}` ({kw(e)}).")
            elif e.target_id == el.id:
                if "implements" in keys:
                    out.append(f"- Implemented by `{name(e.source_id)}`.")
                elif "objective" in keys:
                    out.append(f"- Pursued by use case `{name(e.source_id)}`.")
                elif "refine" in keys:
                    out.append(f"- Refined by `{name(e.source_id)}`.")
                elif "extend" in keys:
                    out.append(f"- Extended by `{name(e.source_id)}`.")
                elif "subject" in keys:
                    pass
                else:
                    out.append(f"- `{name(e.source_id)}` depends on this ({kw(e)}).")
        elif e.kind == K.INCLUDE:
            if e.source_id == el.id:
                out.append(f"- Includes `{name(e.target_id)}`.")
            elif e.target_id == el.id:
                out.append(f"- Included by `{name(e.source_id)}`.")
        elif e.kind == K.SATISFY:
            if e.source_id == el.id:
                out.append(f"- Satisfies `{name(e.target_id)}`.")
            elif e.target_id == el.id:
                out.append(f"- Satisfied by `{name(e.source_id)}`.")
        elif e.kind == K.ALLOCATION:
            if e.source_id == el.id:
                out.append(f"- Allocated to `{name(e.target_id)}`.")
            elif e.target_id == el.id:
                out.append(f"- Comprises `{name(e.source_id)}`.")
    return out


def ancestors(el):
    out = []
    cur = els.get(el.parent_id) if el.parent_id else None
    while cur is not None:
        out.append(cur.id)
        cur = els.get(cur.parent_id) if cur.parent_id else None
    return out


def diagrams(el):
    roots = {el.id, *ancestors(el)} if el.kind in {K.PART, K.ACTOR} else {el.id}
    out = []
    for v in els.values():
        if v.kind != K.VIEW:
            continue
        exposed = set(v.expose_refs or []) | ({v.expose_ref} if v.expose_ref else set())
        if exposed & roots:
            out.append(f"- `{v.name}`")
    return out


def owner_name(port_id):
    p = els.get(port_id)
    return name(p.parent_id) if p and p.parent_id else "?"


def interfaces(el):
    out = []
    for pid in el.children:
        port = els.get(pid)
        if not port or port.kind != K.PORT:
            continue
        peers = []
        for c in els.values():
            if c.kind == K.CONNECTION and c.source_id == pid:
                peers.append(f"connected to `{owner_name(c.target_id)}`")
            elif c.kind == K.CONNECTION and c.target_id == pid:
                peers.append(f"connected from `{owner_name(c.source_id)}`")
            elif c.kind == K.BINDING and pid in (c.source_id, c.target_id):
                other = c.target_id if c.source_id == pid else c.source_id
                peers.append(f"bound to `{owner_name(other)}`")
        role = "Provider" if port.name.endswith("Out") else "Consumer" if port.name.endswith("In") else "Port"
        tail = (", " + ", ".join(peers)) if peers else ""
        out.append(f"- {role} port `{port.name}` : {port.type_ref}{tail}.")
    return out


written = []
for el in els.values():
    if el.kind not in DOCUMENTED or not el.file_id or "/" not in el.file_id:
        continue
    folder = el.file_id.rsplit("/", 1)[0]
    if only and folder not in only:
        continue
    packages = []
    cur = els.get(el.parent_id) if el.parent_id else None
    while cur is not None:
        if cur.kind == K.PACKAGE:
            packages.insert(0, cur.name)
        cur = els.get(cur.parent_id) if cur.parent_id else None
    path = root / folder / "docs" / (".".join([*packages, el.name]) + ".md")
    if path.exists() and not force:
        continue
    lines = [f"# {el.name}", ""]
    if el.documentation:
        lines += [el.documentation.strip(), ""]
    parent = els.get(el.parent_id) if el.parent_id else None
    if parent is not None and el.kind in {K.PART, K.ACTOR}:
        lines += [f"Part of `{parent.name}`.", ""]
    rels = relations(el)
    if rels:
        lines += ["## Relations", "", *rels, ""]
    dia = diagrams(el)
    if dia:
        lines += ["## Diagrams", "", *dia, ""]
    ifs = interfaces(el)
    if ifs:
        lines += ["## Interfaces", "", *ifs, ""]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    written.append(str(path.relative_to(root)))
print(f"wrote {len(written)} docs")
for w in written:
    print("  ", w)

# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pyodbc>=5.1",
#     "tabulate>=0.9",
# ]
# ///
"""Validate a PBIP semantic model against Power BI Desktop's load rules and the SQL source.

Usage:
    uv run tools/validate_pbip.py                      validates "Contoso Sales.pbip"
    uv run tools/validate_pbip.py "Other.pbip"
    add -v to list the passed checks too

Checks the TMDL in <Name>.SemanticModel/definition without Power BI Desktop:
  - project files: .pbip -> .Report -> definition.pbir byPath -> .SemanticModel
  - model: implicit measures off (required by calculation groups), auto date/time off,
    M parameters are plain text literals
  - data tables: one M partition that only navigates to an existing view; every column
    maps to a view column of a compatible type; no Double
  - calculation groups: exactly two columns, string <- Name and int64 <- Ordinal
  - sort-by columns, hierarchies, relationships (types, one-side uniqueness in SQL)
  - date table: date key column, unique, contiguous
  - measures: format string, description and display folder (project convention)
  - report tooltips: a tooltip page is flagged as one (page type, binding, hidden, tooltip size), and every
    native chart, table and matrix by category, country or channel uses it as its report-page tooltip
Exit code 1 if any check fails.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sql import connect  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# SQL type -> TMDL dataType that Desktop maps it to
SQL_TO_TMDL = {
    "int": "int64", "bigint": "int64", "smallint": "int64", "tinyint": "int64",
    "decimal": "decimal", "numeric": "decimal", "money": "decimal", "smallmoney": "decimal",
    "float": "double", "real": "double",
    "nvarchar": "string", "varchar": "string", "nchar": "string", "char": "string",
    "date": "dateTime", "datetime": "dateTime", "datetime2": "dateTime",
    "bit": "boolean",
}

failures: list[str] = []
passes: list[str] = []


def check(ok: bool, rule: str, detail: str = "") -> None:
    (passes if ok else failures).append(f"{rule}{': ' + detail if detail else ''}")


# --- TMDL parsing -------------------------------------------------------------

def depth(line: str) -> int:
    return len(line) - len(line.lstrip("\t"))


def parse_name(text: str) -> tuple[str, str]:
    """Split a TMDL object name off the front of text; return (name, rest)."""
    text = text.strip()
    if text.startswith("'"):
        m = re.match(r"'((?:[^']|'')*)'(.*)", text)
        return m.group(1).replace("''", "'"), m.group(2)
    m = re.match(r"([^\s=]+)(.*)", text)
    return m.group(1), m.group(2)


def parse_ref(text: str) -> tuple[str, str]:
    """Split Table.'Column' into (table, column)."""
    text = text.strip()
    if text.startswith("'"):
        table, rest = parse_name(text)
    else:
        table, _, rest = text.partition(".")
    column, _ = parse_name(rest.lstrip("."))
    return table, column


PROP = re.compile(r"^(\w+)(?::\s*(.*))?$")


def parse_table(path: Path) -> dict:
    t = {"columns": {}, "measures": {}, "partitions": [], "hierarchies": {},
         "calc_group": False, "calc_items": [], "props": {}, "described": set()}
    current = None          # dict of the depth-1 object being read
    level = None            # current hierarchy level
    pending_doc = False
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    for line in lines:
        if not line.strip():
            continue
        d, body = depth(line), line.strip()
        if body.startswith("///"):
            pending_doc = True
            continue
        if d == 0 and body.startswith("table "):
            t["name"], _ = parse_name(body[6:])
        elif d == 1:
            level = None
            kind, _, rest = body.partition(" ")
            if kind in ("column", "measure", "hierarchy", "partition"):
                name, tail = parse_name(rest)
                current = {"kind": kind, "name": name, "props": {}, "raw": [line],
                           "doc": pending_doc, "tail": tail}
                if kind == "column":
                    t["columns"][name] = current
                elif kind == "measure":
                    t["measures"][name] = current
                elif kind == "hierarchy":
                    current["levels"] = []
                    t["hierarchies"][name] = current
                else:
                    current["source_kind"] = tail.split("=")[-1].strip()
                    t["partitions"].append(current)
            elif kind == "calculationGroup":
                t["calc_group"] = True
                current = {"kind": "calculationGroup", "props": {}, "raw": []}
            else:
                current = None
                m = PROP.match(body)
                if m:
                    t["props"][m.group(1)] = m.group(2) if m.group(2) is not None else True
        elif current is not None:
            current["raw"].append(line)
            if current["kind"] == "calculationGroup" and d == 2 and body.startswith("calculationItem "):
                name, _ = parse_name(body[len("calculationItem "):])
                t["calc_items"].append(name)
            elif current["kind"] == "hierarchy" and d == 2 and body.startswith("level "):
                name, _ = parse_name(body[6:])
                level = {"name": name, "column": None}
                current["levels"].append(level)
            elif current["kind"] == "hierarchy" and d == 3 and level and body.startswith("column:"):
                level["column"], _ = parse_name(body[7:])
            elif d == 2:
                m = PROP.match(body)
                if m:
                    current["props"][m.group(1)] = m.group(2) if m.group(2) is not None else True
        pending_doc = False
    return t


def parse_relationships(path: Path) -> list[dict]:
    rels, current = [], None
    if not path.exists():
        return rels
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.strip().startswith("///"):
            continue
        if depth(line) == 0 and line.startswith("relationship "):
            name, _ = parse_name(line[len("relationship "):])
            current = {"name": name}
            rels.append(current)
        elif current is not None and depth(line) == 1:
            m = PROP.match(line.strip())
            if m:
                current[m.group(1)] = m.group(2) if m.group(2) is not None else True
    return rels


# --- checks -------------------------------------------------------------------

# --- report tooltip wiring ----------------------------------------------------

# Native visuals with one data point per item; hovering one should show the tooltip page
TOOLTIP_VISUALS = {"clusteredBarChart", "clusteredColumnChart", "tableEx", "pivotTable"}
# The items the tooltip page can name (its title measure reads Category, Country and Channel)
TOOLTIP_FIELDS = {("Product", "Category"), ("Store", "Country"), ("Store", "Channel")}


def literal(prop: dict | None) -> str | None:
    """Plain value of a PBIR literal property: 'Canvas' -> Canvas, true -> true."""
    try:
        return prop["expr"]["Literal"]["Value"].strip("'")
    except (KeyError, TypeError):
        return None


def check_tooltips(report_dir: Path) -> None:
    pages_dir = report_dir / "definition" / "pages"
    pages = {p.parent.name: json.loads(p.read_text(encoding="utf-8-sig")) for p in pages_dir.glob("*/page.json")}
    tooltip_pages = {k for k, p in pages.items() if p.get("type") == "Tooltip" or p.get("pageBinding", {}).get("type") == "Tooltip"}
    for k in sorted(tooltip_pages):
        p = pages[k]
        name = p.get("displayName", k)
        # Desktop offers a page as a report-page tooltip only with page type Tooltip ("Allow use as tooltip")
        check(p.get("type") == "Tooltip", f"REPORT tooltip page {name}: page type Tooltip (allow use as tooltip)")
        check(p.get("pageBinding", {}).get("type") == "Tooltip", f"REPORT tooltip page {name}: page binding type Tooltip")
        check(p.get("visibility") == "HiddenInViewMode", f"REPORT tooltip page {name}: hidden in view mode")
        check(p.get("width", 9999) <= 640 and p.get("height", 9999) <= 480, f"REPORT tooltip page {name}: tooltip size (max 640 x 480)",
              f"{p.get('width')} x {p.get('height')}")
    for vf in sorted(pages_dir.glob("*/visuals/*/visual.json")):
        page_id = vf.parent.parent.parent.name
        if page_id in tooltip_pages:
            continue
        v = json.loads(vf.read_text(encoding="utf-8-sig"))
        vis = v["visual"]
        where = f"{pages[page_id].get('displayName', page_id)}/{v['name']} ({vis['visualType']})"
        tip = (vis.get("visualContainerObjects", {}).get("visualTooltip") or [{}])[0].get("properties", {})
        section = literal(tip.get("section"))
        if literal(tip.get("type")) == "Canvas":
            check(section in tooltip_pages, f"REPORT visual {where}: report-page tooltip points at a tooltip page", str(section))
        fields = {
            (proj["field"]["Column"]["Expression"]["SourceRef"]["Entity"], proj["field"]["Column"]["Property"])
            for role in vis.get("query", {}).get("queryState", {}).values()
            for proj in role.get("projections", [])
            if "Column" in proj["field"]
        }
        if tooltip_pages and vis["visualType"] in TOOLTIP_VISUALS and fields & TOOLTIP_FIELDS:
            check(literal(tip.get("show")) == "true" and literal(tip.get("type")) == "Canvas" and section in tooltip_pages,
                  f"REPORT visual {where}: uses the report-page tooltip")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # rule names contain Δ; the Windows console default (cp1252) cannot print it
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    pbip = ROOT / (args[0] if args else "Contoso Sales.pbip")
    name = pbip.stem
    sm = ROOT / f"{name}.SemanticModel"
    defn = sm / "definition"

    # project files
    pbip_json = json.loads(pbip.read_text(encoding="utf-8-sig"))
    report_dir = ROOT / pbip_json["artifacts"][0]["report"]["path"]
    check(report_dir.is_dir(), "PBIP .pbip points at an existing report folder", report_dir.name)
    pbir = json.loads((report_dir / "definition.pbir").read_text(encoding="utf-8-sig"))
    target = (report_dir / pbir["datasetReference"]["byPath"]["path"]).resolve()
    check(target == sm.resolve(), "PBIP definition.pbir byPath resolves to the semantic model", str(target.name))
    check((sm / "definition.pbism").exists(), "PBIP definition.pbism exists")

    # model
    model_text = (defn / "model.tmdl").read_text(encoding="utf-8-sig")
    check(re.search(r"^\tdiscourageImplicitMeasures\b", model_text, re.M) is not None,
          "MODEL discourageImplicitMeasures is on (required for calculation groups)")
    check("annotation __PBI_TimeIntelligenceEnabled = 0" in model_text, "MODEL auto date/time is off")
    expr_path = defn / "expressions.tmdl"
    params = {}
    if expr_path.exists():
        for m in re.finditer(r"^expression (\S+) = (.*)$", expr_path.read_text(encoding="utf-8-sig"), re.M):
            params[m.group(1)] = m.group(2)
    for pname, ptext in params.items():
        check(re.match(r'^"[^"]+" meta \[IsParameterQuery=true', ptext) is not None,
              f"MODEL parameter {pname} is a plain text literal", ptext.split(" meta")[0])

    tables = {}
    for p in sorted((defn / "tables").glob("*.tmdl")):
        t = parse_table(p)
        tables[t["name"]] = t
    ref_names = re.findall(r"^ref table (.+)$", model_text, re.M)
    ref_names = [parse_name(r)[0] for r in ref_names]
    check(sorted(ref_names) == sorted(tables), "MODEL ref table list matches table files")

    conn = connect()
    cur = conn.cursor()
    view_cols = defaultdict(dict)
    cur.execute("""SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS c
                   WHERE c.TABLE_SCHEMA = 'model'""")
    for tn, cn, dt in cur.fetchall():
        view_cols[tn][cn] = dt

    view_of = {}
    all_measures = Counter()
    for tname, t in tables.items():
        cols = t["columns"]
        all_measures.update(t["measures"].keys())
        check(len(t["partitions"]) == 1, f"TABLE {tname}: exactly one partition", str(len(t["partitions"])))

        for mname, m in t["measures"].items():
            check(mname not in cols, f"MEASURE {tname}[{mname}]: name differs from columns in its table")
            # Image URL measures (an SVG data URI) and report title/text measures return text, so a number format does not apply
            is_text = m["props"].get("dataCategory") == "ImageUrl" or m["props"].get("displayFolder") in ("Report titles", "Report text")
            for prop in ("displayFolder",) if is_text else ("formatString", "displayFolder"):
                check(prop in m["props"], f"MEASURE {tname}[{mname}]: has {prop}")
            check(m["doc"], f"MEASURE {tname}[{mname}]: has description")

        if t["calc_group"]:
            part = t["partitions"][0] if t["partitions"] else {}
            check(part.get("source_kind") == "calculationGroup", f"CALCGROUP {tname}: partition is calculationGroup")
            check(len(cols) == 2, f"CALCGROUP {tname}: exactly two columns", ", ".join(cols))
            srcs = {c["props"].get("sourceColumn"): c["props"].get("dataType") for c in cols.values()}
            check(srcs.get("Name") == "string", f"CALCGROUP {tname}: string column with sourceColumn Name")
            check(srcs.get("Ordinal") == "int64", f"CALCGROUP {tname}: int64 column with sourceColumn Ordinal")
            check(len(t["calc_items"]) > 0, f"CALCGROUP {tname}: has calculation items", str(len(t["calc_items"])))
            check(len(set(t["calc_items"])) == len(t["calc_items"]), f"CALCGROUP {tname}: item names unique")
        else:
            part = t["partitions"][0]
            src = "\n".join(part["raw"])
            mode = part["props"].get("mode")
            check(part["source_kind"] == "m" and mode in ("import", "directQuery"),
                  f"TABLE {tname}: M partition, mode {mode}")
            item = re.search(r'Source\{\[Schema = "model", Item = "(\w+)"\]\}\[Data\]', src)
            steps = re.findall(r"^\s+#?\"?\w+\"? = ", src, re.M)
            check(item is not None and "Sql.Database(Server, Database)" in src and len(steps) == 2,
                  f"TABLE {tname}: partition only navigates to a model view (no transformation steps)",
                  item.group(1) if item else "no view found")
            view = item.group(1) if item else None
            check(view in view_cols, f"TABLE {tname}: view model.{view} exists")
            view_of[tname] = view
            for cname, c in cols.items():
                sc, dt = c["props"].get("sourceColumn"), c["props"].get("dataType")
                check(sc is not None, f"COLUMN {tname}[{cname}]: has sourceColumn")
                sql_type = view_cols.get(view, {}).get(sc)
                check(sql_type is not None, f"COLUMN {tname}[{cname}]: source column {sc} exists in model.{view}")
                if sql_type:
                    check(SQL_TO_TMDL.get(sql_type) == dt, f"COLUMN {tname}[{cname}]: dataType {dt} matches SQL {sql_type}")
                check(dt != "double", f"COLUMN {tname}[{cname}]: not Double")

        # sort-by columns
        for cname, c in cols.items():
            sb = c["props"].get("sortByColumn")
            if not sb:
                continue
            sb, _ = parse_name(sb)
            target_col = cols.get(sb)
            check(target_col is not None, f"SORTBY {tname}[{cname}] -> [{sb}]: target exists in same table")
            if target_col is None:
                continue
            check("sortByColumn" not in target_col["props"], f"SORTBY {tname}[{cname}] -> [{sb}]: target is not itself sorted")
            check(target_col["props"].get("isAvailableInMdx") != "false",
                  f"SORTBY {tname}[{cname}] -> [{sb}]: target available in MDX")
            if not t["calc_group"]:
                a, b = c["props"]["sourceColumn"], target_col["props"]["sourceColumn"]
                cur.execute(f"SELECT COUNT(*) FROM (SELECT [{a}] FROM model.[{view_of[tname]}] "
                            f"GROUP BY [{a}] HAVING COUNT(DISTINCT [{b}]) > 1) x")
                n = cur.fetchone()[0]
                check(n == 0, f"SORTBY {tname}[{cname}] -> [{sb}]: one sort value per value (SQL)", f"{n} conflicts")

        # hierarchies
        for hname, h in t["hierarchies"].items():
            check(len(h["levels"]) >= 2, f"HIERARCHY {tname}.{hname}: at least two levels")
            for lv in h["levels"]:
                col = cols.get(lv["column"])
                check(col is not None and col["props"].get("isAvailableInMdx") != "false",
                      f"HIERARCHY {tname}.{hname}.{lv['name']}: column [{lv['column']}] exists and is available in MDX")

        # date table
        if t["props"].get("dataCategory") == "Time":
            keys = [c for c in cols.values() if c["props"].get("isKey")]
            check(len(keys) == 1 and keys[0]["props"].get("dataType") == "dateTime",
                  f"DATE {tname}: one dateTime column marked as key", ", ".join(k["name"] for k in keys))
            if keys:
                sc = keys[0]["props"]["sourceColumn"]
                cur.execute(f"""SELECT COUNT(*), COUNT(DISTINCT [{sc}]), SUM(CASE WHEN [{sc}] IS NULL THEN 1 ELSE 0 END),
                                       DATEDIFF(day, MIN([{sc}]), MAX([{sc}])) + 1, MIN([{sc}]), MAX([{sc}])
                                FROM model.[{view_of[tname]}]""")
                n, nd, nulls, span, lo, hi = cur.fetchone()
                check(n == nd and not nulls, f"DATE {tname}: key unique, no blanks", f"{n} rows")
                check(span == n, f"DATE {tname}: contiguous days", f"{lo} to {hi}")
                check(lo.month == 1 and lo.day == 1 and hi.month == 12 and hi.day == 31,
                      f"DATE {tname}: whole years", f"{lo} to {hi}")

    dupes = [m for m, n in all_measures.items() if n > 1]
    check(not dupes, "MEASURE names unique across the model", ", ".join(dupes))

    # relationships
    rels = parse_relationships(defn / "relationships.tmdl")
    active_pairs = Counter()
    related = set()
    for r in rels:
        ft, fc = parse_ref(r["fromColumn"])
        tt, tc = parse_ref(r["toColumn"])
        related.update((ft, tt))
        fcol = tables.get(ft, {}).get("columns", {}).get(fc)
        tcol = tables.get(tt, {}).get("columns", {}).get(tc)
        check(fcol is not None and tcol is not None, f"REL {r['name']}: both columns exist")
        if not (fcol and tcol):
            continue
        check(fcol["props"].get("dataType") == tcol["props"].get("dataType"),
              f"REL {r['name']}: data types match", f"{fcol['props'].get('dataType')} / {tcol['props'].get('dataType')}")
        many_many = r.get("toCardinality") == "many"
        check(r.get("crossFilteringBehavior", "oneDirection") == "oneDirection",
              f"REL {r['name']}: single direction")
        if r.get("isActive", "true") != "false":
            active_pairs[frozenset((ft, tt))] += 1
        if not many_many:
            sc = tcol["props"]["sourceColumn"]
            cur.execute(f"SELECT COUNT(*) - COUNT(DISTINCT [{sc}]), SUM(CASE WHEN [{sc}] IS NULL THEN 1 ELSE 0 END) "
                        f"FROM model.[{view_of[tt]}]")
            dup, nulls = cur.fetchone()
            check(dup == 0 and not nulls, f"REL {r['name']}: one-side {tt}[{tc}] unique, no blanks (SQL)")
    check(all(n == 1 for n in active_pairs.values()), "REL at most one active relationship per table pair")
    # Slicer tables read only by measures (SELECTEDVALUE) have no relationships by design
    disconnected = {"Comparison"}
    for tname, t in tables.items():
        if not t["calc_group"] and tname not in disconnected:
            check(tname in related, f"TABLE {tname}: has a relationship")

    check_tooltips(report_dir)

    print(f"{len(passes)} checks passed, {len(failures)} failed")
    for f in failures:
        print(f"FAIL  {f}")
    if "-v" in sys.argv:
        for p in passes:
            print(f"ok    {p}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()

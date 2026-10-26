# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pyodbc>=5.1",
#     "tabulate>=0.9",
# ]
# ///
"""Query the Contoso1M SQL Server database.

Usage:
    uv run tools/sql.py "<SQL>"                 run a query, print a table
    uv run tools/sql.py -f script.sql           run a script (batches split on GO)
    uv run tools/sql.py --describe              all tables and views
    uv run tools/sql.py --describe Data.Sales   one table or view

Options:
    --format table|csv|json   output format (default table)
    --max-rows N              rows to print per result set (default 100, 0 = all)

The password is read from the CLAUDE_SQL_PWD environment variable.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import decimal
import json
import os
import re
import sys

import pyodbc
from tabulate import tabulate

SERVER = "localhost"
DATABASE = "Contoso1M"
LOGIN = "claude_reader"
DRIVER = "ODBC Driver 18 for SQL Server"


def connect() -> pyodbc.Connection:
    pwd = os.environ.get("CLAUDE_SQL_PWD")
    if not pwd:
        sys.exit("CLAUDE_SQL_PWD is not set.")
    conn_str = (
        f"DRIVER={{{DRIVER}}};SERVER={SERVER};DATABASE={DATABASE};"
        f"UID={LOGIN};PWD={{{pwd.replace('}', '}}')}}};"
        "Encrypt=yes;TrustServerCertificate=yes;"
    )
    # autocommit so CREATE VIEW etc. take effect without an explicit COMMIT
    return pyodbc.connect(conn_str, autocommit=True)


# --- output -----------------------------------------------------------------

def to_plain(value):
    """Convert DB values to something csv/json/tabulate print cleanly."""
    if isinstance(value, decimal.Decimal):
        return float(value) if value != value.to_integral_value() else int(value)
    if isinstance(value, (dt.date, dt.datetime, dt.time)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray)):
        return "0x" + value.hex()
    return value


def print_result(columns: list[str], rows: list, fmt: str, max_rows: int, total: int) -> None:
    rows = [[to_plain(v) for v in r] for r in rows]
    if fmt == "csv":
        writer = csv.writer(sys.stdout, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)
    elif fmt == "json":
        print(json.dumps([dict(zip(columns, r)) for r in rows], indent=2, default=str))
    else:
        print(tabulate(rows, headers=columns, tablefmt="github", floatfmt=",.2f"))
    if total > len(rows):
        print(f"({len(rows)} of {total} rows shown; use --max-rows 0 for all)", file=sys.stderr)
    elif fmt == "table":
        print(f"({total} row{'s' if total != 1 else ''})")


def run_batch(cur: pyodbc.Cursor, sql: str, fmt: str, max_rows: int) -> None:
    """Execute one batch and print every result set it returns."""
    cur.execute(sql)
    while True:
        if cur.description:
            columns = [d[0] or f"col{i + 1}" for i, d in enumerate(cur.description)]
            if max_rows:
                rows = cur.fetchmany(max_rows)
                total = len(rows) + sum(1 for _ in cur)  # count the rest without keeping them
            else:
                rows = cur.fetchall()
                total = len(rows)
            print_result(columns, rows, fmt, max_rows, total)
        elif cur.rowcount >= 0 and fmt == "table":
            print(f"({cur.rowcount} rows affected)")
        if not cur.nextset():
            break


def split_batches(script: str) -> list[str]:
    """Split a script on lines that contain only GO (case-insensitive)."""
    parts = re.split(r"^\s*GO\s*$", script, flags=re.IGNORECASE | re.MULTILINE)
    return [p.strip() for p in parts if p.strip()]


# --- describe ---------------------------------------------------------------

DESCRIBE_SQL = """
SELECT
    s.name AS [schema], o.name AS [object], o.type_desc AS object_type,
    CAST(op.value AS nvarchar(4000)) AS object_description,
    c.column_id, c.name AS [column],
    TYPE_NAME(c.user_type_id) AS data_type, c.max_length, c.precision, c.scale,
    c.is_nullable,
    CAST(cp.value AS nvarchar(4000)) AS column_description,
    CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_pk,
    fk.ref
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.columns c ON c.object_id = o.object_id
LEFT JOIN sys.extended_properties op
    ON op.major_id = o.object_id AND op.minor_id = 0 AND op.class = 1 AND op.name = 'MS_Description'
LEFT JOIN sys.extended_properties cp
    ON cp.major_id = o.object_id AND cp.minor_id = c.column_id AND cp.class = 1 AND cp.name = 'MS_Description'
LEFT JOIN (
    SELECT ic.object_id, ic.column_id
    FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE i.is_primary_key = 1
) pk ON pk.object_id = o.object_id AND pk.column_id = c.column_id
OUTER APPLY (
    SELECT STRING_AGG(SCHEMA_NAME(ro.schema_id) + '.' + ro.name + '.' + rc.name, ', ') AS ref
    FROM sys.foreign_key_columns fkc
    JOIN sys.objects ro ON ro.object_id = fkc.referenced_object_id
    JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
    WHERE fkc.parent_object_id = o.object_id AND fkc.parent_column_id = c.column_id
) fk
WHERE o.type IN ('U', 'V') AND o.is_ms_shipped = 0
  AND (? IS NULL OR o.object_id = OBJECT_ID(?))
ORDER BY s.name, o.name, c.column_id
"""


def format_type(name: str, max_length: int, precision: int, scale: int) -> str:
    if name in ("varchar", "char", "varbinary", "binary"):
        return f"{name}({'max' if max_length == -1 else max_length})"
    if name in ("nvarchar", "nchar"):
        return f"{name}({'max' if max_length == -1 else max_length // 2})"
    if name in ("decimal", "numeric"):
        return f"{name}({precision},{scale})"
    if name in ("datetime2", "time", "datetimeoffset"):
        return f"{name}({scale})"
    return name


def describe(cur: pyodbc.Cursor, target: str | None, fmt: str) -> None:
    rows = cur.execute(DESCRIBE_SQL, target, target).fetchall()
    if not rows:
        sys.exit(f"No table or view found: {target}" if target else "No tables or views found.")

    if fmt != "table":
        columns = [d[0] for d in cur.description]
        print_result(columns, rows, fmt, 0, len(rows))
        return

    current = None
    table: list[list] = []

    def flush():
        if table:
            print(tabulate(table, headers=["column", "type", "null", "key", "description"], tablefmt="github"))
            print()

    for r in rows:
        key = (r.schema, r.object)
        if key != current:
            flush()
            table = []
            current = key
            kind = "VIEW" if r.object_type == "VIEW" else "TABLE"
            print(f"{r.schema}.{r.object}  [{kind}]")
            if r.object_description:
                print(f"  {r.object_description}")
        keys = []
        if r.is_pk:
            keys.append("PK")
        if r.ref:
            keys.append(f"FK -> {r.ref}")
        table.append([
            r.column,
            format_type(r.data_type, r.max_length, r.precision, r.scale),
            "yes" if r.is_nullable else "",
            ", ".join(keys),
            r.column_description or "",
        ])
    flush()


# --- main -------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sql", nargs="?", help="SQL query to run")
    parser.add_argument("-f", "--file", help="SQL script file; batches split on lines containing only GO")
    parser.add_argument("--describe", nargs="?", const="", metavar="SCHEMA.TABLE",
                        help="describe all tables and views, or one")
    parser.add_argument("--format", choices=["table", "csv", "json"], default="table")
    parser.add_argument("--max-rows", type=int, default=100, help="rows per result set (0 = all)")
    args = parser.parse_args()

    if sum(x is not None for x in (args.sql, args.file, args.describe)) != 1:
        parser.error("give exactly one of: a SQL string, -f FILE, or --describe")

    # Windows consoles default to a legacy code page; force UTF-8 for names with accents.
    sys.stdout.reconfigure(encoding="utf-8")

    with connect() as conn:
        cur = conn.cursor()
        try:
            if args.describe is not None:
                describe(cur, args.describe or None, args.format)
            elif args.file:
                with open(args.file, encoding="utf-8-sig") as fh:
                    batches = split_batches(fh.read())
                for i, batch in enumerate(batches, 1):
                    if len(batches) > 1 and args.format == "table":
                        print(f"-- batch {i}/{len(batches)}")
                    run_batch(cur, batch, args.format, args.max_rows)
            else:
                run_batch(cur, args.sql, args.format, args.max_rows)
        except pyodbc.Error as e:
            # e.args[1] holds the driver message; strip the ODBC prefix noise
            msg = e.args[1] if len(e.args) > 1 else str(e)
            sys.exit(re.sub(r"\[Microsoft\]\[ODBC Driver \d+ for SQL Server\]\[SQL Server\]", "", msg))


if __name__ == "__main__":
    main()

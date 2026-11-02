# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pypandoc_binary>=1.13",
# ]
# ///
"""Build docs/contoso-sales.docx from docs/contoso-sales.md.

Usage:
    uv run tools/build_docs.py

The Markdown is the source. Each ```mermaid block is rendered locally to docs/img/diagram-N.png with
mermaid-cli (npx, headless Chromium; nothing leaves the machine) and replaced by that image for Word.
Images are fitted to the page width. pandoc comes from the pypandoc_binary package.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

import pypandoc

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
SOURCE = DOCS / "contoso-sales.md"
TARGET = DOCS / "contoso-sales.docx"
MERMAID_CLI = "@mermaid-js/mermaid-cli@11.4.2"

MERMAID = re.compile(r"```mermaid\n(.*?)```", re.S)


def render_diagrams(text: str) -> str:
    """Render every Mermaid block to a PNG and put an image reference in its place."""
    count = 0

    def replace(match: re.Match) -> str:
        nonlocal count
        count += 1
        png = DOCS / "img" / f"diagram-{count}.png"
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "diagram.mmd"
            source.write_text(match.group(1), encoding="utf-8")
            subprocess.run(
                ["npx", "-y", MERMAID_CLI, "-i", str(source), "-o", str(png), "-b", "white", "-s", "2"],
                check=True, shell=True, capture_output=True,
            )
        return f"![Diagram {count}](img/{png.name}){{width=100%}}\n"

    text = MERMAID.sub(replace, text)
    print(f"Rendered {count} diagrams")
    return text


def main() -> None:
    text = render_diagrams(SOURCE.read_text(encoding="utf-8"))
    # Screenshots and diagrams fill the page width in Word
    text = re.sub(r"(!\[[^\]]*\]\(img/page-[^)]+\))(?!\{)", r"\1{width=100%}", text)
    # Dollar math off, as a backstop to the \$ escapes in the source: "$13.6M ... $2.0M" is text, not a formula
    pypandoc.convert_text(
        text, "docx", format="gfm+attributes-tex_math_dollars-tex_math_gfm", outputfile=str(TARGET),
        extra_args=[f"--resource-path={DOCS}"],
    )
    print(f"Wrote {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

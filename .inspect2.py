"""Deeper inspection: full headers + sample rows for each sheet, distinct values."""
import sys
from pathlib import Path
from openpyxl import load_workbook
from collections import Counter
from openpyxl.utils import get_column_letter


def show_sheet(ws, max_rows=15):
    print(f"  Sheet: {ws.title} ({ws.max_row}r × {ws.max_column}c)")
    if ws.merged_cells.ranges:
        print(f"  Merged: {[str(r) for r in list(ws.merged_cells.ranges)[:5]]}")

    # Print rows 1..max_rows × all cols (or 25)
    cols = min(ws.max_column, 25)
    print(f"  Header + first {max_rows - 1} data rows (cols 1..{cols}):")
    for r in range(1, min(max_rows, ws.max_row) + 1):
        line = []
        for c in range(1, cols + 1):
            v = ws.cell(r, c).value
            s = "" if v is None else (str(v)[:18] + "…" if len(str(v)) > 18 else str(v))
            line.append(f"{s:>18}")
        print(f"    R{r:3d}| " + "|".join(line))


def distinct_values(ws, col, max_show=12):
    if ws.max_row < 2 or col > ws.max_column:
        return
    vals = []
    for r in range(2, ws.max_row + 1):
        v = ws.cell(r, col).value
        if v not in (None, ""):
            vals.append(str(v))
    if vals:
        c = Counter(vals)
        top = c.most_common(max_show)
        print(f"    Col {get_column_letter(col)} distinct={len(c)} top={top}")


for path_str in sys.argv[1:]:
    path = Path(path_str)
    print("=" * 100)
    print(f"FILE: {path.name}")
    print("=" * 100)

    wb = load_workbook(path, data_only=False)

    for sn in wb.sheetnames:
        ws = wb[sn]
        print()
        show_sheet(ws, max_rows=6 if ws.max_row > 20 else 12)

        # Distinct-value analysis for the categorical-looking columns in registration form
        if sn == "计划外维修清单" or sn == "计划外维修清单":
            for col in (2, 4, 5, 6, 7, 8):  # B,D,E,F,G,H
                distinct_values(ws, col)

        # Production sheet is a master list
        if sn == "Production":
            distinct_values(ws, 1, max_show=20)

        # Setting sheet has key-value lookups
        if sn == "Setting":
            for col in (1, 2, 3, 4, 5):
                distinct_values(ws, col)

    # Cross-sheet formula analysis (sample)
    print("\n  -- Distinct values across all sheets for key cols --")
    for sn in wb.sheetnames:
        ws = wb[sn]
        if ws.max_row < 3:
            continue
        # Try columns 5,6,7,8 (likely "类型", "阶段", "报修内容", "紧急程度")
        for c in (5, 6, 7, 8):
            distinct_values(ws, c, max_show=5)
    print()
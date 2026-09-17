"""Inspect the user's actual Excel files to understand their reporting format."""
import sys
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter


def cell_repr(cell):
    """Compact repr that distinguishes formula vs value, highlights type."""
    if cell.value is None:
        return ""
    v = cell.value
    is_formula = isinstance(v, str) and v.startswith("=")
    type_hint = ""
    if hasattr(cell, "data_type"):
        if cell.data_type == "f":
            type_hint = "[F]"
        elif cell.data_type == "n":
            type_hint = "[N]"
        elif cell.data_type == "s":
            type_hint = "[S]"
        elif cell.data_type == "d":
            type_hint = "[D]"
        elif cell.data_type == "b":
            type_hint = "[B]"
    s = str(v)
    if len(s) > 60:
        s = s[:57] + "…"
    return f"{type_hint}{s}"


def inspect(path: Path):
    print("=" * 90)
    print(f"FILE: {path.name}")
    print(f"PATH: {path}")
    print(f"SIZE: {path.stat().st_size:,} bytes")
    print("=" * 90)

    wb = load_workbook(path, data_only=False)
    print(f"\nSHEETS ({len(wb.sheetnames)}): {wb.sheetnames}")
    print(f"DEFINED NAMES: {[n for n in wb.defined_names]}")

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        print(f"\n--- Sheet: {sheet_name} ---")
        print(f"Dimensions: {ws.dimensions} (max_row={ws.max_row}, max_col={ws.max_column})")
        print(f"State: {ws.sheet_state}")
        if ws.merged_cells.ranges:
            merged = [str(r) for r in ws.merged_cells.ranges]
            print(f"Merged regions: {merged[:10]}{' ...' if len(merged) > 10 else ''}")

        # Column widths
        col_widths = []
        for letter, dim in ws.column_dimensions.items():
            if dim.width:
                col_widths.append(f"{letter}={dim.width:.1f}")
        if col_widths:
            print(f"Column widths: {col_widths[:15]}{' ...' if len(col_widths) > 15 else ''}")

        # Walk first 30 rows, show content
        max_rows_to_show = min(40, ws.max_row)
        max_cols_to_show = min(15, ws.max_column)
        print(f"\nFirst {max_rows_to_show} rows × {max_cols_to_show} cols:")
        print("    " + " | ".join(f"{get_column_letter(c):>10}" for c in range(1, max_cols_to_show + 1)))
        for r in range(1, max_rows_to_show + 1):
            row_repr = []
            for c in range(1, max_cols_to_show + 1):
                row_repr.append(f"{cell_repr(ws.cell(r, c)):>10}")
            print(f"R{r:3d}| " + " | ".join(row_repr))

        # Formula summary
        formulas = []
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    formulas.append((cell.coordinate, cell.value))
        if formulas:
            print(f"\nFormulas found ({len(formulas)}):")
            for coord, f in formulas[:25]:
                print(f"  {coord}: {f[:100]}")
            if len(formulas) > 25:
                print(f"  ... +{len(formulas) - 25} more")

    print()


if __name__ == "__main__":
    for p in sys.argv[1:]:
        inspect(Path(p))
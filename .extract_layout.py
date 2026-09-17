"""Inspect the 3 maintenance sheets' exact headers and sample row."""
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
from pathlib import Path
import json

PATH = Path(r"C:\Users\PZS0X\.minimax\v2\assets\2026\09\17\22-26-53-073-asset_20260917-222653-073_24913de2068a_a4c1617c-计划外维修汇总登记表.xlsx")
wb = load_workbook(PATH, data_only=True)

# The 3 sheets we care about are at indices 0, 1, 2 by name match
sheets_of_interest = [wb.sheetnames[0], wb.sheetnames[1], wb.sheetnames[2]]

result = {}
for sn in sheets_of_interest:
    ws = wb[sn]
    headers = []
    for c in range(1, ws.max_column + 1):
        v = ws.cell(1, c).value
        if v is not None:
            headers.append({"col": get_column_letter(c), "idx": c, "name": str(v).strip()})
    # Get all data rows (row 2 onward)
    data_rows = []
    for r in range(2, ws.max_row + 1):
        row = {}
        for c in range(1, ws.max_column + 1):
            h = ws.cell(1, c).value
            if h is None: continue
            v = ws.cell(r, c).value
            if v not in (None, ""):
                row[str(h).strip()] = v
        if row:
            data_rows.append(row)
    result[sn] = {"headers": headers, "data_count": len(data_rows), "first_row": data_rows[0] if data_rows else None}

# UTF-8 write (BOM so Excel reads as UTF-8)
out_path = Path(r"D:\Github\Maintenance-Records\.layout.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2, default=str)
print(f"Wrote layout for {len(result)} sheets → {out_path}")
print(f"Sheets: {list(result.keys())}")
for sn, info in result.items():
    print(f"\n{sn}: {len(info['headers'])} cols, {info['data_count']} rows")
    print(f"  Headers: {[h['name'] for h in info['headers']]}")
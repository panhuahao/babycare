#!/usr/bin/env python3
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
WEEKDAY_ORDER = {"周一": 0, "周二": 1, "周三": 2, "周四": 3, "周五": 4, "周六": 5, "周日": 6}


def normalize_number_text(raw: str) -> str:
    s = (raw or "").strip()
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        return s
    try:
        n = float(s)
    except ValueError:
        return s
    if abs(n - round(n)) < 1e-9:
        return str(int(round(n)))
    out = f"{n:.2f}".rstrip("0").rstrip(".")
    return out if out else s


def col_num(ref: str) -> int:
    m = re.match(r"([A-Z]+)", ref or "")
    if not m:
        return -1
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - 64)
    return n


def load_shared_strings(zf: zipfile.ZipFile):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall("x:si", NS):
        texts = []
        for t in si.findall(".//x:t", NS):
            texts.append(t.text or "")
        out.append("".join(texts))
    return out


def read_cell(c: ET.Element, shared_strings):
    t = c.attrib.get("t")
    if t == "s":
        v = c.find("x:v", NS)
        if v is None or v.text is None:
            return ""
        try:
            idx = int(v.text)
        except ValueError:
            return ""
        return shared_strings[idx] if 0 <= idx < len(shared_strings) else ""
    if t == "inlineStr":
        ts = c.findall(".//x:t", NS)
        return "".join((x.text or "") for x in ts)
    v = c.find("x:v", NS)
    if v is None or v.text is None:
        return ""
    return normalize_number_text(v.text)


def parse_week_sheet(zf: zipfile.ZipFile, sheet_xml: str, week_no: int, shared_strings):
    root = ET.fromstring(zf.read(sheet_xml))
    rows = root.findall(".//x:sheetData/x:row", NS)
    title = ""
    by_day = {k: [] for k in WEEKDAY_ORDER.keys()}
    current_day = None

    for row in rows:
        row_map = {}
        for c in row.findall("x:c", NS):
            key = col_num(c.attrib.get("r", ""))
            if key <= 0:
                continue
            value = (read_cell(c, shared_strings) or "").strip()
            if value:
                row_map[key] = value
        if not row_map:
            continue

        a = row_map.get(1, "")
        if not title and a.startswith("第") and "周食谱" in a:
            title = a
            continue
        if a in WEEKDAY_ORDER:
            current_day = a
        if current_day is None:
            continue

        meal = row_map.get(2, "")
        food = row_map.get(3, "")
        if not meal and not food:
            continue

        by_day[current_day].append(
            {
                "meal": meal,
                "food": food,
                "rawWeightGram": row_map.get(4, ""),
                "carbsGram": row_map.get(5, ""),
                "proteinGram": row_map.get(6, ""),
                "fatGram": row_map.get(7, ""),
                "fiberGram": row_map.get(8, ""),
                "kcal": row_map.get(9, ""),
                "eatOrderTip": row_map.get(10, ""),
            }
        )

    days = []
    for name in ("周一", "周二", "周三", "周四", "周五", "周六", "周日"):
        days.append({"weekday": name, "dayIndex": WEEKDAY_ORDER[name], "items": by_day[name]})

    return {"weekNo": week_no, "title": title or f"Week{week_no}", "days": days}


def parse_workbook(path: str):
    with zipfile.ZipFile(path) as zf:
        wb_root = ET.fromstring(zf.read("xl/workbook.xml"))
        rel_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}

        id_to_target = {}
        for rel in rel_root.findall("r:Relationship", rel_ns):
            rid = rel.attrib.get("Id", "")
            target = rel.attrib.get("Target", "")
            if rid and target:
                norm = target.lstrip("/")
                if not norm.startswith("xl/"):
                    norm = f"xl/{norm}"
                id_to_target[rid] = norm

        shared_strings = load_shared_strings(zf)
        weeks = []
        for sh in wb_root.findall("x:sheets/x:sheet", NS):
            name = sh.attrib.get("name", "")
            if not re.fullmatch(r"Week\d+", name):
                continue
            rid = sh.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id", "")
            target = id_to_target.get(rid, "")
            if not target:
                continue
            week_no = int(name[4:])
            weeks.append(parse_week_sheet(zf, target, week_no, shared_strings))

        weeks.sort(key=lambda x: x["weekNo"])
        return {"weeks": weeks, "totalWeeks": len(weeks), "daysPerWeek": 7}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing xlsx path"}, ensure_ascii=False))
        return 2
    xlsx_path = sys.argv[1]
    try:
        payload = parse_workbook(xlsx_path)
        if not payload.get("weeks"):
            raise ValueError("no week sheets found")
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())

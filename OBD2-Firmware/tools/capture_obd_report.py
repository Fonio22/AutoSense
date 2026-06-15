#!/usr/bin/env python3
import argparse
import csv
import re
import sys
import time
from pathlib import Path
from typing import Optional


ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
SUMMARY_PREFIXES = (
    "OBD2 DASHBOARD",
    "AutoSense OBD2 Live",
    "link=",
    "rate ",
    "fps:",
    "log=",
    "OBD LIVE",
    "OBD LIVE TABLE",
    "PID DATO",
    "M  PID",
    "LIVE DATA",
    "ENGINE",
    "DRIVE",
    "AIR/FUEL",
    "DIAG",
    "Mode09",
    "Mode09 ECU",
    "ECU ID",
    "Mode 09",
    "Mode 02",
    "Mode 06",
    "Mode 03",
    "Mode 07",
    "Mode 0A",
    "VW/VAG UDS",
    "VW/VAG leido",
    "Leido por OBD",
    "No leido",
    "No leido UDS",
    "ADR NAME",
)
MODE09_ECU_ROW_RE = re.compile(r"^[0-9A-F]{3,8}\s+\S+")
MODULE_ROW_RE = re.compile(r"^[0-9A-F]{2}\s+(?![0-9A-F]{2}\b)\S+\s+(UP|--|\S{3,})\s+")
METRIC_ROW_FIXED_RE = re.compile(
    r"^(?P<mode>[0-9A-F]{2})\s+"
    r"(?P<pid>[0-9A-F]{2})\s{2}"
    r"(?P<key>.{12}) "
    r"(?P<value>.{12}) "
    r"(?P<unit>.{6})\s+"
    r"(?P<hz>\d+\.\d)\s{2}"
    r"(?P<category>.{12}) "
    r"(?P<raw>\S+)\s+"
    r"(?P<updated_age_seconds>\d+)s$"
)
METRIC_ROW_FLEX_RE = re.compile(
    r"^(?P<mode>[0-9A-F]{2})\s+"
    r"(?P<pid>[0-9A-F]{2})\s+"
    r"(?P<key>\S+)\s+"
    r"(?P<value>\S+)\s+"
    r"(?P<unit>\S*)\s+"
    r"(?P<hz>\d+\.\d)\s+"
    r"(?P<category>\S+)\s+"
    r"(?P<raw>\S+)\s+"
    r"(?P<updated_age_seconds>\d+)s$"
)
METRIC_ROW_COMPACT_FIXED_RE = re.compile(
    r"^(?P<pid>[0-9A-F]{2})\s{2}"
    r"(?P<key>.{12}) "
    r"(?P<value>.{12}) "
    r"(?P<unit>.{6})\s+"
    r"(?P<hz>\d+\.\d)\s+"
    r"(?P<raw>\S+)\s+"
    r"(?P<updated_age_seconds>\d+)s$"
)
METRIC_ROW_COMPACT_FLEX_RE = re.compile(
    r"^(?P<pid>[0-9A-F]{2})\s+"
    r"(?P<key>\S+)\s+"
    r"(?P<value>\S+)\s+"
    r"(?P<unit>\S*)\s+"
    r"(?P<hz>\d+\.\d)\s+"
    r"(?P<raw>\S+)\s+"
    r"(?P<updated_age_seconds>\d+)s$"
)
VAG_ROW_RE = re.compile(r"^(?P<address>[0-9A-F]{2})\s+(?P<rest>.+)$")

METRIC_HEADERS = [
    "mode",
    "pid",
    "supported",
    "key",
    "value",
    "unit",
    "hz",
    "category",
    "raw",
    "updated_age_seconds",
    "notes",
]
VAG_HEADERS = ["address", "name", "status", "part_or_sw", "dtc", "error"]
MODE09_ECU_HEADERS = ["response_id", "ecu", "calid", "cvn", "raw"]
MODE06_HEADERS = ["summary", "kind", "tid", "test", "unit", "value", "min", "raw"]
VAG_NAME_TO_ADDRESS = {
    "Engine": "01",
    "Trans": "02",
    "ABS": "03",
    "HVAC": "08",
    "BCM": "09",
    "Airbag": "15",
    "Cluster": "17",
    "Gateway": "19",
    "Steering": "44",
    "Comfort": "46",
    "ParkBrake": "53",
    "Infotain": "5F",
    "TPMS": "65",
    "SteerCol": "16",
}


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text).replace("\x1b", "")


def latest_dashboard_frame(text: str) -> str:
    markers = ("AutoSense OBD2 Live", "OBD2 DASHBOARD")
    index = max(text.rfind(marker) for marker in markers)
    if index < 0:
        return text
    return text[index:]


def summarize(text: str) -> list[str]:
    frame = latest_dashboard_frame(strip_ansi(text))
    lines = []
    for raw_line in frame.splitlines():
        line = raw_line.strip()
        if any(line.startswith(prefix) for prefix in SUMMARY_PREFIXES) or parse_metric_line(line) or MODE09_ECU_ROW_RE.match(line) or MODULE_ROW_RE.match(line):
            lines.append(line)
    return lines


def parse_metric_rows(clean_text: str) -> list[dict[str, str]]:
    metrics: dict[tuple[str, str], dict[str, str]] = {}

    for raw_line in clean_text.splitlines():
        line = raw_line.strip()
        row = parse_metric_line(line)
        if not row:
            continue

        row["supported"] = "yes"
        row["notes"] = "captured"
        metrics[(row["mode"], row["pid"])] = row

    add_unsupported_from_bitmaps(metrics)
    return [metrics[key] for key in sorted(metrics)]


def parse_metric_line(line: str) -> Optional[dict[str, str]]:
    match = METRIC_ROW_FIXED_RE.match(line)
    if not match:
        match = METRIC_ROW_FLEX_RE.match(line)
    if match:
        row = match.groupdict()
    else:
        match = METRIC_ROW_COMPACT_FIXED_RE.match(line)
        if not match:
            match = METRIC_ROW_COMPACT_FLEX_RE.match(line)
        if not match:
            return None
        row = match.groupdict()
        row["mode"] = "01"
        row["category"] = "live"

    for key, value in list(row.items()):
        row[key] = value.strip()
    return row


def parse_raw_bytes(raw: str) -> list[int]:
    if raw in ("", "--"):
        return []
    try:
        return [int(part, 16) for part in raw.split(":")]
    except ValueError:
        return []


def add_unsupported_from_bitmaps(metrics: dict[tuple[str, str], dict[str, str]]) -> None:
    support_pids = [0x00, 0x20, 0x40, 0x60, 0x80, 0xA0, 0xC0]
    for base in support_pids:
        row = metrics.get(("01", f"{base:02X}"))
        if not row:
            continue

        values = parse_raw_bytes(row.get("raw", ""))
        if len(values) < 4:
            values = parse_raw_bytes(row.get("value", ""))
        if len(values) < 4:
            continue

        bitmap = (values[0] << 24) | (values[1] << 16) | (values[2] << 8) | values[3]
        for bit_index in range(32):
            pid = base + 1 + bit_index
            if pid > 0xE0:
                continue

            key = ("01", f"{pid:02X}")
            if key in metrics:
                continue
            if bitmap & (1 << (31 - bit_index)):
                continue

            metrics[key] = {
                "mode": "01",
                "pid": f"{pid:02X}",
                "supported": "no",
                "key": f"pid_{pid:02X}",
                "value": "",
                "unit": "",
                "hz": "0.0",
                "category": "unsupported",
                "raw": "",
                "updated_age_seconds": "",
                "notes": "declared_not_supported_by_bitmap",
            }


def parse_vag_rows(clean_text: str) -> list[dict[str, str]]:
    modules: dict[str, dict[str, str]] = {}
    in_vag_section = False

    for raw_line in clean_text.splitlines():
        line = raw_line.strip()
        if line.startswith("Leido por OBD:"):
            visible = line.split(":", 1)[1].split("(", 1)[0].strip()
            for name in [part.strip() for part in visible.split(",") if part.strip()]:
                address = VAG_NAME_TO_ADDRESS.get(name, "")
                modules[address or name] = {
                    "address": address,
                    "name": name,
                    "status": "OBD",
                    "part_or_sw": "Mode09/Mode01",
                    "dtc": "--",
                    "error": "UDS not required for standard OBD identity/live data",
                }
            continue
        if line.startswith("No leido UDS:"):
            missing = line.split(":", 1)[1].strip()
            for item in [part.strip() for part in missing.split(",") if part.strip() and part.strip() != "--"]:
                match = re.match(r"(?P<name>[^@]+)@(?P<route>[^:]+):(?P<error>.+)", item)
                if not match:
                    continue
                name = match.group("name").strip()
                address = VAG_NAME_TO_ADDRESS.get(name, "")
                current = modules.get(address or name)
                if current and current.get("status") == "OBD":
                    continue
                modules[address or name] = {
                    "address": address,
                    "name": name,
                    "status": "--",
                    "part_or_sw": "--",
                    "dtc": "--",
                    "error": f"{match.group('route').strip()} {match.group('error').strip()}",
                }
            continue
        if line.startswith("VW/VAG leido"):
            in_vag_section = True
            continue
        if in_vag_section and (line.startswith("Leido por OBD") or line.startswith("No leido UDS") or line.startswith("No leido modulos") or line.startswith("AutoSense OBD2 Live")):
            in_vag_section = False
        if not in_vag_section or line.startswith("ADR "):
            continue
        if not MODULE_ROW_RE.match(line):
            continue
        match = VAG_ROW_RE.match(line)
        if not match:
            continue

        parts = line.split()
        if len(parts) < 5:
            continue

        address, name = parts[:2]
        if parts[2] == "UP" or (parts[2] == "--" and len(parts) >= 6):
            status, part_or_sw, dtc = parts[2:5]
            error = " ".join(parts[5:])
        else:
            status = "UP"
            part_or_sw, dtc = parts[2:4]
            error = " ".join(parts[4:])
        modules[address] = {
            "address": address,
            "name": name,
            "status": status,
            "part_or_sw": part_or_sw,
            "dtc": dtc,
            "error": error,
        }

    return [modules[key] for key in sorted(modules)]


def parse_mode09_ecu_rows(clean_text: str) -> list[dict[str, str]]:
    rows: dict[str, dict[str, str]] = {}
    row_re = re.compile(r"^(?P<id>[0-9A-F]{3,8})\s+(?P<ecu>.*?)\s{2,}(?P<calid>.*?)\s{2,}(?P<cvn>\S+)$")

    for raw_line in clean_text.splitlines():
        line = raw_line.strip()
        match = row_re.match(line)
        if match:
            response_id = match.group("id")
            ecu = match.group("ecu").strip()
            calid = match.group("calid").strip()
            cvn = match.group("cvn").strip()
        else:
            parts = line.split()
            if len(parts) < 4 or not re.fullmatch(r"[0-9A-F]{3,8}", parts[0]):
                continue
            response_id = parts[0]
            ecu = parts[1]
            cvn = parts[-1]
            calid = " ".join(parts[2:-1])
        if not calid:
            continue
        if response_id in {"ADR", "PID"}:
            continue
        rows[response_id] = {
            "response_id": response_id,
            "ecu": ecu,
            "calid": calid,
            "cvn": cvn,
            "raw": line,
        }

    return [rows[key] for key in sorted(rows)]


def parse_mode06_rows(clean_text: str) -> list[dict[str, str]]:
    rows: dict[str, dict[str, str]] = {}
    token_re = re.compile(r"\b(?P<key>tid|test|unit|val|min|raw|sup)(?:=)?(?P<value>[0-9A-Fa-f:.]+)")

    for raw_line in clean_text.splitlines():
        line = raw_line.strip()
        if "M06=" not in line:
            continue

        summary = line.split("M06=", 1)[1].strip()
        if summary == "--":
            continue

        row = {
            "summary": summary,
            "kind": "unknown",
            "tid": "",
            "test": "",
            "unit": "",
            "value": "",
            "min": "",
            "raw": "",
        }

        if summary.startswith("sup"):
            row["kind"] = "support"
            parts = summary.split()
            if parts:
                row["tid"] = parts[0].replace("sup", "", 1)
        elif summary.startswith("tid="):
            row["kind"] = "test"

        for match in token_re.finditer(summary):
            key = match.group("key")
            value = match.group("value")
            if key == "tid":
                row["tid"] = value
            elif key == "test":
                row["test"] = value
            elif key == "unit":
                row["unit"] = value
            elif key == "val":
                row["value"] = value
            elif key == "min":
                row["min"] = value
            elif key == "raw":
                row["raw"] = value

        dedupe_key = f"{row['kind']}:{row['tid']}:{row['test']}:{row['raw'] or row['summary']}"
        rows[dedupe_key] = row

    return [rows[key] for key in sorted(rows)]


def write_csv(path: Path, rows: list[dict[str, str]], headers: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture a read-only AutoSense serial dashboard report.")
    parser.add_argument("--port", required=True, help="ESP32 serial port, for example /dev/cu.usbmodem101")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--out", type=Path, default=Path("output/obd_report.txt"))
    parser.add_argument("--metrics-csv", type=Path, help="Optional CSV output for OBD metric rows")
    parser.add_argument("--vag-csv", type=Path, help="Optional CSV output for VW/VAG module rows")
    parser.add_argument("--mode09-csv", type=Path, help="Optional CSV output for Mode 09 ECU identity rows")
    parser.add_argument("--mode06-csv", type=Path, help="Optional CSV output for Mode 06 summary rows")
    args = parser.parse_args()

    try:
        import serial
    except ImportError as exc:
        raise SystemExit("pyserial is required. Use PlatformIO's Python or install pyserial.") from exc

    args.out.parent.mkdir(parents=True, exist_ok=True)
    chunks: list[str] = []

    with serial.Serial(args.port, args.baud, timeout=0.2, write_timeout=0) as ser:
        start = time.monotonic()
        while time.monotonic() - start < args.seconds:
            data = ser.read(4096)
            if data:
                chunks.append(data.decode("utf-8", errors="replace"))

    captured = "".join(chunks)
    clean = strip_ansi(captured)
    args.out.write_text(clean)

    if args.metrics_csv:
        metric_rows = parse_metric_rows(clean)
        write_csv(args.metrics_csv, metric_rows, METRIC_HEADERS)
        print(f"wrote {len(metric_rows)} OBD metric rows to {args.metrics_csv}")

    if args.vag_csv:
        vag_rows = parse_vag_rows(clean)
        write_csv(args.vag_csv, vag_rows, VAG_HEADERS)
        print(f"wrote {len(vag_rows)} VW/VAG module rows to {args.vag_csv}")

    if args.mode09_csv:
        mode09_rows = parse_mode09_ecu_rows(clean)
        write_csv(args.mode09_csv, mode09_rows, MODE09_ECU_HEADERS)
        print(f"wrote {len(mode09_rows)} Mode 09 ECU rows to {args.mode09_csv}")

    if args.mode06_csv:
        mode06_rows = parse_mode06_rows(clean)
        write_csv(args.mode06_csv, mode06_rows, MODE06_HEADERS)
        print(f"wrote {len(mode06_rows)} Mode 06 rows to {args.mode06_csv}")

    summary = summarize(captured)
    print(f"wrote report to {args.out}")
    if summary:
        print("\n".join(summary))
    else:
        print("no dashboard frame detected")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

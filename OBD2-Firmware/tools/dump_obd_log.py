#!/usr/bin/env python3
import argparse
import csv
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path


RECORD_SIZE = 24
RECORDS_PER_SECTOR = 170
SECTOR_SIZE = 4096
FORMAT = "<2sBHIIH8BB"
MAGIC = b"AS"
VERSION = 1
DEFAULT_PARTITION_NAME = "obdlog"

FIELDS = [
    ("rpm", 1 << 0),
    ("speed_kph", 1 << 1),
    ("coolant_c", 1 << 2),
    ("throttle_pct", 1 << 3),
    ("fuel_level_pct", 1 << 4),
    ("engine_load_pct", 1 << 5),
    ("map_kpa", 1 << 6),
    ("maf_gps", 1 << 7),
    ("ecu_voltage_v", 1 << 8),
]


def crc8(data: bytes) -> int:
    crc = 0
    for value in data:
        crc ^= value
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def parse_int(value: str) -> int:
    return int(value.strip(), 0)


def partition_info(partitions_csv: Path, name: str) -> tuple[int, int]:
    for raw_line in partitions_csv.read_text().splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = [part.strip() for part in line.split(",")]
        if len(parts) < 5 or parts[0] != name:
            continue
        return parse_int(parts[3]), parse_int(parts[4])
    raise SystemExit(f"partition '{name}' not found in {partitions_csv}")


def find_esptool_command() -> list[str]:
    platformio_tool = Path.home() / ".platformio/packages/tool-esptoolpy/esptool.py"
    if platformio_tool.exists():
        platformio_python = Path.home() / ".platformio/penv/bin/python"
        if platformio_python.exists():
            return [str(platformio_python), str(platformio_tool)]
        return [sys.executable, str(platformio_tool)]

    executable = shutil.which("esptool.py") or shutil.which("esptool")
    if executable:
        return [executable]

    return [sys.executable, "-m", "esptool"]


def read_flash(port: str, baud: int, offset: int, size: int, output: Path) -> None:
    command = find_esptool_command() + [
        "--chip",
        "esp32s3",
        "--port",
        port,
        "--baud",
        str(baud),
        "read_flash",
        hex(offset),
        hex(size),
        str(output),
    ]
    subprocess.run(command, check=True)


def decode_record(record: bytes):
    if len(record) != RECORD_SIZE or record == b"\xFF" * RECORD_SIZE:
        return None
    if crc8(record[:-1]) != record[-1]:
        return None

    unpacked = struct.unpack(FORMAT, record)
    magic, version, valid_mask, sequence, uptime, rpm = unpacked[:6]
    compact = unpacked[6:14]
    stored_crc = unpacked[14]

    if magic != MAGIC or version != VERSION or stored_crc != record[-1]:
        return None

    speed, coolant_raw, throttle, fuel, load, map_kpa, maf, ecu_dv = compact
    values = {
        "sequence": sequence,
        "uptime_seconds": uptime,
        "valid_mask": f"0x{valid_mask:04X}",
        "rpm": rpm,
        "speed_kph": speed,
        "coolant_c": coolant_raw - 40,
        "throttle_pct": throttle,
        "fuel_level_pct": fuel,
        "engine_load_pct": load,
        "map_kpa": map_kpa,
        "maf_gps": maf,
        "ecu_voltage_v": f"{ecu_dv / 10:.1f}",
    }

    for field, bit in FIELDS:
        if not valid_mask & bit:
            values[field] = ""

    return values


def parse_records(raw_path: Path):
    data = raw_path.read_bytes()
    records = []
    sector_count = len(data) // SECTOR_SIZE
    for sector_index in range(sector_count):
        sector_base = sector_index * SECTOR_SIZE
        for record_index in range(RECORDS_PER_SECTOR):
            start = sector_base + (record_index * RECORD_SIZE)
            decoded = decode_record(data[start : start + RECORD_SIZE])
            if decoded:
                records.append(decoded)
    records.sort(key=lambda row: row["sequence"])
    return records


def write_csv(records, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    headers = ["sequence", "uptime_seconds", "valid_mask"] + [name for name, _ in FIELDS]
    with output.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=headers)
        writer.writeheader()
        writer.writerows(records)


def main() -> int:
    parser = argparse.ArgumentParser(description="Dump AutoSense binary OBD log to CSV.")
    parser.add_argument("--port", help="ESP32 serial port, for example /dev/cu.usbmodem1101")
    parser.add_argument("--baud", type=int, default=921600)
    parser.add_argument("--out", required=True, type=Path, help="CSV output path")
    parser.add_argument("--partitions", type=Path, default=Path("partitions.csv"))
    parser.add_argument("--partition-name", default=DEFAULT_PARTITION_NAME)
    parser.add_argument("--raw", type=Path, help="Parse an existing raw flash dump instead of reading the ESP32")
    parser.add_argument("--keep-raw", type=Path, help="Keep the raw partition dump at this path")
    parser.add_argument("--limit", type=int, default=0, help="Keep only the latest N valid records")
    args = parser.parse_args()

    if args.raw:
        raw_path = args.raw
    else:
        if not args.port:
            raise SystemExit("--port is required unless --raw is used")
        offset, size = partition_info(args.partitions, args.partition_name)
        if args.keep_raw:
            raw_path = args.keep_raw
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            read_flash(args.port, args.baud, offset, size, raw_path)
        else:
            with tempfile.TemporaryDirectory() as tmp:
                raw_path = Path(tmp) / "obdlog.bin"
                read_flash(args.port, args.baud, offset, size, raw_path)
                records = parse_records(raw_path)
                if args.limit > 0:
                    records = records[-args.limit :]
                write_csv(records, args.out)
                print(f"wrote {len(records)} records to {args.out}")
                return 0

    records = parse_records(raw_path)
    if args.limit > 0:
        records = records[-args.limit :]
    write_csv(records, args.out)
    print(f"wrote {len(records)} records to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

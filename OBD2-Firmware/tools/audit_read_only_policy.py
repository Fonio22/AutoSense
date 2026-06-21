#!/usr/bin/env python3
import re
import sys
import json
from pathlib import Path
from typing import Optional


SAFE_OBD = {0x01, 0x02, 0x03, 0x06, 0x07, 0x09, 0x0A}
BLOCKED_OBD = {0x04, 0x08}
SAFE_UDS = {0x19, 0x22}
BLOCKED_UDS = {
    0x10,
    0x11,
    0x14,
    0x23,
    0x27,
    0x28,
    0x2A,
    0x2C,
    0x2E,
    0x2F,
    0x31,
    0x34,
    0x35,
    0x36,
    0x37,
    0x38,
    0x3D,
    0x3E,
    0x83,
    0x85,
    0x87,
}

ALLOWED_CAN_SEND_FILES = {
    "src/obd_service.cpp",
    "src/uds_vag_scanner.cpp",
    "src/obd_ble_protocol.cpp",
}


def rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def parse_hex(value: str) -> int:
    return int(value, 16)


def scan_send_request_frame(path: Path, root: Path, text: str) -> list[str]:
    errors = []
    pattern = re.compile(
        r"sendRequestFrame\(\s*[^,\n]+,\s*[^,\n]+,\s*[^,\n]+,\s*(0x[0-9A-Fa-f]+|\d+)\s*,",
    )
    for match in pattern.finditer(text):
        raw = match.group(1)
        service = int(raw, 0)
        if service in BLOCKED_OBD:
            errors.append(f"{rel(path, root)} sends blocked OBD service 0x{service:02X}")
        elif service not in SAFE_OBD:
            errors.append(f"{rel(path, root)} sends non-allowlisted OBD service 0x{service:02X}")
    return errors


def scan_uds_payload_assignments(path: Path, root: Path, text: str) -> list[str]:
    errors = []
    pattern = re.compile(r"payload\[0\]\s*=\s*(0x[0-9A-Fa-f]+|\d+)\s*;")
    for match in pattern.finditer(text):
        service = int(match.group(1), 0)
        if service in BLOCKED_UDS:
            errors.append(f"{rel(path, root)} assigns blocked UDS service 0x{service:02X}")
        elif service not in SAFE_UDS:
            errors.append(f"{rel(path, root)} assigns non-allowlisted UDS service 0x{service:02X}")
    return errors


def scan_can_send_locations(path: Path, root: Path, text: str) -> list[str]:
    errors = []
    if "CAN0.sendFrame" not in text:
        return errors

    relative = rel(path, root)
    if relative not in ALLOWED_CAN_SEND_FILES:
        errors.append(f"{relative} calls CAN0.sendFrame outside approved guarded senders")
    return errors


def scan_guard_policy(path: Path, root: Path, text: str) -> list[str]:
    errors = []
    standard_match = re.search(r"kSafeStandardObd\[\]\s*=\s*\{(?P<body>[^}]*)\}", text, re.MULTILINE)
    if standard_match:
        safe_standard = {int(value, 16) for value in re.findall(r"0x[0-9A-Fa-f]+", standard_match.group("body"))}
        for service in BLOCKED_OBD:
            if service in safe_standard:
                errors.append(f"{rel(path, root)} allowlists blocked OBD service 0x{service:02X}")

    uds_match = re.search(r"kSafeUds\[\]\s*=\s*\{(?P<body>[^}]*)\}", text, re.MULTILINE)
    if uds_match:
        safe_uds = {int(value, 16) for value in re.findall(r"0x[0-9A-Fa-f]+", uds_match.group("body"))}
        for service in BLOCKED_UDS:
            if service in safe_uds:
                errors.append(f"{rel(path, root)} allowlists blocked UDS service 0x{service:02X}")
    return errors


def parse_profile_service(value: object) -> Optional[int]:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return int(text, 16)
    except ValueError:
        return None


def scan_vehicle_profiles(root: Path) -> list[str]:
    errors: list[str] = []
    profiles_dir = root.parent / "vehicle-profiles"
    if not profiles_dir.exists():
        return errors

    for path in sorted(profiles_dir.glob("*.json")):
        if path.name == "metadata.json":
            continue

        try:
            profile = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            errors.append(f"{path.relative_to(root.parent)} invalid JSON: {exc}")
            continue

        for signal in profile.get("signals", []):
            mode = parse_profile_service(signal.get("mode"))
            if mode is None:
                errors.append(f"{path.relative_to(root.parent)} signal has invalid mode")
                continue
            if mode in BLOCKED_OBD:
                errors.append(f"{path.relative_to(root.parent)} uses blocked OBD mode 0x{mode:02X}")
            elif mode not in SAFE_OBD:
                errors.append(f"{path.relative_to(root.parent)} uses non-allowlisted OBD mode 0x{mode:02X}")

        extended = profile.get("extendedReadOnly") or {}
        for service_value in extended.get("udsServices", []):
            service = parse_profile_service(service_value)
            if service is None:
                errors.append(f"{path.relative_to(root.parent)} has invalid UDS service")
                continue
            if service in BLOCKED_UDS:
                errors.append(f"{path.relative_to(root.parent)} uses blocked UDS service 0x{service:02X}")
            elif service not in SAFE_UDS:
                errors.append(f"{path.relative_to(root.parent)} uses non-allowlisted UDS service 0x{service:02X}")

    return errors


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    src = root / "src"
    errors: list[str] = []

    for path in sorted(src.glob("*.[ch]pp")) + sorted(src.glob("*.h")):
        text = path.read_text(errors="replace")
        errors.extend(scan_send_request_frame(path, root, text))
        errors.extend(scan_uds_payload_assignments(path, root, text))
        errors.extend(scan_can_send_locations(path, root, text))
        errors.extend(scan_guard_policy(path, root, text))

    errors.extend(scan_vehicle_profiles(root))

    if errors:
        print("READ-ONLY POLICY AUDIT FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("READ-ONLY POLICY AUDIT OK")
    print("SAFE_OBD:", ", ".join(f"0x{x:02X}" for x in sorted(SAFE_OBD)))
    print("SAFE_UDS:", ", ".join(f"0x{x:02X}" for x in sorted(SAFE_UDS)))
    print("BLOCKED_OBD:", ", ".join(f"0x{x:02X}" for x in sorted(BLOCKED_OBD)))
    print("BLOCKED_UDS:", ", ".join(f"0x{x:02X}" for x in sorted(BLOCKED_UDS)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

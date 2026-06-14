#!/usr/bin/env python3

import argparse
import signal
import socket
import sys


def restore_terminal() -> None:
    try:
        sys.stdout.write("\x1b[0m\x1b[?25h\n")
        sys.stdout.flush()
    except Exception:
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the ESP32 UDP terminal dashboard to a local TTY.")
    parser.add_argument("--host", default="0.0.0.0", help="Local bind host. Use 0.0.0.0 to receive broadcast.")
    parser.add_argument("--port", type=int, default=3333, help="Local UDP port.")
    args = parser.parse_args()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((args.host, args.port))

    def handle_exit(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    sys.stdout.write(f"\x1b[2J\x1b[HListening on {args.host}:{args.port}...\n")
    sys.stdout.flush()

    try:
        while True:
            payload, _ = sock.recvfrom(8192)
            sys.stdout.buffer.write(payload)
            sys.stdout.flush()
    except KeyboardInterrupt:
        restore_terminal()
        return 0
    finally:
        sock.close()


if __name__ == "__main__":
    raise SystemExit(main())

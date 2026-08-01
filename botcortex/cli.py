"""BotCortex CLI — `botcortex "task"` (alias `bx`).

Dry-run is the default; real motion requires --execute AND an operator present.
The hardware path lands at milestone 3 — v0 is mock-first by design.
"""

import argparse
import sys

from botcortex import __version__, routines
from botcortex.robot import EStopTriggered, MockRobot


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="botcortex", description="Teach your robot new tasks by typing."
    )
    parser.add_argument("task", nargs="?", help='what to do, e.g. "wave right arm"')
    parser.add_argument("--mock", action="store_true", help="run against the in-memory mock robot")
    parser.add_argument(
        "--execute", action="store_true", help="allow real motion (not wired in v0)"
    )
    parser.add_argument("--version", action="store_true", help="print version and exit")
    args = parser.parse_args()

    if args.version:
        print(f"botcortex {__version__}")
        return
    if args.execute:
        sys.exit("--execute is not wired yet: real hardware lands at milestone 3.")
    if not args.task:
        parser.print_help()
        return
    if not args.mock:
        sys.exit('v0 supports --mock only. Try: botcortex --mock "wave right arm"')

    task = args.task.lower()
    if "wave" in task:
        arm = "left" if "left" in task else "right"
        robot = MockRobot()
        try:
            steps = routines.wave(robot, arm=arm)
        except EStopTriggered as e:
            sys.exit(f"E-STOP: {e}")
        print(
            f"[mock] waved the {arm} arm: {steps} interpolation steps at 20 Hz, "
            "velocity-capped, e-stop checked every step. Final pose: home."
        )
    else:
        print("[mock] I only know 'wave ...' until the authoring agent lands (milestone 2).")

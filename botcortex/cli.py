"""BotCortex CLI — `botcortex "task"` (alias `bx`).

Dry-run is the default; real motion requires --execute and an operator present.
"""

import sys

from botcortex import __version__


def main() -> None:
    args = sys.argv[1:]
    if "--version" in args:
        print(f"botcortex {__version__}")
        return
    print(
        f"botcortex {__version__} — scaffold only, nothing wired yet.\n"
        "Milestone 1 (primitives + mock robot) is next: see the runtime-architecture skill."
    )

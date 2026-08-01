"""Motion primitives — the only layer that ever touches actuators.

Every move is clamped inside vendor limits, interpolated at CONTROL_HZ with a
velocity cap, and checks the e-stop file between every step. No LLM anywhere in
this file: deterministic execution is the product's core claim.

MockRobot mirrors the full primitive interface so everything above it can be
developed and tested with no hardware. RealRobot (LeRobot-backed) lands at
milestone 3.
"""

import math
import time
from pathlib import Path

from botcortex import config


class EStopTriggered(RuntimeError):
    """The stop file appeared mid-motion; the move was aborted between steps."""


def clamp_target(arm: str, joint: str, value: float) -> float:
    lo, hi = config.JOINT_LIMITS[arm][joint]
    margin = 0.0 if joint == "gripper" else config.SAFETY_MARGIN_DEG
    return min(max(value, lo + margin), hi - margin)


class MockRobot:
    """In-memory twin of the bimanual OpenArm v1: same primitives, no hardware.

    realtime=False (default) skips the per-step sleep so tests run instantly;
    the interpolation math is identical either way.
    """

    def __init__(self, stop_file: Path | None = None, realtime: bool = False):
        self.stop_file = stop_file if stop_file is not None else config.STOP_FILE
        self.realtime = realtime
        self.positions = {arm: dict(config.HOME_POSITION) for arm in config.ARMS}
        self.torque = {arm: True for arm in config.ARMS}
        self.motion_log: list[tuple[str, str, dict[str, float]]] = []

    def get_positions(self, arm: str) -> dict[str, float]:
        return dict(self.positions[arm])

    def move_to(self, arm: str, targets: dict[str, float], duration: float | None = None) -> None:
        current = self.positions[arm]
        goal = {j: clamp_target(arm, j, v) for j, v in targets.items()}
        largest_delta = max((abs(goal[j] - current[j]) for j in goal), default=0.0)
        min_duration = largest_delta / config.MAX_VEL_DEG_S
        actual_duration = max(duration or 0.0, min_duration)
        steps = max(1, math.ceil(actual_duration * config.CONTROL_HZ))
        start = dict(current)
        for i in range(1, steps + 1):
            if self.stop_file.exists():
                raise EStopTriggered(f"stop file present: {self.stop_file}")
            fraction = i / steps
            for j, g in goal.items():
                current[j] = start[j] + (g - start[j]) * fraction
            self.motion_log.append(("step", arm, dict(current)))
            if self.realtime:
                time.sleep(1 / config.CONTROL_HZ)

    def gripper(self, arm: str, position: float) -> None:
        self.move_to(arm, {"gripper": position})

    def set_torque(self, arm: str, enabled: bool) -> None:
        self.torque[arm] = enabled
        self.motion_log.append(("torque", arm, {"enabled": float(enabled)}))

    def clear_errors(self) -> None:
        self.motion_log.append(("clear_errors", "both", {}))

    def replay_trajectory(self, arm: str, waypoints: list[dict[str, float]]) -> None:
        for waypoint in waypoints:
            self.move_to(arm, waypoint)

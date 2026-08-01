"""Hard limits, paths, and control constants.

Safety values here are bounds, not preferences — user config may tune WITHIN them,
never beyond (see the runtime-architecture blueprint).
"""

from pathlib import Path

CONTROL_HZ = 20
MAX_VEL_DEG_S = 30.0
SAFETY_MARGIN_DEG = 5.0
STOP_FILE = Path.home() / "openarm_agent_STOP"

# OpenArm v1 vendor joint limits in degrees, per arm. j2 mirrors between arms.
# The runtime clamps a further SAFETY_MARGIN_DEG inside these (gripper excepted —
# a margin there would prevent full open/close).
JOINT_LIMITS: dict[str, dict[str, tuple[float, float]]] = {
    "right": {
        "j1": (-75.0, 75.0),
        "j2": (-9.0, 90.0),
        "j3": (-85.0, 85.0),
        "j4": (0.0, 135.0),
        "j5": (-85.0, 85.0),
        "j6": (-40.0, 40.0),
        "j7": (-80.0, 80.0),
        "gripper": (-65.0, 0.0),
    },
    "left": {
        "j1": (-75.0, 75.0),
        "j2": (-90.0, 9.0),
        "j3": (-85.0, 85.0),
        "j4": (0.0, 135.0),
        "j5": (-85.0, 85.0),
        "j6": (-40.0, 40.0),
        "j7": (-80.0, 80.0),
        "gripper": (-65.0, 0.0),
    },
}

ARMS = tuple(JOINT_LIMITS)

# Home sits SAFETY_MARGIN_DEG off any joint whose vendor range starts/ends at 0
# (j4's range is 0..135, so home is 5.0 there — resting ON a hard stop is exactly
# what the margin exists to prevent).
HOME_POSITION: dict[str, float] = {joint: 0.0 for joint in JOINT_LIMITS["right"]}
HOME_POSITION["j4"] = SAFETY_MARGIN_DEG

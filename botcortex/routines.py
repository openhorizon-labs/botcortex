"""Built-in demo routines composed only of primitives.

These power the CLI smoke test until the authoring agent lands (milestone 2);
agent-authored skills will replace them as the source of behavior.
"""


def wave(robot, arm: str = "right", repeats: int = 3) -> int:
    """Raise the forearm and oscillate the wrist, then return home.

    Returns the number of interpolation steps executed.
    """
    from botcortex import config

    steps_before = len(robot.motion_log)
    robot.move_to(arm, {"j4": 60.0})
    for _ in range(repeats):
        robot.move_to(arm, {"j6": 25.0})
        robot.move_to(arm, {"j6": -25.0})
    robot.move_to(arm, {"j6": config.HOME_POSITION["j6"], "j4": config.HOME_POSITION["j4"]})
    return len(robot.motion_log) - steps_before

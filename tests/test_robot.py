from pathlib import Path

import pytest

from botcortex import config, routines
from botcortex.robot import EStopTriggered, MockRobot, clamp_target


def make_robot(tmp_path: Path) -> MockRobot:
    return MockRobot(stop_file=tmp_path / "STOP")


def test_clamp_stays_inside_vendor_limits_with_margin():
    assert clamp_target("right", "j1", 999.0) == 75.0 - config.SAFETY_MARGIN_DEG
    assert clamp_target("right", "j1", -999.0) == -75.0 + config.SAFETY_MARGIN_DEG


def test_left_right_j2_asymmetry():
    assert clamp_target("left", "j2", 50.0) == 9.0 - config.SAFETY_MARGIN_DEG
    assert clamp_target("right", "j2", 50.0) == 50.0


def test_gripper_has_no_margin():
    assert clamp_target("right", "gripper", 0.0) == 0.0
    assert clamp_target("right", "gripper", -100.0) == -65.0


def test_velocity_cap_forces_enough_steps(tmp_path):
    robot = make_robot(tmp_path)
    robot.move_to("right", {"j1": 60.0})
    # 60 degrees at <=30 deg/s -> >=2 s -> >=40 steps at 20 Hz
    assert len(robot.motion_log) >= 40
    assert robot.get_positions("right")["j1"] == pytest.approx(60.0)


def test_estop_aborts_before_any_step(tmp_path):
    robot = make_robot(tmp_path)
    robot.stop_file.touch()
    with pytest.raises(EStopTriggered):
        robot.move_to("right", {"j1": 30.0})
    assert robot.get_positions("right")["j1"] == pytest.approx(0.0)


def test_wave_returns_home(tmp_path):
    robot = make_robot(tmp_path)
    steps = routines.wave(robot, arm="right")
    assert steps > 0
    pose = robot.get_positions("right")
    assert pose["j4"] == pytest.approx(config.HOME_POSITION["j4"])
    assert pose["j6"] == pytest.approx(config.HOME_POSITION["j6"])

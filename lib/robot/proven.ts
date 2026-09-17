/**
 * Which skill has JUST been seen to work, given the unproven list before and
 * the robot's new report. Null when nothing crossed over.
 *
 * `before` is null until a hello has set the baseline: everything already
 * proven when a robot connects is old news, and offering to share forty
 * skills on connect would be noise. A skill that vanished (deleted) did not
 * succeed; one that was never unproven here did not just succeed either.
 */
export function newlyProven(before: string[] | null, skills: string[], unproven: string[]): string | null {
  if (!before) return null;
  return before.find((name) => skills.includes(name) && !unproven.includes(name)) ?? null;
}

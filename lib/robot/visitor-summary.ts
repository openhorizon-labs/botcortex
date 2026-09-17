/**
 * What a run did, for someone who has never seen BotCortex.
 *
 * The runtime's report is evidence: "The right arm swept j4 122°, j2 88° over
 * 600 control ticks. Moved: blue_block moved 20 cm and is now on table, at
 * [0.225, -0.225, 0.22]." An owner debugging a skill wants every part of that.
 * A visitor on a share link wants to know what happened to the block, and the
 * joint names and coordinates read as noise around it.
 *
 * This keeps the report's FACTS — which objects moved, how far, where they
 * ended up — and drops its instrumentation. It never adds a claim the report
 * did not make: a block that landed on the table is said to be on the table,
 * not "placed".
 */
const MOVE = /(\w+) moved (\d+) cm and is now (on [\w ]+?|off the workcell entirely), at \[/g;

const spoken = (name: string) => name.replace(/_/g, " ");

/** "tray_right" is how a scene file names things; "in the right tray" is how
 *  anyone would say it. Things with walls hold a block IN them. */
function place(fixture: string): string {
  const words = fixture.split(/[_ ]+/).filter(Boolean);
  const said = words.length === 2 && /^(left|right|small|large|big|front|back)$/.test(words[1])
    ? `${words[1]} ${words[0]}`
    : words.join(" ");
  return `${/tray|pocket|bin|slot|box|bowl/.test(said) ? "in" : "on"} the ${said}`;
}

function joined(parts: string[]): string {
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function visitorSummary(plain: string): { text: string; ok: boolean } {
  const moves = [...plain.matchAll(MOVE)].map(([, name, cm, landed]) => {
    const where = landed.startsWith("off") ? "fell off the workcell" : `ended up ${place(landed.replace(/^on /, ""))}`;
    return `the ${spoken(name)} moved ${cm} cm and ${where}`;
  });
  if (moves.length) {
    const text = joined(moves);
    return { text: `${text[0].toUpperCase()}${text.slice(1)}.`, ok: true };
  }
  if (/^It ran: /.test(plain) || /\bswept\b/.test(plain)) {
    return { text: "The arm ran the whole motion. Nothing on the table was touched.", ok: true };
  }
  // Refusals and failures are already written for a person; pass them through.
  return { text: plain, ok: !/^(It didn't run|It ran, but nothing moved|Stopped)/.test(plain) };
}

/**
 * A sentence an owner can act on, instead of a vendor stack trace.
 *
 * The mirror of `explain()` in the runtime's agent.py, and deliberately so:
 * these are the same failures reaching the same person through the same chat
 * window, and the answer should not depend on whether the physics happened to
 * be running on their machine or in their tab.
 *
 * Robot owners are not API consumers. "BadRequestError: Error code: 400 -
 * {'error': {'message': "Function tools with reasoning_effort are not
 * supported…" tells them nothing they can do anything about. The full text
 * still goes to the console, which is where someone debugging would look.
 */

export function explain(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const lower = text.toLowerCase();

  // Ours, from the credit proxy — already written for a human.
  if (text.includes("insufficient_credit") || text.includes("out of BotCortex credits")) {
    return (
      "Out of BotCortex credit, so it can't learn anything new right now. " +
      "Skills it already knows still run."
    );
  }
  if (text.includes("not available on BotCortex credits")) {
    return "That model isn't available on BotCortex credits. Pick another one.";
  }
  // The owner's OWN key (held by our api, which passes the provider's answer
  // through). These have to come before the 401 rule below: to our api a 401 is an expired session, to a
  // provider it is a bad key, and "sign in again" would send someone with a
  // typo in their key round the wrong loop.
  if (text.includes("invalid_api_key") || text.includes("Incorrect API key") || text.includes("authentication_error")) {
    return "Your model key was rejected by the provider. Check it in Settings, under Model key.";
  }
  if (text.includes("insufficient_quota") || lower.includes("credit balance is too low")) {
    return "Your provider account is out of quota, so it can't learn anything new. Top it up with them, or remove the key in Settings to use BotCortex credit.";
  }
  if (text.includes("model_not_found") || lower.includes("does not exist") || text.includes("not_found_error")) {
    return "Your key does not have access to that model. Pick another one in the composer.";
  }
  if (text.includes("unauthorized") || text.includes("401")) {
    return "Your session expired. Sign in again to keep teaching.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "Couldn't reach the model. Check your connection and try again.";
  }
  if (lower.includes("rate limit") || text.includes("429")) {
    return "The model is rate-limited right now. Wait a moment and try again.";
  }
  if (text.includes("invalid_request_error") || text.includes("400")) {
    return (
      "That model refused the request — it may not support the tools this " +
      "agent needs. Try a different model from the picker."
    );
  }
  if (text.includes("E-STOP") || text.includes("stop file present")) {
    return "Stopped: the e-stop is latched. Clear it to continue.";
  }
  // Everything above is a failure we recognise. This is the one we do not, and
  // two rules pull opposite ways: a vendor stack trace tells a robot owner
  // nothing, and neither does "check the console" — that is the same sentence
  // for every unrecognised failure, so two different faults read identically
  // and a person watching their task fail repeatedly cannot even say WHICH
  // failure it was. So the reason is shown when it reads like a sentence and
  // withheld when it is machine noise. Full detail goes to the console either
  // way. Mirrors `explain()` in the runtime's agent.py.
  const reason = readable(text);
  return reason
    ? `Teaching stopped: ${reason}`
    : "Teaching stopped for a reason the app does not recognise. " +
        "If it happens again, tell us what you were teaching.";
}

/** Braces and brackets mean a serialised vendor payload; a control character
 *  means it was never prose to begin with. */
const NOT_PROSE = /[{}[\]<>\u0000-\u001f]/;

/** The first line of an error IF an owner could act on it, else null. */
function readable(text: string): string | null {
  const first = text.split("\n").find((part) => part.trim()) ?? "";
  const line = first
    .replace(/^(Error|TypeError|RangeError|ReferenceError|ValueError):\s*/, "")
    .trim();
  if (!line || NOT_PROSE.test(line)) return null;
  // Words and letters, not a ratio: "no clear route to (0.45, -0.25, 0.2)" is
  // the most useful message this will ever pass on and it is half digits and
  // brackets, while "runtime crashed" is two words and worth saying. A hex
  // blob or a bare identifier clears neither bar.
  const words = line.match(/[A-Za-z]{2,}/g) ?? [];
  if (words.length < 2 || words.join("").length < 8) return null;
  return line.length > 180 ? `${line.slice(0, 177)}…` : line;
}

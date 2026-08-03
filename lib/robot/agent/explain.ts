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
  return "Teaching failed. The browser console has the details.";
}

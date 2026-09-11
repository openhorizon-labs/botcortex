/** Resolve only same-origin control-room paths after sign-in. */
export function signInDestination(raw: string | null): string {
  const origin = "https://botcortex.invalid";
  if (!raw?.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u0020]/.test(raw)) return "/app";
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || !(url.pathname === "/app" || url.pathname.startsWith("/app/"))) return "/app";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/app";
  }
}

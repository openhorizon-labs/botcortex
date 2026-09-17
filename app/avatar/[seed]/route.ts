/**
 * Generated avatars, served from here rather than hot-linked.
 *
 * The pictures come from DiceBear. Pointing an <img> straight at it would hand
 * every visitor's address to a third party on every skill page, and make every
 * profile depend on that service being up at that moment. So this fetches each
 * one once, caches it for a year, and visitors only ever talk to us.
 *
 * Not an open proxy: the seed is 16 hex characters the api generated, the
 * style is fixed, and nothing else in the URL comes from the request.
 */
const STYLE = "bottts-neutral";
const SEED = /^[0-9a-f]{16}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ seed: string }> }) {
  const { seed } = await params;
  if (!SEED.test(seed)) return new Response("not found", { status: 404 });
  try {
    const upstream = await fetch(`https://api.dicebear.com/9.x/${STYLE}/svg?seed=${seed}`, {
      next: { revalidate: 60 * 60 * 24 * 365 },
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) return new Response("avatar unavailable", { status: 502 });
    return new Response(await upstream.text(), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=31536000, immutable",
        // An SVG is a document. Shown in an <img> it cannot run anything; this
        // keeps that true if someone opens the URL directly.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("avatar unavailable", { status: 502 });
  }
}

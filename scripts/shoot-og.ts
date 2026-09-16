/**
 * Render an Open Graph card to public/og/.
 *
 * These were hand-made in a scratchpad, which is how og-signup.png went on
 * saying "Join the waitlist." months after the waitlist was gone: the page
 * copy is in the repo and reviewable, the card behind the link was not.
 *
 *   bun scripts/shoot-og.ts signup "Create an account." "Teach your robot by typing."
 *
 * The layout mirrors the site's own: hairline card on off-white, the mark and
 * wordmark top-left, headline bottom-left at display weight, a faint mark
 * watermark on the right, and the company line bottom-right.
 */
import { chromium } from "playwright-core";
import { MARK } from "../components/site/logo";

const [slug, headline, subtitle] = process.argv.slice(2);
if (!slug || !headline) {
  console.error('usage: bun scripts/shoot-og.ts <slug> "<headline>" ["<subtitle>"]');
  process.exit(1);
}

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const html = `<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #fbfbfa;
         font: 400 16px/1.2 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; }
  .card { position: absolute; inset: 28px; border: 1px solid #dedede; background: #fff; overflow: hidden; }
  .brand { position: absolute; top: 46px; left: 62px; display: flex; align-items: center; gap: 14px; }
  .brand svg { width: 34px; height: 34px; }
  .brand span { font-size: 27px; font-weight: 600; letter-spacing: -0.01em; }
  h1 { position: absolute; left: 62px; bottom: 156px; font-size: 76px; font-weight: 400;
       line-height: 1.04; letter-spacing: -0.02em; max-width: 680px; }
  .sub { position: absolute; left: 62px; bottom: 82px; font-size: 26px; color: #6b6b6b; }
  .by { position: absolute; right: 62px; bottom: 84px; font-size: 20px; color: #9a9a9a;
        font-family: ui-monospace, Menlo, monospace; }
  .mark { position: absolute; right: -52px; top: 108px; width: 360px; height: 360px; color: #f2f2f2; }
</style>
<div class="card">
  <div class="brand"><svg viewBox="0 0 200 200"><path d="${MARK}" fill="currentColor" fill-rule="evenodd"/></svg><span>BotCortex</span></div>
  <svg class="mark" viewBox="0 0 200 200"><path d="${MARK}" fill="currentColor" fill-rule="evenodd"/></svg>
  <h1>${escape(headline)}</h1>
  ${subtitle ? `<p class="sub">${escape(subtitle)}</p>` : ""}
  <div class="by">by OpenHorizon Labs</div>
</div>`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
const out = `public/og/og-${slug}.png`;
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);

import { chromium } from "playwright-core";

const OUT = process.argv[2] ?? "/tmp/sim.png";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=metal", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });

const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
page.on("requestfailed", (r) =>
  errors.push(`FAILED ${r.url().split("/").pop()} — ${r.failure()?.errorText}`),
);

const t0 = Date.now();
await page.goto("http://localhost:3000/simview-preview", {
  waitUntil: "domcontentloaded",
});

// Wait until every .glb has arrived and a frame has been drawn.
await page
  .waitForFunction(
    () => {
      const glbs = performance
        .getEntriesByType("resource")
        .filter((e) => e.name.endsWith(".glb"));
      return glbs.length >= 11;
    },
    { timeout: 45000 },
  )
  .catch(() => errors.push("TIMEOUT waiting for 11 glbs"));

await page.waitForTimeout(3000); // let materials/shadows settle

const stats = await page.evaluate(() => {
  const glbs = performance
    .getEntriesByType("resource")
    .filter((e) => e.name.endsWith(".glb"));
  const c = document.querySelector("canvas");
  return {
    glbCount: glbs.length,
    glbMB: +(glbs.reduce((s, e) => s + ((e as PerformanceResourceTiming).transferSize || 0), 0) / 1e6).toFixed(2),
    slowestGlbMs: Math.round(Math.max(...glbs.map((e) => e.duration), 0)),
    canvas: c ? [c.width, c.height] : null,
  };
});

console.log(JSON.stringify({ ...stats, loadMs: Date.now() - t0, errors }, null, 1));
await page.screenshot({ path: OUT });
await browser.close();

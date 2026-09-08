// Serve the built bundle and load it in headless Chrome.
//
// This exists because `npm run build` exiting 0 proved nothing. The clj-fuzzy
// bug compiled cleanly and white-screened every route: a Closure-compiled
// transitive dep read top-level `this`, which is undefined under strict ESM.
// A compile check cannot see that. Loading the page can.
//
// Fails if: the page errors, the console logs an error, or #root stays empty.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
// Playwright, to match frontend/e2e/pos.offline.e2e.js rather than pull in a
// second browser stack.
import { chromium } from "playwright";

const BUILD = resolve(process.cwd(), "build");
const PORT = 8123;

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webp": "image/webp", ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = join(BUILD, url === "/" ? "index.html" : url);
  // SPA fallback
  if (!existsSync(file) || url === "/") file = join(BUILD, "index.html");
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => {
  // Ignore benign favicon misses; anything else is a real failure.
  if (!/favicon/.test(r.url())) problems.push(`request failed: ${r.url()}`);
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle", timeout: 45000 });

const mounted = await page.evaluate(() => {
  const root = document.getElementById("root");
  return Boolean(root && root.children.length > 0);
});

await browser.close();
server.close();

if (!mounted) problems.push("#root is empty — React never mounted");

if (problems.length) {
  console.error("Smoke load FAILED:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("Smoke load passed: bundle served, React mounted, no console or page errors.");

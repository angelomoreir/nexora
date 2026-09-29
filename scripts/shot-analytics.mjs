import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:5173";
const OUT = "docs/manual/shots-audit";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", `--user-data-dir=${process.env.TEMP}\\nx-analytics-shot`]
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

// login
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 1500));
await page.type('input[type="email"], input[name="email"]', "ana@xpto.pt");
await page.type('input[type="password"], input[name="password"]', "XPTOdemo2024!");
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}),
  page.click('button[type="submit"]')
]);
await new Promise((r) => setTimeout(r, 2500));

for (const [name, width, height] of [["analytics-desktop", 1440, 900], ["analytics-tablet", 768, 1024], ["analytics-mobile", 360, 800]]) {
  await page.setViewport({ width, height });
  await page.goto(`${BASE}/analytics`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(`${name}: overflow=${overflow}`);
}
console.log("JS errors:", errors.length ? errors : "none");
await browser.close();

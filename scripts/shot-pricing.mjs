import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));

await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto("http://localhost:5173/pricing", { waitUntil: "networkidle0" });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => localStorage.setItem("i18nextLng", "pt-PT"));
await page.reload({ waitUntil: "networkidle0" });
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: "docs/manual/shots/pricing-desktop-top.png" });

// toggle annual
const annualBtn = await page.$$eval("button", bs => { const b = bs.find(x => /Anual/i.test(x.textContent)); if (b) { b.click(); return true; } return false; });
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: "docs/manual/shots/pricing-desktop-annual.png" });
console.log("annual toggled:", annualBtn);

// full page + comparison section
await page.evaluate(() => document.querySelector("table")?.scrollIntoView({ block: "start" }));
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: "docs/manual/shots/pricing-desktop-compare.png" });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: "docs/manual/shots/pricing-desktop-bottom.png" });

// mobile (Galaxy A14-ish: 360x800)
await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173/pricing", { waitUntil: "networkidle0" });
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: "docs/manual/shots/pricing-mobile-top.png" });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: "docs/manual/shots/pricing-mobile-mid.png" });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log("horizontal overflow mobile:", overflow);

console.log("console errors:", errors.length ? errors : "none");
await browser.close();

// Renders one or all docs/NEXORA-guia-*.html files to PDF.
// Usage: node scripts/render-guide-pdf.mjs [name]   (e.g. "testes" renders NEXORA-guia-testes.html; no arg = all)
import puppeteer from "puppeteer-core";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const docsDir = fileURLToPath(new URL("../docs/", import.meta.url));
const filter = process.argv[2];

const files = readdirSync(docsDir)
  .filter((f) => f.startsWith("NEXORA-guia-") && f.endsWith(".html"))
  .filter((f) => !filter || f === `NEXORA-guia-${filter}.html`);

if (files.length === 0) {
  console.error("Nenhum guia encontrado.");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true
});
const page = await browser.newPage();

for (const file of files) {
  const htmlPath = `${docsDir}${file}`;
  const pdfPath = htmlPath.replace(/\.html$/, ".pdf");
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } });
  console.log("PDF gerado:", pdfPath);
}

await browser.close();

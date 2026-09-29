// Renders docs/NEXORA-apresentacao.html to NEXORA-apresentacao.pdf via headless Edge.
// Usage: node scripts/render-apresentacao.mjs
import puppeteer from "puppeteer-core";
import { fileURLToPath, pathToFileURL } from "node:url";

const docsDir = fileURLToPath(new URL("../docs/", import.meta.url));
const htmlPath = `${docsDir}NEXORA-apresentacao.html`;
const pdfPath = htmlPath.replace(/\.html$/, ".pdf");

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true
});
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:7px;width:100%;text-align:right;color:#94a3b8;padding-right:15mm">NEXORA · Apresentação do Produto</div>`,
  footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  margin: { top: "16mm", bottom: "16mm", left: "15mm", right: "15mm" }
});
await browser.close();
console.log("PDF gerado:", pdfPath);

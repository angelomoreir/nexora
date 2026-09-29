// Captures one screenshot per manual chapter into docs/shots/<slug>.png.
// Logs in as the demo admin (sees every sidebar option) and visits each route.
// Usage: node scripts/capture-shots.mjs   (requires web :5173 and api :3000 up)
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5173";
const EMAIL = "ana@xpto.pt";
const PASSWORD = "XPTOdemo2024!";
const shotsDir = fileURLToPath(new URL("../docs/shots/", import.meta.url));
mkdirSync(shotsDir, { recursive: true });

// slug → app route (null = captured before login)
const SHOTS = [
  ["introducao", "/login"],
  ["meu-dia", "/my-day"],
  ["dashboard", "/dashboard"],
  ["pesquisa", "/search"],
  ["notificacoes", "/notifications"],
  ["documentos", "/documents"],
  ["listas", "/lists"],
  ["formularios", "/forms"],
  ["sites", "/sites"],
  ["noticias", "/news"],
  ["tarefas", "/tasks"],
  ["aprovacoes", "/approvals"],
  ["processos", "/workflows"],
  ["ia", "/ai"],
  ["analise", "/analytics"],
  ["administracao", "/admin"],
  ["planos", "/billing"],
  ["configuracoes", "/settings"],
  ["perfil", "/profile"],
  ["ajuda", "/help"],
  ["caso-xpto", "/admin/users"]
];

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.4 });

// 1) login page shot (before authenticating)
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.screenshot({ path: `${shotsDir}introducao.png` });
console.log("shot: introducao");

// 2) login
await page.type("#email", EMAIL);
await page.type("#password", PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => null),
  page.click("button[type=submit]")
]);
await new Promise((r) => setTimeout(r, 1200));

// 3) one shot per module
for (const [slug, route] of SHOTS) {
  if (slug === "introducao") continue;
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0", timeout: 30000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${shotsDir}${slug}.png` });
  console.log("shot:", slug);
}

await browser.close();
console.log("Concluído —", shotsDir);

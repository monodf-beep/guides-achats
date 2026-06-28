#!/usr/bin/env node
/**
 * Générateur de guides d'achat Cultura Sabauda.
 *
 * Usage :
 *   node src/generate.mjs data/guides/mon-guide.json
 *   node src/generate.mjs data/guides/mon-guide.json --out output
 *   node src/generate.mjs --all                 # génère tous les guides de data/guides/
 *
 * Sorties (dans output/) : <slug>.md (publiable dans WordPress) et <slug>.html (aperçu autonome).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGuide } from "./lib/schema.mjs";
import { renderMarkdown } from "./lib/render-markdown.mjs";
import { renderHtml } from "./lib/render-html.mjs";
import { resolveConfig } from "./lib/affiliate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadConfig() {
  const path = join(ROOT, "config", "affiliation.json");
  const fileConfig = JSON.parse(readFileSync(path, "utf8"));
  loadDotEnv(join(ROOT, ".env"));
  return resolveConfig(fileConfig);
}

// Mini-parseur .env (pas de dépendance dotenv)
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function generateOne(file, outDir, config) {
  const guide = JSON.parse(readFileSync(file, "utf8"));
  validateGuide(guide);
  const md = renderMarkdown(guide, config);
  const html = renderHtml(guide, config);
  mkdirSync(outDir, { recursive: true });
  const mdPath = join(outDir, `${guide.slug}.md`);
  const htmlPath = join(outDir, `${guide.slug}.html`);
  writeFileSync(mdPath, md);
  writeFileSync(htmlPath, html);
  console.log(`✅ ${guide.slug} → ${mdPath} + ${htmlPath} (${guide.products.length} produits)`);
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outDir = outIdx !== -1 ? resolve(args[outIdx + 1]) : join(ROOT, "output");
  const config = loadConfig();

  if (args.includes("--all")) {
    const dir = join(ROOT, "data", "guides");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (!files.length) return console.log("Aucun guide dans data/guides/");
    files.forEach((f) => generateOne(join(dir, f), outDir, config));
    return;
  }

  const file = args.find((a) => a.endsWith(".json"));
  if (!file) {
    console.error("Usage : node src/generate.mjs <guide.json> [--out <dir>] | --all");
    process.exit(1);
  }
  generateOne(resolve(file), outDir, config);
}

main();

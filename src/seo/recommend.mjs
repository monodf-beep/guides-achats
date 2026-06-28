#!/usr/bin/env node
/**
 * Recommandation de guides — v1 « règle-à-règle » (sans données personnelles sensibles).
 *
 * Classe les guides existants (data/guides/*.json) selon l'affinité avec les centres
 * d'intérêt déclarés d'un visiteur. Sert de base à la personnalisation (« pousser les bons
 * articles »). Évolutif vers un scoring comportemental — voir docs/08-seo-et-personnalisation.md.
 *
 * Usage :
 *   node src/seo/recommend.mjs --interests "Livres & lecture, Photo et Vidéo"
 *   node src/seo/recommend.mjs --interests "Maison" --limit 3
 *
 * Conçu pour être importé côté serveur (fonction rankGuides) lors de l'intégration WordPress.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const norm = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Score d'affinité d'un guide pour une liste d'intérêts.
 * +3 si la catégorie correspond, +1 par mot-clé d'intérêt présent dans le titre.
 */
export function scoreGuide(guide, interests) {
  const cat = norm(guide.category);
  let score = 0;
  for (const interest of interests) {
    const it = norm(interest);
    if (!it) continue;
    if (cat === it || cat.includes(it) || it.includes(cat)) score += 3;
    if (norm(guide.title).includes(it)) score += 1;
  }
  return score;
}

/**
 * Classe les guides par score décroissant. Les guides à score 0 sont écartés,
 * sauf si aucun ne correspond (on renvoie alors les plus récents en repli).
 */
export function rankGuides(guides, interests, limit = 5) {
  const scored = guides
    .map((g) => ({ guide: g, score: scoreGuide(g, interests) }))
    .sort((a, b) => b.score - a.score);
  const matching = scored.filter((s) => s.score > 0);
  const result = (matching.length ? matching : scored).slice(0, limit);
  return result.map((s) => ({ slug: s.guide.slug, title: s.guide.title, category: s.guide.category, score: s.score }));
}

function loadGuides() {
  const dir = join(ROOT, "data", "guides");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

function main() {
  const argv = process.argv.slice(2);
  let interests = [];
  let limit = 5;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--interests") interests = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === "--limit") limit = parseInt(argv[++i], 10) || 5;
  }
  if (!interests.length) {
    console.error('Usage : node src/seo/recommend.mjs --interests "Catégorie1, Catégorie2" [--limit 5]');
    process.exit(1);
  }
  const ranked = rankGuides(loadGuides(), interests, limit);
  console.log(`\n🎯 Guides recommandés pour : ${interests.join(", ")}\n`);
  ranked.forEach((r, i) => console.log(`  ${i + 1}. [${r.score} pts] ${r.title}  (${r.category}) → /guides-achat/${r.slug}`));
  console.log("");
}

if (process.argv[1] && process.argv[1].endsWith("recommend.mjs")) main();

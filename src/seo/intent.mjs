#!/usr/bin/env node
/**
 * Module SEO — Intentions d'achat.
 *
 * À partir d'un mot-clé « graine » (ex. "liseuse"), génère :
 *   - une matrice de requêtes à intention d'achat (transactionnel, prix, décision, usage)
 *   - des suggestions de titres de guides
 *   - un brief SEO Markdown prêt à guider la rédaction
 *
 * 100 % hors-ligne, sans dépendance (les modificateurs sont des gabarits FR).
 * Peut ensuite être enrichi avec des volumes réels (Search Console, Keyword Planner).
 *
 * Usage :
 *   node src/seo/intent.mjs "liseuse"
 *   node src/seo/intent.mjs "liseuse" --category "Livres & lecture" --year 2026
 *   node src/seo/intent.mjs "liseuse" --brief        # écrit un brief dans output/briefs/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

// Modificateurs d'intention (français), pondérés par valeur commerciale.
const INTENTS = {
  transactionnel: {
    weight: 5,
    label: "Transactionnel (intention d'achat forte)",
    patterns: ["meilleur {kw}", "meilleure {kw}", "meilleurs {kw}", "meilleures {kw}", "comparatif {kw}", "test {kw}", "avis {kw}"],
  },
  prix: {
    weight: 4,
    label: "Prix / bonnes affaires",
    patterns: ["{kw} pas cher", "{kw} rapport qualité prix", "meilleure {kw} pas cher", "{kw} promo", "{kw} à moins de 100 euros"],
  },
  decision: {
    weight: 4,
    label: "Aide à la décision",
    patterns: ["quel {kw} choisir", "quelle {kw} choisir", "comment choisir {kw}", "{kw} ou alternative", "{kw} vaut le coup"],
  },
  annee: {
    weight: 3,
    label: "Fraîcheur (année)",
    patterns: ["meilleure {kw} {year}", "meilleur {kw} {year}", "{kw} {year}"],
  },
  usage: {
    weight: 2,
    label: "Usage / profil",
    patterns: ["{kw} pour débuter", "{kw} pour cadeau", "{kw} pour la randonnée", "meilleure {kw} professionnelle"],
  },
};

function parseArgs(argv) {
  const args = { _: [], brief: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--brief") args.brief = true;
    else if (a === "--category") args.category = argv[++i];
    else if (a === "--year") args.year = argv[++i];
    else args._.push(a);
  }
  return args;
}

export function buildIntentMatrix(seed, { year = new Date().getFullYear?.() || 2026 } = {}) {
  // NB : new Date() est indisponible dans certains contextes ; year est passé explicitement par le CLI.
  const matrix = {};
  for (const [key, cfg] of Object.entries(INTENTS)) {
    matrix[key] = {
      label: cfg.label,
      weight: cfg.weight,
      queries: cfg.patterns.map((p) => p.replace(/\{kw\}/g, seed).replace(/\{year\}/g, year)),
    };
  }
  return matrix;
}

export function suggestTitles(seed, year) {
  const s = seed.charAt(0).toUpperCase() + seed.slice(1);
  return [
    `Les meilleur·e·s ${seed} en ${year}`,
    `Quel·le ${seed} choisir ? Notre comparatif ${year}`,
    `${s} : le rapport qualité-prix qui vaut vraiment le coup`,
  ];
}

function renderBrief(seed, year, category, matrix, titles) {
  const L = [];
  L.push(`# Brief SEO — « ${seed} »`);
  L.push("");
  L.push(`- **Catégorie** : ${category || "à définir"}`);
  L.push(`- **Année cible** : ${year}`);
  L.push(`- **Mot-clé principal suggéré** : meilleure ${seed} ${year}`);
  L.push("");
  L.push("## Requêtes à couvrir (par intention)");
  L.push("");
  for (const block of Object.values(matrix)) {
    L.push(`### ${block.label} — priorité ${block.weight}/5`);
    block.queries.forEach((q) => L.push(`- ${q}`));
    L.push("");
  }
  L.push("## Titres candidats");
  titles.forEach((t) => L.push(`- ${t}`));
  L.push("");
  L.push("## Plan de contenu recommandé");
  L.push("");
  [
    "Chapô répondant à l'intention dès la 1re phrase (inclure le mot-clé principal)",
    "Sélection en un coup d'œil (Meilleur global / Rapport qualité-prix / Premium)",
    "Comparatif détaillé (forts/faibles, CTA « Acheter sur … »)",
    "Comment choisir (critères) — capte les requêtes « décision »",
    "FAQ — capte les questions longue traîne (données structurées)",
    "Maillage interne (relatedGuides) vers 2-3 guides du même cluster",
  ].forEach((x) => L.push(`- ${x}`));
  L.push("");
  L.push("> Étape suivante : valider ces requêtes avec des volumes réels (Google Search Console,");
  L.push("> Keyword Planner, Google Suggest) et prioriser la longue traîne peu concurrentielle.");
  L.push("");
  return L.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = args._[0];
  const year = args.year || "2026";
  if (!seed) {
    console.error('Usage : node src/seo/intent.mjs "<mot-clé>" [--category "..."] [--year 2026] [--brief]');
    process.exit(1);
  }
  const matrix = buildIntentMatrix(seed, { year });
  const titles = suggestTitles(seed, year);

  console.log(`\n🔎 Intentions d'achat pour « ${seed} » (année ${year})\n`);
  for (const block of Object.values(matrix)) {
    console.log(`▶ ${block.label} [priorité ${block.weight}/5]`);
    block.queries.forEach((q) => console.log(`    • ${q}`));
  }
  console.log(`\n📝 Titres candidats :`);
  titles.forEach((t) => console.log(`    • ${t}`));

  if (args.brief) {
    const dir = join(ROOT, "output", "briefs");
    mkdirSync(dir, { recursive: true });
    const slug = seed.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
    const path = join(dir, `brief-${slug}.md`);
    writeFileSync(path, renderBrief(seed, year, args.category, matrix, titles));
    console.log(`\n✅ Brief écrit : ${path}`);
  }
  console.log("");
}

// Exécution directe uniquement (permet d'importer les fonctions sans déclencher le CLI)
if (process.argv[1] && process.argv[1].endsWith("intent.mjs")) main();

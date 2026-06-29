#!/usr/bin/env node
/**
 * Recherche SEO assistée par Claude AVEC recherche web (outil web_search).
 * Claude va chercher en ligne les vraies intentions d'achat autour d'un mot-clé,
 * puis renvoie des titres de guide, des requêtes par intention, et des idées de produits.
 *
 * Nécessite ANTHROPIC_API_KEY dans l'environnement + npm i @anthropic-ai/sdk.
 *
 * Usage CLI : node src/ai/seo-research.mjs "ballon de foot"
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function buildPrompt(keyword, year) {
  return `Tu es expert SEO pour Cultura Sabauda (guides d'achat affiliés, audience française).
Recherche sur le web les intentions d'achat réelles autour de : « ${keyword} ».

Utilise la recherche web pour identifier ce que les gens tapent réellement sur Google
(suggestions, "autres questions posées", comparatifs concurrents, tendances ${year}).

Puis réponds EXCLUSIVEMENT par un objet JSON valide (aucun texte avant/après), de la forme :
{
  "titles": ["3 titres de guide accrocheurs et optimisés SEO, en français, incluant ${year}"],
  "keywords": [
    {"label": "Transactionnel (intention d'achat forte)", "queries": ["...", "..."]},
    {"label": "Aide à la décision", "queries": ["...", "..."]},
    {"label": "Prix / bonnes affaires", "queries": ["...", "..."]},
    {"label": "Questions fréquentes (longue traîne)", "queries": ["...", "..."]}
  ],
  "products": [
    {"name": "Nom de produit concret et réel", "brand": "Marque", "why": "pourquoi il revient souvent"}
  ],
  "angle": "1-2 phrases : l'angle éditorial le plus prometteur et peu concurrentiel"
}
Donne 4-8 requêtes par catégorie et 3-6 idées de produits réels. Reste factuel.`;
}

function extractJson(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("Réponse IA sans JSON exploitable.");
  return JSON.parse(text.slice(a, b + 1));
}

export async function researchSeo(keyword, { year = "2026" } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Clé API Claude manquante (Réglages ou .env).");
  let Anthropic;
  try { ({ default: Anthropic } = await import("@anthropic-ai/sdk")); }
  catch { throw new Error("SDK Claude manquant sur le serveur : npm i @anthropic-ai/sdk"); }

  const client = new Anthropic();
  const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }];
  let messages = [{ role: "user", content: buildPrompt(keyword, year) }];
  let response;
  // Boucle pour les outils serveur : on relance tant que le modèle est en pause_turn.
  for (let i = 0; i < 6; i++) {
    response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      tools,
      messages,
    });
    if (response.stop_reason === "refusal") throw new Error("Requête refusée par le modèle.");
    if (response.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: response.content }];
  }
  const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Réponse vide du modèle.");
  return extractJson(text);
}

async function main() {
  loadDotEnv(join(ROOT, ".env"));
  const kw = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!kw) { console.error('Usage : node src/ai/seo-research.mjs "<mot-clé>"'); process.exit(1); }
  console.log(`🔎 Recherche SEO web pour « ${kw} »…`);
  const r = await researchSeo(kw);
  console.log(JSON.stringify(r, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("seo-research.mjs")) {
  main().catch((e) => { console.error("❌", e.message); process.exit(1); });
}

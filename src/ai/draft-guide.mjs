#!/usr/bin/env node
/**
 * Rédaction assistée par Claude d'un guide d'achat.
 *
 * PRINCIPE DE CONFORMITÉ (important) :
 *   - Claude rédige UNIQUEMENT l'éditorial (intro, méthodo, critères, points forts/faibles,
 *     distinctions, FAQ, sections de confiance…).
 *   - Claude ne génère JAMAIS les ASIN, URL marchandes ni les prix : ceux-ci sont fournis et
 *     vérifiés par un humain dans le fichier d'entrée. Cela évite les liens/prix hallucinés
 *     (règle Amazon Partenaires + obligation de sincérité, cf. docs/02-conformite-legale.md).
 *   - La sortie est un BROUILLON (<slug>.draft.json) à relire et valider avant publication.
 *
 * Entrée : un squelette de guide JSON contenant au minimum slug, title, category et la liste
 * `products` (id, name, brand, price, affiliate{program, asin/url}). Voir data/guides/_modele.json.
 *
 * Dépendance (séparée du cœur de l'outil) : npm i @anthropic-ai/sdk
 * Clé API : variable d'environnement ANTHROPIC_API_KEY (ou .env).
 *
 * Usage :
 *   node src/ai/draft-guide.mjs data/guides/_modele.json
 *   node src/ai/draft-guide.mjs mon-squelette.json --out data/guides/mon-guide.draft.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
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

// Schéma des CHAMPS ÉDITORIAUX que Claude doit produire (sorties structurées).
// Volontairement limité : pas d'asin, pas d'url, pas de prix — ces données restent humaines.
const EDITORIAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intro: { type: "string" },
    methodology: { type: "string" },
    criteria: { type: "array", items: { type: "string" } },
    buyingGuide: { type: "string" },
    audience: { type: "string" },
    trust: { type: "string" },
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          badge: { type: "string" },
          productRef: { type: "string" },
        },
        required: ["badge", "productRef"],
      },
    },
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          summary: { type: "string" },
          pros: { type: "array", items: { type: "string" } },
          cons: { type: "array", items: { type: "string" } },
        },
        required: ["id", "summary", "pros", "cons"],
      },
    },
    faq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { q: { type: "string" }, a: { type: "string" } },
        required: ["q", "a"],
      },
    },
    relatedGuides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
      },
    },
  },
  required: ["intro", "methodology", "criteria", "buyingGuide", "picks", "products", "faq"],
};

function buildPrompt(skeleton) {
  const productList = skeleton.products
    .map((p) => `- id="${p.id}" | ${p.name}${p.brand ? " (" + p.brand + ")" : ""}${p.price ? " — prix indicatif " + p.price : ""}`)
    .join("\n");
  return `Tu es journaliste pour Cultura Sabauda et tu rédiges un guide d'achat indépendant
en français, dans l'esprit des Guides d'achat du Monde / Wirecutter : utile, honnête, précis.

Sujet du guide : « ${skeleton.title} » (catégorie : ${skeleton.category}).

Produits à comparer (NE PAS inventer d'autres produits, NE PAS inventer de prix ni de référence) :
${productList}

Rédige les champs éditoriaux suivants :
- intro : chapô de 2-3 phrases répondant à l'intention d'achat dès la 1re phrase.
- methodology : comment la sélection a été faite (transparente, indépendante).
- criteria : 4 à 6 critères d'évaluation concrets.
- buyingGuide : un paragraphe « comment bien choisir ».
- audience : « à qui s'adresse ce guide ».
- trust : « pourquoi nous faire confiance » (indépendance éditoriale, pas de rémunération des marques).
- picks : attribue une distinction à 2-4 produits via leur id exact (ex. « Meilleur choix global »,
  « Meilleur rapport qualité-prix », « Premium »). productRef DOIT correspondre à un id ci-dessus.
- products : pour CHAQUE id ci-dessus, un summary (3-4 phrases), 2-4 pros, 1-3 cons honnêtes.
- faq : 3 questions fréquentes réelles avec réponses utiles.
- relatedGuides : 2 suggestions de guides liés (title + url en /guides-achat/slug-suggere).

Contraintes :
- Reste factuel et nuancé : chaque produit a des points faibles. Pas de superlatifs creux.
- N'invente aucune donnée chiffrée (prix, notes) : ces informations sont gérées séparément.
- Écris en français soigné, ton Cultura Sabauda (culturel, sérieux, accessible).`;
}

/**
 * Rédige l'éditorial d'un guide avec Claude et le fusionne sur le squelette.
 * Réutilisable par le tableau de bord. Nécessite ANTHROPIC_API_KEY dans l'environnement
 * et le SDK @anthropic-ai/sdk installé.
 * @param skeleton guide JSON avec au moins products[] (id, name, affiliate…)
 * @returns le guide complet (brouillon, _draft:true) prêt à relire
 */
export async function draftGuideEditorial(skeleton) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Clé API Claude manquante (Réglages ou .env).");
  if (!Array.isArray(skeleton.products) || !skeleton.products.length) {
    throw new Error("Le guide doit contenir au moins un produit (nom + lien).");
  }
  let Anthropic;
  try { ({ default: Anthropic } = await import("@anthropic-ai/sdk")); }
  catch { throw new Error("SDK Claude manquant sur le serveur : npm i @anthropic-ai/sdk"); }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: EDITORIAL_SCHEMA } },
    messages: [{ role: "user", content: buildPrompt(skeleton) }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Requête refusée par le modèle : " + (response.stop_details?.explanation || "sans détail"));
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Réponse vide du modèle.");
  const editorial = JSON.parse(textBlock.text);

  // Fusion : éditorial greffé sur le squelette, données humaines (asin/url/price) intactes.
  const byId = Object.fromEntries((editorial.products || []).map((p) => [p.id, p]));
  return {
    ...skeleton,
    intro: editorial.intro,
    methodology: editorial.methodology,
    criteria: editorial.criteria,
    buyingGuide: editorial.buyingGuide,
    audience: editorial.audience,
    trust: editorial.trust,
    picks: editorial.picks,
    faq: editorial.faq,
    relatedGuides: editorial.relatedGuides,
    products: skeleton.products.map((p) => ({
      ...p,
      summary: byId[p.id]?.summary ?? p.summary,
      pros: byId[p.id]?.pros ?? p.pros,
      cons: byId[p.id]?.cons ?? p.cons,
    })),
    _draft: true,
  };
}

async function main() {
  loadDotEnv(join(ROOT, ".env"));
  const argv = process.argv.slice(2);
  const file = argv.find((a) => a.endsWith(".json"));
  const outIdx = argv.indexOf("--out");
  if (!file) {
    console.error("Usage : node src/ai/draft-guide.mjs <squelette.json> [--out <sortie.draft.json>]");
    process.exit(1);
  }
  const skeleton = JSON.parse(readFileSync(resolve(file), "utf8"));
  console.log(`✍️  Rédaction du guide « ${skeleton.title} » avec Claude…`);
  const merged = await draftGuideEditorial(skeleton);
  const outPath = outIdx !== -1 ? resolve(argv[outIdx + 1]) : resolve(file).replace(/\.json$/, ".draft.json");
  writeFileSync(outPath, JSON.stringify(merged, null, 2));
  console.log(`✅ Brouillon écrit : ${outPath}\n   ⚠️  À RELIRE avant publication (docs/02 et docs/03).`);
}

if (process.argv[1] && process.argv[1].endsWith("draft-guide.mjs")) {
  main().catch((e) => { console.error("❌", e.message); process.exit(1); });
}

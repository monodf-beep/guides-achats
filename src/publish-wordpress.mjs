#!/usr/bin/env node
/**
 * Publication d'un guide sur WordPress via l'API REST.
 *
 * Crée (ou met à jour) un article à partir d'un guide JSON : titre, slug, contenu HTML,
 * catégorie « Guides d'achat », extrait/méta-description. Statut « draft » par défaut
 * (relecture humaine avant mise en ligne — voir conformité 02).
 *
 * Authentification : mot de passe d'application WordPress (Réglages → Utilisateurs →
 * Mot de passe d'application). Variables d'environnement (.env) :
 *   WP_BASE_URL=https://www.culturasabauda.eu
 *   WP_USER=mon_login
 *   WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
 *
 * Utilisable en CLI ou importé (publishGuideToWordPress) par le tableau de bord.
 *
 * Usage CLI :
 *   node src/publish-wordpress.mjs data/guides/mon-guide.json            # crée un brouillon
 *   node src/publish-wordpress.mjs data/guides/mon-guide.json --publish  # publie directement
 *   node src/publish-wordpress.mjs data/guides/mon-guide.json --dry-run  # affiche le payload, n'envoie rien
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGuide } from "./lib/schema.mjs";
import { renderHtml } from "./lib/render-html.mjs";
import { resolveConfig } from "./lib/affiliate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CATEGORY_NAME = "Guides d'achat";

export function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function wpEnv() {
  loadDotEnv(join(ROOT, ".env"));
  return { base: process.env.WP_BASE_URL, user: process.env.WP_USER, pass: process.env.WP_APP_PASSWORD };
}

export function wpConfigured(env = wpEnv()) {
  return !!env.base && !!env.user && !!env.pass;
}

function authHeader(user, pass) {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

// Extrait le corps <main>…</main> pour l'injecter dans WordPress (le thème fournit <html>/<head>).
function extractBody(html) {
  const m = html.match(/<main>([\s\S]*?)<\/main>/);
  return m ? m[1].trim() : html;
}

async function wpFetch(path, env, options = {}) {
  const res = await fetch(`${env.base.replace(/\/$/, "")}/wp-json/wp/v2${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(env.user, env.pass),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`WP ${res.status} ${path} : ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

async function ensureCategory(env) {
  const found = await wpFetch(`/categories?search=${encodeURIComponent(CATEGORY_NAME)}`, env);
  const exact = Array.isArray(found) && found.find((c) => c.name === CATEGORY_NAME);
  if (exact) return exact.id;
  const created = await wpFetch(`/categories`, env, { method: "POST", body: JSON.stringify({ name: CATEGORY_NAME }) });
  return created.id;
}

async function findPostBySlug(slug, env) {
  const found = await wpFetch(`/posts?slug=${encodeURIComponent(slug)}&status=any`, env);
  return Array.isArray(found) && found.length ? found[0] : null;
}

export function buildPayload(guide, config, categoryId, publish) {
  return {
    title: guide.title,
    slug: guide.slug,
    status: publish ? "publish" : "draft",
    content: extractBody(renderHtml(guide, config)),
    excerpt: String(guide.intro || "").slice(0, 155),
    categories: categoryId ? [categoryId] : [],
  };
}

/**
 * Publie (ou met à jour) un guide sur WordPress. Retourne { created, status, id, link }.
 * @param guide  objet guide déjà validé
 * @param config config d'affiliation résolue (pour le rendu des liens)
 * @param opts   { publish?: boolean, env?: {base,user,pass} }
 */
export async function publishGuideToWordPress(guide, config, { publish = false, env = wpEnv() } = {}) {
  if (!wpConfigured(env)) throw new Error("WordPress non configuré (WP_BASE_URL, WP_USER, WP_APP_PASSWORD).");
  const categoryId = await ensureCategory(env);
  const payload = buildPayload(guide, config, categoryId, publish);
  const existing = await findPostBySlug(guide.slug, env);
  const result = existing
    ? await wpFetch(`/posts/${existing.id}`, env, { method: "POST", body: JSON.stringify(payload) })
    : await wpFetch(`/posts`, env, { method: "POST", body: JSON.stringify(payload) });
  return { created: !existing, status: result.status, id: result.id, link: result.link };
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const publish = argv.includes("--publish");
  const file = argv.find((a) => a.endsWith(".json"));
  if (!file) {
    console.error("Usage : node src/publish-wordpress.mjs <guide.json> [--publish] [--dry-run]");
    process.exit(1);
  }

  const guide = JSON.parse(readFileSync(resolve(file), "utf8"));
  validateGuide(guide);

  const fileConfig = JSON.parse(readFileSync(join(ROOT, "config", "affiliation.json"), "utf8"));
  loadDotEnv(join(ROOT, ".env"));
  const config = resolveConfig(fileConfig);

  if (dryRun) {
    const payload = buildPayload(guide, config, null, publish);
    console.log("— DRY RUN — payload WordPress (non envoyé) :\n");
    console.log(JSON.stringify({ ...payload, content: payload.content.slice(0, 400) + "… [tronqué]" }, null, 2));
    console.log(`\n(Contenu HTML complet : ${payload.content.length} caractères)`);
    return;
  }

  if (!wpConfigured()) {
    console.error("❌ Variables WordPress manquantes (WP_BASE_URL, WP_USER, WP_APP_PASSWORD). Voir .env.example.");
    process.exit(1);
  }
  const result = await publishGuideToWordPress(guide, config, { publish });
  console.log(`✅ ${result.created ? "Créé" : "Mis à jour"} : « ${guide.title} »`);
  console.log(`   Statut : ${result.status} · ID ${result.id}`);
  console.log(`   ${result.link}`);
  if (result.status !== "publish") console.log("   (Brouillon — relire puis publier depuis WordPress.)");
}

// CLI uniquement (n'exécute pas main() lors d'un import)
if (process.argv[1] && process.argv[1].endsWith("publish-wordpress.mjs")) {
  main().catch((e) => { console.error("❌", e.message); process.exit(1); });
}

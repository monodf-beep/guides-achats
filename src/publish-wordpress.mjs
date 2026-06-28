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
 * Usage :
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

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function wpEnv() {
  loadDotEnv(join(ROOT, ".env"));
  const base = process.env.WP_BASE_URL;
  const user = process.env.WP_USER;
  const pass = process.env.WP_APP_PASSWORD;
  return { base, user, pass };
}

function authHeader(user, pass) {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

// Extrait le corps <main>…</main> pour l'injecter dans WordPress (le thème fournit <html>/<head>).
function extractBody(html) {
  const m = html.match(/<main>([\s\S]*?)<\/main>/);
  return m ? m[1].trim() : html;
}

async function wpFetch(path, { base, user, pass }, options = {}) {
  const res = await fetch(`${base.replace(/\/$/, "")}/wp-json/wp/v2${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(user, pass),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`WP ${res.status} ${path} : ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

// Trouve l'ID de la catégorie « Guides d'achat », la crée si absente.
async function ensureCategory(env) {
  const found = await wpFetch(`/categories?search=${encodeURIComponent(CATEGORY_NAME)}`, env);
  const exact = Array.isArray(found) && found.find((c) => c.name === CATEGORY_NAME);
  if (exact) return exact.id;
  const created = await wpFetch(`/categories`, env, { method: "POST", body: JSON.stringify({ name: CATEGORY_NAME }) });
  return created.id;
}

// Cherche un article existant par slug pour le mettre à jour plutôt que dupliquer.
async function findPostBySlug(slug, env) {
  const found = await wpFetch(`/posts?slug=${encodeURIComponent(slug)}&status=any`, env);
  return Array.isArray(found) && found.length ? found[0] : null;
}

function buildPayload(guide, categoryId, publish) {
  return {
    title: guide.title,
    slug: guide.slug,
    status: publish ? "publish" : "draft",
    content: extractBody(renderHtml(guide, globalThis.__cfg)),
    excerpt: String(guide.intro || "").slice(0, 155),
    categories: categoryId ? [categoryId] : [],
  };
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
  globalThis.__cfg = resolveConfig(fileConfig);

  if (dryRun) {
    const payload = buildPayload(guide, null, publish);
    console.log("— DRY RUN — payload WordPress (non envoyé) :\n");
    console.log(JSON.stringify({ ...payload, content: payload.content.slice(0, 400) + "… [tronqué]" }, null, 2));
    console.log(`\n(Contenu HTML complet : ${payload.content.length} caractères)`);
    return;
  }

  const env = wpEnv();
  if (!env.base || !env.user || !env.pass) {
    console.error("❌ Variables WordPress manquantes (WP_BASE_URL, WP_USER, WP_APP_PASSWORD). Voir .env.example.");
    process.exit(1);
  }

  const categoryId = await ensureCategory(env);
  const payload = buildPayload(guide, categoryId, publish);
  const existing = await findPostBySlug(guide.slug, env);

  const result = existing
    ? await wpFetch(`/posts/${existing.id}`, env, { method: "POST", body: JSON.stringify(payload) })
    : await wpFetch(`/posts`, env, { method: "POST", body: JSON.stringify(payload) });

  console.log(`✅ ${existing ? "Mis à jour" : "Créé"} : « ${result.title?.rendered || guide.title} »`);
  console.log(`   Statut : ${result.status} · ID ${result.id}`);
  console.log(`   ${result.link}`);
  if (result.status !== "publish") console.log("   (Brouillon — relire puis publier depuis WordPress.)");
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });

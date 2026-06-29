#!/usr/bin/env node
/**
 * Tableau de bord Cultura Sabauda — back-office des guides d'achat.
 *
 * Serveur HTTP sans dépendance (Node natif). À héberger sur le VPS avant de brancher WordPress.
 * Fonctions : vue d'ensemble (KPIs), liste des guides, génération + prévisualisation,
 * outil d'intentions SEO, recommandation par profil, suivi manuel des revenus, état de la config.
 *
 * Usage :
 *   node src/dashboard/server.mjs                 # http://localhost:8787
 *   DASHBOARD_PORT=9000 node src/dashboard/server.mjs
 *   DASHBOARD_TOKEN=secret node src/dashboard/server.mjs   # protège par ?token=secret
 *
 * Sécurité : destiné à un usage interne. Sur un VPS exposé, placez-le derrière un reverse proxy
 * HTTPS + authentification (voir docs/10-tableau-de-bord.md) et/ou définissez DASHBOARD_TOKEN.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGuide } from "../lib/schema.mjs";
import { renderHtml } from "../lib/render-html.mjs";
import { renderMarkdown } from "../lib/render-markdown.mjs";
import { resolveConfig } from "../lib/affiliate.mjs";
import { buildIntentMatrix, suggestTitles } from "../seo/intent.mjs";
import { rankGuides } from "../seo/recommend.mjs";
import { publishGuideToWordPress, wpConfigured } from "../publish-wordpress.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const GUIDES_DIR = join(ROOT, "data", "guides");
const OUTPUT_DIR = join(ROOT, "output");
const REVENUE_FILE = join(ROOT, "data", "revenue.json");
const CLICKS_FILE = join(ROOT, "data", "clicks.json");
const PORT = process.env.DASHBOARD_PORT || 8787;
const TOKEN = process.env.DASHBOARD_TOKEN || "";

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const SETTINGS_FILE = join(ROOT, "data", "settings.json");
function loadSettings() {
  if (!existsSync(SETTINGS_FILE)) return {};
  try { return JSON.parse(readFileSync(SETTINGS_FILE, "utf8")); } catch { return {}; }
}
function saveSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
  return s;
}

// Config = fichier + .env, puis SURCHARGÉE par les Réglages saisis dans le dashboard
// (data/settings.json) → l'utilisateur configure tout depuis l'UI, sans toucher au VPS.
function loadConfig() {
  loadDotEnv(join(ROOT, ".env"));
  const fileConfig = JSON.parse(readFileSync(join(ROOT, "config", "affiliation.json"), "utf8"));
  const cfg = resolveConfig(fileConfig);
  const s = loadSettings();
  if (s.amazonTag) { cfg.amazon = cfg.amazon || {}; cfg.amazon.partnerTag = s.amazonTag; }
  if (s.awinAffiliateId) { cfg.awin = cfg.awin || {}; cfg.awin.affiliateId = s.awinAffiliateId; cfg.awin.enabled = true; }
  if (s.trackerBase) { cfg.tracker = cfg.tracker || {}; cfg.tracker.base = s.trackerBase; }
  return cfg;
}

const slugify = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

function listGuides() {
  if (!existsSync(GUIDES_DIR)) return [];
  return readdirSync(GUIDES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const full = join(GUIDES_DIR, f);
      let g = {};
      try { g = JSON.parse(readFileSync(full, "utf8")); } catch { /* ignore */ }
      const isSkeleton = f.startsWith("_");
      const slug = g.slug || f.replace(/\.json$/, "");
      const htmlOut = join(OUTPUT_DIR, `${slug}.html`);
      return {
        file: f,
        slug,
        title: g.title || slug,
        category: g.category || "",
        products: Array.isArray(g.products) ? g.products.length : 0,
        draft: isSkeleton || g._draft === true,
        generated: existsSync(htmlOut),
        lastUpdated: g.lastUpdated || "",
      };
    })
    .sort((a, b) => Number(a.draft) - Number(b.draft) || a.title.localeCompare(b.title));
}

function readGuideBySlug(slug) {
  const candidates = readdirSync(GUIDES_DIR).filter((f) => f.endsWith(".json"));
  const file = candidates.find((f) => {
    try { return JSON.parse(readFileSync(join(GUIDES_DIR, f), "utf8")).slug === slug; } catch { return false; }
  });
  if (!file) throw new Error(`Guide introuvable pour le slug « ${slug} »`);
  return JSON.parse(readFileSync(join(GUIDES_DIR, file), "utf8"));
}

function generateGuide(slug, config) {
  const guide = readGuideBySlug(slug);
  validateGuide(guide);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, `${guide.slug}.md`), renderMarkdown(guide, config));
  writeFileSync(join(OUTPUT_DIR, `${guide.slug}.html`), renderHtml(guide, config));
  return { slug: guide.slug, products: guide.products.length };
}

function readClicks() {
  if (!existsSync(CLICKS_FILE)) return [];
  try { return JSON.parse(readFileSync(CLICKS_FILE, "utf8")); } catch { return []; }
}
function logClick(entry) {
  const data = readClicks();
  data.push(entry);
  try { writeFileSync(CLICKS_FILE, JSON.stringify(data, null, 2)); } catch { /* best effort */ }
}

function readRevenue() {
  if (!existsSync(REVENUE_FILE)) return [];
  try { return JSON.parse(readFileSync(REVENUE_FILE, "utf8")); } catch { return []; }
}
function addRevenue(entry) {
  const data = readRevenue();
  data.push({ month: entry.month || "", program: entry.program || "", amount: Number(entry.amount) || 0 });
  writeFileSync(REVENUE_FILE, JSON.stringify(data, null, 2));
  return data;
}

function configStatus(config) {
  const tag = config.amazon?.partnerTag || "";
  return {
    amazonConfigured: !!tag && !/REMPLACER|monidentifiant/i.test(tag),
    amazonTag: tag,
    awinEnabled: !!config.awin?.enabled,
    site: config.site?.baseUrl || "",
    wpConfigured: !!process.env.WP_BASE_URL && !!process.env.WP_APP_PASSWORD,
    aiConfigured: !!process.env.ANTHROPIC_API_KEY,
  };
}

const json = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
};

function authorized(url) {
  if (!TOKEN) return true;
  return url.searchParams.get("token") === TOKEN;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const config = loadConfig();

  // Redirection traçante PUBLIQUE pour les partenaires locaux (pas de token).
  // Compte le clic puis redirige (302) vers la boutique. Protégé contre l'open-redirect.
  if (req.method === "GET" && url.pathname === "/go") {
    const to = url.searchParams.get("to") || "";
    let dest;
    try { dest = new URL(to); } catch { return json(res, 400, { error: "Paramètre 'to' invalide" }); }
    if (dest.protocol !== "http:" && dest.protocol !== "https:") return json(res, 400, { error: "Schéma non autorisé" });
    const allowed = config.tracker?.allowedHosts || [];
    if (allowed.length && !allowed.includes(dest.host)) return json(res, 403, { error: "Hôte non autorisé" });
    logClick({
      ts: new Date().toISOString(),
      merchant: url.searchParams.get("m") || "",
      guide: url.searchParams.get("g") || "",
      to: dest.toString(),
    });
    res.writeHead(302, { Location: dest.toString(), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    return res.end();
  }

  if (!authorized(url)) return json(res, 401, { error: "Token requis (?token=...)" });

  // Pages
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(PAGE);
  }

  if (req.method === "GET" && url.pathname === "/architecture") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(ARCH_PAGE);
  }

  if (req.method === "GET" && url.pathname === "/editor") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(EDITOR_PAGE);
  }

  // Prévisualisation d'un guide généré
  if (req.method === "GET" && url.pathname.startsWith("/preview/")) {
    const slug = decodeURIComponent(url.pathname.replace("/preview/", ""));
    const file = join(OUTPUT_DIR, `${slug}.html`);
    if (!file.startsWith(OUTPUT_DIR) || !existsSync(file)) return json(res, 404, { error: "Non généré" });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(readFileSync(file));
  }

  // API
  if (url.pathname === "/api/overview") {
    const guides = listGuides();
    const revenue = readRevenue();
    return json(res, 200, {
      status: configStatus(config),
      kpis: {
        guides: guides.length,
        published: guides.filter((g) => g.generated && !g.draft).length,
        drafts: guides.filter((g) => g.draft).length,
        products: guides.reduce((n, g) => n + g.products, 0),
        revenueTotal: revenue.reduce((n, r) => n + (r.amount || 0), 0),
        clicks: readClicks().length,
      },
      guides,
    });
  }

  if (url.pathname === "/api/generate" && req.method === "POST") {
    try {
      const result = generateGuide(url.searchParams.get("slug"), config);
      return json(res, 200, { ok: true, ...result });
    } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  }

  if (url.pathname === "/api/publish-wp" && req.method === "POST") {
    (async () => {
      try {
        if (!wpConfigured()) throw new Error("WordPress non configuré (voir .env).");
        const guide = readGuideBySlug(url.searchParams.get("slug"));
        validateGuide(guide);
        const publish = url.searchParams.get("publish") === "1";
        const result = await publishGuideToWordPress(guide, config, { publish });
        return json(res, 200, { ok: true, ...result });
      } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    })();
    return;
  }

  if (url.pathname === "/api/settings") {
    if (req.method === "GET") return json(res, 200, { settings: loadSettings() });
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const p = JSON.parse(body || "{}");
          const clean = {};
          if (p.amazonTag !== undefined) clean.amazonTag = String(p.amazonTag).trim();
          if (p.awinAffiliateId !== undefined) clean.awinAffiliateId = String(p.awinAffiliateId).trim();
          if (p.trackerBase !== undefined) clean.trackerBase = String(p.trackerBase).trim().replace(/\/$/, "");
          return json(res, 200, { ok: true, settings: saveSettings(clean) });
        } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      });
      return;
    }
  }

  if (url.pathname === "/api/guide") {
    if (req.method === "GET") {
      try { return json(res, 200, { guide: readGuideBySlug(url.searchParams.get("slug")) }); }
      catch (e) { return json(res, 404, { error: e.message }); }
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const guide = JSON.parse(body || "{}");
          guide.slug = slugify(guide.slug || guide.title);
          if (!guide.slug) throw new Error("Titre manquant");
          validateGuide(guide);
          const file = join(GUIDES_DIR, `${guide.slug}.json`);
          if (!file.startsWith(GUIDES_DIR)) throw new Error("Slug invalide");
          mkdirSync(GUIDES_DIR, { recursive: true });
          writeFileSync(file, JSON.stringify(guide, null, 2));
          return json(res, 200, { ok: true, slug: guide.slug });
        } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      });
      return;
    }
  }

  if (url.pathname === "/api/seo") {
    const kw = url.searchParams.get("kw");
    if (!kw) return json(res, 400, { error: "Paramètre kw requis" });
    const year = url.searchParams.get("year") || "2026";
    return json(res, 200, { matrix: buildIntentMatrix(kw, { year }), titles: suggestTitles(kw, year) });
  }

  if (url.pathname === "/api/recommend") {
    const interests = (url.searchParams.get("interests") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const guides = readdirSync(GUIDES_DIR)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => { try { return JSON.parse(readFileSync(join(GUIDES_DIR, f), "utf8")); } catch { return null; } })
      .filter(Boolean);
    return json(res, 200, { results: rankGuides(guides, interests, 5) });
  }

  if (url.pathname === "/api/revenue") {
    if (req.method === "GET") return json(res, 200, { revenue: readRevenue() });
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try { return json(res, 200, { ok: true, revenue: addRevenue(JSON.parse(body || "{}")) }); }
        catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      });
      return;
    }
  }

  json(res, 404, { error: "Route inconnue" });
});

server.listen(PORT, () => {
  console.log(`📊 Tableau de bord Cultura Sabauda → http://localhost:${PORT}${TOKEN ? "?token=***" : ""}`);
  if (!TOKEN) console.log("   (Astuce : définissez DASHBOARD_TOKEN pour protéger l'accès.)");
});

const PAGE = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tableau de bord — Guides d'achat Cultura Sabauda</title>
<style>
:root{--accent:#1a4d8f;--ok:#1b8a3a;--warn:#b06a00;--line:#e3e3e3;--bg:#f6f7f9}
*{box-sizing:border-box}body{font-family:system-ui,Arial,sans-serif;margin:0;background:var(--bg);color:#1a1a1a}
header{background:var(--accent);color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}header h1{margin:0;font-size:1.25rem}
header a{color:#fff;background:rgba(255,255,255,.15);padding:8px 14px;border-radius:6px;text-decoration:none;font-size:.9rem;font-weight:600}
main{max-width:1100px;margin:0 auto;padding:24px;display:grid;gap:24px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px}
.kpi b{display:block;font-size:1.8rem;color:var(--accent)}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:18px}
.card h2{margin:0 0 12px;font-size:1.05rem}
table{width:100%;border-collapse:collapse;font-size:.92rem}
th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}
.badge{font-size:.72rem;padding:2px 8px;border-radius:999px;font-weight:700}
.b-ok{background:#dff3e4;color:var(--ok)}.b-draft{background:#fdeccf;color:var(--warn)}.b-no{background:#eee;color:#777}
button{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:7px 12px;cursor:pointer;font-weight:600}
button.alt{background:#fff;color:var(--accent);border:1px solid var(--accent)}
input{padding:7px 10px;border:1px solid var(--line);border-radius:6px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:.82rem;max-height:280px}
.status span{display:inline-block;margin-right:14px}
small{color:#666}
.lead{color:#333;margin:0 0 12px}
.help{color:#666;font-size:.82rem;margin:3px 0 0}
h3.mini{font-size:.95rem;margin:16px 0 4px;color:var(--accent)}
.setrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:12px}
.flow{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;margin:10px 0}
.flow .step{flex:1;min-width:120px;background:#f4f7fb;border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:10px 12px;font-size:.85rem}
.flow .step b{display:block;margin-bottom:2px}
.flow .arrow{display:flex;align-items:center;color:#999;font-size:1.3rem}
.owe{background:#eaf6ee;border:1px solid #bfe3cc;border-radius:8px;padding:10px 14px;margin-top:10px;font-size:.9rem}
</style></head><body>
<header><h1>📊 Guides d'achat — Tableau de bord Cultura Sabauda</h1><nav><a id="newLink" href="/editor">➕ Nouveau guide</a> <a id="archLink" href="/architecture">📐 Architecture &amp; flux</a></nav></header>
<main>
  <div class="kpis" id="kpis"></div>
  <div class="card"><h2>État de la configuration</h2><div class="status" id="status"></div></div>
  <div class="card"><h2>⚙️ Réglages — vos identifiants d'affiliation</h2>
    <p class="lead">À quoi ça sert : ces identifiants permettent à l'outil de transformer
    automatiquement les liens de vos guides en liens d'affiliation, pour que les achats vous
    rapportent une commission. <strong>À remplir une seule fois</strong>, puis « Enregistrer ».</p>
    <div class="setrow">
      <div><label>Identifiant Amazon Partenaires</label><input id="setAmazon" placeholder="culturasab-21">
        <p class="help">Votre « tag » obtenu sur partenaires.amazon.fr. Sans lui, les liens Amazon ne rapportent rien.</p></div>
      <div><label>Identifiant Awin</label><input id="setAwin" placeholder="2961729">
        <p class="help">Votre numéro d'éditeur Awin (pour Fnac, Decathlon, Cultura…). Facultatif au début.</p></div>
      <div><label>Adresse de ce tableau de bord</label><input id="setTracker" placeholder="https://dashboard.culturasabauda.eu">
        <p class="help">Sert à compter les clics vers vos partenaires locaux. Recopiez simplement l'adresse affichée dans votre navigateur.</p></div>
    </div>
    <button onclick="saveSettings()">Enregistrer</button>
    <span id="setMsg" style="margin-left:12px;font-weight:600"></span>
  </div>
  <div class="card"><h2>Vos guides d'achat</h2>
    <p class="lead">Un « guide » est un comparatif de produits que vous recommandez (ex. « Les meilleures liseuses »).
    Cliquez <strong>« ➕ Nouveau guide »</strong> (en haut) pour en créer un, <strong>« Modifier »</strong> pour
    le changer, <strong>« Générer »</strong> pour fabriquer la page, <strong>« Aperçu »</strong> pour la voir,
    puis <strong>« → WP »</strong> pour la publier sur le site.</p>
    <table id="guides"><thead><tr><th>Titre</th><th>Catégorie</th><th>Produits</th><th>État</th><th></th></tr></thead><tbody></tbody></table></div>
  <div class="card"><h2>🔎 Intentions d'achat (SEO)</h2>
    <div class="row"><input id="kw" placeholder="ex. liseuse"><button onclick="seo()">Analyser</button></div>
    <pre id="seoOut" hidden></pre></div>
  <div class="card"><h2>🎯 Recommandation par profil</h2>
    <div class="row"><input id="interests" placeholder="ex. Livres & lecture, Maison" style="flex:1"><button onclick="reco()">Recommander</button></div>
    <pre id="recoOut" hidden></pre></div>
  <div class="card"><h2>💶 Suivi des revenus (manuel)</h2>
    <div class="row"><input id="rMonth" placeholder="2026-06" size="8"><input id="rProg" placeholder="Amazon"><input id="rAmt" placeholder="0.00" size="6"><button onclick="addRev()">Ajouter</button></div>
    <pre id="revOut" hidden></pre></div>

  <div class="card"><h2>🏪 Gagner des commissions avec des marques locales</h2>
    <p class="lead">Beaucoup de boutiques et d'artisans ne sont pas sur Amazon. Vous pouvez quand même
    toucher une commission en les recommandant. Voici comment, étape par étape.</p>

    <h3 class="mini">1. Se mettre d'accord avec la marque</h3>
    <p>Un simple accord par e-mail suffit : un <strong>pourcentage de commission</strong> (ex. 10 %) et un
    <strong>code promo à votre nom</strong> (ex. <strong>CULTURA10</strong>). Le code sert à reconnaître les
    ventes qui viennent de vous.</p>

    <h3 class="mini">2. L'ajouter dans un guide</h3>
    <p>Dans « ➕ Nouveau guide », pour le produit, choisissez le programme <strong>« Marque locale »</strong>,
    collez l'adresse (le lien) de la page du produit chez la marque, et indiquez le code promo. C'est tout :
    l'outil crée le bouton d'achat et affiche le code au lecteur.</p>

    <h3 class="mini">3. Comment vous êtes payé</h3>
    <div class="flow">
      <div class="step"><b>Vous publiez</b>le guide sur le site</div><div class="arrow">→</div>
      <div class="step"><b>Le lecteur clique</b>« Acheter » et/ou note le code promo</div><div class="arrow">→</div>
      <div class="step"><b>Il achète</b>directement chez la marque</div><div class="arrow">→</div>
      <div class="step"><b>La marque compte la vente</b>grâce à votre code</div><div class="arrow">→</div>
      <div class="step"><b>Fin de mois</b>la marque vous verse la commission</div><div class="arrow">→</div>
      <div class="step"><b>Vous notez</b>le montant dans « Suivi des revenus »</div>
    </div>
    <div class="owe"><strong>Ce que la marque vous doit</strong> = votre pourcentage × le total des ventes
    réalisées avec votre code (ou via vos liens). Exemple : 10 % sur 1 200 € de ventes = <strong>120 €</strong>.
    Vous lui envoyez une facture en fin de mois.</div>
    <p class="help">Le compteur « Clics affiliés » (tout en haut) vous indique combien de personnes ont cliqué
    vers chaque marque — utile pour suivre l'intérêt, même avant les premières ventes.</p>
  </div>
</main>
<script>
const TOKEN = new URLSearchParams(location.search).get('token');
const q = (p)=> p + (TOKEN ? (p.includes('?')?'&':'?')+'token='+encodeURIComponent(TOKEN) : '');
async function load(){
  document.getElementById('archLink').href = q('/architecture');
  document.getElementById('newLink').href = q('/editor');
  loadSettings();
  const d = await (await fetch(q('/api/overview'))).json();
  const k = d.kpis;
  document.getElementById('kpis').innerHTML = [
    ['Guides',k.guides],['Publiés',k.published],['Brouillons',k.drafts],['Produits',k.products],['Clics affiliés',k.clicks],['Revenus €',k.revenueTotal.toFixed(2)]
  ].map(([l,v])=>'<div class="kpi"><b>'+v+'</b>'+l+'</div>').join('');
  const s=d.status; window.WP = s.wpConfigured;
  document.getElementById('status').innerHTML =
    pill('Amazon Partenaires', s.amazonConfigured) + pill('Awin', s.awinEnabled) +
    pill('WordPress', s.wpConfigured) + pill('IA / Claude', s.aiConfigured) +
    '<span><small>Site : '+(s.site||'—')+'</small></span>';
  document.querySelector('#guides tbody').innerHTML = d.guides.map(g=>{
    const st = g.draft?'<span class="badge b-draft">brouillon</span>':(g.generated?'<span class="badge b-ok">généré</span>':'<span class="badge b-no">à générer</span>');
    const wpBtn = (g.generated && window.WP) ? ' <button onclick="pubwp(\\''+g.slug+'\\')">→ WP</button>' : '';
    const edit = '<a href="'+q('/editor?slug='+encodeURIComponent(g.slug))+'"><button class="alt">Modifier</button></a> ';
    const act = edit + (g.draft? '<small>complétez puis générez</small>' :
      '<button class="alt" onclick="gen(\\''+g.slug+'\\')">Générer</button> '+(g.generated?'<a href="'+q('/preview/'+g.slug)+'" target="_blank"><button class="alt">Aperçu</button></a>':'')+wpBtn);
    return '<tr><td>'+g.title+'</td><td>'+g.category+'</td><td>'+g.products+'</td><td>'+st+'</td><td>'+act+'</td></tr>';
  }).join('');
}
function pill(l,ok){return '<span><span class="badge '+(ok?'b-ok':'b-no')+'">'+(ok?'OK':'à faire')+'</span> '+l+'</span>';}
async function gen(slug){const r=await (await fetch(q('/api/generate?slug='+encodeURIComponent(slug)),{method:'POST'})).json();alert(r.ok?'Généré : '+r.slug+' ('+r.products+' produits)':'Erreur : '+r.error);load();}
async function pubwp(slug){if(!confirm('Publier « '+slug+' » sur WordPress en BROUILLON ?'))return;const r=await (await fetch(q('/api/publish-wp?slug='+encodeURIComponent(slug)),{method:'POST'})).json();if(r.ok){if(confirm((r.created?'Brouillon créé':'Article mis à jour')+' sur WP (statut '+r.status+').\\nOuvrir l\\'article ?'))window.open(r.link,'_blank');}else alert('Erreur : '+r.error);}
async function seo(){const kw=document.getElementById('kw').value;if(!kw)return;const r=await (await fetch(q('/api/seo?kw='+encodeURIComponent(kw)))).json();const o=document.getElementById('seoOut');o.hidden=false;o.textContent=JSON.stringify(r,null,2);}
async function reco(){const i=document.getElementById('interests').value;const r=await (await fetch(q('/api/recommend?interests='+encodeURIComponent(i)))).json();const o=document.getElementById('recoOut');o.hidden=false;o.textContent=JSON.stringify(r.results,null,2);}
async function addRev(){const body={month:rMonth.value,program:rProg.value,amount:rAmt.value};const r=await (await fetch(q('/api/revenue'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();const o=document.getElementById('revOut');o.hidden=false;o.textContent=JSON.stringify(r.revenue,null,2);load();}
async function loadSettings(){const s=(await (await fetch(q('/api/settings'))).json()).settings||{};document.getElementById('setAmazon').value=s.amazonTag||'';document.getElementById('setAwin').value=s.awinAffiliateId||'';document.getElementById('setTracker').value=s.trackerBase||'';}
async function saveSettings(){const body={amazonTag:setAmazon.value,awinAffiliateId:setAwin.value,trackerBase:setTracker.value};const r=await (await fetch(q('/api/settings'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();document.getElementById('setMsg').textContent=r.ok?'✅ Réglages enregistrés.':'Erreur : '+r.error;load();}
load();
</script></body></html>`;

const ARCH_PAGE = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Architecture & flux — Guides d'achat Cultura Sabauda</title>
<style>
:root{--accent:#1a4d8f;--ai:#7c3aed;--auto:#0f766e;--human:#b45309;--line:#e3e3e3;--bg:#f6f7f9}
*{box-sizing:border-box}body{font-family:system-ui,Arial,sans-serif;margin:0;background:var(--bg);color:#1a1a1a;line-height:1.55}
header{background:var(--accent);color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
header h1{margin:0;font-size:1.2rem}header a{color:#fff;background:rgba(255,255,255,.15);padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600;font-size:.9rem}
main{max-width:1000px;margin:0 auto;padding:24px;display:grid;gap:24px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:20px}
.card h2{margin:0 0 6px;font-size:1.1rem}.card p.sub{margin:0 0 14px;color:#666}
table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
.tag{font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
.t-ai{background:#efe7fd;color:var(--ai)}.t-auto{background:#d9f2ee;color:var(--auto)}.t-human{background:#fdecd0;color:var(--human)}
.flow{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px}
.step{flex:1;min-width:130px;background:#f4f7fb;border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:10px 12px;font-size:.86rem}
.step.ai{border-left-color:var(--ai)}.step.human{border-left-color:var(--human)}.step.auto{border-left-color:var(--auto)}
.step b{display:block;font-size:.92rem;margin-bottom:2px}
.arrow{display:flex;align-items:center;font-size:1.3rem;color:#999}
.legend span{display:inline-block;margin-right:16px;font-size:.85rem}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:middle}
code{background:#eef;padding:1px 5px;border-radius:4px;font-size:.85em}
.note{background:#fff8e6;border-left:4px solid var(--human);padding:10px 14px;border-radius:6px;font-size:.9rem}
</style></head><body>
<header><h1>📐 Architecture & flux</h1><a id="back" href="/">← Retour au tableau de bord</a></header>
<main>

  <div class="card">
    <h2>En une phrase</h2>
    <p>Une chaîne <strong>majoritairement déterministe</strong> (Node, sans IA) transforme des données
    de guide en pages publiables et liens affiliés. <strong>Un seul maillon utilise l'IA</strong> :
    Claude rédige l'éditorial, sous contrôle humain. Il n'y a pas une nuée d'agents — un appel LLM, encadré.</p>
    <p class="legend">
      <span><span class="dot" style="background:#0f766e"></span>Automatique (Node, déterministe)</span>
      <span><span class="dot" style="background:#7c3aed"></span>IA (Claude)</span>
      <span><span class="dot" style="background:#b45309"></span>Humain (décision / relecture)</span>
    </p>
  </div>

  <div class="card">
    <h2>Qui fait quoi (composants)</h2>
    <p class="sub">Chaque brique a une responsabilité unique et un type d'exécution.</p>
    <table>
      <thead><tr><th>Composant</th><th>Rôle</th><th>Type</th></tr></thead>
      <tbody>
        <tr><td><code>seo/intent</code></td><td>Mot-clé → matrice d'intentions d'achat + brief SEO</td><td><span class="tag t-auto">Auto</span></td></tr>
        <tr><td><code>ai/draft-guide</code></td><td>Rédige l'éditorial d'un guide (intro, critères, forts/faibles, FAQ…)</td><td><span class="tag t-ai">IA — Claude</span></td></tr>
        <tr><td><code>lib/schema</code></td><td>Valide les données du guide (champs, références) avant tout rendu</td><td><span class="tag t-auto">Auto</span></td></tr>
        <tr><td><code>lib/affiliate</code></td><td>Construit les liens affiliés trackés (Amazon / Awin / direct)</td><td><span class="tag t-auto">Auto</span></td></tr>
        <tr><td><code>generate</code> + <code>lib/render-*</code></td><td>Guide JSON → page Markdown + HTML (SEO, Schema.org)</td><td><span class="tag t-auto">Auto</span></td></tr>
        <tr><td><code>seo/recommend</code></td><td>Profil visiteur → guides classés par affinité</td><td><span class="tag t-auto">Auto</span></td></tr>
        <tr><td><code>publish-wordpress</code></td><td>Publie l'article sur WordPress (API REST)</td><td><span class="tag t-auto">Auto</span></td></tr>
        <tr><td><code>dashboard</code></td><td>Pilote tout : génère, prévisualise, publie, suit les revenus</td><td><span class="tag t-auto">Auto</span></td></tr>
        <tr><td>Rédacteur / relecteur</td><td>Fournit les ASIN & prix vérifiés, valide qualité + conformité</td><td><span class="tag t-human">Humain</span></td></tr>
      </tbody>
    </table>
  </div>

  <div class="card">
    <h2>Le modèle d'IA</h2>
    <p class="sub">Un seul appel LLM dans toute la chaîne.</p>
    <p><strong>Claude <code>claude-opus-4-8</code></strong> (adaptive thinking, sorties structurées
    validées par schéma) — utilisé par <code>ai/draft-guide</code> pour rédiger l'éditorial.</p>
    <div class="note"><strong>Garde-fous de conformité :</strong>
      <ul style="margin:6px 0 0">
        <li>Claude rédige <strong>uniquement le texte</strong> ; il ne génère <strong>jamais</strong> les ASIN, URL marchandes ni les prix (fournis et vérifiés par un humain).</li>
        <li>Sa sortie est un <strong>brouillon</strong> (<code>*.draft.json</code>) à relire avant publication.</li>
        <li>Schéma JSON strict : pas de champ prix/asin côté IA → pas de lien ou de prix halluciné.</li>
      </ul>
    </div>
    <p style="margin-top:12px">Tous les autres composants sont <strong>déterministes</strong> (Node natif, aucune IA) : prévisibles, testables, gratuits.</p>
  </div>

  <div class="card">
    <h2>Flux 1 — Créer & publier un guide</h2>
    <div class="flow">
      <div class="step human"><b>1. Idée</b>sujet à couvrir</div><div class="arrow">→</div>
      <div class="step auto"><b>2. SEO</b>intentions + brief (<code>intent</code>)</div><div class="arrow">→</div>
      <div class="step human"><b>3. Squelette</b>produits + ASIN/prix vérifiés</div><div class="arrow">→</div>
      <div class="step ai"><b>4. Rédaction</b>brouillon par Claude (ou manuel)</div><div class="arrow">→</div>
      <div class="step human"><b>5. Relecture</b>qualité + conformité</div><div class="arrow">→</div>
      <div class="step auto"><b>6. Génération</b>MD + HTML (<code>generate</code>)</div><div class="arrow">→</div>
      <div class="step auto"><b>7. Aperçu</b>dans le dashboard</div><div class="arrow">→</div>
      <div class="step auto"><b>8. Publication</b>→ WordPress (brouillon)</div>
    </div>
  </div>

  <div class="card">
    <h2>Flux 2 — Du clic à la commission (revenu)</h2>
    <div class="flow">
      <div class="step"><b>Lecteur</b>lit le guide</div><div class="arrow">→</div>
      <div class="step auto"><b>Bouton</b>« Acheter sur [Marchand] » = lien tracké (tag affilié)</div><div class="arrow">→</div>
      <div class="step"><b>Marchand</b>Amazon / Fnac…</div><div class="arrow">→</div>
      <div class="step"><b>Achat</b>attribué via le tag</div><div class="arrow">→</div>
      <div class="step auto"><b>Commission</b>versée par le marchand</div><div class="arrow">→</div>
      <div class="step human"><b>Suivi</b>saisi dans le dashboard</div>
    </div>
  </div>

  <div class="card">
    <h2>Flux 3 — Personnalisation (pousser les bons guides)</h2>
    <div class="flow">
      <div class="step human"><b>Visiteur</b>déclare ses centres d'intérêt</div><div class="arrow">→</div>
      <div class="step auto"><b>Recommandation</b>affinité de catégorie (<code>recommend</code>)</div><div class="arrow">→</div>
      <div class="step auto"><b>Affichage</b>« Nos guides pour vous »</div>
    </div>
    <p style="margin-top:10px;font-size:.88rem;color:#666">Règle-à-règle pour l'instant (sans donnée sensible). Le comportemental/prédictif viendra avec le trafic — sous consentement (RGPD).</p>
  </div>

  <div class="card">
    <h2>Pour aller plus loin</h2>
    <p>Documentation détaillée dans le dépôt : <code>docs/09-ia-claude.md</code> (IA),
    <code>docs/08-seo-et-personnalisation.md</code> (SEO &amp; perso),
    <code>docs/ETAT-DU-PROJET.md</code> (avancement).</p>
  </div>

</main>
<script>
  // Conserve le token dans le lien retour
  var t = new URLSearchParams(location.search).get('token');
  if(t) document.getElementById('back').href = '/?token='+encodeURIComponent(t);
</script>
</body></html>`;

const EDITOR_PAGE = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Éditeur de guide — Cultura Sabauda</title>
<style>
:root{--accent:#1a4d8f;--line:#e3e3e3;--bg:#f6f7f9;--ok:#1b8a3a}
*{box-sizing:border-box}body{font-family:system-ui,Arial,sans-serif;margin:0;background:var(--bg);color:#1a1a1a}
header{background:var(--accent);color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
header h1{margin:0;font-size:1.15rem}header a{color:#fff;background:rgba(255,255,255,.15);padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600;font-size:.9rem}
main{max-width:960px;margin:0 auto;padding:24px;display:grid;gap:18px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:18px}
.card h2{margin:0 0 12px;font-size:1.05rem}
label{display:block;font-size:.85rem;font-weight:600;margin:8px 0 2px}
input,select,textarea{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font:inherit}
textarea{min-height:60px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.grid3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
.pcard{border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:14px;margin-bottom:14px;position:relative}
.pcard .del{position:absolute;top:8px;right:8px;background:#fff;color:#b00;border:1px solid #f0c0c0;border-radius:6px;cursor:pointer;padding:2px 8px}
button{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:9px 16px;cursor:pointer;font-weight:600}
button.alt{background:#fff;color:var(--accent);border:1px solid var(--accent)}
.hint{color:#666;font-size:.82rem;margin:2px 0 0}
#msg{font-weight:600;margin-top:10px}
small.cond{color:#888}
</style></head><body>
<header><h1>📝 Éditeur de guide</h1><a id="back" href="/">← Tableau de bord</a></header>
<main>
  <div class="card" style="background:#eef4fb;border-color:#cfe0f3">
    <h2>À quoi sert cette page</h2>
    <p style="margin:0">Créez ou modifiez un <strong>guide d'achat</strong> : un comparatif de produits que vous
    recommandez. En 4 étapes : <strong>1)</strong> le titre et l'intro, <strong>2)</strong> vos produits avec
    leur lien d'affiliation, <strong>3)</strong> une « distinction » sur vos préférés (Meilleur choix…),
    <strong>4)</strong> « Enregistrer ». Ensuite, retournez au tableau de bord pour le générer et le publier.
    Les champs avec <strong>*</strong> sont obligatoires.</p>
  </div>
  <div class="card"><h2>1. Le guide</h2>
    <label>Titre *</label><input id="title" placeholder="Les meilleures liseuses en 2026">
    <div class="grid3">
      <div><label>Catégorie *</label><input id="category" placeholder="Livres & lecture"></div>
      <div><label>Année *</label><input id="year" type="number" value="2026"></div>
      <div><label>Mise à jour</label><input id="lastUpdated" type="date"></div>
    </div>
    <label>Chapô (intro) *</label><textarea id="intro" placeholder="2-3 phrases qui répondent au besoin dès la 1re phrase."></textarea>
    <label>Auteur</label><input id="author" value="La rédaction Cultura Sabauda">
  </div>

  <div class="card"><h2>2. Produits</h2>
    <p class="hint">Donnez une « distinction » à au moins un produit (Meilleur choix, etc.) : c'est ce qui crée la sélection en tête de guide.</p>
    <div id="products"></div>
    <button class="alt" onclick="addProduct()">+ Ajouter un produit</button>
  </div>

  <div class="card"><h2>3. Sections (facultatives)</h2>
    <label>Critères d'évaluation <small class="cond">(un par ligne)</small></label><textarea id="criteria" placeholder="Autonomie&#10;Confort de lecture&#10;Rapport qualité-prix"></textarea>
    <label>Comment bien choisir</label><textarea id="buyingGuide"></textarea>
    <div class="grid2">
      <div><label>À qui s'adresse ce guide</label><textarea id="audience"></textarea></div>
      <div><label>Pourquoi nous faire confiance</label><textarea id="trust"></textarea></div>
    </div>
    <label>Méthodologie</label><textarea id="methodology"></textarea>
    <label>FAQ <small class="cond">(une par ligne : Question | Réponse)</small></label><textarea id="faq" placeholder="Inox ou plastique ? | L'inox isole mieux..."></textarea>
  </div>

  <div class="card">
    <button onclick="save()">💾 Enregistrer le guide</button>
    <span id="msg"></span>
    <p class="hint">Après enregistrement, retourne au tableau de bord pour Générer → Aperçu → Publier.</p>
  </div>
</main>
<script>
var params=new URLSearchParams(location.search), TOKEN=params.get('token'), SLUG=params.get('slug');
function q(p){return p+(TOKEN?(p.includes('?')?'&':'?')+'token='+encodeURIComponent(TOKEN):'');}
if(TOKEN) document.getElementById('back').href='/?token='+encodeURIComponent(TOKEN);
function slugify(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);}
var BADGES=['','Meilleur choix global','Meilleur rapport qualité-prix','Premium','Coup de cœur'];
var PROGRAMS=[['amazon','Amazon (ASIN)'],['local','Marque locale (URL + code)'],['direct','Marchand direct (URL)'],['awin','Awin (URL + Merchant ID)']];
function addProduct(p){
  p=p||{}; var a=p.affiliate||{};
  var badgeOpts=BADGES.map(function(b){return '<option'+(p._badge===b?' selected':'')+'>'+(b||'— aucune —')+'</option>';}).join('');
  var progOpts=PROGRAMS.map(function(pr){return '<option value="'+pr[0]+'"'+(((a.program||'amazon')===pr[0])?' selected':'')+'>'+pr[1]+'</option>';}).join('');
  var div=document.createElement('div'); div.className='pcard';
  div.innerHTML=
    '<button class="del" onclick="this.parentNode.remove()">✕</button>'+
    '<div class="grid3"><div><label>Nom *</label><input class="p-name" value="'+esc(p.name)+'"></div>'+
    '<div><label>Marque</label><input class="p-brand" value="'+esc(p.brand)+'"></div>'+
    '<div><label>Prix indicatif</label><input class="p-price" value="'+esc(p.price)+'"></div></div>'+
    '<div class="grid2"><div><label>Distinction</label><select class="p-badge">'+badgeOpts+'</select></div>'+
    '<div><label>Programme d\\'affiliation</label><select class="p-program" onchange="toggleProg(this)">'+progOpts+'</select></div></div>'+
    '<div class="grid2"><div class="f-asin"><label>ASIN Amazon</label><input class="p-asin" value="'+esc(a.asin)+'"></div>'+
    '<div class="f-url"><label>URL produit (marchand)</label><input class="p-url" value="'+esc(a.url)+'"></div></div>'+
    '<div class="grid3"><div class="f-merchant"><label>Nom du marchand</label><input class="p-merchant" value="'+esc(a.merchant)+'"></div>'+
    '<div class="f-code"><label>Code promo</label><input class="p-code" value="'+esc(a.code)+'"></div>'+
    '<div class="f-awinmid"><label>Awin Merchant ID</label><input class="p-awinmid" value="'+esc(a.awinMerchantId)+'"></div></div>'+
    '<label>Résumé</label><textarea class="p-summary">'+esc(p.summary)+'</textarea>'+
    '<div class="grid2"><div><label>Points forts (un par ligne)</label><textarea class="p-pros">'+esc((p.pros||[]).join("\\n"))+'</textarea></div>'+
    '<div><label>Points faibles (un par ligne)</label><textarea class="p-cons">'+esc((p.cons||[]).join("\\n"))+'</textarea></div></div>';
  document.getElementById('products').appendChild(div);
  toggleProg(div.querySelector('.p-program'));
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
function toggleProg(sel){var c=sel.closest('.pcard'),v=sel.value;
  c.querySelector('.f-asin').style.display=(v==='amazon')?'':'none';
  c.querySelector('.f-url').style.display=(v==='amazon')?'none':'';
  c.querySelector('.f-awinmid').style.display=(v==='awin')?'':'none';
  c.querySelector('.f-code').style.display=(v==='local')?'':'none';
}
function lines(id){return document.getElementById(id).value.split('\\n').map(function(s){return s.trim();}).filter(Boolean);}
function save(){
  var products=[],picks=[];
  document.querySelectorAll('#products .pcard').forEach(function(c,i){
    var name=c.querySelector('.p-name').value.trim(); if(!name)return;
    var program=c.querySelector('.p-program').value, id=slugify(name)||('produit-'+(i+1));
    var aff={program:program};
    if(program==='amazon'){aff.asin=c.querySelector('.p-asin').value.trim();}
    else {aff.url=c.querySelector('.p-url').value.trim();}
    var m=c.querySelector('.p-merchant').value.trim(); if(m)aff.merchant=m;
    if(program==='awin'){aff.awinMerchantId=c.querySelector('.p-awinmid').value.trim();}
    if(program==='local'){var cd=c.querySelector('.p-code').value.trim(); if(cd)aff.code=cd;}
    var prod={id:id,name:name,affiliate:aff};
    var b=c.querySelector('.p-brand').value.trim(); if(b)prod.brand=b;
    var pr=c.querySelector('.p-price').value.trim(); if(pr)prod.price=pr;
    var sm=c.querySelector('.p-summary').value.trim(); if(sm)prod.summary=sm;
    var pros=c.querySelector('.p-pros').value.split('\\n').map(function(s){return s.trim();}).filter(Boolean); if(pros.length)prod.pros=pros;
    var cons=c.querySelector('.p-cons').value.split('\\n').map(function(s){return s.trim();}).filter(Boolean); if(cons.length)prod.cons=cons;
    products.push(prod);
    var badge=c.querySelector('.p-badge').value; if(badge && badge!=='— aucune —')picks.push({badge:badge,productRef:id});
  });
  if(!products.length){return msg('Ajoute au moins un produit.',true);}
  if(!picks.length){return msg('Mets une distinction à au moins un produit.',true);}
  var faq=lines('faq').map(function(l){var i=l.indexOf('|');return i<0?null:{q:l.slice(0,i).trim(),a:l.slice(i+1).trim()};}).filter(Boolean);
  var g={
    slug:slugify(document.getElementById('title').value),
    title:document.getElementById('title').value.trim(),
    category:document.getElementById('category').value.trim(),
    year:parseInt(document.getElementById('year').value,10)||2026,
    lang:'fr',
    lastUpdated:document.getElementById('lastUpdated').value||undefined,
    author:document.getElementById('author').value.trim()||undefined,
    intro:document.getElementById('intro').value.trim(),
    methodology:document.getElementById('methodology').value.trim()||undefined,
    criteria:lines('criteria'),
    buyingGuide:document.getElementById('buyingGuide').value.trim()||undefined,
    audience:document.getElementById('audience').value.trim()||undefined,
    trust:document.getElementById('trust').value.trim()||undefined,
    picks:picks, products:products, faq:faq
  };
  fetch(q('/api/guide'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(g)})
   .then(function(r){return r.json();}).then(function(r){
     if(r.ok){msg('✅ Guide enregistré ('+r.slug+'). Retourne au tableau de bord pour le générer.',false);}
     else{msg('Erreur : '+r.error,true);}
   });
}
function msg(t,err){var m=document.getElementById('msg');m.textContent=t;m.style.color=err?'#b00':'#1b8a3a';}
// Édition d'un guide existant
if(SLUG){
  fetch(q('/api/guide?slug='+encodeURIComponent(SLUG))).then(function(r){return r.json();}).then(function(d){
    var g=d.guide; if(!g)return addProduct();
    document.getElementById('title').value=g.title||'';
    document.getElementById('category').value=g.category||'';
    document.getElementById('year').value=g.year||2026;
    document.getElementById('lastUpdated').value=g.lastUpdated||'';
    document.getElementById('author').value=g.author||'La rédaction Cultura Sabauda';
    document.getElementById('intro').value=g.intro||'';
    document.getElementById('methodology').value=g.methodology||'';
    document.getElementById('criteria').value=(g.criteria||[]).join('\\n');
    document.getElementById('buyingGuide').value=g.buyingGuide||'';
    document.getElementById('audience').value=g.audience||'';
    document.getElementById('trust').value=g.trust||'';
    document.getElementById('faq').value=(g.faq||[]).map(function(f){return f.q+' | '+f.a;}).join('\\n');
    var badgeByRef={}; (g.picks||[]).forEach(function(p){badgeByRef[p.productRef]=p.badge;});
    (g.products||[]).forEach(function(p){p._badge=badgeByRef[p.id]||''; addProduct(p);});
    if(!(g.products||[]).length)addProduct();
  });
} else {
  document.getElementById('lastUpdated').valueAsDate=new Date();
  addProduct();
}
</script>
</body></html>`;

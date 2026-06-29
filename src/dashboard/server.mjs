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
function loadConfig() {
  loadDotEnv(join(ROOT, ".env"));
  const fileConfig = JSON.parse(readFileSync(join(ROOT, "config", "affiliation.json"), "utf8"));
  return resolveConfig(fileConfig);
}

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
</style></head><body>
<header><h1>📊 Guides d'achat — Tableau de bord Cultura Sabauda</h1><a id="archLink" href="/architecture">📐 Architecture &amp; flux</a></header>
<main>
  <div class="kpis" id="kpis"></div>
  <div class="card"><h2>État de la configuration</h2><div class="status" id="status"></div></div>
  <div class="card"><h2>Guides</h2><table id="guides"><thead><tr><th>Titre</th><th>Catégorie</th><th>Produits</th><th>État</th><th></th></tr></thead><tbody></tbody></table></div>
  <div class="card"><h2>🔎 Intentions d'achat (SEO)</h2>
    <div class="row"><input id="kw" placeholder="ex. liseuse"><button onclick="seo()">Analyser</button></div>
    <pre id="seoOut" hidden></pre></div>
  <div class="card"><h2>🎯 Recommandation par profil</h2>
    <div class="row"><input id="interests" placeholder="ex. Livres & lecture, Maison" style="flex:1"><button onclick="reco()">Recommander</button></div>
    <pre id="recoOut" hidden></pre></div>
  <div class="card"><h2>💶 Suivi des revenus (manuel)</h2>
    <div class="row"><input id="rMonth" placeholder="2026-06" size="8"><input id="rProg" placeholder="Amazon"><input id="rAmt" placeholder="0.00" size="6"><button onclick="addRev()">Ajouter</button></div>
    <pre id="revOut" hidden></pre></div>

  <div class="card"><h2>🏪 Affiliation des marques locales (hors plateformes)</h2>
    <details><summary style="cursor:pointer;font-weight:600">Comment faire — méthode A+B (clique pour déplier)</summary>
    <div style="font-size:.93rem;line-height:1.55;margin-top:10px">
      <p>Pour les marques <strong>pas sur Amazon/Awin</strong>, on combine deux méthodes :</p>
      <p><strong>A. Code promo dédié</strong> — la marque te crée un code unique (ex. <code>CULTURA10</code>).
      Chaque vente avec ce code = ta commission. Aucune technique requise ; la marque te reporte les ventes.
      Bonus : la réduction améliore la conversion.</p>
      <p><strong>B. Redirection traçante</strong> — tes boutons passent par <code>/go</code> (ce serveur) qui
      <strong>compte le clic</strong> puis redirige vers la boutique. Tu vois le volume de clics (KPI
      « Clics affiliés » ci-dessus), même si la marque n'a aucun outil.</p>
      <p><strong>En pratique : A attribue les ventes, B donne les clics.</strong> Tu réconcilies, puis tu
      saisis la commission dans « Suivi des revenus ».</p>
      <p><strong>Mise en place :</strong></p>
      <ol style="margin:4px 0 0">
        <li>Accord avec la marque : taux de commission + code promo + paiement (facture mensuelle).</li>
        <li>Dans le <code>.env</code> du VPS : <code>TRACKER_BASE_URL=https://&lt;ce-dashboard&gt;</code> (active la redirection /go).</li>
        <li>Dans un guide, déclare le produit ainsi :</li>
      </ol>
      <pre style="background:#0f172a;color:#e2e8f0;padding:10px;border-radius:8px;font-size:.8rem;overflow:auto">"affiliate": {
  "program": "local",
  "url": "https://atelier-sabaudo.fr/produit",
  "merchant": "Atelier Sabaudo",
  "code": "CULTURA10"
}</pre>
      <p style="margin:8px 0 0;color:#666">→ bouton « Acheter sur Atelier Sabaudo » + encadré « 🎟️ Code partenaire : CULTURA10 ».
      Sécurité : renseigne <code>tracker.allowedHosts</code> (domaines partenaires) dans
      <code>config/affiliation.json</code>. Détails : <code>docs/11-affiliation-locale.md</code>.</p>
    </div></details>
  </div>
</main>
<script>
const TOKEN = new URLSearchParams(location.search).get('token');
const q = (p)=> p + (TOKEN ? (p.includes('?')?'&':'?')+'token='+encodeURIComponent(TOKEN) : '');
async function load(){
  document.getElementById('archLink').href = q('/architecture');
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
    const act = g.draft?'<small>compléter d\\'abord</small>':
      '<button class="alt" onclick="gen(\\''+g.slug+'\\')">Générer</button> '+(g.generated?'<a href="'+q('/preview/'+g.slug)+'" target="_blank"><button class="alt">Aperçu</button></a>':'')+wpBtn;
    return '<tr><td>'+g.title+'</td><td>'+g.category+'</td><td>'+g.products+'</td><td>'+st+'</td><td>'+act+'</td></tr>';
  }).join('');
}
function pill(l,ok){return '<span><span class="badge '+(ok?'b-ok':'b-no')+'">'+(ok?'OK':'à faire')+'</span> '+l+'</span>';}
async function gen(slug){const r=await (await fetch(q('/api/generate?slug='+encodeURIComponent(slug)),{method:'POST'})).json();alert(r.ok?'Généré : '+r.slug+' ('+r.products+' produits)':'Erreur : '+r.error);load();}
async function pubwp(slug){if(!confirm('Publier « '+slug+' » sur WordPress en BROUILLON ?'))return;const r=await (await fetch(q('/api/publish-wp?slug='+encodeURIComponent(slug)),{method:'POST'})).json();if(r.ok){if(confirm((r.created?'Brouillon créé':'Article mis à jour')+' sur WP (statut '+r.status+').\\nOuvrir l\\'article ?'))window.open(r.link,'_blank');}else alert('Erreur : '+r.error);}
async function seo(){const kw=document.getElementById('kw').value;if(!kw)return;const r=await (await fetch(q('/api/seo?kw='+encodeURIComponent(kw)))).json();const o=document.getElementById('seoOut');o.hidden=false;o.textContent=JSON.stringify(r,null,2);}
async function reco(){const i=document.getElementById('interests').value;const r=await (await fetch(q('/api/recommend?interests='+encodeURIComponent(i)))).json();const o=document.getElementById('recoOut');o.hidden=false;o.textContent=JSON.stringify(r.results,null,2);}
async function addRev(){const body={month:rMonth.value,program:rProg.value,amount:rAmt.value};const r=await (await fetch(q('/api/revenue'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();const o=document.getElementById('revOut');o.hidden=false;o.textContent=JSON.stringify(r.revenue,null,2);load();}
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

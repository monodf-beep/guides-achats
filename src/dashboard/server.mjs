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
    amazonConfigured: !!tag && !/REMPLACER/i.test(tag),
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

  if (!authorized(url)) return json(res, 401, { error: "Token requis (?token=...)" });

  // Pages
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(PAGE);
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
header{background:var(--accent);color:#fff;padding:16px 24px}header h1{margin:0;font-size:1.25rem}
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
<header><h1>📊 Guides d'achat — Tableau de bord Cultura Sabauda</h1></header>
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
</main>
<script>
const TOKEN = new URLSearchParams(location.search).get('token');
const q = (p)=> p + (TOKEN ? (p.includes('?')?'&':'?')+'token='+encodeURIComponent(TOKEN) : '');
async function load(){
  const d = await (await fetch(q('/api/overview'))).json();
  const k = d.kpis;
  document.getElementById('kpis').innerHTML = [
    ['Guides',k.guides],['Publiés',k.published],['Brouillons',k.drafts],['Produits',k.products],['Revenus €',k.revenueTotal.toFixed(2)]
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

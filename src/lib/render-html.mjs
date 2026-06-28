/**
 * Rendu d'un guide en page HTML autonome + données structurées Schema.org
 * (ItemList + FAQPage) pour un référencement (SEO) optimal — comme Le Monde.
 */
import { buildAffiliateLink } from "./affiliate.mjs";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderHtml(guide, config) {
  const byId = Object.fromEntries(guide.products.map((p) => [p.id, p]));
  const site = config.site || {};
  const canonical = `${(site.baseUrl || "").replace(/\/$/, "")}${site.guidesPath || "/guides-achat"}/${guide.slug}`;

  const productCards = guide.products
    .map((p, i) => {
      const link = buildAffiliateLink(p.affiliate, config);
      const pick = guide.picks.find((pk) => pk.productRef === p.id);
      return `
      <article class="card">
        <div class="rank">${i + 1}</div>
        ${pick ? `<span class="badge">${esc(pick.badge)}</span>` : ""}
        ${p.image ? `<img loading="lazy" src="${esc(p.image)}" alt="${esc(p.name)}">` : ""}
        <h3>${esc(p.name)}</h3>
        <p class="meta">${p.brand ? esc(p.brand) + " · " : ""}${p.price ? esc(p.price) : ""}${p.rating ? " · ★ " + p.rating + "/5" : ""}</p>
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
        ${list(p.pros, "pros", "✅")}
        ${list(p.cons, "cons", "⚠️")}
        <a class="cta" href="${esc(link.href)}" rel="${link.rel}" target="_blank">Voir le prix</a>
      </article>`;
    })
    .join("\n");

  const picksRows = guide.picks
    .map((pk) => {
      const p = byId[pk.productRef];
      const link = buildAffiliateLink(p.affiliate, config);
      return `<tr><td><strong>${esc(pk.badge)}</strong></td><td>${esc(p.name)}</td><td>${p.rating ? "★ " + p.rating : ""}</td><td><a href="${esc(link.href)}" rel="${link.rel}" target="_blank">Voir l'offre</a></td></tr>`;
    })
    .join("\n");

  const jsonLd = buildJsonLd(guide, canonical);

  return `<!DOCTYPE html>
<html lang="${esc(guide.lang || "fr")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(guide.title)} | ${esc(site.name || "Cultura Sabauda")}</title>
<meta name="description" content="${esc(guide.intro).slice(0, 155)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(guide.title)}">
<meta property="og:description" content="${esc(guide.intro).slice(0, 155)}">
<meta property="og:type" content="article">
${guide.products[0]?.image ? `<meta property="og:image" content="${esc(guide.products[0].image)}">` : ""}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${CSS}</style>
</head>
<body>
<main>
  <header class="hero">
    <p class="kicker">Guide d'achat${guide.category ? " · " + esc(guide.category) : ""}</p>
    <h1>${esc(guide.title)}</h1>
    <p class="byline">${guide.lastUpdated ? "Mis à jour le " + esc(guide.lastUpdated) : ""}${guide.author ? " · " + esc(guide.author) : ""}</p>
    <p class="intro">${esc(guide.intro)}</p>
  </header>

  <aside class="disclosure">
    ℹ️ <strong>Transparence —</strong> Cet article contient des liens affiliés. Un achat via ces liens peut générer une commission pour Cultura Sabauda, sans surcoût pour vous. Notre sélection reste indépendante (voir <a href="#methodo">méthodologie</a>).
  </aside>

  <section>
    <h2>Notre sélection en un coup d'œil</h2>
    <table class="picks">
      <thead><tr><th>Distinction</th><th>Produit</th><th>Note</th><th></th></tr></thead>
      <tbody>${picksRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Notre comparatif détaillé</h2>
    <div class="grid">${productCards}</div>
  </section>

  ${guide.buyingGuide ? `<section><h2>Comment bien choisir ?</h2><p>${esc(guide.buyingGuide)}</p></section>` : ""}

  <section id="methodo">
    <h2>Méthodologie</h2>
    ${guide.methodology ? `<p>${esc(guide.methodology)}</p>` : ""}
    ${guide.criteria?.length ? "<ul>" + guide.criteria.map((c) => `<li>${esc(c)}</li>`).join("") + "</ul>" : ""}
  </section>

  ${guide.faq?.length ? `<section><h2>Questions fréquentes</h2>${guide.faq.map((qa) => `<details><summary>${esc(qa.q)}</summary><p>${esc(qa.a)}</p></details>`).join("")}</section>` : ""}

  <footer class="legal">
    Les prix sont indicatifs et peuvent varier. Cultura Sabauda perçoit une commission d'affiliation sur certains achats réalisés via cette page. <a href="/affiliation">Politique d'affiliation</a>.
  </footer>
</main>
</body>
</html>`;
}

function list(items, cls, icon) {
  if (!Array.isArray(items) || !items.length) return "";
  return `<ul class="${cls}">${items.map((x) => `<li>${icon} ${esc(x)}</li>`).join("")}</ul>`;
}

function buildJsonLd(guide, canonical) {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: guide.title,
    url: canonical,
    itemListElement: guide.products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      ...(p.image ? { image: p.image } : {}),
    })),
  };
  if (Array.isArray(guide.faq) && guide.faq.length) {
    return [
      itemList,
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: guide.faq.map((qa) => ({
          "@type": "Question",
          name: qa.q,
          acceptedAnswer: { "@type": "Answer", text: qa.a },
        })),
      },
    ];
  }
  return itemList;
}

const CSS = `
:root{--accent:#1a4d8f;--ink:#1a1a1a;--muted:#666;--line:#e3e3e3;--bg:#fff}
*{box-sizing:border-box}
body{font-family:Georgia,'Times New Roman',serif;color:var(--ink);background:var(--bg);margin:0;line-height:1.6}
main{max-width:820px;margin:0 auto;padding:24px}
.kicker{text-transform:uppercase;letter-spacing:.08em;color:var(--accent);font-family:Arial,sans-serif;font-size:.8rem;font-weight:700;margin:0}
h1{font-size:2.2rem;line-height:1.15;margin:.2em 0}
h2{font-family:Arial,sans-serif;border-bottom:2px solid var(--accent);padding-bottom:.2em;margin-top:2em}
h3{margin:.4em 0}
.byline{color:var(--muted);font-size:.9rem;font-family:Arial,sans-serif}
.intro{font-size:1.15rem}
.disclosure{background:#f4f7fb;border-left:4px solid var(--accent);padding:12px 16px;font-family:Arial,sans-serif;font-size:.92rem;border-radius:4px}
table.picks{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:.95rem}
table.picks th,table.picks td{text-align:left;padding:10px;border-bottom:1px solid var(--line)}
table.picks a{color:var(--accent);font-weight:700;text-decoration:none}
.grid{display:grid;grid-template-columns:1fr;gap:20px}
.card{position:relative;border:1px solid var(--line);border-radius:10px;padding:20px}
.card .rank{position:absolute;top:-12px;left:-12px;background:var(--accent);color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-weight:700}
.card img{max-width:100%;height:auto;border-radius:6px}
.badge{display:inline-block;background:#fde68a;color:#7c5e00;font-family:Arial,sans-serif;font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}
.meta{color:var(--muted);font-family:Arial,sans-serif;font-size:.9rem}
.pros,.cons{list-style:none;padding:0;font-family:Arial,sans-serif;font-size:.92rem}
.cta{display:inline-block;margin-top:10px;background:var(--accent);color:#fff;font-family:Arial,sans-serif;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:6px}
details{border:1px solid var(--line);border-radius:6px;padding:10px 14px;margin:8px 0;font-family:Arial,sans-serif}
summary{cursor:pointer;font-weight:700}
.legal{color:var(--muted);font-size:.82rem;font-family:Arial,sans-serif;margin-top:3em;border-top:1px solid var(--line);padding-top:1em}
@media(min-width:640px){.grid{grid-template-columns:1fr 1fr}}
`;

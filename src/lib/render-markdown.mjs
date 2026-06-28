/**
 * Rendu d'un guide en Markdown (publiable dans WordPress, ou tout CMS Markdown).
 */
import { buildAffiliateLink } from "./affiliate.mjs";

const stars = (n) => {
  if (!n) return "";
  const full = Math.round(n);
  return "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full)) + ` (${n}/5)`;
};

export function renderMarkdown(guide, config) {
  const byId = Object.fromEntries(guide.products.map((p) => [p.id, p]));
  const L = [];

  L.push(`# ${guide.title}`);
  L.push("");
  if (guide.lastUpdated) L.push(`*Mis à jour le ${guide.lastUpdated} — par ${guide.author || "la rédaction Cultura Sabauda"}*`);
  L.push("");
  L.push(`> ${guide.intro}`);
  L.push("");

  // Encadré transparence (conformité)
  L.push("> ℹ️ **Transparence** — Cet article contient des liens affiliés. Si vous achetez via ces liens, Cultura Sabauda perçoit une commission, sans surcoût pour vous. Cela ne change pas notre sélection, fondée sur des critères objectifs. [En savoir plus](#méthodologie).");
  L.push("");

  // Sélection en un coup d'œil
  L.push("## Notre sélection en un coup d'œil");
  L.push("");
  L.push("| Distinction | Produit | Note | Voir l'offre |");
  L.push("| --- | --- | --- | --- |");
  for (const pick of guide.picks) {
    const p = byId[pick.productRef];
    const link = buildAffiliateLink(p.affiliate, config);
    L.push(`| **${pick.badge}** | ${p.name} | ${stars(p.rating)} | [Voir le prix](${link.href}) |`);
  }
  L.push("");

  // Fiches produit
  L.push("## Notre comparatif détaillé");
  L.push("");
  guide.products.forEach((p, i) => {
    const link = buildAffiliateLink(p.affiliate, config);
    const pickFor = guide.picks.find((pk) => pk.productRef === p.id);
    L.push(`### ${i + 1}. ${p.name}${pickFor ? ` — *${pickFor.badge}*` : ""}`);
    L.push("");
    if (p.image) L.push(`![${p.name}](${p.image})`);
    L.push("");
    const meta = [];
    if (p.brand) meta.push(`**Marque :** ${p.brand}`);
    if (p.price) meta.push(`**Prix indicatif :** ${p.price}`);
    if (p.rating) meta.push(`**Note :** ${stars(p.rating)}`);
    if (meta.length) { L.push(meta.join(" · ")); L.push(""); }
    if (p.summary) { L.push(p.summary); L.push(""); }
    if (Array.isArray(p.pros) && p.pros.length) {
      L.push("**On aime :**");
      p.pros.forEach((x) => L.push(`- ✅ ${x}`));
      L.push("");
    }
    if (Array.isArray(p.cons) && p.cons.length) {
      L.push("**On aime moins :**");
      p.cons.forEach((x) => L.push(`- ⚠️ ${x}`));
      L.push("");
    }
    L.push(`👉 **[Voir le prix sur ${labelFor(link.program)}](${link.href})**`);
    L.push("");
    L.push("---");
    L.push("");
  });

  // Guide d'achat
  if (guide.buyingGuide) {
    L.push("## Comment bien choisir ?");
    L.push("");
    L.push(guide.buyingGuide);
    L.push("");
  }

  // Critères / méthodologie
  L.push("## Méthodologie");
  L.push("");
  if (guide.methodology) { L.push(guide.methodology); L.push(""); }
  if (Array.isArray(guide.criteria) && guide.criteria.length) {
    L.push("Nous évaluons chaque produit selon les critères suivants :");
    guide.criteria.forEach((c) => L.push(`- ${c}`));
    L.push("");
  }

  // FAQ
  if (Array.isArray(guide.faq) && guide.faq.length) {
    L.push("## Questions fréquentes");
    L.push("");
    guide.faq.forEach((qa) => {
      L.push(`**${qa.q}**`);
      L.push("");
      L.push(qa.a);
      L.push("");
    });
  }

  // Pied de page conformité
  L.push("---");
  L.push("");
  L.push("*Les prix sont donnés à titre indicatif et peuvent varier. Cultura Sabauda peut percevoir une commission d'affiliation sur les achats réalisés via les liens de cette page. Mentions complètes : voir notre [politique d'affiliation](/affiliation).*");
  L.push("");

  return L.join("\n");
}

function labelFor(program) {
  return { amazon: "Amazon", awin: "le marchand", direct: "la boutique" }[program] || "le marchand";
}

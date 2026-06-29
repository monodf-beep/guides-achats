/**
 * Construction de liens d'affiliation trackés, multi-programmes.
 *
 * Programmes supportés :
 *  - amazon : Amazon Partenaires (lien /dp/{asin}?tag=...)
 *  - awin   : Awin (deeplink via la gateway cread.php)
 *  - direct : programme marchand direct (URL + paramètres UTM)
 *
 * Les identifiants viennent (par ordre de priorité) :
 *   1. variables d'environnement (AMAZON_PARTNER_TAG, AWIN_AFFILIATE_ID, SITE_BASE_URL)
 *   2. config/affiliation.json
 */

/**
 * Ajoute des paramètres UTM à une URL.
 */
export function withUtm(url, utm) {
  if (!utm) return url;
  const u = new URL(url);
  if (utm.source) u.searchParams.set("utm_source", utm.source);
  if (utm.medium) u.searchParams.set("utm_medium", utm.medium);
  if (utm.campaign) u.searchParams.set("utm_campaign", utm.campaign);
  return u.toString();
}

/**
 * Construit le lien affilié final pour un produit.
 * @param {object} affiliate - bloc "affiliate" du produit (program, asin/url/awinMerchantId...)
 * @param {object} config - config d'affiliation résolue (cf. resolveConfig)
 * @returns {{href: string, rel: string, program: string}}
 */
export function buildAffiliateLink(affiliate, config) {
  if (!affiliate || !affiliate.program) {
    throw new Error("Produit sans bloc 'affiliate.program'.");
  }
  const program = affiliate.program;
  // rel recommandé pour la conformité (déclaration de lien sponsorisé) + nofollow
  const rel = "sponsored nofollow noopener";

  switch (program) {
    case "amazon": {
      const cfg = config.amazon || {};
      if (!affiliate.asin) throw new Error(`Produit Amazon sans 'asin' : ${affiliate.url || ""}`);
      const tag = cfg.partnerTag;
      if (!tag || /REMPLACER|monidentifiant/i.test(tag)) {
        console.warn("⚠️  Tag Amazon Partenaires non configuré (AMAZON_PARTNER_TAG). Lien généré sans commission valide.");
      }
      const marketplace = cfg.marketplace || "amazon.fr";
      const u = new URL(`https://www.${marketplace}/dp/${affiliate.asin}/`);
      if (tag) u.searchParams.set("tag", tag);
      if (cfg.linkCode) u.searchParams.set("linkCode", cfg.linkCode);
      u.searchParams.set("language", "fr_FR");
      return { href: u.toString(), rel, program };
    }

    case "awin": {
      const cfg = config.awin || {};
      if (!affiliate.url) throw new Error("Produit Awin sans 'url' marchande cible.");
      if (!affiliate.awinMerchantId) throw new Error("Produit Awin sans 'awinMerchantId' (awinmid).");
      const gateway = cfg.gateway || "https://www.awin1.com/cread.php";
      const u = new URL(gateway);
      u.searchParams.set("awinmid", affiliate.awinMerchantId);
      u.searchParams.set("awinaffid", cfg.affiliateId || "");
      u.searchParams.set("ued", withUtm(affiliate.url, config.utm));
      return { href: u.toString(), rel, program };
    }

    case "direct": {
      if (!affiliate.url) throw new Error("Produit direct sans 'url'.");
      return { href: withUtm(affiliate.url, config.utm), rel, program };
    }

    // Partenaire LOCAL (marque hors plateforme). Si un traceur est configuré
    // (config.tracker.base), le lien passe par /go (compte le clic puis redirige) ;
    // sinon, lien direct avec UTM. Un éventuel code promo est porté par affiliate.code.
    case "local": {
      if (!affiliate.url) throw new Error("Produit local sans 'url'.");
      const target = withUtm(affiliate.url, config.utm);
      const base = config.tracker?.base;
      if (base) {
        const u = new URL("/go", base);
        u.searchParams.set("to", target);
        if (affiliate.merchant) u.searchParams.set("m", affiliate.merchant);
        return { href: u.toString(), rel, program };
      }
      return { href: target, rel, program };
    }

    default:
      throw new Error(`Programme d'affiliation inconnu : '${program}'`);
  }
}

/**
 * Libellé du marchand pour le bouton « Acheter sur … ».
 * Priorité : affiliate.merchant explicite > déduction par programme.
 */
export function merchantLabel(affiliate) {
  if (affiliate?.merchant) return affiliate.merchant;
  if (affiliate?.program === "amazon") return "Amazon";
  if (affiliate?.program === "local") return "la boutique";
  return "le marchand";
}

/**
 * Fusionne config JSON + variables d'environnement (env prioritaire).
 */
export function resolveConfig(fileConfig, env = process.env) {
  const cfg = structuredClone(fileConfig);
  if (env.AMAZON_PARTNER_TAG) {
    cfg.amazon = cfg.amazon || {};
    cfg.amazon.partnerTag = env.AMAZON_PARTNER_TAG;
  }
  if (env.AWIN_AFFILIATE_ID) {
    cfg.awin = cfg.awin || {};
    cfg.awin.affiliateId = env.AWIN_AFFILIATE_ID;
    cfg.awin.enabled = true; // activer Awin dès que l'ID est dans .env (survit aux git reset)
  }
  if (env.SITE_BASE_URL) {
    cfg.site = cfg.site || {};
    cfg.site.baseUrl = env.SITE_BASE_URL;
  }
  if (env.TRACKER_BASE_URL) {
    cfg.tracker = cfg.tracker || {};
    cfg.tracker.base = env.TRACKER_BASE_URL;
  }
  return cfg;
}

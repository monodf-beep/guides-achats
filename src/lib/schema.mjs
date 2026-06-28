/**
 * Validation légère (sans dépendance) du JSON d'un guide.
 * Lève une erreur explicite si le guide est mal formé, pour éviter
 * de publier un contenu cassé ou un lien affilié invalide.
 */

const REQUIRED_GUIDE_FIELDS = ["slug", "title", "category", "year", "intro", "products", "picks"];
const REQUIRED_PRODUCT_FIELDS = ["id", "name", "affiliate"];

export function validateGuide(guide) {
  const errors = [];

  for (const f of REQUIRED_GUIDE_FIELDS) {
    if (guide[f] === undefined || guide[f] === null || guide[f] === "") {
      errors.push(`Champ guide manquant : "${f}"`);
    }
  }

  if (!Array.isArray(guide.products) || guide.products.length === 0) {
    errors.push("Le guide doit contenir au moins un produit dans 'products'.");
  } else {
    const ids = new Set();
    guide.products.forEach((p, i) => {
      for (const f of REQUIRED_PRODUCT_FIELDS) {
        if (p[f] === undefined || p[f] === null || p[f] === "") {
          errors.push(`products[${i}] : champ manquant "${f}"`);
        }
      }
      if (p.id) {
        if (ids.has(p.id)) errors.push(`products[${i}] : id en double "${p.id}"`);
        ids.add(p.id);
      }
      if (p.affiliate && !p.affiliate.program) {
        errors.push(`products[${i}] (${p.name}) : 'affiliate.program' manquant`);
      }
    });

    // Les picks doivent référencer des produits existants
    if (Array.isArray(guide.picks)) {
      guide.picks.forEach((pk, i) => {
        if (!pk.productRef) errors.push(`picks[${i}] : 'productRef' manquant`);
        else if (!ids.has(pk.productRef)) {
          errors.push(`picks[${i}] : référence un produit inexistant "${pk.productRef}"`);
        }
        if (!pk.badge) errors.push(`picks[${i}] : 'badge' manquant`);
      });
    }
  }

  if (errors.length) {
    throw new Error("Guide invalide :\n  - " + errors.join("\n  - "));
  }
  return true;
}

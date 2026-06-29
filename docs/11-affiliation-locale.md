# 11 — Affiliation avec les marques locales (hors plateformes)

Comment monétiser des recommandations vers des **boutiques/marques locales** qui ne sont pas sur
Amazon, Awin, etc. C'est plus rentable (pas d'intermédiaire) ; le seul enjeu est le **tracking**.

## Le principe (le « comment faire »)

1. **Accord commercial** avec la marque : taux de commission (% du panier ou montant fixe), durée
   d'attribution, modalités de paiement (facture mensuelle/trimestrielle). Un simple échange écrit
   (e-mail/contrat léger) suffit pour démarrer.
2. **Méthode de tracking** — comment savoir qu'une vente vient de toi :
   - **A. Code promo dédié** *(recommandé)* : la marque crée un code unique (`CULTURASABAUDA10`).
     Toute vente avec ce code = commission. Zéro technique des deux côtés ; bonus : la réduction
     améliore ta conversion.
   - **B. Redirection traçante** *(auto-hébergée sur le VPS)* : tes boutons passent par
     `https://<dashboard>/go?...` qui **compte le clic** puis redirige vers la boutique. Tu connais
     le volume de clics par marque, même si la marque n'a aucun outil.
   - **C. Paramètres UTM** : pour les marques avec un minimum d'analytics (elles voient les ventes
     attribuées dans leur Google Analytics).
3. **Réconciliation** : on combine en général **A + B** — le code attribue les ventes, la
   redirection donne les clics. La marque confirme les ventes ; tu saisis la commission dans le
   tableau de bord (suivi des revenus).

## Configurer le traceur de clics

Le traceur est le **serveur du tableau de bord** lui-même (route publique `/go`).

```bash
# .env — base publique du dashboard
TRACKER_BASE_URL=https://dashboard.culturasabauda.eu
```
Sans `TRACKER_BASE_URL`, les liens « local » pointent directement vers la boutique (avec UTM), sans
comptage de clic.

**Sécurité (anti open-redirect)** : renseigne la liste blanche des domaines partenaires dans
`config/affiliation.json` → `tracker.allowedHosts` (ex. `["boutique-x.fr","www.boutique-y.fr"]`).
Si la liste est non vide, `/go` ne redirige que vers ces hôtes.

## Déclarer un produit de partenaire local dans un guide

```json
{
  "id": "vase-artisanal",
  "name": "Vase artisanal en céramique",
  "brand": "Atelier Sabaudo",
  "price": "45 €",
  "affiliate": {
    "program": "local",
    "url": "https://atelier-sabaudo.fr/vase-ceramique",
    "merchant": "Atelier Sabaudo",
    "code": "CULTURASABAUDA10"
  }
}
```
- `program: "local"` → le lien passe par `/go` si le traceur est configuré.
- `merchant` → nom affiché sur le bouton (« Acheter sur Atelier Sabaudo »).
- `code` *(optionnel)* → affiche un encadré « 🎟️ Code partenaire : CULTURASABAUDA10 ».

## Suivi dans le tableau de bord

- KPI **« Clics affiliés »** = total des clics passés par `/go` (`data/clicks.json`).
- Les ventes/commissions se saisissent dans **Suivi des revenus** (`data/revenue.json`).

## Conformité (rappel)

Les obligations restent les mêmes que pour Amazon (cf. `02-conformite-legale.md`) : mention de
transparence, `rel="sponsored"` sur les liens (déjà appliqué), et — si tu touches une rémunération
fixe d'une marque pour un placement — le signaler comme **partenariat** en plus de l'affiliation.

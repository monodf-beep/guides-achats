# 01 — Programmes d'affiliation & tracking

## Vue d'ensemble

L'outil construit automatiquement les liens trackés à partir du bloc `affiliate` de chaque produit
et de la configuration `config/affiliation.json` (surchargée par les variables d'environnement).

## Programmes supportés

### 1. Amazon Partenaires (par défaut)

- **Inscription** : https://partenaires.amazon.fr
- **Identifiant** : un *tag de suivi* de la forme `monsite-21`.
- **Configuration** : variable `AMAZON_PARTNER_TAG` (recommandé) ou `config/affiliation.json` → `amazon.partnerTag`.
- **Champ produit** : `"affiliate": { "program": "amazon", "asin": "B0XXXXXXX" }`
  (l'ASIN se trouve dans l'URL produit Amazon ou la fiche « Informations »).
- **Lien généré** : `https://www.amazon.fr/dp/{ASIN}/?tag={TAG}&linkCode=ll1&language=fr_FR`

> ⚠️ **Règle Amazon importante** : la première vente doit intervenir dans les **180 jours**
> suivant l'inscription, sinon le compte est clôturé. Commissions ~1 à 10 % selon catégorie.

### 2. Awin (Fnac, Darty, Boulanger, Cdiscount, etc.)

- **Inscription** : https://www.awin.com (validation requise, parfois frais d'entrée remboursés).
- **Identifiant** : un *affiliate ID* éditeur (numérique).
- **Configuration** : il suffit de définir `AWIN_AFFILIATE_ID` dans `.env` — cela renseigne
  l'identifiant **et active Awin automatiquement** (pas besoin de toucher au `config/affiliation.json`
  versionné, donc rien à ré-appliquer après un `git reset --hard`).
- **Champ produit** :
  ```json
  "affiliate": { "program": "awin", "url": "https://www.fnac.com/...", "awinMerchantId": "12345" }
  ```
- **Lien généré** : deeplink via la gateway `awin1.com/cread.php`.

### 3. Marchand direct

Pour un partenariat négocié en direct (meilleures marges).

- **Champ produit** : `"affiliate": { "program": "direct", "url": "https://boutique.fr/produit?ref=..." }`
- **Lien généré** : l'URL telle quelle, enrichie des paramètres **UTM** (`config/affiliation.json` → `utm`).

## Configuration des identifiants

Ordre de priorité : **variables d'environnement** > `config/affiliation.json`.

```bash
# .env (non versionné — voir .env.example)
AMAZON_PARTNER_TAG=culturasab-21
AWIN_AFFILIATE_ID=123456
```

> 🔒 **Ne jamais committer de vrais identifiants/secrets.** `config/affiliation.json` contient des
> placeholders ; le fichier `.env` est dans `.gitignore`.

## Tracking & attribution

- Tous les liens sortants portent `rel="sponsored nofollow noopener"` (conformité + sécurité).
- Les paramètres **UTM** permettent de suivre la performance dans Google Analytics / Matomo
  (source = `culturasabauda`, medium = `affiliate`, campaign = `guides-achat`).
- Suivi des revenus : tableau de bord natif de chaque programme (Amazon, Awin).

## Bonnes pratiques de rémunération

1. **Diversifier** les programmes pour ne pas dépendre d'un seul (risque de fermeture de compte).
2. Privilégier les produits à **panier moyen élevé** quand la commission est en %.
3. Mettre à jour les **ASIN/URL morts** (produit retiré = lien cassé = perte sèche).
4. Mesurer le **revenu par guide** pour réinvestir sur les thématiques rentables.

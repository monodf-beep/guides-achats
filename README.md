# Guides d'achat — Cultura Sabauda

Outil et cadre éditorial pour **publier des guides d'achat affiliés** (à la manière des
[Guides d'achat du Monde](https://www.lemonde.fr/guides-d-achat/)) et générer des **commissions
d'affiliation**, au service du financement des projets de Cultura Sabauda.

> **Principe** : on rédige des comparatifs de produits utiles à notre audience (« Les meilleur·e·s X »),
> on insère des **liens affiliés trackés** vers les marchands, et chaque achat réalisé via ces liens
> rapporte une commission — **sans surcoût pour le lecteur**.

---

## 📦 Ce que contient ce dépôt

| Dossier | Contenu |
| --- | --- |
| `src/generate.mjs` | Le **générateur** : transforme un guide décrit en JSON → page Markdown + HTML prêtes à publier |
| `src/publish-wordpress.mjs` | **Publication WordPress** depuis le JSON (API REST) |
| `src/seo/` | **SEO** : `intent.mjs` (intentions d'achat + brief) et `recommend.mjs` (reco par profil) |
| `src/ai/` | **Rédaction assistée par Claude** (`draft-guide.mjs`) |
| `data/guides/` | Les **guides** et **squelettes** (`_*.json`) sous forme de données structurées |
| `config/` | Configuration des **programmes d'affiliation** (tags, identifiants) |
| `output/` | Les fichiers **générés** (Markdown + HTML) et **briefs SEO** |
| `docs/` | La **documentation** : stratégie, affiliation, conformité, gabarit, SEO, workflow, roadmap, analyse Le Monde, SEO & perso, IA |

## 🚀 Démarrage rapide

Aucune dépendance à installer (Node.js ≥ 18 suffit).

```bash
# 1. Configurer son identifiant affilié (recommandé : variable d'environnement)
cp .env.example .env        # puis renseigner AMAZON_PARTNER_TAG

# 2. Générer le guide d'exemple
npm run example
#   → output/meilleures-gourdes-reutilisables.md  (à coller dans WordPress)
#   → output/meilleures-gourdes-reutilisables.html (aperçu autonome dans le navigateur)

# 3. Générer tous les guides
npm run build
```

## ✍️ Créer un nouveau guide

1. Copier `data/guides/meilleures-gourdes-reutilisables.json` sous un nouveau nom.
2. Remplir le titre, l'intro, les `products` (avec leur bloc `affiliate`) et les `picks`.
3. Lancer `node src/generate.mjs data/guides/mon-guide.json`.
4. Relire avec la [checklist qualité & conformité](docs/03-gabarit-editorial.md).
5. Publier le Markdown sur la plateforme cible (voir [workflow](docs/05-workflow-publication.md)).

Le **gabarit d'un guide** et tous les champs JSON sont détaillés dans
[`docs/03-gabarit-editorial.md`](docs/03-gabarit-editorial.md).

## 🔗 Programmes d'affiliation supportés

| Programme | Champ JSON requis | Statut |
| --- | --- | --- |
| **Amazon Partenaires** | `affiliate.asin` | ✅ par défaut |
| **Awin** (Fnac, Darty, Boulanger…) | `affiliate.url` + `affiliate.awinMerchantId` | ⚙️ à activer |
| **Marchand direct** | `affiliate.url` | ✅ |

Détails et stratégie : [`docs/01-affiliation.md`](docs/01-affiliation.md).

## ⚖️ Conformité (important)

Les liens affiliés imposent des **obligations légales** en France/UE : mention de transparence
visible, attribut `rel="sponsored"`, respect du RGPD et des règles Amazon Partenaires. Tout est
intégré au générateur et détaillé dans [`docs/02-conformite-legale.md`](docs/02-conformite-legale.md).
**À lire avant toute publication.**

## 🤖 SEO, recommandation & IA

```bash
# Trouver les intentions d'achat d'un mot-clé + écrire un brief SEO
node src/seo/intent.mjs "liseuse" --category "Livres & lecture" --brief

# Recommander des guides selon les centres d'intérêt d'un visiteur (règle-à-règle)
node src/seo/recommend.mjs --interests "Livres & lecture, Visite & patrimoine"

# Rédiger un brouillon de guide avec Claude (npm i @anthropic-ai/sdk + ANTHROPIC_API_KEY)
node src/ai/draft-guide.mjs data/guides/_sujet-meilleures-liseuses.json

# Publier sur WordPress (API REST — voir .env.example)
node src/publish-wordpress.mjs data/guides/mon-guide.json --dry-run
```

Détails : [SEO & personnalisation](docs/08-seo-et-personnalisation.md) · [IA / Claude](docs/09-ia-claude.md).
La rédaction IA n'invente **jamais** les ASIN/prix (conformité) et produit un **brouillon à relire**.

## 🗺️ Décisions à valider (hypothèses actuelles)

Choix arrêtés / à confirmer :

- **Plateforme de publication** : ✅ **WordPress** (le générateur produit du Markdown/HTML
  collable, automatisation via l'API REST WordPress prévue en phase 2).
- **Affiliation prioritaire** : Amazon Partenaires (démarrage simple) + multi-programmes *(à confirmer)*.
- **Thématique** : angle « culture & patrimoine » recommandé, gabarit généraliste *(à confirmer)*.

Voir [`docs/06-roadmap.md`](docs/06-roadmap.md) pour le plan par phases.

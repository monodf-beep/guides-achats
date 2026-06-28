# 09 — Rédaction assistée par l'IA (Claude)

Oui, l'outil intègre une couche IA — c'est là que Claude apporte le plus de valeur : **accélérer la
rédaction** des guides tout en gardant l'humain aux commandes pour la qualité et la conformité.

## Ce que fait (et ne fait pas) l'IA

| ✅ Claude rédige | ❌ Claude ne génère jamais |
| --- | --- |
| Chapô, méthodologie, critères | Les **ASIN** / URL marchandes |
| Résumés produit, points forts/faibles | Les **prix** |
| Distinctions (« picks »), FAQ | Les notes chiffrées |
| Sections de confiance, guide d'achat | (données fournies et **vérifiées par un humain**) |

Pourquoi cette séparation : les ASIN et prix doivent être **exacts** (lien d'affiliation valide,
règle Amazon Partenaires, sincérité). On ne laisse donc pas le modèle les inventer — ils viennent
du squelette rempli à la main. La sortie est un **brouillon** (`<slug>.draft.json`) à relire.

## Outil : `src/ai/draft-guide.mjs`

```bash
# 1. Installer la dépendance (séparée du cœur de l'outil, qui reste sans dépendance)
npm i @anthropic-ai/sdk

# 2. Configurer la clé API
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env

# 3. Préparer un squelette (produits + ASIN/prix vérifiés) — voir data/guides/_modele.json
#    puis générer le brouillon éditorial :
node src/ai/draft-guide.mjs data/guides/_sujet-meilleures-liseuses.json
#    → data/guides/_sujet-meilleures-liseuses.draft.json

# 4. RELIRE le brouillon (checklists docs/02 et docs/03), renommer sans le préfixe _,
#    puis générer la page :
node src/generate.mjs data/guides/meilleures-liseuses.json
```

## Détails techniques

- Modèle : **`claude-opus-4-8`** (le plus capable), *adaptive thinking* activé.
- **Sorties structurées** (`output_config.format`) : la réponse est validée contre un schéma JSON,
  donc directement exploitable, sans parsing fragile.
- Le schéma ne contient **que** des champs éditoriaux (ni asin, ni prix) — garde-fou de conformité.
- Gestion du `stop_reason: "refusal"` et des erreurs SDK typées.
- Fusion : l'éditorial est greffé sur le squelette, les données humaines (affiliate/price) restent
  intactes ; chaque produit est fusionné par `id`.

## Pistes d'extension IA (plus tard)

- **Idéation** : Claude propose des sujets à partir des briefs SEO (`src/seo/intent.mjs`).
- **Mise à jour** : détecter les guides à rafraîchir et proposer les ajustements.
- **Contrôle qualité** : un second passage qui vérifie ton, conformité et complétude avant publication.
- **Multilingue** : traduction FR ↔ IT pour l'audience Sabauda.

> Bonne pratique : l'IA **assiste**, elle ne publie pas. Un relecteur humain valide toujours avant
> mise en ligne (qualité éditoriale + conformité légale).

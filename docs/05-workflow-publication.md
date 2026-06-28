# 05 — Workflow de publication

Process de bout en bout, de l'idée au guide publié et suivi.

## Étapes

```
1. IDÉATION        → choisir un sujet (mot-clé d'intention d'achat, cf. 04-seo.md)
2. RECHERCHE       → sélectionner 3–8 produits, relever ASIN/URL, prix, forces/faiblesses
3. RÉDACTION       → créer data/guides/<slug>.json (gabarit 03-gabarit-editorial.md)
4. GÉNÉRATION      → node src/generate.mjs data/guides/<slug>.json
5. RELECTURE       → checklist qualité (03) + checklist conformité (02)
6. PUBLICATION     → coller le Markdown sur la plateforme cible (Shopify / WordPress / statique)
7. INDEXATION      → soumettre l'URL à Google Search Console, ajouter au maillage interne
8. SUIVI           → mesurer trafic (Analytics) et revenus (tableau de bord affilié)
9. MISE À JOUR     → rafraîchir prix/classement/date tous les 3–6 mois
```

## Publier le résultat selon la plateforme

### Option A — Shopify (blog)
1. Admin Shopify → **Boutique en ligne › Articles de blog › Créer**.
2. Basculer l'éditeur en mode **HTML** (`<>`), coller le contenu de `output/<slug>.html`
   (corps `<main>`), ou convertir le `.md` via l'éditeur.
3. Renseigner titre SEO, méta-description, slug `/guides-achat/<slug>`, image à la une.
4. Vérifier l'affichage des liens `rel="sponsored"` et de l'encadré transparence.

> Une automatisation via l'API Shopify (création d'article depuis le JSON) est prévue en phase 2
> (cf. `06-roadmap.md`) — les outils MCP Shopify sont disponibles dans cet environnement.

### Option B — WordPress
Coller le `.md` (bloc Markdown / Gutenberg) ou le HTML. Renseigner les champs SEO (Rank Math / Yoast).

### Option C — Site statique (Astro / Next.js)
Committer le `.md` dans le dossier `content/` du site → build & déploiement automatique
(GitHub Pages / Vercel). C'est l'option la plus « tout-en-un dans GitHub ».

## Rôles (si équipe)

| Rôle | Responsabilité |
| --- | --- |
| Éditeur | Idéation, choix des sujets, validation finale |
| Rédacteur | Recherche produits, rédaction du JSON |
| Référent conformité | Vérifie mentions légales et règles affiliation |
| Référent technique | Génération, publication, suivi analytics |

## Cadence recommandée

- **Phase de lancement** : 1 guide / semaine pendant 8–12 semaines (atteindre une masse critique).
- **Régime de croisière** : 1–2 nouveaux guides/mois + mise à jour des guides existants.

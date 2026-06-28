# 05 — Workflow de publication

Process de bout en bout, de l'idée au guide publié et suivi.

## Étapes

```
1. IDÉATION        → choisir un sujet (mot-clé d'intention d'achat, cf. 04-seo.md)
2. RECHERCHE       → sélectionner 3–8 produits, relever ASIN/URL, prix, forces/faiblesses
3. RÉDACTION       → créer data/guides/<slug>.json (gabarit 03-gabarit-editorial.md)
4. GÉNÉRATION      → node src/generate.mjs data/guides/<slug>.json
5. RELECTURE       → checklist qualité (03) + checklist conformité (02)
6. PUBLICATION     → coller le contenu dans WordPress (Articles › Ajouter)
7. INDEXATION      → soumettre l'URL à Google Search Console, ajouter au maillage interne
8. SUIVI           → mesurer trafic (Analytics) et revenus (tableau de bord affilié)
9. MISE À JOUR     → rafraîchir prix/classement/date tous les 3–6 mois
```

## Publier le résultat sur WordPress (plateforme retenue)

### Méthode manuelle (immédiate)
1. WordPress → **Articles › Ajouter**.
2. Ajouter un bloc **HTML personnalisé** et coller le corps `<main>` de
   `output/<slug>.html` (rendu fidèle, encadré transparence + boutons inclus),
   **ou** un bloc **Markdown** et coller `output/<slug>.md` (si le bloc Markdown
   ou l'éditeur classique est activé).
3. Créer la catégorie/rubrique **« Guides d'achat »** et y ranger l'article.
4. Renseigner le **slug** `guides-achat/<slug>`, le titre SEO et la
   méta-description (extension **Rank Math** ou **Yoast SEO**).
5. Définir l'**image à la une**.
6. Vérifier que les liens portent bien `rel="sponsored nofollow"` et que
   l'encadré de transparence est visible.

> ⚠️ Selon le thème, les données structurées Schema.org (JSON-LD) du `.html`
> peuvent ne pas être reprises si vous collez seulement le `<main>`. Dans ce cas,
> laisser Rank Math/Yoast gérer le balisage, **ou** coller aussi le bloc
> `<script type="application/ld+json">` via un bloc HTML.

### Méthode automatisée (phase 2)
Publication directe via l'**API REST WordPress** (`POST /wp-json/wp/v2/posts`)
depuis le JSON : création de l'article, catégorie, slug, image à la une et
métadonnées SEO en une commande. Authentification par **mot de passe
d'application** WordPress. Voir `06-roadmap.md`.

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

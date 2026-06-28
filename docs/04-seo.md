# 04 — SEO (référencement)

> Le SEO est le **moteur de revenu n°1** de ce projet : pas de trafic organique → pas de clics
> affiliés → pas de commission. Chaque guide doit être pensé pour le référencement.

## 1. Recherche de mots-clés (avant d'écrire)

Cibler des requêtes à **intention d'achat** (« commercial / transactionnel ») :

- « meilleure [produit] », « meilleur [produit] 2026 », « [produit] pas cher »
- « [produit A] vs [produit B] », « comparatif [produit] »
- « quel [produit] choisir »

Outils : Google Suggest / « Autres questions posées », Google Keyword Planner, Ubersuggest,
AnswerThePublic. Viser des mots-clés **à concurrence atteignable** (longue traîne) au début.

## 2. On-page (intégré au générateur)

✅ Déjà produit dans le HTML généré :

- `<title>` et `<meta name="description">` optimisés
- Balise **canonique** (`<link rel="canonical">`)
- Balises **Open Graph** (partage réseaux sociaux)
- **Données structurées Schema.org** : `ItemList` (sélection) + `FAQPage` (FAQ) → éligibilité aux
  *rich results* Google
- Structure Hn cohérente (un seul `<h1>`, `<h2>` par section)
- Images en `loading="lazy"` avec `alt`

## 3. À compléter côté plateforme de publication

- **URL propre** : `/guides-achat/{slug}` (slug = mot-clé principal)
- **Maillage interne** : lier les guides entre eux + depuis la page « Tous nos guides »
- **Sitemap.xml** et indexation (Google Search Console)
- **Performance** : images compressées (WebP), Core Web Vitals au vert
- **Fraîcheur** : mettre à jour la date et le classement régulièrement (Google valorise la fraîcheur
  sur les requêtes « 2026 »)

## 4. Architecture de contenu recommandée

```
/guides-achat/                      ← page hub (liste tous les guides, comme Le Monde)
  /guides-achat/meilleures-gourdes-reutilisables
  /guides-achat/meilleurs-…
```

Regrouper les guides d'une même thématique en **clusters** (cocon sémantique) + un article « pilier »
qui les relie → renforce l'autorité SEO du site sur la thématique.

## 5. Erreurs à éviter

- Contenu mince ou dupliqué (copier les descriptions Amazon) → pénalité.
- Trop de liens affiliés sans valeur ajoutée rédactionnelle.
- Oublier `rel="sponsored"` (vu en conformité) — impacte aussi le SEO.
- Négliger le mobile (la majorité du trafic).

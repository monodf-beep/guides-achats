# 08 — Intentions d'achat (SEO) & personnalisation

Deux briques distinctes, à ne pas confondre — l'une côté contenu (hors-ligne), l'autre côté site
(à l'exécution).

---

## A. Recherche d'intentions d'achat — à faire maintenant

**Objectif** : repérer les requêtes à intention d'achat pour décider *quels guides écrire en
priorité*, et structurer chaque guide pour les capter. C'est le carburant du pipeline éditorial.

### Outil : `src/seo/intent.mjs`

Génère, à partir d'un mot-clé « graine », une **matrice d'intentions** (transactionnel, prix,
décision, fraîcheur, usage), des **titres candidats** et un **brief SEO** prêt à guider la rédaction.

```bash
node src/seo/intent.mjs "liseuse" --category "Livres & lecture" --year 2026 --brief
#   → affiche la matrice + écrit output/briefs/brief-liseuse.md
```

100 % hors-ligne (modificateurs FR). À enrichir ensuite avec des **volumes réels** :
- Google Search Console (requêtes qui amènent déjà du trafic)
- Google Keyword Planner / Ubersuggest (volumes + concurrence)
- « Autres questions posées » et Google Suggest (longue traîne, FAQ)

> Règle d'or : viser d'abord la **longue traîne peu concurrentielle** (« meilleure liseuse pour
> grands lecteurs » plutôt que « liseuse »), où un site jeune peut se classer.

### Workflow recommandé
1. Lister 10-15 graines alignées avec la niche (cf. `00-strategie.md`).
2. `node src/seo/intent.mjs "<graine>" --brief` pour chacune.
3. Prioriser selon volume × intention × faisabilité.
4. Rédiger le squelette (`data/guides/`), puis rédaction (manuelle ou `src/ai/draft-guide.mjs`).

---

## B. Personnalisation par profil visiteur — par étapes

**Objectif** : « pousser les bons articles » à un visiteur selon son profil. C'est un moteur de
recommandation. Approche progressive recommandée :

### Étape 1 — Règle-à-règle (livré : `src/seo/recommend.mjs`)
Classe les guides existants par **affinité de catégorie** avec les centres d'intérêt déclarés.
Aucune donnée sensible, déployable tout de suite.

```bash
node src/seo/recommend.mjs --interests "Livres & lecture, Visite & patrimoine" --limit 3
```

La fonction `rankGuides(guides, interests, limit)` est importable côté serveur (WordPress headless,
ou un petit endpoint) pour afficher « Nos guides pour vous » selon les préférences d'un membre.

### Étape 2 — Comportemental (plus tard, quand il y a du trafic)
Recommander selon l'**historique de navigation** (guides vus, catégories cliquées). N'a de sens
qu'avec du volume — inutile au lancement.

### Étape 3 — Personnalisé / prédictif (optionnel)
Modèle de recommandation plus fin (filtrage collaboratif, scoring). À n'envisager qu'une fois les
volumes et la valeur démontrés.

### ⚠️ RGPD / CNIL — à cadrer dès qu'on personnalise
- Le **profilage** d'un visiteur identifié exige une **base légale** (consentement explicite le
  plus souvent) et une information claire.
- Préférer des préférences **déclarées** (le membre choisit ses centres d'intérêt) au pistage
  implicite : plus simple, plus respectueux, et l'étape 1 suffit.
- Documenter la finalité dans la **politique de confidentialité** ; permettre de modifier/supprimer
  son profil.

---

## C. Et l'IA (Claude) dans tout ça ?

Claude accélère la brique A (rédaction des guides à partir d'intentions) — voir
`docs/09-ia-claude.md` et `src/ai/draft-guide.mjs`. Pour la brique B, l'IA n'est pas nécessaire au
départ : le règle-à-règle suffit ; un modèle ML ne se justifie qu'à l'étape 3.

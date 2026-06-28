# 07 — Analyse de structure : lemonde.fr/guides-d-achat/

> Relevé effectué le 28 juin 2026 via session navigateur (non bloquée côté client).
> Sert de référence pour notre gabarit éditorial (`03-gabarit-editorial.md`) et le générateur.

---

## 1. Header / titre de rubrique

| Élément | Valeur exacte |
|---|---|
| Titre principal (H1, lien) | **« GUIDES D'ACHAT »** — lien vers `/guides-d-achat/` |
| Sous-titre / chapô de rubrique | « Les meilleurs produits testés en profondeur, dans des comparatifs indépendants réalisés par des journalistes expérimentés. » |
| Emplacement | En haut du `<article>`, zone `<banner>` |

## 2. Navigation par catégories (filtres thématiques)

Boutons-pilules cliquables, deux rangées (la 2e révélée par « Voir plus ▾ »).

**Rangée 1 :** Smartphones et Tablettes · Ordinateurs · Photo et Vidéo · Son et Musique · Sports et forme · Soin et bien-être · Accessoires cuisine
**Rangée 2 :** Arts et loisirs · Enfants et bébés · Animalerie · Outdoor · Maison

Lien « Tous nos comparatifs » présent dans le menu Services (pas en corps de page).
Pagination en bas : « 1 », « 2 ».

## 3. Guides « vedettes » (grille en haut de flux)

Grille de **4 cartes** (2×2). Chaque carte : **grande image + titre (H3, lien)**, **sans** chapô,
**sans** badge, **sans** note. Exemples relevés : « Les meilleures visseuses entre 50 et 100 euros »,
« Les meilleurs jeux de société », « Les meilleures machines à café à grains à moins de 500 euros »,
« Les meilleurs chargeurs de piles AA et AAA ».

## 4. Flux principal (« Les meilleurs X »)

Liste chronologique inverse : titre (H2, lien) + chapô tronqué + date (+ mise à jour) + auteur.
10 premiers intitulés relevés : Grandes vacances : nos choix d'accessoires · Les meilleures centrales
vapeur · Les meilleures brosses à dents électriques · Comparatif : les meilleurs blenders · Les
meilleurs sèche-cheveux · Les meilleures ponceuses triangulaires · Les meilleures tondeuses à barbe ·
Six cadeaux de Noël qui ont remporté nos comparatifs · Les meilleurs robots pâtissiers · Les meilleurs
bouchons d'oreilles pour mieux dormir.
*(Des blocs « Contenus sponsorisés » Outbrain s'intercalent — distincts des guides.)*

## 5. Mentions de transparence / affiliation

- **Page rubrique** : aucune mention d'affiliation visible en corps de page.
- **Chaque guide (article)**, en tout premier, avant le chapô — texte exact :
  > « Ces produits sont sélectionnés et testés de manière indépendante par des journalistes
  > expérimentés. Le Monde touche une rémunération lorsqu'un lecteur procède à leur achat en ligne.
  > En savoir plus. »
  Le lien « En savoir plus » pointe vers leur page de règles sur les liens marchands.

## 6. Tableaux, badges, boutons d'achat

- **Tableaux comparatifs** : présents (ex. résultats d'isolation), souvent en listes/paragraphes,
  **pas** de `<table>` de specs structuré.
- **Badges produit** (`.product__number`), libellés exacts : **« VAINQUEUR EX AEQUO »** /
  **« NOTRE CHOIX »** et **« ON RECOMMANDE AUSSI »**. Pas de « Meilleur choix »/« coup de cœur ».
- **Boutons d'achat** (`.product__link`) :
  - Texte : **« Acheter sur [Marchand]* »**
  - Marchands observés : Amazon, Decathlon, Cdiscount, Gobi, Alpiniste, Zeste
  - `rel="nofollow noopener"` — **pas de `rel="sponsored"`**
  - `target="_blank"`, URL via **redirecteur interne opaque** `/_rprt/[token]`
  - Prix (`.product__disclaimer`) : **« *Au moment de la publication, le prix était de XX,XX€ »**
- Pas de note chiffrée / étoiles associée aux produits.

## 7. Structure interne d'un guide complet (ex. gourdes)

Ordre observé :
0. Mention d'affiliation (tête d'article)
1. Fil d'Ariane (GUIDES D'ACHAT • sous-rubrique)
2. Titre (H1)
3. Chapô
4. Auteur + dates (publié / modifié)
5. **Sélection en un coup d'œil** (« Tout ce que nous recommandons ») : fiches résumées + bouton
6. Ancre « Le test complet »
7. **Pourquoi nous faire confiance** (auteur + méthodo)
8. **À qui s'adressent ces produits**
9. Section thématique (santé / matériaux…)
10. **Comment nous les avons choisies** (présélection)
11. **Comment nous les avons testées** (protocole + tableaux de résultats)
12. **Fiches produit détaillées** ×N : badge, photo, H3, description longue, bouton(s) « Acheter sur… »,
    prix au moment de la publication, défauts (« Des défauts non rédhibitoires »)
13. **Les autres modèles testés** (écartés, avis bref)
14. **Lire aussi** (liens croisés vers d'autres guides)
15. Footer auteur

> Pas de FAQ ni de mentions légales spécifiques dans ce guide (variable selon les guides).
> Accès libre (pas de mur d'abonnement sur les guides).

## 8. Enseignements pour notre gabarit

1. **Transparence par le texte** en tête d'article (nous : texte **+** `rel="sponsored"`, plus strict).
2. **CTA « Acheter sur [Marchand] »** plutôt que « Voir le prix » → intégré au générateur.
3. **Prix « au moment de la publication »** = parade élégante à la règle Amazon (pas de prix en dur)
   → intégré (`product.price` rendu en disclaimer).
4. **Structure en deux temps** (sélection résumée en tête, puis développement) = modèle Wirecutter
   (Le Monde a eu un partenariat Wirecutter/NYT jusqu'en 2023) → déjà notre approche.
5. **Sections de confiance** à ajouter : « Pourquoi nous faire confiance », « À qui s'adresse »,
   « Les autres modèles écartés », « À lire aussi » (maillage interne SEO) → ajoutées au générateur.
6. **Taxonomie de catégories** réutilisable (cf. liste §2).

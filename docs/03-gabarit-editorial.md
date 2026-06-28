# 03 — Gabarit éditorial & format des données

## Anatomie d'un guide (structure type)

Reprise de la structure qui convertit le mieux (Le Monde / Wirecutter) :

1. **Titre SEO** : « Les meilleur·e·s [produit] en [année] »
2. **Chapô** : 2–3 phrases résumant le besoin et la promesse
3. **Encadré de transparence** (auto-généré)
4. **Notre sélection en un coup d'œil** : tableau Meilleur global / Rapport qualité-prix / Premium
5. **Comparatif détaillé** : une fiche par produit (photo, points forts/faibles, prix, CTA affilié)
6. **Comment bien choisir** : guide d'achat (critères concrets)
7. **Méthodologie** : comment la sélection a été faite (transparence)
8. **FAQ** : questions fréquentes (bon pour le SEO — données structurées)
9. **Mentions légales d'affiliation** (auto-générées)

## Format des données (`data/guides/*.json`)

Un guide = un fichier JSON. Champs :

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `slug` | string | ✅ | Identifiant URL (minuscules, tirets) |
| `title` | string | ✅ | Titre SEO |
| `category` | string | ✅ | Rubrique (ex. « Maison & Lifestyle ») |
| `year` | number | ✅ | Année du classement |
| `lang` | string | | Langue (`fr` par défaut) |
| `lastUpdated` | string | | Date de mise à jour (AAAA-MM-JJ) |
| `author` | string | | Auteur affiché |
| `intro` | string | ✅ | Chapô |
| `methodology` | string | | Explication de la méthode de sélection |
| `criteria` | string[] | | Critères d'évaluation (liste) |
| `picks` | object[] | ✅ | Distinctions (voir ci-dessous) |
| `products` | object[] | ✅ | Produits comparés (voir ci-dessous) |
| `buyingGuide` | string | | Section « comment choisir » |
| `faq` | object[] | | Questions/réponses (`{q, a}`) |

### `picks[]` (distinctions / sélection en un coup d'œil)

```json
{ "badge": "Meilleur choix global", "productRef": "id-du-produit" }
```
`productRef` doit correspondre à un `products[].id` existant (vérifié par le validateur).

### `products[]`

| Champ | Requis | Description |
| --- | --- | --- |
| `id` | ✅ | Identifiant unique interne |
| `name` | ✅ | Nom du produit |
| `affiliate` | ✅ | Bloc d'affiliation (voir `01-affiliation.md`) |
| `brand` | | Marque |
| `price` | | Prix **indicatif** (string, ex. « 29,90 € ») |
| `rating` | | Note /5 (number) |
| `image` | | URL de l'image |
| `summary` | | Paragraphe descriptif |
| `pros` | | Points forts (string[]) |
| `cons` | | Points faibles (string[]) |

## Checklist qualité avant publication

- [ ] Titre contient le mot-clé principal + l'année
- [ ] Chapô répond à l'intention de recherche dès la 1ʳᵉ phrase
- [ ] 3 à 8 produits, chacun avec points forts **et** faibles (crédibilité)
- [ ] Au moins 3 distinctions (`picks`) : global / qualité-prix / premium
- [ ] Méthodologie renseignée (transparence)
- [ ] FAQ avec 3+ questions réelles (SEO)
- [ ] Tous les `affiliate.asin` / `url` vérifiés et actifs
- [ ] Relu pour l'orthographe et le ton Cultura Sabauda
- [ ] Checklist de conformité (`02-conformite-legale.md`) validée

## Astuce rédaction

Le validateur (`src/lib/schema.mjs`) **refuse** un guide mal formé (champ manquant, `productRef`
orphelin, id en double). Lancez `node src/generate.mjs <fichier>` tôt et souvent.

# 02 — Conformité légale (France / UE)

> ⚠️ **À lire avant toute publication.** Le non-respect de ces règles expose à des sanctions
> (DGCCRF) **et** à l'exclusion des programmes d'affiliation (Amazon clôture sans préavis).
> Ce document est une synthèse opérationnelle, **pas un avis juridique** : faire valider par un
> conseil pour les points sensibles.

## 1. Transparence du caractère commercial (obligatoire)

La loi (Code de la consommation, directive UE 2005/29 sur les pratiques commerciales, DSA) impose
d'**indiquer clairement** qu'un contenu contient des liens rémunérés.

✅ **Intégré par l'outil** : chaque guide généré affiche un **encadré de transparence** en haut de
page + une mention en pied de page. Ne pas le retirer.

> Exemple de mention (déjà générée) : « Cet article contient des liens affiliés. Un achat via ces
> liens peut générer une commission pour Cultura Sabauda, sans surcoût pour vous. »

## 2. Attribut `rel` sur les liens (SEO + conformité)

Google impose de marquer les liens monétisés. ✅ **Intégré** : tous les liens affiliés portent
`rel="sponsored nofollow noopener"`. Ne pas publier de liens affiliés sans cet attribut.

## 3. Exigences spécifiques Amazon Partenaires

Le *Contrat Opérationnel* Amazon impose notamment :

- Afficher la mention : **« En tant que Partenaire Amazon, je réalise un bénéfice sur les achats
  remplissant les conditions requises. »** → à ajouter dans les mentions du site / pied de page.
- **Ne pas afficher de prix en dur** copié d'Amazon (les prix changent) — utiliser « Prix indicatif »
  ou renvoyer vers la page produit. ✅ Le gabarit utilise « Prix indicatif ».
- Pas d'usage des liens dans les **e-mails, PDF, ebooks** ou hors du site déclaré.
- Pas de raccourcisseurs d'URL masquant la destination Amazon.

## 4. RGPD & cookies

- Les redirections d'affiliation et les outils de mesure (Analytics) peuvent déposer des **cookies/traceurs**
  → bandeau de **consentement** conforme CNIL requis sur le site de publication.
- Mentionner l'affiliation dans la **politique de confidentialité**.
- Ne pas transmettre de données personnelles aux marchands sans base légale.

## 5. Honnêteté éditoriale (pratiques commerciales loyales)

- Les recommandations doivent être **sincères** : interdiction de présenter comme « meilleur » un
  produit choisi uniquement pour sa commission (pratique trompeuse).
- Distinguer clairement **test réel** vs **synthèse de sources** → décrit dans la méthodologie.
- Si rémunération directe par une marque (article sponsorisé), le signaler **en plus** de l'affiliation.

## 6. Mentions légales du site

Le site de publication doit comporter (loi LCEN) : éditeur, hébergeur, directeur de publication,
+ une **page « Politique d'affiliation »** (URL `/affiliation` référencée dans les guides générés).

## Checklist de conformité avant publication

- [ ] Encadré de transparence présent et visible (haut de page)
- [ ] Tous les liens affiliés en `rel="sponsored nofollow noopener"`
- [ ] Mention Amazon Partenaires présente sur le site
- [ ] Prix affichés comme « indicatifs », non copiés en dur
- [ ] Bandeau cookies / consentement actif sur le site
- [ ] Page « Politique d'affiliation » publiée et liée
- [ ] Sélection sincère, méthodologie expliquée

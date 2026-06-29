# État du projet — Guides d'achat Cultura Sabauda

> Document vivant : ce qu'on veut faire, les étapes pour y arriver, et où on en est.
> Dernière mise à jour : **29/06/2026**.

---

## 1. Ce qu'on veut faire (objectif)

Créer une rubrique **« Guides d'achat »** qui génère des **revenus d'affiliation récurrents**
pour Cultura Sabauda, sur le modèle des Guides d'achat du Monde.

On publie des comparatifs utiles (« Les meilleur·e·s X »), on insère des **liens affiliés trackés**,
et chaque achat réalisé via ces liens rapporte une **commission** — sans surcoût pour le lecteur.
Le moteur de revenu est le **référencement naturel (SEO)** qui amène un trafic qualifié.

**Principe d'architecture** : on pilote tout depuis un **tableau de bord sur le VPS** (back-office
qu'on maîtrise), et **WordPress** sert de simple **cible de publication** (branchée ensuite).

---

## 2. Les étapes pour y arriver

| Phase | Contenu | État |
| --- | --- | --- |
| **0. Cadrage & outils** | Stratégie, conformité, générateur, SEO, IA, dashboard | ✅ Terminé |
| **1. Infrastructure VPS** | Déployer le tableau de bord sur le VPS Hostinger | 🟡 En cours |
| **2. Lancement éditorial** | Compte Amazon, thématique, 3 premiers guides | ⬜ À venir |
| **3. Brancher WordPress** | Publier les guides depuis le dashboard (API REST) | ⬜ À venir |
| **4. Croissance** | SEO (volumes réels), maillage, personnalisation, multilingue | ⬜ À venir |

---

## 3. Où on en est précisément

### ✅ Fait
- **Dépôt GitHub** complet : générateur (JSON → Markdown + HTML SEO), liens affiliés trackés
  (Amazon / Awin / direct), conformité intégrée (transparence, `rel="sponsored"`, prix « au moment
  de la publication »).
- **Outils** : SEO (intentions d'achat + brief), recommandation par profil, rédaction assistée par
  Claude (brouillons, sans inventer ASIN/prix), publication WordPress (CLI + bouton dashboard).
- **Tableau de bord** : KPIs, état config, génération + aperçu, SEO, reco, suivi des revenus,
  bouton « → WP ».
- **VPS Hostinger (Ubuntu 24.04, IP 152.239.112.112)** :
  - Node **v20.20.2** installé (NodeSource).
  - Service **`guides-dashboard`** actif (systemd), autostart au boot, ~8 Mo RAM.
  - **API vérifiée** (`/api/overview` répond `kpis`).
  - Accès actuel via **tunnel SSH** : `ssh -L 8787:127.0.0.1:8787 root@152.239.112.112` →
    `http://localhost:8787/?token=<.dashboard-token>`.
- **Documentation** (dossier `docs/`) : 00→10 + ce document. **Drive** : cahier de projet synchronisé.

### 🟡 En cours / prochaines actions immédiates
1. **DNS + HTTPS** : créer l'enregistrement A `dashboard.culturasabauda.eu → 152.239.112.112`,
   puis relancer `sudo bash deploy/vps-setup.sh dashboard.culturasabauda.eu` (ajoute Nginx + HTTPS).
2. **Vrai tag Amazon** : le `.env` du VPS contient encore le placeholder `REMPLACER-21`.
   Créer le compte Amazon Partenaires (partenaires.amazon.fr), puis renseigner `AMAZON_PARTNER_TAG`
   dans `/opt/guides-achats/.env` et `systemctl restart guides-dashboard`.

### ⬜ À venir
- Choisir/confirmer la **thématique éditoriale** (recommandé : culture & patrimoine).
- Rédiger et publier les **3 premiers guides** (squelettes prêts : liseuses, matériel dessin, jumelles).
- **Brancher WordPress** : mot de passe d'application → variables `WP_*` dans `.env` → le bouton
  « → WP » du dashboard publie en brouillon.
- Page **« Politique d'affiliation »** + mentions légales (conformité, docs/02).
- **Google Search Console** + Analytics/Matomo ; enrichir le SEO avec des volumes réels.

---

## 4. Décisions à confirmer
- **Thématique** : culture & patrimoine (recommandé) vs généraliste.
- **Programmes d'affiliation** : Amazon d'abord, puis Awin / partenariats directs.
- **Sous-domaine** du dashboard : `dashboard.culturasabauda.eu` (proposé).

---

## 5. Repères techniques
- **Dépôt** : `monodf-beep/guides-achats` — branche `claude/cultura-shopping-guide-tool-7osf4z`.
- **VPS** : `/opt/guides-achats` ; service `guides-dashboard` ; logs `journalctl -u guides-dashboard -f`.
- **Mise à jour** : `cd /opt/guides-achats && git pull && systemctl restart guides-dashboard`.
- **Zéro dépendance** pour le dashboard (Node natif) ; `@anthropic-ai/sdk` requis uniquement pour la
  rédaction IA.

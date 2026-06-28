# 10 — Tableau de bord (VPS)

Back-office pour piloter les guides depuis ton VPS, **avant** de brancher WordPress. WordPress
devient ensuite une simple cible de publication (`src/publish-wordpress.mjs`).

## Ce qu'il fait

- **KPIs** : guides, publiés, brouillons, produits, revenus cumulés.
- **État de la config** : Amazon Partenaires, Awin, WordPress, IA/Claude (configurés ou non).
- **Guides** : liste avec état, bouton **Générer** et **Aperçu** (HTML rendu).
- **Intentions SEO** : matrice d'un mot-clé + titres candidats.
- **Recommandation** : guides classés par centres d'intérêt (profil visiteur).
- **Suivi des revenus** : saisie manuelle (`data/revenue.json`), en attendant les API affiliées.

Aucune dépendance (Node natif). API JSON sous `/api/*`, prévisualisation sous `/preview/<slug>`.

## Lancer en local

```bash
node src/dashboard/server.mjs           # http://localhost:8787
# ou
npm run dashboard
DASHBOARD_PORT=9000 npm run dashboard   # port personnalisé
DASHBOARD_TOKEN=secret npm run dashboard # accès via ?token=secret
```

## Déploiement sur le VPS

### Méthode rapide — script tout-en-un (recommandé)
Installe Node si besoin, crée un utilisateur de service, le `.env`, un token, le service systemd
et (si un domaine est passé) Nginx + HTTPS. Idempotent.

```bash
git clone -b claude/cultura-shopping-guide-tool-7osf4z \
  https://github.com/monodf-beep/guides-achats /opt/guides-achats
cd /opt/guides-achats

# Sans domaine (écoute locale 127.0.0.1:8787) :
sudo bash deploy/vps-setup.sh

# Avec domaine → Nginx + HTTPS automatiques :
sudo bash deploy/vps-setup.sh dashboard.culturasabauda.eu
```
À la fin, le script affiche l'URL d'accès et le token (aussi dans `.dashboard-token`).

### Méthode manuelle (détaillée)

#### 1. Récupérer le code
```bash
git clone <url-du-depot> /opt/guides-achats
cd /opt/guides-achats
cp .env.example .env   # renseigner AMAZON_PARTNER_TAG, etc.
```

### 2. Service persistant (systemd — recommandé)
Créer `/etc/systemd/system/guides-dashboard.service` :
```ini
[Unit]
Description=Tableau de bord Guides d'achat Cultura Sabauda
After=network.target

[Service]
WorkingDirectory=/opt/guides-achats
ExecStart=/usr/bin/node src/dashboard/server.mjs
Environment=DASHBOARD_PORT=8787
Environment=DASHBOARD_TOKEN=CHANGER_CE_SECRET
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now guides-dashboard
sudo systemctl status guides-dashboard
```

*(Alternative : `pm2 start src/dashboard/server.mjs --name guides-dashboard && pm2 save`.)*

### 3. Reverse proxy HTTPS (Nginx)
```nginx
server {
  server_name dashboard.culturasabauda.eu;
  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
  }
}
```
Puis certificat : `sudo certbot --nginx -d dashboard.culturasabauda.eu`.

## Sécurité (important)

Le tableau de bord peut **générer des fichiers** et lit la config — ne l'exposez pas sans protection :
- **Toujours** définir `DASHBOARD_TOKEN` (et/ou une auth Nginx `auth_basic`).
- Restreindre par IP si possible (`allow`/`deny` Nginx, ou pare-feu).
- Le servir uniquement en **HTTPS**.
- Ne jamais committer `.env` (déjà dans `.gitignore`).

## Mises à jour

```bash
cd /opt/guides-achats && git pull && sudo systemctl restart guides-dashboard
```

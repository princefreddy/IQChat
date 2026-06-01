# Document 3 : Guide de Déploiement Complet - IQChat (Production Économique ~7 €/mois)

Ce guide technique détaille pas à pas comment configurer, relier et déployer l'intégralité de l'infrastructure de production d'IQChat pour un coût minime, en exploitant les offres gratuites et les abonnements d'entrée de gamme des hébergeurs.

---

## 1. Base de Données : Supabase (0 €/mois)
Supabase fournit une base de données PostgreSQL managée robuste avec un quota gratuit de 500 Mo, largement suffisant pour stocker les relations et les messages d'IQChat puisque les fichiers volumineux sont redirigés vers le cloud R2.
1. Créez un compte sur [Supabase](https://supabase.com/).
2. Créez un nouveau projet nommé `IQChat` dans la région la plus proche de vos utilisateurs (ex. `aws-eu-central-2` pour l'Europe).
3. Attendez la fin de la création de la base de données.
4. Récupérez votre chaîne de connexion PostgreSQL dans : **Project Settings** > **Database** > **Connection string** > **URI**.
   * *Exemple de format* : `postgresql://postgres.[username]:[password]@aws-0-eu-central-2.pooler.supabase.com:6543/postgres`
   * Remplacez le mot de passe fictif `[password]` par le mot de passe que vous avez configuré à la création du projet.

---

## 2. Stockage Cloud : Cloudflare R2 (0 € à ~2 €/mois)
Cloudflare R2 est un espace de stockage d'objets (compatible S3) qui offre 10 Go gratuits par mois et, contrairement à Amazon S3, ne facture aucun frais pour la bande passante sortante (frais de transfert).
1. Connectez-vous sur votre console [Cloudflare](https://dash.cloudflare.com/).
2. Allez dans **R2** > **Create bucket**, nommez votre bucket `iqchat-assets` et validez.
3. Allez dans les paramètres du Bucket, activez un **Custom Domain** (ex. `assets.iqchat.com`) ou activez le sous-domaine gratuit R2 pour rendre les fichiers publiquement accessibles en lecture.
4. Allez dans **R2** (menu principal) > **Manage R2 API Tokens** et cliquez sur **Create API Token**.
5. Attribuez les droits **Edit** (lecture/écriture), nommez le jeton et validez. Notez précieusement les informations générées :
   * `Access Key ID`
   * `Secret Access Key`
   * `Endpoint URL` (ex : `https://[id-compte].r2.cloudflarestorage.com`)

---

## 3. API Backend : Render (Tiers Web Service : ~7 €/mois)
Le serveur FastAPI doit être actif en continu pour gérer les WebSockets. L'hébergement gratuit de Render met en veille les serveurs inactifs après 15 minutes, ce qui interrompt les messageries. Pour éviter cela, utilisez le plan "Starter" de Render à 7 $/mois.
1. Créez un compte sur [Render](https://render.com/).
2. Créez un nouveau **Web Service** et connectez votre dépôt GitHub.
3. Configurez les options suivantes :
   * **Root Directory** : `backend`
   * **Environment** : `Python`
   * **Build Command** : `pip install -r requirements.txt`
   * **Start Command** : `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Allez dans l'onglet **Environment** et ajoutez les variables d'environnement suivantes :
   * `DATABASE_URL` : *Votre URI de connexion Supabase (Étape 1)*
   * `S3_BUCKET_NAME` : `iqchat-assets`
   * `S3_ACCESS_KEY_ID` : *Votre R2 Access Key (Étape 2)*
   * `S3_SECRET_ACCESS_KEY` : *Votre R2 Secret Key (Étape 2)*
   * `S3_ENDPOINT_URL` : *Votre R2 Endpoint URL (Étape 2)*
   * `S3_PUBLIC_URL` : *Votre domaine ou sous-domaine public de lecture R2 (Étape 2)*
5. Cliquez sur **Deploy Web Service**. Une fois le déploiement réussi, notez l'URL publique générée (ex : `https://iqchat-backend.onrender.com`).

---

## 4. Frontend Web : Vercel (0 €/mois)
Le frontend Next.js d'IQChat se déploie très facilement et gratuitement sur Vercel.
1. Créez un compte sur [Vercel](https://vercel.com/).
2. Importez votre dépôt GitHub.
3. Configurez le projet :
   * **Framework Preset** : `Next.js`
   * **Root Directory** : `web`
4. Dans l'onglet **Environment Variables**, ajoutez la variable suivante :
   * `NEXT_PUBLIC_API_URL` : *L'URL de votre backend Render de l'étape 3 (ex. https://iqchat-backend.onrender.com)*
5. Cliquez sur **Deploy**.

---

## 5. Compilation Mobile : Expo EAS (0 €/mois)
EAS (Expo Application Services) permet de compiler gratuitement votre application React Native dans le cloud d'Expo pour générer des fichiers d'installation (.apk pour Android ou .ipa pour iOS).
1. Ouvrez votre terminal dans le dossier `mobile` de votre projet (`D:\IQChat\mobile`).
2. Installez le client CLI EAS globalement :
   ```bash
   npm install -g eas-cli
   ```
3. Connectez-vous à votre compte Expo :
   ```bash
   eas login
   ```
4. Initialisez le projet avec la configuration EAS :
   ```bash
   eas build:configure
   ```
5. Pour générer un fichier d'installation Android (.apk) pour vos testeurs, lancez :
   ```bash
   eas build -p android --profile preview
   ```
6. Une fois le processus de compilation cloud terminé, scannez le QR code affiché dans le terminal ou téléchargez l'APK généré directement depuis votre tableau de bord Expo.

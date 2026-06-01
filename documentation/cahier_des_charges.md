# Document 1 : Cahier des Charges & Modèle d'Abonnement - IQChat

## 1. Présentation du Projet
**IQChat** est une application de messagerie instantanée cross-platform (Web et Mobile) combinant sécurité, esthétique premium et fonctionnalités avancées axées sur l'intelligence, la stimulation cognitive et la croissance personnelle. Contrairement aux messageries traditionnelles, IQChat intègre des mécaniques d'apprentissage collaboratif, des duels intellectuels et des outils de développement personnel assistés par intelligence artificielle.

L'identité visuelle d'IQChat s'appuie sur une charte graphique "Royale" (tons bleus profonds, contrastes dorés, effets de transparence vitrée - *glassmorphism*) pour inspirer la sécurité, le prestige et l'excellence.

---

## 2. Objectifs Stratégiques
1. **Stimulation Intellectuelle** : Offrir des outils interactifs qui font travailler le cerveau au quotidien dans le cadre de conversations ordinaires.
2. **Maturation & Apprentissage** : Permettre d'acquérir des connaissances de manière continue et collaborative.
3. **Sécurisation & Confidentialité** : Garantir la confidentialité des données via des messages éphémères, cachés ou différés, soutenus par une infrastructure cloud moderne.
4. **Monétisation Viable** : Établir un modèle freemium robuste et équitable, structuré en trois niveaux d'abonnement.

---

## 3. Liste des Fonctionnalités

### 3.1. Fonctionnalités de Messagerie Standard & Avancées (Déjà implémentées)
*   **Messagerie instantanée temps réel** : Discussions privées (un à un) et discussions de groupe gérées via connexions WebSockets persistantes.
*   **Envoi de pièces jointes et messages vocaux** : Prise en charge des images, vidéos, documents et audios avec téléversement asynchrone direct sur le stockage cloud (S3 / Cloudflare R2) pour préserver la base de données.
*   **Messages éphémères** : Messages configurés avec un temps de vie (TTL) après lequel ils s'autodétruisent de l'écran et de la base de données.
*   **Messages cachés (Double authentification)** : Messages chiffrés visuellement nécessitant une validation (clic ou mot de passe) pour être révélés.
*   **Messages différés** : Envoi de messages programmés pour ne devenir visibles par le destinataire qu'à une date et heure précises.
*   **Fil d'actualité public (PublicationsFeed)** : Un espace communautaire mondial de partage d'idées, de reposts et de réactions avec système de tri et de recherche par auteur.

### 3.2. Fonctionnalités Cognitives & d'Apprentissage (Nouvelles propositions)
*   **Duels Cognitifs en temps réel** : Possibilité de lancer des mini-défis mentaux (logique, énigmes, mathématiques) directement dans la fenêtre de chat. Le système comptabilise les résultats sous forme de points d'expérience cognitifs (IQ Points).
*   **Mentor IA (Coach de développement)** : Une intelligence artificielle privée qui aide l'utilisateur à définir ses objectifs hebdomadaires, effectue un bilan quotidien rapide et fournit des statistiques de maturation le week-end.
*   **Flashcards Collaboratives** : Système de création de paquets de révision partagés dans les groupes. Un bot automatique distribue des questions périodiques pour encourager la mémorisation active par répétition espacée.
*   **Détecteur de Biais Cognitifs** : Modérateur IA capable de signaler de manière bienveillante les biais d'argumentation (sophismes, attaques personnelles, etc.) dans les débats pour élever le niveau de discussion.
*   **Le Daily Spark** : Widget d'apprentissage quotidien proposant un mini-cours sur un concept complexe (philosophie, science, économie) suivi d'un quiz pour stimuler la plasticité cérébrale.

---

## 4. Modèle Économique & Niveaux d'Abonnement

Pour assurer la rentabilité d'IQChat tout en couvrant les frais d'infrastructure (base de données Supabase, serveurs d'IA, bande passante de stockage R2), les fonctionnalités sont segmentées en trois niveaux d'accès :

| Fonctionnalité | Gratuit (Citoyen) | Écuyer (Premium - 2.99€/m) | Souverain (Royal - 7.99€/m) |
| :--- | :---: | :---: | :---: |
| **Messagerie un-à-un & Groupes** | Oui (limité à 3 groupes) | Illimité | Illimité |
| **Stockage des pièces jointes** | Max 10 Mo par fichier | Max 50 Mo par fichier | Max 200 Mo par fichier |
| **Messages éphémères & cachés** | Oui | Oui | Oui |
| **Messages différés** | Non | Oui | Oui |
| **Mini-jeux et Duels Cognitifs** | 3 duels / jour | 15 duels / jour | Illimité |
| **Mentor IA** | Non | 1 check-in / semaine | Illimité + Conseils personnalisés |
| **Flashcards de groupe** | 1 deck actif | 5 decks actifs | Illimité |
| **Détecteur de Biais Cognitifs** | Non | Non | Oui (Activé par défaut) |
| **Daily Spark & Streaks** | Oui (Fiche simple) | Oui (+ Historique des fiches) | Oui (+ Génération de quiz sur-mesure) |
| **Statut Musical Dynamique** | Non | Oui | Oui |
| **Badge de Profil Royal** | Non | Badge Bronze 🛡️ | Badge Couronne Dorée 👑 |

---

## 5. Spécifications Non Fonctionnelles
1. **Performances réseau** : Le polling est réduit au minimum (15-30s) pour économiser la base de données. Les messages s'appuient sur un canal WebSocket réactif (< 100ms de latence).
2. **Portabilité** : Le design doit s'adapter automatiquement aux navigateurs web récents (Desktop/Mobile) et aux smartphones iOS et Android.
3. **Sécurité et RGPD** : Suppression physique et définitive des fichiers cloud R2/S3 lors de la suppression des messages éphémères ou des comptes utilisateurs.

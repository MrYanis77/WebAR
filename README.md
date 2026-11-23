# Mindi — WebAR

Application web de **réalité augmentée** qui relie le patrimoine de Montbéliard aux événements de la ville.

- Le **visiteur** scanne le QR code d'une affiche avec son téléphone : une animation 3D sort de l'affiche, puis une carte le guide vers un monument où l'attend une grande animation. Rien à installer, tout se passe dans le navigateur.
- Les **agents de la mairie** et les **partenaires** (commerçants, associations…) créent les animations et les affiches dans un **back-office**.

## Sommaire

1. [Ce qu'il faut installer](#1-ce-quil-faut-installer)
2. [Installer le projet](#2-installer-le-projet)
3. [Lancer l'application](#3-lancer-lapplication)
4. [Utiliser le back-office](#4-utiliser-le-back-office)
5. [Tester avec un téléphone](#5-tester-avec-un-téléphone)
6. [Problèmes fréquents](#6-problèmes-fréquents)
7. [Commandes utiles](#7-commandes-utiles)
8. [Mettre à jour une base existante](#8-mettre-à-jour-une-base-existante)
9. [Tests et mise en ligne](#9-tests-et-mise-en-ligne)
10. [Détails techniques](#10-détails-techniques)

---

## 1. Ce qu'il faut installer

| Logiciel | Pourquoi | Où le trouver |
| --- | --- | --- |
| **Node.js 24** | Fait tourner le site et l'API | [nodejs.org](https://nodejs.org/) (version « LTS » 24) |
| **XAMPP** (ou MariaDB / MySQL) | La base de données | [apachefriends.org](https://www.apachefriends.org/) |
| **Git** | Récupérer le projet | [git-scm.com](https://git-scm.com/) |
| Mailpit *(facultatif)* | Voir les mails envoyés par l'application | [mailpit.axllent.org](https://mailpit.axllent.org/) |

Pour vérifier que Node.js est bien installé, ouvrez un terminal (PowerShell sous Windows) et tapez :

```bash
node --version
```

La réponse doit commencer par `v24`.

---

## 2. Installer le projet

À faire **une seule fois**.

### 2.1 Récupérer le code et ses dépendances

```bash
git clone <adresse-du-dépôt> WebAR
cd WebAR
npm install
```

`npm install` télécharge les bibliothèques (quelques minutes) et prépare l'accès à la base.

### 2.2 Démarrer la base de données

Ouvrez le **panneau de contrôle XAMPP** et cliquez sur **Start** en face de **MySQL** (et **Apache** si vous voulez utiliser phpMyAdmin).

### 2.3 Créer la base `webar`

1. Ouvrez [http://localhost/phpmyadmin](http://localhost/phpmyadmin).
2. Cliquez sur **Nouvelle base de données**, nommez-la `webar`, interclassement `utf8mb4_unicode_ci`, puis **Créer**.
3. Sélectionnez la base `webar`, onglet **Importer**, choisissez le fichier `database/montbeliard_webar.sql` du projet, puis **Importer**.
4. Toujours dans `webar`, importez aussi `database/migrations/2026-11-18_decalage_affiche.sql` (déplacement de l'animation autour de l'affiche).

Ou en ligne de commande (XAMPP : `C:\xampp\mysql\bin\mysql.exe`) :

```bash
mysql -u root -e "CREATE DATABASE webar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
```

```bash
mysql -u root webar < database/montbeliard_webar.sql
```

```bash
mysql -u root webar < database/migrations/2026-11-18_decalage_affiche.sql
```

Le script crée 17 tables et 6 vues, **sans aucune donnée**. Attention : il supprime d'abord les tables existantes de la base où vous l'importez.

### 2.4 Créer le fichier de configuration `.env`

1. Copiez le fichier `.env.example` et renommez la copie en `.env`.
2. Ouvrez `.env` et modifiez `DATABASE_URL`. Avec XAMPP (utilisateur `root` sans mot de passe) :

   ```
   DATABASE_URL="mysql://root@127.0.0.1:3306/webar"
   ```

3. Remplissez les 4 secrets `SESSION_SECRET`, `CSRF_SECRET`, `ALTCHA_HMAC` et `ALTCHA_HMAC_CLE`. Chacun doit recevoir une valeur aléatoire **différente**. Générez-en une avec la commande suivante, à lancer 4 fois :

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

Ne partagez jamais ce fichier `.env` (il n'est pas envoyé sur Git).

### 2.5 Créer le premier compte agent

Aucun compte n'existe après l'installation. Créez celui de la mairie :

```bash
npm run creer-agent -- --email prenom.nom@montbeliard.fr --nom "Prénom Nom"
```

La commande **affiche le mot de passe généré** : notez-le. En cas d'oubli, un nouveau mot de passe est généré et affiché par :

```bash
npm run changer-mot-de-passe -- --email prenom.nom@montbeliard.fr
```

> La double authentification est désactivée pour l'instant (`DOUBLE_AUTHENTIFICATION=false` dans `.env`) : l'agent se connecte avec son seul mot de passe. Avec `true`, il reçoit en plus un code à 6 chiffres par mail à chaque connexion.

---

## 3. Lancer l'application

À chaque fois que vous voulez travailler (XAMPP doit avoir **MySQL démarré**) :

```bash
npm run dev
```

Laissez ce terminal ouvert. Ensuite, dans votre navigateur :

| Adresse | Ce que vous voyez |
| --- | --- |
| [http://localhost:5173](http://localhost:5173) | L'application **visiteur** (carte, monuments, agenda) |
| [http://localhost:5173/backoffice](http://localhost:5173/backoffice) | Le **back-office** (connexion avec le compte agent) |

Pour arrêter : `Ctrl + C` dans le terminal.

---

## 4. Utiliser le back-office

### Ordre conseillé pour une première mise en place

```
1. Monument  →  2. Modèle 3D  →  3. Animation  →  4. Affiche  →  5. Publication
```

### 4.1 Créer un monument (agent)

**Monuments & zones › Créer un monument**, en 3 étapes :

1. **Le monument** : nom, adresse, description en français (anglais et allemand facultatifs), photo.
2. **Sa position** : placez le repère au centre du bâtiment sur la carte satellite et réglez le **rayon** (50 m par défaut). Quand un visiteur entre dans ce rayon, l'application le prévient et l'animation peut se lancer.
3. **Son animation 3D** (voir 4.3).

Dans le même menu, onglet **Zones d'affichage**, créez les **zones d'affichage** autorisées par la Ville. Une affiche de partenaire ne peut être publiée que si une zone lui est attribuée.

### 4.2 Importer un modèle 3D

**Fichiers 3D & sons › Choisir un fichier** (ou glissez-le dans le cadre).

- Formats acceptés : **GLB** (modèle 3D, avec ses animations intégrées), **MP3 / M4A** (son), **PNG / JPEG**.
- Choisissez l'**usage** : animation d'affiche (petite, 30 000 triangles maximum) ou animation de lieu (grande, 100 000 triangles maximum).
- Le serveur contrôle le fichier automatiquement. Vérifiez l'aperçu, puis cliquez sur **Valider l'enregistrement**.

**Ouvrir l'atelier** sur un modèle permet de :

- le **redresser** s'il est couché ou tourné (un modèle exporté couché se redresse souvent avec −90° en X) ;
- choisir son **ancrage** (posé au sol ou par son centre), sa vitesse d'animation, sa luminosité ;
- l'**alléger** (textures plus petites, compression) ; l'original reste disponible ;
- le **voir en situation** : bouton **Studio** (à côté d'une silhouette de 1,75 m), **Sur l'affiche** ou **Au monument** (carte satellite avec les bâtiments en 3D).

N'oubliez pas **Enregistrer** en haut de l'atelier.

**Assembler des modèles** (en haut de la page, ou **Assembler** à côté de « Ouvrir l'atelier ») réunit plusieurs modèles en un seul, par exemple *logo · séparateur · logo* pour un match :

1. Ajoutez les modèles un par un dans la liste (un même modèle peut être ajouté plusieurs fois).
2. **Aligner côte à côte** les pose au sol dans l'ordre de la liste ; ajustez ensuite chacun avec les poignées (**Déplacer**, **Tourner**) et sa **taille** en mètres. Cliquez sur un modèle dans la vue pour le sélectionner.
3. **Créer le modèle assemblé** : le serveur produit un nouveau fichier GLB. Chaque modèle y garde ses animations, qui jouent ensemble, et les modèles d'origine ne changent pas. Le nouveau fichier passe le contrôle automatique comme un import : validez-le, puis utilisez-le dans une animation.

### 4.3 Créer une animation

**Animations › Nouvelle animation**. Le formulaire suit 5 étapes :

1. **Animation** : titre et type. **Animation de monument** (grande, autour d'un bâtiment, réservée aux agents) ou **animation d'affiche** (courte, elle sort de l'affiche).
2. **Modèle 3D et son** : choisissez le modèle (ou importez-le directement ici) et, si vous voulez, un son.
3. **Placement** :
   - **Monument** : cochez « Placer l'animation moi-même » pour la déplacer sur la carte 3D autour du bâtiment (glisser le repère, poignée pour l'orienter, hauteur et taille en mètres).
   - **Affiche** : une vue 3D montre l'affiche au mur et le modèle. Choisissez **Devant** ou **Au-dessus** de l'affiche, la **taille**, puis déplacez le modèle avec les flèches dans la vue ou avec les curseurs, dans un rayon de **3 m** autour de l'affiche. Une animation de monument utilisée sur une affiche se règle dans la section « Quand elle sort d'une affiche ».
4. **Diffusion** : durée, date de sortie et date de fin (obligatoire pour une animation d'affiche).
5. **Transcription du son** pour les personnes sourdes ou malentendantes : obligatoire en français seulement si vous avez choisi un son.

**Enregistrer** garde un brouillon invisible des visiteurs ; **Enregistrer et activer** la diffuse à ses dates.

### 4.4 Créer une affiche

**Affiches › Nouvelle affiche**, en 5 étapes :

1. **Affiche** : importez votre affiche déjà mise en page (**PDF**, PNG, JPEG ou WebP) et choisissez le format d'impression (A4 à A0). L'image sert aussi à la reconnaissance par la caméra : préférez une affiche riche en détails.
2. **Informations** : nom, accroche, texte montré au visiteur, dates.
3. **Expérience** : l'animation qui sort de l'affiche et le monument vers lequel la carte guidera le visiteur. Un message vous prévient si l'animation n'est pas diffusée pendant toute la période de l'affiche.
4. **QR code** : il est généré automatiquement ; glissez-le sur l'affiche (3 cm minimum à l'impression).
5. **Validation** : les 4 conditions de publication (compte vérifié, fichiers conformes, charte acceptée, zone attribuée), puis **Publier** et téléchargement en **PDF** prêt à imprimer.

**Voir l'affiche** l'ouvre en plein écran : vous pouvez scanner son QR code directement sur l'écran.

### 4.5 Les partenaires

1. Le partenaire crée son compte sur `/backoffice/inscription`.
2. Un agent le vérifie dans **Partenaires**.
3. Le partenaire accepte la **charte d'utilisation**, puis crée ses modèles, animations d'affiche et affiches.
4. Un agent lui attribue une **zone d'affichage** (Monuments & zones › onglet Attributions).

Les contenus des partenaires ne sont pas validés un par un : la mairie peut les suspendre ou les retirer à tout moment (**Signalements**, **Modération**).

### 4.6 Côté visiteur

- **Carte** : les monuments, la distance, l'itinéraire à pied, le message « Vous êtes arrivé » dans le rayon.
- **Scan d'une affiche** : consignes, autorisation de la caméra, l'animation sort de l'affiche, puis la carte s'ouvre sur le monument promu.
- **Au monument** : dans le rayon, l'animation apparaît à l'endroit choisi dans le back-office.
- Partout : bouton **Signaler** anonyme, langues français / anglais / allemand.

---

## 5. Tester avec un téléphone

La caméra d'un téléphone ne fonctionne que sur une page **HTTPS**.

1. Le PC et le téléphone sont sur le **même Wi-Fi**.
2. Lancez :

   ```bash
   npm run dev:mobile
   ```

3. Sur le PC, ouvrez [https://localhost:5173/backoffice](https://localhost:5173/backoffice) et acceptez l'avertissement de certificat (« Paramètres avancés › Continuer »).
4. Ouvrez une affiche **publiée** avec **Voir l'affiche** : son QR code pointe automatiquement vers l'adresse réseau du PC.
5. Scannez le QR code avec l'**appareil photo** du téléphone, acceptez l'avertissement de certificat la première fois, puis **Autoriser et commencer**.
6. Visez l'affiche (sur l'écran du PC ou imprimée) : l'animation en sort et reste en place quand vous bougez le téléphone. Sur iPhone, iOS 16.4 minimum.

Pour éviter l'avertissement de certificat, vous pouvez passer par un tunnel HTTPS :

```bash
npx cloudflared tunnel --url http://localhost:5173
```

puis ouvrir sur le PC l'adresse `https://….trycloudflare.com/backoffice` affichée.

---

## 6. Problèmes fréquents

| Problème | Solution |
| --- | --- |
| `Can't reach database server` au lancement | MySQL n'est pas démarré dans XAMPP, ou `DATABASE_URL` est faux dans `.env`. |
| `The column … does not exist` | La base est plus ancienne que le code : appliquez les migrations (section 8). |
| Le téléphone affiche « animation indisponible » ou « expirée » | L'affiche doit être **publiée**, dans ses dates, avec une **zone attribuée**, et son **animation doit être activée et dans ses dates** elle aussi. L'étape 5 de l'éditeur d'affiche indique ce qui manque. |
| Le téléphone n'arrive pas à ouvrir le site | Même Wi-Fi ? Autorisez le port 5173 dans le pare-feu Windows (réseau privé). Si l'adresse du QR code est fausse, forcez-la dans `.env` : `URL_RESEAU=https://<ip-du-pc>:5173`. |
| L'affiche n'est pas reconnue par la caméra | Plus de lumière, 0,5 à 3 m de distance, angle de moins de 45°. Une affiche peu détaillée se reconnaît mal. |
| Aucun mail n'arrive | Sans Mailpit, les mails ne partent pas : ils sont écrits dans le terminal de `npm run dev`. Lancez Mailpit et ouvrez [http://localhost:8025](http://localhost:8025). |
| Mot de passe perdu | `npm run changer-mot-de-passe -- --email adresse@exemple.fr` |
| Le modèle 3D est couché ou tourné | Atelier 3D › Orientation (souvent −90° en X), puis **Enregistrer**. |

---

## 7. Commandes utiles

| Commande | Effet |
| --- | --- |
| `npm run dev` | Lance l'API (port 3000) et le site (port 5173) |
| `npm run dev:mobile` | Même chose en HTTPS, pour tester avec un téléphone |
| `npm run creer-agent -- --email … --nom "…"` | Crée un compte agent de la mairie |
| `npm run changer-mot-de-passe -- --email …` | Génère un nouveau mot de passe pour un compte |
| `npm run combiner-animations` | Ajoute l'animation combinée aux anciens modèles GLB |
| `npm test` | Lance les tests de l'API (section 9) |
| `npm run build` | Prépare la version de production dans `dist/` |
| `npm start` | Lance l'API en production |

---

## 8. Mettre à jour une base existante

Si votre base `webar` a été créée avant une évolution, importez dans phpMyAdmin (ou avec `mysql -u root webar < fichier`) les migrations de `database/migrations/` qui manquent, **dans l'ordre des dates** :

| Fichier | Ajoute |
| --- | --- |
| `2026-11-16_atelier_3d.sql` | Réglages et optimisation de l'atelier 3D |
| `2026-11-16_placement_gps.sql` | Placement GPS en 3D des animations de monument |
| `2026-11-17_reglage_affiche.sql` | Position (devant / au-dessus) et taille sur l'affiche |
| `2026-11-18_decalage_affiche.sql` | Déplacement du modèle autour de l'affiche (rayon de 3 m) |
| `2026-11-21_dossiers_fichiers.sql` | Dossiers de la bibliothèque de fichiers (affiche + modèle 3D + son) |

Le script `database/montbeliard_webar.sql` contient déjà les trois premières et la dernière (dossiers) : après une installation neuve, seule `2026-11-18_decalage_affiche.sql` est à importer.

---

## 9. Tests et mise en ligne

### Tests

```bash
npm test
```

Les tests de l'API recréent une base séparée, `webar_test`, à chaque lancement, à partir de `database/montbeliard_webar.sql`.

> **Attention** : ce script ne doit contenir ni `DROP DATABASE`, ni `CREATE DATABASE`, ni `USE`. Sinon, les tests effaceraient votre base de travail `webar`.

### Mise en ligne

`npm run build` produit le site dans `dist/`. En production (`NODE_ENV=production`), `npm start` lance l'API, qui sert aussi le site : un seul serveur Node.js (VPS) avec MariaDB, derrière HTTPS.

`vercel.json` ne déploie que le site sans l'API : seul, il ne peut rien afficher.

---

## 10. Détails techniques

### Architecture

| Partie | Technologies |
| --- | --- |
| Site visiteur et back-office (`src/`) | React 19, TypeScript, Vite, React Router, TanStack Query, MapLibre GL JS, Three.js, moteur 8th Wall (reconnaissance d'image + SLAM), ALTCHA |
| API (`api/`) | Node.js 24, Express 5, Prisma 7 (MariaDB / MySQL), sessions en base, Argon2id, helmet, csrf-csrf, express-rate-limit, multer + file-type, glTF-Validator + glTF-Transform, ffprobe, sharp, pdf-lib + qrcode, Nodemailer, pino |
| Code partagé (`src/commun/`) | Types, constantes et schémas Zod utilisés par l'API et les formulaires |
| Tests (`api/tests/`) | Vitest + Supertest sur la base `webar_test` |

Le site appelle l'API sous `/api/v1` (relayée par Vite en développement) ; les fichiers importés sont servis sous `/uploads`.

### Limites des fichiers

| Fichier | Maximum | Contrôle |
| --- | --- | --- |
| Modèle 3D GLB | 100 Mo ; 30 000 triangles (affiche) ou 100 000 (monument) | glTF-Validator, triangles, textures, animations intégrées |
| Son MP3 / AAC | 2 Mo, 120 s | ffprobe |
| Image (affiche, visuel) | 30 Mo, 600 px minimum sur le petit côté | file-type, réencodage sharp |

### Pages

**Site visiteur** (`src/visiteur`)

| Adresse | Page |
| --- | --- |
| `/` | Carte, position, distances, message de proximité, itinéraire à pied |
| `/lieux/:id` | Fiche du monument, horaires, score du stade, transcription sans caméra |
| `/lieux/:id/ra` | Animation de monument posée à son point GPS en 3D |
| `/a/:code` | Entrée par QR code : animation d'affiche puis carte |
| `/agenda` | Spectacles en cours et à venir |
| `/scanner` | Scanner une affiche ou relancer le spectacle d'un lieu |
| `/mentions` | Mentions légales et confidentialité |

**Back-office** (`src/backoffice`)

| Adresse | Page | Rôle |
| --- | --- | --- |
| `/backoffice/connexion`, `/inscription` | Connexion, inscription d'un partenaire | tous |
| `/backoffice` | Vue d'ensemble (statistiques, tâches à traiter) | tous |
| `/backoffice/animations` | Animations, placement, diffusion | tous |
| `/backoffice/affiches` | Affiches, QR code, publication, export PDF | tous |
| `/backoffice/fichiers` | Modèles 3D, sons, atelier 3D | tous |
| `/backoffice/statistiques` | Statistiques anonymes | tous |
| `/backoffice/charte`, `/mes-signalements` | Charte, signalements reçus | partenaire |
| `/backoffice/lieux` | Monuments, zones d'affichage, attributions | agent |
| `/backoffice/partenaires`, `/signalements`, `/moderation`, `/journal` | Comptes, signalements, décisions, journal | agent |
| `/backoffice/score` | Score du match | agent |

### Réalité augmentée

- **Moteur** : binaire 8th Wall ([`@8thwall/engine-binary`](https://github.com/8thwall/engine) 1.0.0) piloté en Three.js, car WebXR n'existe pas dans Safari sur iPhone. Il reconnaît l'affiche puis suit la pièce (SLAM) : l'animation reste en place même quand l'affiche n'est plus filmée. Tout est calculé dans le téléphone ; aucune image n'est envoyée.
- **Cible de reconnaissance** : générée par le serveur à partir de l'affiche (recadrage 3:4, image 480 × 640, `api/src/traitements/cibleImage.ts`), rangée dans `uploads/cibles/`.
- **Affiche** : le modèle est posé devant ou au-dessus de l'affiche, à sa taille relative, puis déplacé de la distance choisie (en mètres, 3 m au plus), à l'échelle de l'affiche imprimée (`src/commun/impression.ts`, `src/visiteur/ra/contenu3d.ts`). L'aperçu du back-office utilise exactement le même calcul.
- **Monument** : pas de reconnaissance du bâtiment ; dans le rayon, l'animation est posée à son point GPS en 3D (`src/visiteur/ra/ancrageGps.ts` : GPS, boussole et SLAM moyennés).
- **Chargement** : `xr.js` et `xr-slam.js` sont servis sous `/xr8/`, les décodeurs Draco et KTX2 sous `/draco/` et `/basis/`, et téléchargés pendant les consignes.
- **Ordinateur** : le SLAM ne fonctionne que sur smartphone ; sur PC, l'application montre un aperçu simulé.
- **Licence du moteur** : binaire gratuit sous *XR Engine License Agreement* de Niantic Spatial (pas une licence libre) ; la mention figure dans `index.html` et les mentions légales.

### Limites actuelles

- **Score du stade** : affiché en surimpression HTML, pas encore en texte 3D.
- **Carte** : fond OpenFreeMap (données OpenStreetMap) ; le cahier des charges prévoit à terme un fichier PMTiles servi par l'API.
- **Itinéraire** : calculé par le service OSRM piéton de FOSSGIS, uniquement à la demande du visiteur ; sa position est alors envoyée à ce service (indiqué dans les mentions légales).
- **Caméra absente ou refusée** : mode « caméra simulée » avec le visuel du lieu.

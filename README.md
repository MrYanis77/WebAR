# Montbéliard Expériences — WebAR

Application web de réalité augmentée (sans installation) qui relie le patrimoine de Montbéliard aux événements de la ville, et son back-office pour les agents de la mairie et les partenaires.

Le design reprend la maquette Figma *maquette-projet-co-test* (palette `--wine #7b1e2e`, `--cyan #4fd1c5`, `--chalk #faf8f4`, `--ink #1e2024`, polices Bricolage Grotesque et Inter). Les pages et états absents de la maquette ont été conçus dans le même style à partir du cahier des charges fonctionnel et technique.

## Architecture

| Partie | Technologies (cahier des charges technique) |
| --- | --- |
| Application visiteur et back-office (`src/`) | React 19, TypeScript, Vite, React Router, TanStack Query, MapLibre GL JS, Three.js, 8th Wall (reconnaissance d'image + SLAM), ALTCHA (widget) |
| API (`api/`) | Node.js 24, Express 5, Prisma 7 (MariaDB/MySQL), express-session + express-mysql-session, Argon2id, double authentification par code envoyé par mail (Nodemailer), helmet, csrf-csrf, express-rate-limit, multer + file-type, glTF-Validator + glTF-Transform, ffprobe, sharp, pdf-lib + qrcode, p-queue, Nodemailer, pino |
| Partagé (`src/commun/`) | types, constantes et schémas Zod utilisés à la fois par l'API et les formulaires |
| Tests (`api/tests/`) | Vitest + Supertest sur une base dédiée `webar_test` |

Le front appelle l'API sous `/api/v1` (proxy Vite en développement) ; les fichiers importés sont servis sous `/uploads`. Il n'y a plus aucune donnée de démonstration : tout est lu et écrit dans la base.

## Installation

Prérequis : Node.js 24, MariaDB ou MySQL (XAMPP convient), et facultativement [Mailpit](https://mailpit.axllent.org/) pour voir les mails envoyés.

1. **Dépendances** : `npm install` (génère aussi le client Prisma).
2. **Configuration** : copier `.env.example` en `.env` et remplir les secrets (une valeur aléatoire par secret, par exemple `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). `DATABASE_URL` pointe sur la base `webar`.
3. **Base de données** : créer la base `webar` (phpMyAdmin ou `CREATE DATABASE webar`), puis importer le script :

   ```bash
   mysql -u root webar < database/montbeliard_webar.sql
   ```

   Le script crée 17 tables et 6 vues, sans aucune donnée (il supprime d'abord les tables existantes).
4. **Premier agent de la mairie** (aucun compte n'existe à l'installation) :

   ```bash
   npm run creer-agent -- --email prenom.nom@montbeliard.fr --nom "Prénom Nom"
   ```

   La commande affiche le mot de passe généré. **La double authentification est désactivée provisoirement** (`DOUBLE_AUTHENTIFICATION=false` dans `.env`) : l'agent se connecte avec son seul mot de passe. Avec `DOUBLE_AUTHENTIFICATION=true`, à chaque connexion, l'agent saisit son mot de passe puis un code à 6 chiffres reçu par mail (valable 10 minutes, 5 essais, renvoi possible après 30 s). Aucune application d'authentification ni QR code n'est nécessaire.
5. **Lancement** : `npm run dev` démarre l'API (port `API_PORT`, 3000) et Vite (http://localhost:5173).

Les partenaires créent leur compte sur `/backoffice/inscription` ; un agent le vérifie dans « Partenaires », puis le partenaire accepte la charte avant d'importer des fichiers.

Sans serveur SMTP (Mailpit sur le port 1025), les mails ne partent pas : ils sont consignés comme avertissements dans les journaux de l'API. En développement uniquement, le code de connexion des agents y est alors écrit pour pouvoir se connecter ; en production, la connexion échoue (503) tant que le mail ne peut pas partir.

## Tester une affiche avec un téléphone

1. Le PC et le téléphone sont sur le **même réseau Wi-Fi**.
2. Lancer `npm run dev:mobile` : l'API et le site démarrent en **HTTPS** (certificat auto-signé), car un téléphone n'autorise la caméra que sur une page HTTPS. Vite affiche l'adresse réseau, par exemple `https://192.168.1.20:5173`.
3. Sur le PC, ouvrir `https://localhost:5173/backoffice` (accepter l'avertissement de certificat), se connecter, puis cliquer sur **Voir l'affiche** (accueil du back-office, liste des affiches ou éditeur). L'affiche s'affiche en plein écran ; son QR code pointe automatiquement vers l'adresse réseau du PC.
4. Scanner le QR code avec l'**appareil photo** du téléphone (ou Google Lens) : le navigateur du téléphone ouvre l'affiche ; accepter l'avertissement de certificat la première fois, puis **Autoriser et commencer** (caméra, et sur iPhone mouvement et orientation). Viser ensuite l'affiche affichée sur l'écran du PC (ou imprimée) : l'animation 3D en surgit et reste en place dans la pièce quand on détourne le téléphone (voir « Réalité augmentée » ci-dessous).

L'affiche doit être **publiée**, dans sa période de diffusion, avec une **zone d'affichage attribuée** ; sinon le téléphone affiche « animation indisponible ». Si le téléphone n'arrive pas à joindre le PC, autoriser le port 5173 dans le pare-feu Windows (réseau privé). Expo Go ne sert pas ici : il ouvre des applications React Native, alors que ce projet est un site web.

## Taille des fichiers

| Fichier | Maximum | Contrôle |
| --- | --- | --- |
| Modèle 3D GLB (animations intégrées comprises) | **100 Mo** — valeur de la base (contrainte `ck_fichier_taille`), supérieure au cahier des charges | glTF-Validator, triangles (30 000 affiche / 100 000 lieu), textures, animations listées dans `fichier_clip` |
| Son MP3 / AAC | 2 Mo, 120 s | ffprobe |
| Image (affiche, visuel, façade) | 30 Mo | file-type, réencodage sharp |

## Tests

```bash
npm test
```

Les 28 tests de l'API recréent la base `webar_test` à chaque lancement (la base `webar` n'est jamais touchée) : authentification et blocage après 5 échecs, code de connexion par mail (code faux, renvoi, usage unique, 5 essais), CSRF, droits par rôle, imports (GLB de 60 Mo accepté, plus de 100 Mo refusé par l'API et par la base, clips du GLB, faux fichier, son, image), règle des 4 conditions, PDF, placement GPS en 3D des animations de lieu, parcours visiteur par QR code (avec la cible 8th Wall générée), statistiques, signalement anonyme limité à 5 par heure, suspension, réexamen et suppressions protégées.

## Déploiement

`npm run build` produit le front dans `dist/`. En production (`NODE_ENV=production`), `npm start` lance l'API qui sert aussi `dist/` : un seul serveur Node (VPS, conformément au cahier des charges) derrière HTTPS.

**Vercel** : `vercel.json` ne déploie que le front statique. Sans API hébergée, l'application déployée sur Vercel ne peut plus rien afficher : il faut un serveur Node + MariaDB (VPS), ou adapter l'API en fonctions serverless avec une base distante.

## Pages

**Application visiteur** (`src/visiteur`)

| Route | Page | Exigences |
| --- | --- | --- |
| `/` | Carte MapLibre plein écran, position, distances, lieu promu, message de proximité, itinéraire à pied vers le monument | BF-05, BF-06, BF-08, BF-14, BF-32, BF-33 |
| `/lieux/:id` | Fiche du lieu, horaires, score du stade, transcription sans caméra | BF-07, BF-22, BNF-11 |
| `/lieux/:id/ra` | Consignes, animation de lieu (8th Wall : détail de façade reconnu, sinon GPS + boussole), photo, sous-titres | BF-03, BF-17 à BF-20, BNF-12 |
| `/a/:code` | Entrée par QR code : animation d'affiche puis carte centrée sur le lieu promu | BF-02, BF-16, BF-30 à BF-33 |
| `/agenda` | Spectacles en cours et à venir | BF-22, BF-26 |
| `/scanner` | Scanner une affiche ou relancer le spectacle d'un lieu | BF-10 |
| `/mentions` | Mentions légales, confidentialité, registre des contenus tiers | BNF-09, BNF-15, BNF-24 |

Partout : signalement anonyme (BF-45 à BF-51), FR/EN/DE (BF-13), messages d'erreur avec action (BF-09), états de démonstration dans le menu (i).

**Back-office** (`src/backoffice`) — menus filtrés selon le rôle, page « accès réservé » pour un partenaire sur une route d'agent.

| Route | Page | Rôle |
| --- | --- | --- |
| `/backoffice/connexion`, `/inscription` | Connexion + double authentification, inscription partenaire avec anti-robot | tous |
| `/backoffice` | Vue d'ensemble (statistiques, tâches à traiter) | tous |
| `/backoffice/animations` | Animations, dates de diffusion, transcription | tous |
| `/backoffice/affiches`, `/affiches/nouvelle` | Import de votre affiche (PNG, JPEG, WebP), QR code unique généré et placé par glisser-déposer, format A4 à A0 visible à l’échelle, aperçu 3D de l’animation qui sort de l’affiche, 4 conditions de publication, export PNG ou PDF | tous |
| `/backoffice/fichiers` | Import GLB/MP3/AAC/PNG/JPEG, contrôle automatique, aperçu 3D (Three.js) | tous |
| `/backoffice/statistiques` | Statistiques anonymes, export CSV | tous |
| `/backoffice/charte`, `/mes-signalements` | Charte d'utilisation, signalements reçus et réexamen | partenaire |
| `/backoffice/lieux` | Lieux (position, rayon, fiches FR/EN/DE, photos de façade), zones, attributions | agent |
| `/backoffice/partenaires`, `/signalements`, `/moderation`, `/journal` | Vérification des comptes, file des signalements, décisions, journal horodaté | agent |
| `/backoffice/score` | Score du match | agent |

## Réalité augmentée (8th Wall + Three.js)

Conformément au cahier des charges technique (sections 1 et 3.1), la RA visiteur utilise le **moteur 8th Wall** (binaire distribué [`@8thwall/engine-binary`](https://github.com/8thwall/engine), version figée 1.0.0) piloté directement en **Three.js** : WebXR n'est pas disponible dans Safari sur iPhone. Le moteur lit la caméra, reconnaît l'affiche ou un détail de façade (*image target*), puis suit l'environnement (**SLAM**) : l'animation reste en place autour du visiteur, même quand l'affiche n'est plus filmée. Tout est calculé dans le téléphone.

| Étape | Fonctionnement |
| --- | --- |
| Cible de reconnaissance | Générée par le serveur à partir du visuel de l'affiche (ou d'une photo de façade) avec sharp, au format de l'outil officiel `image-target-cli` : recadrage 3:4, image de luminance 480 × 640 et JSON, rangés dans `uploads/cibles/` (`api/src/traitements/cibleImage.ts`). Un visuel de moins de 480 × 640 px après recadrage ne donne pas de cible. |
| Affiche | `GET /public/affiches/:code` renvoie la cible. À la reconnaissance, l'animation est posée devant l'affiche, debout, à sa taille ; viser de nouveau l'affiche la recale. Sans reconnaissance en 15 s : conseils, et bouton **Poser l'animation devant moi** (SLAM). |
| Monument | `GET /public/lieux/:id/cibles` renvoie les cibles des photos de façade. Un détail reconnu pose l'animation au-dessus. Sans reconnaissance en 20 s : bouton **Lancer manuellement** dans le rayon du lieu, qui pose l'animation à sa **position GPS en 3D**. Lieu sans photo de façade : placement GPS automatique dès que le visiteur est dans le rayon. |
| Placement GPS en 3D | Chaque animation de lieu peut avoir sa position (latitude, longitude), la hauteur de son socle au-dessus du sol, l'orientation de sa face avant et sa taille en mètres (back-office, « Position du modèle dans l'espace » ; sinon position du lieu, 10 m de haut, 12 m de taille). Dans le téléphone, `src/visiteur/ra/ancrageGps.ts` relie le repère géographique au repère SLAM : deux fois par seconde, il associe position GPS, cap de la boussole et pose de la caméra, puis moyenne ces mesures (angle du nord, point de référence pondéré par la précision du GPS). Le modèle se stabilise à mesure que le visiteur regarde autour de lui ; une flèche indique de quel côté tourner si l'animation est hors champ. Sans boussole, le téléphone est supposé viser le monument. Une façade reconnue reste prioritaire (plus précise). Base existante : `mysql -u root webar < database/migrations/2026-11-16_placement_gps.sql`. |
| Chargement | `xr.js` (1 Mo) et `xr-slam.js` (5,4 Mo) sont servis sous `/xr8/` (plugin dans `vite.config.ts`, copiés dans `dist/xr8/` au build) et téléchargés pendant les consignes avec le modèle et le son ; Three.js n'est chargé qu'à l'ouverture de la caméra. Les décodeurs Draco (`/draco/`) et KTX2 (`/basis/`) de three.js sont servis de la même façon. |
| iPhone | Le bouton **Autoriser et commencer** des consignes demande l'accès au mouvement et à l'orientation (`DeviceOrientationEvent.requestPermission`), nécessaire au SLAM et à la boussole ; iOS 16.4 minimum. |
| Ordinateur | Le SLAM ne fonctionne que sur smartphone : l'application affiche un aperçu simulé (modèle Three.js par-dessus la webcam ou le visuel). Même repli si le moteur échoue (capteurs refusés, navigateur non pris en charge). |

Le modèle est celui servi par l'API, avec le clip et le mode de lecture choisis dans le back-office ; sans clip choisi, toutes les animations du GLB sont jouées ensemble. L'aperçu 3D du back-office utilise encore Three.js (le cahier des charges prévoit `<model-viewer>`) ; l'animation combinée « Toutes les animations (WebAR) » ajoutée au contrôle des GLB (`npm run combiner-animations` pour les anciens) sert à ce futur aperçu.

**Licence du moteur** : binaire gratuit sous licence *XR Engine License Agreement* de Niantic Spatial (pas une licence libre) ; la mention requise figure dans `index.html` et dans les mentions légales. Le framework open source 8th Wall (MIT) ne contient pas le SLAM.

**Tester sur téléphone** : `npm run dev:mobile` suffit (le certificat auto-signé est accepté après l'avertissement). Pour éviter l'avertissement, un tunnel HTTPS avec un vrai certificat :

```bash
npx cloudflared tunnel --url http://localhost:5173
```

puis ouvrir sur le PC l'adresse `https://….trycloudflare.com/backoffice` affichée par cloudflared : le QR code de « Voir l'affiche » pointe alors vers cette adresse publique.

## Ce qui reste simulé
- **Caméra** : sans webcam (ou si l'accès est refusé), le mode « caméra simulée » affiche le visuel du lieu ou un fond neutre.
- **Optimisation des modèles** (Meshopt, KTX2) : non faite ; les GLB sont servis tels qu'importés (l'application visiteur sait déjà lire les GLB compressés Meshopt, Draco et KTX2).
- **Réglage du placement** (devant / au-dessus de l'affiche, taille) : valeurs par défaut (devant, taille de l'affiche) ; le choix par le partenaire n'est pas encore en base.
- **Score du stade en texte 3D** (troika-three-text) : le score reste affiché en surimpression HTML.
- **Carte** : MapLibre GL JS avec le fond OpenFreeMap (données OpenStreetMap, sans clé). Le cahier des charges prévoit à terme un fichier PMTiles servi par l'API. Les cartes du back-office (lieux, zones) utilisent encore le fond SVG stylisé.
- **Itinéraire** : calculé par le serveur OSRM piéton de FOSSGIS (routing.openstreetmap.de), uniquement à la demande du visiteur ; la position est alors envoyée à ce service (mentionné dans les mentions légales). Sans GPS, l'option « Partir de la gare de Montbéliard (démo) » permet de tester.

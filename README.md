# Montbéliard Expériences — WebAR

Application web de réalité augmentée (sans installation) qui relie le patrimoine de Montbéliard aux événements de la ville, et son back-office pour les agents de la mairie et les partenaires.

Le design reprend la maquette Figma *maquette-projet-co-test* (palette `--wine #7b1e2e`, `--cyan #4fd1c5`, `--chalk #faf8f4`, `--ink #1e2024`, polices Bricolage Grotesque et Inter). Les pages et états absents de la maquette ont été conçus dans le même style à partir du cahier des charges fonctionnel et technique.

## Lancer le projet

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # vérification TypeScript + build de production
```

L'application visiteur occupe tout l'écran ; sur ordinateur, elle garde la largeur d'un smartphone (480 px max.). Une bascule « Application visiteur / Back-office » en bas à droite permet de passer de l'une à l'autre (masquée sur smartphone).

### Déploiement sur Vercel

Le fichier `vercel.json` est prêt : build `npm run build`, dossier `dist`, et redirection de toutes les routes vers `index.html` (indispensable pour ouvrir directement `/a/<code>` ou `/backoffice`). Deux façons de déployer :

- importer le dépôt GitHub sur [vercel.com/new](https://vercel.com/new) (aucun réglage à changer) ;
- ou en ligne de commande : `npx vercel` puis `npx vercel --prod`.

Vercel sert le site en HTTPS, ce qui permet d'utiliser la caméra et la géolocalisation sur smartphone.

Comptes de démonstration du back-office (`/backoffice`) — tout mot de passe de 8 caractères ou plus est accepté :

| Rôle | E-mail | Remarque |
| --- | --- | --- |
| Agente de la mairie | `c.martin@montbeliard.fr` | demande un code TOTP (tout code à 6 chiffres) |
| Partenaire vérifié | `hugo@festival-momes.test` | Festival des Mômes |
| Partenaire en attente | `thomas@pages-or.test` | connexion refusée tant que le compte n'est pas vérifié |

Les données de démonstration sont gardées dans le `localStorage` du navigateur ; le bouton « Réinitialiser la démo » du back-office les remet à zéro.

## Pages

**Application visiteur** (`src/visiteur`)

| Route | Page | Exigences |
| --- | --- | --- |
| `/` | Carte des spectacles, position, distances, lieu promu, message de proximité | BF-05, BF-06, BF-08, BF-32, BF-33 |
| `/lieux/:id` | Fiche du lieu, horaires, score du stade, transcription sans caméra | BF-07, BF-22, BNF-11 |
| `/lieux/:id/ra` | Consignes, animation de lieu, échec de reconnaissance et lancement manuel, photo, sous-titres | BF-03, BF-17 à BF-20, BNF-12 |
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
| `/backoffice/affiches`, `/affiches/nouvelle` | Liste, éditeur en 4 étapes, QR code, 4 conditions de publication, export PDF | tous |
| `/backoffice/fichiers` | Import GLB/MP3/AAC/PNG/JPEG, contrôle automatique, aperçu 3D (Three.js) | tous |
| `/backoffice/statistiques` | Statistiques anonymes, export CSV | tous |
| `/backoffice/charte`, `/mes-signalements` | Charte d'utilisation, signalements reçus et réexamen | partenaire |
| `/backoffice/lieux` | Lieux (position, rayon, fiches FR/EN/DE, photos de façade), zones, attributions | agent |
| `/backoffice/partenaires`, `/signalements`, `/moderation`, `/journal` | Vérification des comptes, file des signalements, décisions, journal horodaté | agent |
| `/backoffice/score`, `/modeles` | Score du match, modèles d'affiche de la Ville | agent |

## Ce qui reste simulé

- **Reconnaissance d'image** : la détection de l'affiche et de la façade est simulée (succès au bout de 3,5 s, ou état forcé avec le sélecteur « Démo »). Le moteur MindAR / LocAR est à brancher derrière `VueRA`.
- **API et base de données** : `src/commun/store.ts` joue le rôle de l'API Express/Prisma (mêmes règles : 4 conditions de publication, droits par rôle, décisions, journal).
- **Caméra** : sans webcam (ou si l'accès est refusé), l'application propose un mode « caméra simulée » qui utilise les photos de la maquette.
- **Carte** : fond SVG stylisé du centre-ville, en attendant MapLibre + PMTiles.

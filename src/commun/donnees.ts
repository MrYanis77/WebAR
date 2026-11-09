// Jeu de données de démonstration. Il remplace l'API Express tant qu'elle n'est pas branchée.
import type {
  Affiche,
  Animation,
  Decision,
  EntreeJournal,
  Fichier,
  Lieu,
  ModeleAffiche,
  Partenaire,
  PointStat,
  Signalement,
  Zone,
} from './types'

export const VILLE_ID = 'ville'

export const lieuxInitiaux: Lieu[] = [
  {
    id: 'chateau',
    nom: 'Château des Ducs de Wurtemberg',
    nomCourt: 'Château',
    categorie: { fr: 'Patrimoine & histoire', en: 'Heritage & history', de: 'Erbe & Geschichte' },
    adresse: 'Cour du Château, Montbéliard',
    description: {
      fr: 'Dominant la ville depuis son éperon rocheux, le château témoigne de quatre siècles de présence des ducs de Wurtemberg à Montbéliard. Ses deux tours rondes, la tour Henriette et la tour Frédéric, abritent aujourd’hui le musée.',
      en: 'Overlooking the town from its rocky spur, the castle bears witness to four centuries of the Dukes of Württemberg in Montbéliard. Its two round towers, Henriette and Frédéric, now house the museum.',
      de: 'Das Schloss thront auf seinem Felsvorsprung über der Stadt und zeugt von vier Jahrhunderten württembergischer Herzöge in Mömpelgard. Seine beiden Rundtürme beherbergen heute das Museum.',
    },
    latitude: 47.50969,
    longitude: 6.79852,
    rayonM: 50,
    image: 'chateau',
    photosFacade: 12,
    actif: true,
    accesLibre: true,
  },
  {
    id: 'stade',
    nom: 'Stade Auguste-Bonal',
    nomCourt: 'Stade Bonal',
    categorie: { fr: 'Sport & émotions', en: 'Sport & emotions', de: 'Sport & Emotionen' },
    adresse: 'Impasse de la Forge, Montbéliard',
    description: {
      fr: 'Inauguré en 1931, le stade Bonal est le théâtre historique du FC Sochaux-Montbéliard et de ses plus grandes émotions sportives. L’animation affiche le score du dernier match en direct.',
      en: 'Opened in 1931, Stade Bonal is the historic home of FC Sochaux-Montbéliard and its greatest sporting moments. The animation shows the latest match score live.',
      de: 'Das 1931 eröffnete Stade Bonal ist die historische Heimat des FC Sochaux-Montbéliard. Die Animation zeigt den Spielstand des letzten Spiels live.',
    },
    latitude: 47.51222,
    longitude: 6.81111,
    rayonM: 80,
    image: 'stade',
    photosFacade: 9,
    scoreDomicile: 2,
    scoreExterieur: 1,
    equipeDomicile: 'FCSM',
    equipeExterieur: 'ASNL',
    competition: 'Championnat National',
    minute: '90:00 · Victoire',
    scoreMajLe: '2026-11-08T21:52:00',
    actif: true,
    accesLibre: true,
  },
  {
    id: 'parc',
    nom: 'Parc du Près-la-Rose',
    nomCourt: 'Près-la-Rose',
    categorie: { fr: 'Nature & sciences', en: 'Nature & science', de: 'Natur & Wissenschaft' },
    adresse: 'Rue du Près-la-Rose, Montbéliard',
    description: {
      fr: 'Parc scientifique au bord de l’Allan, le Près-la-Rose mêle jardins, sculptures et expériences ludiques autour des sciences.',
      en: 'A science park on the banks of the Allan, mixing gardens, sculptures and playful experiments.',
      de: 'Ein Wissenschaftspark am Ufer der Allan mit Gärten, Skulpturen und spielerischen Experimenten.',
    },
    latitude: 47.5046,
    longitude: 6.8037,
    rayonM: 60,
    photosFacade: 0,
    actif: false,
    accesLibre: true,
  },
]

export const animationsInitiales: Animation[] = [
  {
    id: 'anim-reveil',
    proprietaireId: VILLE_ID,
    titre: 'Le réveil des Ducs',
    type: 'LIEU',
    lieuId: 'chateau',
    modeleId: 'f2',
    sonId: 'f5',
    declencheur: 'MONUMENT',
    dureeS: 420,
    debut: '2026-09-01T10:00:00',
    statut: 'PUBLIEE',
    transcription: {
      fr: 'Roulement de tambours. Les bannières des Wurtemberg se déploient sur les tours tandis qu’une voix raconte l’arrivée du duc Frédéric en 1581.',
      en: 'Drum roll. The Württemberg banners unfurl on the towers while a voice tells of Duke Frederick’s arrival in 1581.',
      de: 'Trommelwirbel. Die württembergischen Banner entfalten sich an den Türmen, während eine Stimme von der Ankunft Herzog Friedrichs 1581 erzählt.',
    },
    lancements: 3120,
    modifieLe: '2026-10-28T09:12:00',
  },
  {
    id: 'anim-lumieres',
    proprietaireId: VILLE_ID,
    titre: 'La légende des lumières',
    type: 'LIEU',
    lieuId: 'chateau',
    modeleId: 'f2',
    sonId: 'f5',
    declencheur: 'MONUMENT',
    dureeS: 720,
    debut: '2026-12-01T17:30:00',
    fin: '2027-01-05T23:00:00',
    statut: 'PUBLIEE',
    transcription: {
      fr: 'Carillon de Noël. Une arche de lumière dorée s’élève au-dessus de la porte du château, la neige tombe et le conteur ouvre la légende.',
      en: 'Christmas chimes. A golden arch of light rises above the castle gate, snow falls and the storyteller begins the legend.',
      de: 'Weihnachtsglocken. Ein goldener Lichtbogen erhebt sich über dem Schlosstor, Schnee fällt und der Erzähler beginnt die Legende.',
    },
    lancements: 0,
    modifieLe: '2026-11-05T15:40:00',
  },
  {
    id: 'anim-bonal',
    proprietaireId: VILLE_ID,
    titre: 'Bonal en fête',
    type: 'LIEU',
    lieuId: 'stade',
    modeleId: 'f3',
    sonId: 'f6',
    declencheur: 'MONUMENT',
    dureeS: 300,
    debut: '2026-08-15T09:00:00',
    statut: 'PUBLIEE',
    transcription: {
      fr: 'Clameur de la foule. Le logo du club tourne au-dessus de la tribune et le tableau d’affichage révèle le score du dernier match.',
      en: 'Crowd roar. The club logo spins above the stand and the scoreboard reveals the latest match score.',
      de: 'Jubel der Menge. Das Vereinslogo dreht sich über der Tribüne und die Anzeigetafel zeigt den letzten Spielstand.',
    },
    lancements: 5309,
    modifieLe: '2026-11-08T21:52:00',
  },
  {
    id: 'anim-jardins',
    proprietaireId: VILLE_ID,
    titre: 'Les jardins du temps',
    type: 'LIEU',
    lieuId: 'parc',
    modeleId: 'f4',
    declencheur: 'MONUMENT',
    dureeS: 480,
    debut: '2027-04-01T10:00:00',
    fin: '2027-09-30T20:00:00',
    statut: 'BROUILLON',
    transcription: { fr: 'Chants d’oiseaux et bruissement des feuilles.', en: 'Birdsong and rustling leaves.', de: 'Vogelgesang und Blätterrauschen.' },
    lancements: 0,
    modifieLe: '2026-11-02T11:20:00',
  },
  {
    id: 'anim-porte',
    proprietaireId: VILLE_ID,
    titre: 'La porte du temps — Teaser 3D',
    type: 'AFFICHE',
    modeleId: 'f1',
    sonId: 'f5',
    declencheur: 'AFFICHE',
    dureeS: 20,
    debut: '2026-11-01T00:00:00',
    fin: '2027-01-05T23:00:00',
    statut: 'PUBLIEE',
    transcription: {
      fr: 'Une porte de pierre s’ouvre dans l’affiche ; des flocons lumineux s’en échappent.',
      en: 'A stone door opens in the poster; glowing snowflakes escape from it.',
      de: 'Ein Steintor öffnet sich im Plakat; leuchtende Schneeflocken entweichen.',
    },
    lancements: 2890,
    modifieLe: '2026-10-30T10:00:00',
  },
  {
    id: 'anim-momes',
    proprietaireId: 'p2',
    titre: 'La mascotte des Mômes',
    type: 'AFFICHE',
    modeleId: 'f7',
    sonId: 'f8',
    declencheur: 'AFFICHE',
    dureeS: 15,
    debut: '2026-11-01T00:00:00',
    fin: '2027-08-31T23:00:00',
    statut: 'PUBLIEE',
    transcription: {
      fr: 'Fanfare joyeuse. La mascotte saute hors de l’affiche et salue.',
      en: 'Cheerful brass band. The mascot jumps out of the poster and waves.',
      de: 'Fröhliche Blaskapelle. Das Maskottchen springt aus dem Plakat und winkt.',
    },
    lancements: 412,
    modifieLe: '2026-11-03T14:10:00',
  },
  {
    id: 'anim-marche',
    proprietaireId: 'p3',
    titre: 'Flocons du marché',
    type: 'AFFICHE',
    modeleId: 'f9',
    declencheur: 'AFFICHE',
    dureeS: 18,
    debut: '2026-11-01T00:00:00',
    fin: '2026-12-31T23:00:00',
    statut: 'PUBLIEE',
    transcription: {
      fr: 'Musique de boîte à musique ; des chalets miniatures s’illuminent.',
      en: 'Music-box melody; miniature chalets light up.',
      de: 'Spieluhrmelodie; Miniaturhütten leuchten auf.',
    },
    lancements: 960,
    modifieLe: '2026-11-04T09:30:00',
  },
]

export const zonesInitiales: Zone[] = [
  { id: 'z1', nom: 'Place Saint-Martin — panneau 1', adresse: 'Place Saint-Martin', latitude: 47.5094, longitude: 6.7993, regles: 'Format A2 maximum. Pas d’affichage sur la façade du temple (secteur protégé).', format: 'A2', active: true },
  { id: 'z2', nom: 'Rue de la Schliffe — vitrine 4', adresse: 'Rue de la Schliffe', latitude: 47.5079, longitude: 6.7971, regles: 'Vitrine municipale, format A3. Durée maximale 6 semaines.', format: 'A3', active: true },
  { id: 'z3', nom: 'Gare — hall voyageurs', adresse: 'Place de la Gare', latitude: 47.5103, longitude: 6.8034, regles: 'Accord SNCF requis. Format A2.', format: 'A2', active: true },
  { id: 'z4', nom: 'Esplanade du stade — totem', adresse: 'Impasse de la Forge', latitude: 47.5113, longitude: 6.8094, regles: 'Réservé aux événements sportifs et culturels. Format A1.', format: 'A1', active: true },
  { id: 'z5', nom: 'Près-la-Rose — entrée nord', adresse: 'Rue du Près-la-Rose', latitude: 47.5055, longitude: 6.8031, regles: 'Panneau extérieur, affiche plastifiée obligatoire.', format: 'A2', active: false },
]

export const modelesInitiaux: ModeleAffiche[] = [
  { id: 'm1', nom: 'Éditoriale', description: 'Photo & titre', format: 'A3', variante: 0, actif: true },
  { id: 'm2', nom: 'Immersive', description: 'Visuel plein format', format: 'A2', variante: 1, actif: true },
  { id: 'm3', nom: 'Événement', description: 'Programme détaillé', format: 'A3', variante: 2, actif: true },
]

export const partenairesInitiaux: Partenaire[] = [
  { id: 'p1', compteId: 'c1', nomStructure: 'Office de Tourisme', secteur: 'Tourisme', adresse: '1 rue Henri Mouhot, Montbéliard', contactNom: 'Sophie Girard', contactTelephone: '03 81 00 00 01', email: 'contact@ot-montbeliard.test', statut: 'VERIFIE', charteAccepteeLe: '2026-09-12T10:00:00', creeLe: '2026-09-10T08:30:00' },
  { id: 'p2', compteId: 'c2', nomStructure: 'Festival des Mômes', secteur: 'Événementiel', adresse: '8 rue de Belfort, Montbéliard', contactNom: 'Hugo Perrin', contactTelephone: '03 81 00 00 02', email: 'hugo@festival-momes.test', statut: 'VERIFIE', charteAccepteeLe: '2026-10-02T14:12:00', creeLe: '2026-09-28T16:45:00' },
  { id: 'p3', compteId: 'c3', nomStructure: 'Marché de Noël', secteur: 'Association', adresse: 'Place Denfert-Rochereau, Montbéliard', contactNom: 'Nadia Lefèvre', email: 'bureau@marche-noel.test', statut: 'VERIFIE', charteAccepteeLe: '2026-10-15T09:00:00', creeLe: '2026-10-14T11:00:00' },
  { id: 'p4', compteId: 'c4', nomStructure: 'Librairie Les Pages d’Or', secteur: 'Commerce', adresse: '22 rue des Febvres, Montbéliard', contactNom: 'Thomas Roy', contactTelephone: '03 81 00 00 04', email: 'thomas@pages-or.test', statut: 'EN_ATTENTE', creeLe: '2026-11-07T18:20:00' },
  { id: 'p5', compteId: 'c5', nomStructure: 'Brasserie du Faubourg', secteur: 'Restauration', adresse: '5 faubourg de Besançon, Montbéliard', contactNom: 'Inès Morel', email: 'ines@brasserie-faubourg.test', statut: 'EN_ATTENTE', creeLe: '2026-11-08T09:05:00' },
  { id: 'p6', compteId: 'c6', nomStructure: 'Escape Wurtemberg', secteur: 'Autre', adresse: '3 rue Cuvier, Montbéliard', contactNom: 'Paul Henry', email: 'paul@escape-w.test', statut: 'SUSPENDU', motifStatut: 'Affiche contenant un lien promotionnel externe non autorisé (charte §4).', charteAccepteeLe: '2026-09-20T10:00:00', creeLe: '2026-09-18T10:00:00' },
]

export const fichiersInitiaux: Fichier[] = [
  { id: 'f1', proprietaireId: VILLE_ID, type: 'MODELE_3D', nomOriginal: 'porte-du-temps.glb', tailleOctets: 3_350_000, nbTriangles: 24_800, textureMaxPx: 1024, statutControle: 'CONFORME', creeLe: '2026-10-29T10:00:00', usage: 'AFFICHE' },
  { id: 'f2', proprietaireId: VILLE_ID, type: 'MODELE_3D', nomOriginal: 'legende-lumieres.glb', tailleOctets: 8_400_000, nbTriangles: 84_000, textureMaxPx: 2048, statutControle: 'CONFORME', creeLe: '2026-10-20T10:00:00', usage: 'LIEU' },
  { id: 'f3', proprietaireId: VILLE_ID, type: 'MODELE_3D', nomOriginal: 'bonal-en-fete.glb', tailleOctets: 7_900_000, nbTriangles: 92_000, textureMaxPx: 2048, statutControle: 'CONFORME', creeLe: '2026-08-10T10:00:00', usage: 'LIEU' },
  { id: 'f4', proprietaireId: VILLE_ID, type: 'MODELE_3D', nomOriginal: 'jardins-du-temps.glb', tailleOctets: 12_600_000, nbTriangles: 126_000, textureMaxPx: 4096, statutControle: 'REFUSE', raisonRefus: 'Poids 12,6 Mo (max. 10 Mo) · 126 000 triangles (max. 100 000) · texture 4096 px (max. 2048 px)', creeLe: '2026-11-02T11:00:00', usage: 'LIEU' },
  { id: 'f5', proprietaireId: VILLE_ID, type: 'SON', nomOriginal: 'cloches-noel.mp3', tailleOctets: 820_000, dureeS: 42, statutControle: 'CONFORME', creeLe: '2026-10-20T10:05:00', usage: 'LIEU' },
  { id: 'f6', proprietaireId: VILLE_ID, type: 'SON', nomOriginal: 'ambiance-stade.m4a', tailleOctets: 1_600_000, dureeS: 75, statutControle: 'CONFORME', creeLe: '2026-08-10T10:05:00', usage: 'LIEU' },
  { id: 'f7', proprietaireId: 'p2', type: 'MODELE_3D', nomOriginal: 'mascotte-momes.glb', tailleOctets: 2_100_000, nbTriangles: 18_000, textureMaxPx: 1024, statutControle: 'CONFORME', creeLe: '2026-11-03T14:00:00', usage: 'AFFICHE' },
  { id: 'f8', proprietaireId: 'p2', type: 'SON', nomOriginal: 'fanfare.mp3', tailleOctets: 610_000, dureeS: 15, statutControle: 'EN_COURS', creeLe: '2026-11-09T08:58:00', usage: 'AFFICHE' },
  { id: 'f9', proprietaireId: 'p3', type: 'MODELE_3D', nomOriginal: 'chalets.glb', tailleOctets: 2_800_000, nbTriangles: 21_500, textureMaxPx: 1024, statutControle: 'CONFORME', creeLe: '2026-11-04T09:00:00', usage: 'AFFICHE' },
]

export const affichesInitiales: Affiche[] = [
  { id: 'af1', proprietaireId: VILLE_ID, modeleId: 'm1', animationAfficheId: 'anim-porte', animationLieuId: 'anim-lumieres', nom: 'Noël au château', accroche: 'Montbéliard présente', texte: 'Une histoire prend vie. Spectacle en réalité augmentée chaque soir du 1er décembre au 5 janvier.', codeQr: 'Nq3XkL9pWz2Vb7Rt1Mc5yA', zoneId: 'z1', debut: '2026-11-01T00:00:00', fin: '2027-01-05T23:00:00', statut: 'PUBLIEE', fichiersConformes: true, scans: 4210, modifieLe: '2026-10-30T10:00:00' },
  { id: 'af2', proprietaireId: 'p2', modeleId: 'm3', animationAfficheId: 'anim-momes', animationLieuId: 'anim-reveil', nom: 'Festival des Mômes', accroche: 'Été 2027', texte: 'Trois jours de spectacles pour toute la famille au pied du château.', codeQr: 'Fm8TqP2zLx4Hn6Wd0Ks3vB', zoneProposeeId: 'z2', debut: '2026-12-01T00:00:00', fin: '2027-08-31T23:00:00', statut: 'BROUILLON', fichiersConformes: false, scans: 0, modifieLe: '2026-11-09T08:58:00' },
  { id: 'af3', proprietaireId: 'p3', modeleId: 'm2', animationAfficheId: 'anim-marche', animationLieuId: 'anim-lumieres', nom: 'Marché de Noël', accroche: 'Lumières de Noël', texte: '150 chalets, place Denfert-Rochereau, du 28 novembre au 24 décembre.', codeQr: 'Mk2RvT7yQa9Ze4Lp1Xb6nC', zoneId: 'z2', debut: '2026-11-01T00:00:00', fin: '2026-12-31T23:00:00', statut: 'PUBLIEE', fichiersConformes: true, scans: 1388, modifieLe: '2026-11-04T09:30:00' },
  { id: 'af4', proprietaireId: VILLE_ID, modeleId: 'm2', animationAfficheId: 'anim-porte', animationLieuId: 'anim-bonal', nom: 'Bonal en fête', accroche: 'Saison 2026–2027', texte: 'Vivez chaque match en réalité augmentée devant le stade.', codeQr: 'Bf5YwN3kPs8Gd2Hq7Tz0jD', zoneId: 'z4', debut: '2026-08-15T00:00:00', fin: '2027-06-30T23:00:00', statut: 'PUBLIEE', fichiersConformes: true, scans: 7086, modifieLe: '2026-08-14T16:00:00' },
]

export const signalementsInitiaux: Signalement[] = [
  { id: 's1', afficheId: 'af3', motif: 'TROMPEUR', commentaire: 'Les dates annoncées ne correspondent pas au programme officiel du marché.', statut: 'NOUVEAU', creeLe: '2026-11-08T17:42:00' },
  { id: 's2', afficheId: 'af3', motif: 'TROMPEUR', commentaire: 'Le nombre de chalets annoncé semble faux.', statut: 'NOUVEAU', creeLe: '2026-11-08T19:03:00' },
  { id: 's3', animationId: 'anim-momes', motif: 'CHOQUANT', commentaire: 'Le son démarre très fort et a fait peur à mon enfant.', statut: 'EN_COURS', creeLe: '2026-11-07T15:20:00' },
  { id: 's4', afficheId: 'af4', motif: 'AUTRE', commentaire: 'Le QR code semblait renvoyer vers une page vide, mais cela fonctionne en réessayant.', statut: 'TRAITE', creeLe: '2026-10-21T12:10:00' },
]

export const decisionsInitiales: Decision[] = [
  { id: 'd1', agent: 'Claire Martin', signalementIds: ['s4'], contenuType: 'AFFICHE', contenuId: 'af4', action: 'MAINTENIR', motif: 'Contenu conforme ; problème réseau ponctuel sans lien avec l’affiche.', decideLe: '2026-10-21T15:00:00', reexamenDemande: false },
  { id: 'd2', agent: 'Claire Martin', signalementIds: [], contenuType: 'COMPTE', contenuId: 'p6', action: 'SUSPENDRE', motif: 'Affiche contenant un lien promotionnel externe non autorisé (charte §4).', decideLe: '2026-10-30T11:30:00', reponsePartenaire: 'Nous avons retiré le lien, merci de réexaminer notre compte.', reexamenDemande: true },
]

export const journalInitial: EntreeJournal[] = [
  { id: 'j1', date: '2026-11-09T08:58:00', auteur: 'Festival des Mômes', action: 'IMPORT_FICHIER', objetType: 'Fichier', objet: 'fanfare.mp3', details: 'Contrôle automatique lancé' },
  { id: 'j2', date: '2026-11-08T21:52:00', auteur: 'Claire Martin', action: 'SCORE_MAJ', objetType: 'Lieu', objet: 'Stade Auguste-Bonal', details: 'FCSM 2 – 1 ASNL' },
  { id: 'j3', date: '2026-11-08T19:03:00', auteur: 'Visiteur anonyme', action: 'SIGNALEMENT', objetType: 'Affiche', objet: 'Marché de Noël', details: 'Motif : trompeur' },
  { id: 'j4', date: '2026-11-08T17:42:00', auteur: 'Visiteur anonyme', action: 'SIGNALEMENT', objetType: 'Affiche', objet: 'Marché de Noël', details: 'Motif : trompeur' },
  { id: 'j5', date: '2026-11-08T09:05:00', auteur: 'Brasserie du Faubourg', action: 'INSCRIPTION', objetType: 'Compte', objet: 'Brasserie du Faubourg' },
  { id: 'j6', date: '2026-11-07T18:20:00', auteur: 'Librairie Les Pages d’Or', action: 'INSCRIPTION', objetType: 'Compte', objet: 'Librairie Les Pages d’Or' },
  { id: 'j7', date: '2026-11-07T15:20:00', auteur: 'Visiteur anonyme', action: 'SIGNALEMENT', objetType: 'Animation', objet: 'La mascotte des Mômes', details: 'Motif : choquant' },
  { id: 'j8', date: '2026-11-05T15:40:00', auteur: 'Claire Martin', action: 'PUBLICATION', objetType: 'Animation', objet: 'La légende des lumières', details: 'Du 01/12/2026 au 05/01/2027' },
  { id: 'j9', date: '2026-11-04T09:30:00', auteur: 'Marché de Noël', action: 'PUBLICATION', objetType: 'Affiche', objet: 'Marché de Noël' },
  { id: 'j10', date: '2026-11-04T09:10:00', auteur: 'Claire Martin', action: 'ZONE_ATTRIBUEE', objetType: 'Affiche', objet: 'Marché de Noël', details: 'Rue de la Schliffe — vitrine 4' },
  { id: 'j11', date: '2026-10-30T11:30:00', auteur: 'Claire Martin', action: 'SUSPENSION', objetType: 'Compte', objet: 'Escape Wurtemberg', details: 'Lien externe non autorisé' },
  { id: 'j12', date: '2026-10-15T09:00:00', auteur: 'Marché de Noël', action: 'CHARTE_ACCEPTEE', objetType: 'Compte', objet: 'Marché de Noël', details: 'Version 1.0' },
]

/** Statistiques anonymes arrondies au jour (agrégées depuis la table statistique). */
export function genererStatistiques(jours: number, fin = new Date('2026-11-09T12:00:00')): PointStat[] {
  const points: PointStat[] = []
  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(fin)
    d.setDate(d.getDate() - i)
    const t = jours - i
    const weekend = d.getDay() === 0 || d.getDay() === 6 ? 1.35 : 1
    const scans = Math.round((220 + 90 * Math.sin(t / 3.1) + 60 * Math.sin(t / 7.3) + t * 1.4) * weekend)
    const lancements = Math.round(scans * (0.62 + 0.08 * Math.sin(t / 4.2)))
    points.push({ jour: d.toISOString().slice(0, 10), scans, lancements })
  }
  return points
}

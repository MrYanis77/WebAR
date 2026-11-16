// Types partagés entre l'application visiteur, le back-office et l'API (réponses JSON).
// Ils reprennent les tables du cahier des charges technique (section 7).

export type Langue = 'fr' | 'en' | 'de'
export type Role = 'AGENT' | 'PARTENAIRE'
export type StatutCompte = 'EN_ATTENTE' | 'VERIFIE' | 'REFUSE' | 'SUSPENDU'
export type StatutContenu = 'BROUILLON' | 'PUBLIEE' | 'SUSPENDUE' | 'RETIREE'
export type StatutControle = 'EN_COURS' | 'CONFORME' | 'REFUSE'
export type TypeFichier = 'MODELE_3D' | 'SON' | 'IMAGE'
export type TypeAnimation = 'AFFICHE' | 'LIEU'
export type Declencheur = 'AFFICHE' | 'MONUMENT' | 'MANUEL'
export type MotifSignalement = 'ILLICITE' | 'TROMPEUR' | 'CHOQUANT' | 'PARTISAN' | 'ATTEINTE_DROITS' | 'AUTRE'
export type StatutSignalement = 'NOUVEAU' | 'EN_COURS' | 'TRAITE'
export type ActionDecision = 'MAINTENIR' | 'SUSPENDRE' | 'SUPPRIMER' | 'REACTIVER'

export type Texte3 = { fr: string; en: string; de: string }

export interface Lieu {
  id: string
  nom: string
  nomCourt: string
  categorie: Texte3
  adresse: string
  description: Texte3
  latitude: number
  longitude: number
  rayonM: number
  /** Fichier image de la fiche (identifiant et URL servie par l'API). */
  visuelId?: string
  image?: string
  photosFacade: number
  scoreDomicile?: number
  scoreExterieur?: number
  equipeDomicile?: string
  equipeExterieur?: string
  competition?: string
  minute?: string
  scoreMajLe?: string
  actif: boolean
  accesLibre: boolean
}

export interface Compte {
  id: string
  email: string
  role: Role
  statut: StatutCompte
  motifStatut?: string
  creeLe: string
}

export interface Partenaire {
  id: string
  compteId: string
  nomStructure: string
  secteur: string
  adresse: string
  contactNom: string
  contactTelephone?: string
  email: string
  statut: StatutCompte
  motifStatut?: string
  charteAccepteeLe?: string
  creeLe: string
}

/** Animation intégrée à un fichier GLB (gltf.animations). */
export interface ClipGlb {
  id?: string
  /** Position du clip dans le fichier GLB (par défaut : son rang dans la liste). */
  indice?: number
  nom: string
  dureeS: number
  pistes: number
}

export interface Fichier {
  id: string
  proprietaireId: string
  type: TypeFichier
  nomOriginal: string
  tailleOctets: number
  nbTriangles?: number
  textureMaxPx?: number
  clips?: ClipGlb[]
  dureeS?: number
  statutControle: StatutControle
  raisonRefus?: string
  creeLe: string
  usage: 'AFFICHE' | 'LIEU'
  /** URL du fichier servi par l'API (/uploads/...). */
  url: string
  largeurPx?: number
  hauteurPx?: number
  /** Contrôle automatique terminé : aperçu prêt, en attente de validation par l'éditeur. */
  controleTermine?: boolean
}

/**
 * Placement GPS en 3D d'une animation de lieu : le téléphone pose le modèle à cette position
 * (convertie dans le repère SLAM grâce au GPS et à la boussole) quand la façade n'est pas reconnue.
 */
export interface PlacementGps {
  latitude: number
  longitude: number
  /** Hauteur du socle du modèle au-dessus du sol, en mètres. */
  hauteurM: number
  /** Cap vers lequel est tournée la face avant du modèle (0 = nord, 90 = est) ; vide = face au visiteur. */
  orientationDeg?: number
  /** Plus grande dimension du modèle, en mètres. */
  tailleM: number
}

export interface Animation {
  id: string
  proprietaireId: string
  titre: string
  type: TypeAnimation
  lieuId?: string
  modeleId?: string
  /** Indice du clip du GLB à jouer ; vide = tous les clips. */
  clipIndice?: number
  lecture?: 'BOUCLE' | 'UNE_FOIS'
  sonId?: string
  declencheur: Declencheur
  dureeS: number
  debut: string
  fin?: string
  statut: StatutContenu
  transcription: Texte3
  lancements: number
  modifieLe: string
  /** Animation de lieu : position du modèle dans l'espace (vide = position du lieu, valeurs par défaut). */
  placement?: PlacementGps
  /** URL du modèle GLB et du son, pour l'aperçu et l'application visiteur. */
  modeleUrl?: string
  sonUrl?: string
}

export interface Zone {
  id: string
  nom: string
  adresse: string
  latitude: number
  longitude: number
  regles: string
  format: string
  active: boolean
}

export interface ConditionsPublication {
  compteVerifie: boolean
  fichiersConformes: boolean
  charteAcceptee: boolean
  zoneAttribuee: boolean
}

/** Position du QR code sur l'affiche, en fractions de la largeur et de la hauteur. */
export interface PlacementQr {
  x: number
  y: number
  taille: number
  fond: boolean
  mention: boolean
}

export interface ImageAffiche {
  nom: string
  largeur: number
  hauteur: number
  octets: number
  url?: string
}

/**
 * Cible de reconnaissance 8th Wall (image target), au format lu par XR8.XrController.configure({ imageTargetData }).
 * Générée par le serveur à partir du visuel de l'affiche ou d'une photo de façade (même format que
 * l'outil officiel @8thwall/image-target-cli) : recadrage 3:4 et image de luminance 480 × 640.
 */
export interface CibleImage {
  /** Nom unique parmi les cibles actives, renvoyé dans les événements reality.imagefound. */
  name: string
  type: 'PLANAR'
  /** URL de l'image de luminance (niveaux de gris, 480 × 640). */
  imagePath: string
  metadata: null
  /** Recadrage dans l'image d'origine (tournée d'un quart de tour si elle est en paysage). */
  properties: { left: number; top: number; width: number; height: number; isRotated: boolean; originalWidth: number; originalHeight: number }
}

export interface Affiche {
  id: string
  proprietaireId: string
  /** Fichier IMAGE de l'affiche importée. */
  imageId?: string
  image?: ImageAffiche
  qr?: PlacementQr
  format?: string
  animationAfficheId: string
  /** Lieu promu : la carte s'ouvre dessus après l'animation de l'affiche. */
  lieuId: string
  /** Spectacle du lieu mis en avant (facultatif). */
  animationLieuId?: string
  nom: string
  accroche: string
  texte: string
  codeQr: string
  zoneId?: string
  zoneProposeeId?: string
  debut: string
  fin: string
  statut: StatutContenu
  fichiersConformes: boolean
  /** Les 4 conditions de publication calculées par le serveur (BF-42). */
  conditions?: ConditionsPublication
  scans: number
  modifieLe: string
}

export interface Signalement {
  id: string
  afficheId?: string
  animationId?: string
  motif: MotifSignalement
  commentaire?: string
  statut: StatutSignalement
  creeLe: string
}

export interface Decision {
  id: string
  agent: string
  signalementIds: string[]
  contenuType: 'AFFICHE' | 'ANIMATION' | 'FICHIER' | 'COMPTE'
  contenuId: string
  action: ActionDecision
  motif: string
  decideLe: string
  reponsePartenaire?: string
  reexamenDemande: boolean
}

export interface EntreeJournal {
  id: string
  date: string
  auteur: string
  action: string
  objetType: string
  objet: string
  details?: string
}

export interface Session {
  role: Role
  nom: string
  email: string
  structure: string
  partenaireId?: string
}

export interface PointStat {
  jour: string
  scans: number
  lancements: number
}

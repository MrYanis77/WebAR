// Types partagés entre l'application visiteur et le back-office.
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

export interface Fichier {
  id: string
  proprietaireId: string
  type: TypeFichier
  nomOriginal: string
  tailleOctets: number
  nbTriangles?: number
  textureMaxPx?: number
  dureeS?: number
  statutControle: StatutControle
  raisonRefus?: string
  creeLe: string
  usage: 'AFFICHE' | 'LIEU'
}

export interface Animation {
  id: string
  proprietaireId: string
  titre: string
  type: TypeAnimation
  lieuId?: string
  modeleId?: string
  sonId?: string
  declencheur: Declencheur
  dureeS: number
  debut: string
  fin?: string
  statut: StatutContenu
  transcription: Texte3
  lancements: number
  modifieLe: string
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

export interface ModeleAffiche {
  id: string
  nom: string
  description: string
  format: string
  variante: 0 | 1 | 2
  actif: boolean
}

export interface Affiche {
  id: string
  proprietaireId: string
  modeleId: string
  animationAfficheId: string
  animationLieuId: string
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

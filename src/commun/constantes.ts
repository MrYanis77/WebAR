// Constantes métier partagées (package « commun » du cahier des charges).

export const DOMAINE_APPLICATION = 'https://experiences.montbeliard.fr'
export const VERSION_CHARTE = '1.0'

export const RAYON_PAR_DEFAUT_M = 50
export const DELAI_AFFICHE_NON_RECONNUE_S = 15
export const DELAI_MONUMENT_NON_RECONNU_S = 20
export const LIMITE_SIGNALEMENTS_PAR_HEURE = 5
export const COMMENTAIRE_MAX = 500

export const BUDGETS_3D = {
  AFFICHE: { poidsMo: 4, triangles: 30_000, texturePx: 1024, sonMo: 1 },
  LIEU: { poidsMo: 10, triangles: 100_000, texturePx: 2048, sonMo: 2 },
} as const

export const FORMATS_ACCEPTES = ['glb', 'mp3', 'm4a', 'aac', 'png', 'jpg', 'jpeg'] as const

export const MOTIFS_SIGNALEMENT = ['ILLICITE', 'TROMPEUR', 'CHOQUANT', 'PARTISAN', 'ATTEINTE_DROITS', 'AUTRE'] as const

export const SECTEURS = [
  'Culture & patrimoine',
  'Commerce',
  'Sport',
  'Tourisme',
  'Événementiel',
  'Restauration',
  'Association',
  'Autre',
]

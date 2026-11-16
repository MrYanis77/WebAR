// Constantes métier partagées (package « commun » du cahier des charges).

export const DOMAINE_APPLICATION = 'https://experiences.montbeliard.fr'
export const VERSION_CHARTE = '1.0'

export const RAYON_PAR_DEFAUT_M = 50
/** Sans reconnaissance dans ce délai, un conseil s'affiche (section 4.2). */
export const DELAI_AFFICHE_NON_RECONNUE_S = 15
export const DELAI_MONUMENT_NON_RECONNU_S = 20
/** Placement GPS par défaut d'une animation de lieu (position du lieu) : hauteur du socle et taille, en mètres. */
export const PLACEMENT_LIEU_DEFAUT = { hauteurM: 10, tailleM: 12 } as const
export const LIMITE_SIGNALEMENTS_PAR_HEURE = 5
export const COMMENTAIRE_MAX = 500

/** Taille maximale d'un modèle 3D GLB (animations intégrées comprises). */
export const MODELE_3D_MAX_MO = 100

export const BUDGETS_3D = {
  AFFICHE: { poidsMo: MODELE_3D_MAX_MO, triangles: 30_000, texturePx: 1024, sonMo: 1 },
  LIEU: { poidsMo: MODELE_3D_MAX_MO, triangles: 100_000, texturePx: 2048, sonMo: 2 },
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

/**
 * Nom de l'animation ajoutée aux GLB qui en contiennent plusieurs : elle les joue toutes ensemble
 * (l'aperçu <model-viewer> du back-office ne joue qu'une animation à la fois). Elle n'apparaît pas
 * dans la liste des clips.
 */
export const NOM_ANIMATION_COMBINEE = 'Toutes les animations (WebAR)'

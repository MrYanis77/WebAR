// Constantes métier partagées (package « commun » du cahier des charges).

export const DOMAINE_APPLICATION = 'https://experiences.montbeliard.fr'
export const VERSION_CHARTE = '1.0'

export const RAYON_PAR_DEFAUT_M = 50
/** Sans reconnaissance dans ce délai, un conseil s'affiche (section 4.2). */
export const DELAI_AFFICHE_NON_RECONNUE_S = 15
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

/** Réglages par défaut d'un modèle 3D (atelier 3D) : le modèle tel qu'importé. */
export const REGLAGES_3D_DEFAUT = {
  rotation: { x: 0, y: 0, z: 0 },
  ancrage: 'sol',
  hauteur: 0,
  vitesse: 1,
  luminosite: 1,
} as const satisfies import('./types').Reglages3D

/**
 * Réglages complets (valeurs par défaut pour les champs absents). Une ancienne « échelle » enregistrée
 * par l'atelier est ignorée : la taille se règle au placement de l'animation.
 */
export function reglagesComplets(r?: Partial<import('./types').Reglages3D>): import('./types').Reglages3D {
  return {
    rotation: { ...REGLAGES_3D_DEFAUT.rotation, ...r?.rotation },
    ancrage: r?.ancrage ?? REGLAGES_3D_DEFAUT.ancrage,
    hauteur: r?.hauteur ?? REGLAGES_3D_DEFAUT.hauteur,
    vitesse: r?.vitesse ?? REGLAGES_3D_DEFAUT.vitesse,
    luminosite: r?.luminosite ?? REGLAGES_3D_DEFAUT.luminosite,
  }
}

/** Optimisation proposée par défaut : textures 1024 px en WebP, géométrie compressée, sans simplification. */
export const OPTIMISATION_DEFAUT = { textureMaxPx: 1024, webp: true, simplification: 0, compression: true } as const satisfies import('./types').ParametresOptimisation

/** Animation d'affiche par défaut : devant l'affiche, 1,5 fois sa hauteur, sans déplacement. */
export const REGLAGE_AFFICHE_RA_DEFAUT: Readonly<import('./types').ReglageAfficheRA> = { position: 'devant', taille: 1.5 }

/**
 * Déplacement maximal du modèle d'une animation d'affiche autour de l'affiche, en mètres : le visiteur
 * la scanne entre 0,5 et 3 m (BNF-05), l'animation reste dans cette zone.
 */
export const RAYON_AFFICHE_M = 3

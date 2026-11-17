// Schémas Zod partagés par l'API (validation des requêtes) et l'application (formulaires) :
// une règle modifiée ici s'applique partout (package « commun » du cahier des charges).
import { z } from 'zod'
import { COMMENTAIRE_MAX, MOTIFS_SIGNALEMENT, SECTEURS } from './constantes'

/** Identifiant envoyé par l'application (chaîne) ou les tests (nombre). */
export const zId = z.coerce.number().int().positive()
/** Date locale « AAAA-MM-JJTHH:MM:SS » ou « AAAA-MM-JJ ». */
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/, 'Date invalide')
const texte = (max: number) => z.string().trim().min(1, 'Champ obligatoire').max(max)
const texteLibre = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // Texte brut : aucune balise ni lien (BNF-18, BF-46).
    .transform((s) => s.replace(/<[^>]*>/g, ''))

export const zTexte3 = z.object({ fr: texte(5000), en: z.string().max(5000).default(''), de: z.string().max(5000).default('') })

export const schemaInscription = z.object({
  nomStructure: texte(150),
  secteur: z.enum(SECTEURS as [string, ...string[]]),
  adresse: texte(255),
  contactNom: texte(100),
  contactTelephone: z.string().trim().max(20).optional(),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(255),
  motDePasse: z.string().min(12, '12 caractères minimum').max(200),
  rgpd: z.literal(true),
  altcha: z.string().min(10, 'Vérification anti-robot manquante'),
})

export const schemaConnexion = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  motDePasse: z.string().min(1).max(200),
})

/** Code de connexion à 6 chiffres reçu par mail (agents). */
export const schemaCodeConnexion = z.object({ code: z.string().trim().regex(/^\d{6}$/, '6 chiffres attendus') })

export const schemaDecisionCompte = z.object({
  statut: z.enum(['VERIFIE', 'REFUSE', 'SUSPENDU']),
  motif: z.string().trim().max(500).optional(),
})

export const schemaLieu = z.object({
  nom: texte(150),
  nomCourt: texte(20),
  categorie: z.object({ fr: texte(80), en: z.string().max(80).default(''), de: z.string().max(80).default('') }),
  adresse: texte(255),
  description: zTexte3,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  rayonM: z.number().int().min(20).max(500),
  visuelId: zId.nullable().optional(),
  accesLibre: z.boolean(),
  actif: z.boolean(),
})

export const schemaScore = z.object({
  equipeDomicile: texte(30),
  equipeExterieur: texte(30),
  scoreDomicile: z.number().int().min(0).max(99),
  scoreExterieur: z.number().int().min(0).max(99),
  competition: z.string().trim().max(80),
  minute: z.string().trim().max(40),
})

export const schemaZone = z.object({
  nom: texte(150),
  adresse: texte(255),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  format: z.enum(['A4', 'A3', 'A2', 'A1', 'A0']),
  regles: z.string().trim().max(5000).default(''),
  active: z.boolean(),
})

const angle = z.number().min(-180).max(180)
export const schemaReglages3D = z.object({
  rotation: z.object({ x: angle, y: angle, z: angle }),
  ancrage: z.enum(['sol', 'centre']),
  hauteur: z.number().min(-1).max(1),
  vitesse: z.number().min(0.1).max(4),
  luminosite: z.number().min(0.1).max(4),
})

export const schemaReglageAffiche = z.object({
  position: z.enum(['devant', 'dessus']),
  taille: z.number().min(0.3).max(5),
})

export const schemaOptimisation = z.object({
  textureMaxPx: z.union([z.literal(256), z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]).nullable(),
  webp: z.boolean(),
  simplification: z.number().min(0).max(0.9),
  compression: z.boolean(),
})

export const schemaPlacementGps = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  hauteurM: z.number().min(0).max(300),
  orientationDeg: z.number().int().min(0).max(359).nullable().optional(),
  tailleM: z.number().min(0.5).max(200),
})

export const schemaAnimation = z
  .object({
    titre: texte(120),
    type: z.enum(['AFFICHE', 'LIEU']),
    lieuId: zId.nullable().optional(),
    modeleId: zId,
    sonId: zId.nullable().optional(),
    clipIndice: z.number().int().min(0).nullable().optional(),
    lecture: z.enum(['BOUCLE', 'UNE_FOIS']).default('BOUCLE'),
    declencheur: z.enum(['AFFICHE', 'MONUMENT', 'MANUEL']),
    dureeS: z.number().int().min(5).max(1800),
    debut: zDate,
    fin: zDate.nullable().optional(),
    transcription: zTexte3,
    placement: schemaPlacementGps.nullable().optional(),
    reglageAffiche: schemaReglageAffiche.nullable().optional(),
    publier: z.boolean().default(false),
  })
  .refine((a) => a.type === 'AFFICHE' || a.lieuId, { message: 'Une animation de lieu doit avoir un lieu', path: ['lieuId'] })
  .refine((a) => (a.type === 'AFFICHE') === (a.declencheur === 'AFFICHE'), { message: 'Déclencheur incompatible avec le type', path: ['declencheur'] })
  .refine((a) => !a.fin || a.fin > a.debut, { message: 'La fin doit suivre la sortie', path: ['fin'] })

export const schemaPlacementQr = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    taille: z.number().min(0.05).max(0.4),
    fond: z.boolean(),
    mention: z.boolean(),
  })
  .refine((q) => q.x <= 1 - q.taille + 1e-9, { message: 'Le QR code dépasse de l’affiche', path: ['x'] })

export const schemaAffiche = z
  .object({
    imageId: zId,
    animationAfficheId: zId,
    /** Lieu promu (obligatoire) et, facultativement, une animation de ce lieu. */
    lieuId: zId,
    animationLieuId: zId.nullable().optional(),
    nom: texte(60),
    accroche: z.string().trim().max(40).default(''),
    texte: texteLibre(300).pipe(z.string().min(1, 'Champ obligatoire')).transform((s) => s.replace(/https?:\/\/\S+/g, '')),
    format: z.enum(['A4', 'A3', 'A2', 'A1', 'A0']),
    qr: schemaPlacementQr,
    debut: zDate,
    fin: zDate,
  })
  .refine((a) => a.fin > a.debut, { message: 'La fin doit suivre la sortie', path: ['fin'] })

export const schemaZoneAffiche = z.object({ zoneId: zId.nullable(), refusProposition: z.boolean().default(false) })

export const schemaSignalement = z
  .object({
    afficheId: zId.optional(),
    animationId: zId.optional(),
    motif: z.enum(MOTIFS_SIGNALEMENT),
    commentaire: texteLibre(COMMENTAIRE_MAX).default(''),
    altcha: z.string().min(10, 'Vérification anti-robot manquante'),
  })
  .refine((s) => !!s.afficheId !== !!s.animationId, { message: 'Un seul contenu doit être visé' })
  .refine((s) => s.motif !== 'AUTRE' || s.commentaire.length > 0, { message: 'Commentaire obligatoire pour « Autre »', path: ['commentaire'] })

export const schemaDecision = z.object({
  action: z.enum(['MAINTENIR', 'SUSPENDRE', 'SUPPRIMER', 'REACTIVER']),
  motif: z.string().trim().min(5, 'Motif obligatoire (5 caractères minimum)').max(500),
  signalementIds: z.array(zId).default([]),
})

export const schemaReponseDecision = z.object({ reponse: texte(1000), reexamen: z.boolean() })
export const schemaClotureReexamen = z.object({ conclusion: z.string().trim().min(5).max(500), lever: z.boolean() })

export const schemaStatistique = z.object({
  type: z.enum(['SCAN', 'LANCEMENT']),
  afficheId: zId.optional(),
  animationId: zId.optional(),
  declencheur: z.enum(['AFFICHE', 'MONUMENT', 'MANUEL']).optional(),
})

export type Inscription = z.infer<typeof schemaInscription>
export type DonneesAnimation = z.infer<typeof schemaAnimation>
export type DonneesAffiche = z.infer<typeof schemaAffiche>
export type DonneesLieu = z.infer<typeof schemaLieu>

// Conversion des lignes de la base vers les objets attendus par l'application (src/commun/types.ts).
// Les identifiants deviennent des chaînes et les dates sont en heure de Paris, sans fuseau.
import type { Prisma } from '../../generated/prisma/client.js'
import type {
  Affiche,
  ConditionsPublication,
  Animation,
  Decision,
  EntreeJournal,
  Fichier,
  Lieu,
  Partenaire,
  Signalement,
  Zone,
} from '../../../src/commun/types.js'
import { prisma } from '../db.js'
import { versLocal } from '../dates.js'

/** Identifiant public d'un propriétaire : « ville » pour un agent, sinon l'identifiant du partenaire. */
export type Proprietaires = Map<number, string>

export async function chargerProprietaires(): Promise<Proprietaires> {
  const comptes = await prisma.compte.findMany({ select: { id: true, role: true, partenaire: { select: { id: true } } } })
  return new Map(comptes.map((c) => [c.id, c.role === 'AGENT' ? 'ville' : String(c.partenaire?.id ?? `compte-${c.id}`)]))
}

/** URL publique d'un fichier importé : le dossier des imports est servi sous /uploads. */
export const urlFichier = (chemin: string | null | undefined) => (chemin ? `/uploads/${chemin.replace(/\\/g, '/')}` : undefined)
const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? undefined : Number(d))

type FichierAvecClips = Prisma.fichierGetPayload<{ include: { fichier_clip: true } }>

export function serialiserFichier(f: FichierAvecClips, proprio: Proprietaires): Fichier {
  return {
    id: String(f.id),
    proprietaireId: proprio.get(f.proprietaire_id) ?? '',
    type: f.type,
    nomOriginal: f.nom_original,
    tailleOctets: f.taille_octets,
    nbTriangles: f.nb_triangles ?? undefined,
    textureMaxPx: f.texture_max_px ?? undefined,
    largeurPx: f.largeur_px ?? undefined,
    hauteurPx: f.hauteur_px ?? undefined,
    clips: f.fichier_clip
      .sort((a, b) => a.indice - b.indice)
      .map((c) => ({ id: String(c.id), indice: c.indice, nom: c.nom, dureeS: Number(c.duree_s), pistes: c.nb_pistes })),
    dureeS: num(f.duree_s),
    statutControle: f.statut_controle,
    controleTermine: !!f.controle_termine_le,
    raisonRefus: f.raison_refus ?? undefined,
    creeLe: versLocal(f.cree_le),
    usage: f.usage_fichier ?? 'AFFICHE',
    url: urlFichier(f.chemin)!,
  }
}

type LieuComplet = Prisma.lieuGetPayload<{ include: { fichier: true; _count: { select: { photo_facade: true } } } }>

export function serialiserLieu(l: LieuComplet): Lieu {
  return {
    id: String(l.id),
    nom: l.nom,
    nomCourt: l.nom_court,
    categorie: { fr: l.categorie_fr, en: l.categorie_en ?? '', de: l.categorie_de ?? '' },
    adresse: l.adresse,
    description: { fr: l.description_fr, en: l.description_en ?? '', de: l.description_de ?? '' },
    latitude: Number(l.latitude),
    longitude: Number(l.longitude),
    rayonM: l.rayon_m,
    visuelId: l.visuel_id ? String(l.visuel_id) : undefined,
    image: urlFichier(l.fichier?.chemin),
    photosFacade: l._count.photo_facade,
    scoreDomicile: l.score_domicile ?? undefined,
    scoreExterieur: l.score_exterieur ?? undefined,
    equipeDomicile: l.equipe_domicile ?? undefined,
    equipeExterieur: l.equipe_exterieur ?? undefined,
    competition: l.competition ?? undefined,
    minute: l.etat_match ?? undefined,
    scoreMajLe: versLocal(l.score_maj_le),
    actif: l.actif,
    accesLibre: l.acces_libre,
  }
}

type AnimationComplete = Prisma.animationGetPayload<{
  include: { fichier_clip: true; fichier_animation_modele_idTofichier: true; fichier_animation_son_idTofichier: true }
}>

export function serialiserAnimation(a: AnimationComplete, proprio: Proprietaires, lancements = 0): Animation {
  return {
    id: String(a.id),
    proprietaireId: proprio.get(a.proprietaire_id) ?? '',
    titre: a.titre,
    type: a.type,
    lieuId: a.lieu_id ? String(a.lieu_id) : undefined,
    modeleId: String(a.modele_id),
    modeleUrl: urlFichier(a.fichier_animation_modele_idTofichier.chemin),
    clipIndice: a.fichier_clip?.indice ?? undefined,
    lecture: a.lecture,
    sonId: a.son_id ? String(a.son_id) : undefined,
    sonUrl: urlFichier(a.fichier_animation_son_idTofichier?.chemin),
    declencheur: a.declencheur,
    dureeS: a.duree_s,
    debut: versLocal(a.debut),
    fin: versLocal(a.fin),
    statut: a.statut,
    transcription: { fr: a.transcription_fr, en: a.transcription_en ?? '', de: a.transcription_de ?? '' },
    placement:
      a.position_latitude !== null && a.position_longitude !== null
        ? {
            latitude: Number(a.position_latitude),
            longitude: Number(a.position_longitude),
            hauteurM: Number(a.position_hauteur_m),
            orientationDeg: a.position_orientation_deg ?? undefined,
            tailleM: Number(a.position_taille_m),
          }
        : undefined,
    lancements,
    modifieLe: versLocal(a.modifie_le),
  }
}

type AfficheComplete = Prisma.afficheGetPayload<{ include: { fichier: true } }>

/** `conditions` : résultat du service reglePublication, pour la liste et l'étape « Validation » de l'éditeur. */
export function serialiserAffiche(a: AfficheComplete, proprio: Proprietaires, scans = 0, conditions?: ConditionsPublication): Affiche {
  return {
    id: String(a.id),
    proprietaireId: proprio.get(a.proprietaire_id) ?? '',
    imageId: String(a.image_id),
    image: {
      nom: a.fichier.nom_original,
      largeur: a.fichier.largeur_px ?? 0,
      hauteur: a.fichier.hauteur_px ?? 0,
      octets: a.fichier.taille_octets,
      url: urlFichier(a.fichier.chemin),
    },
    qr: { x: Number(a.qr_x), y: Number(a.qr_y), taille: Number(a.qr_taille), fond: a.qr_fond, mention: a.qr_mention },
    format: a.format,
    animationAfficheId: String(a.animation_affiche_id),
    lieuId: String(a.lieu_id),
    animationLieuId: a.animation_lieu_id ? String(a.animation_lieu_id) : undefined,
    nom: a.nom,
    accroche: a.accroche ?? '',
    texte: a.texte,
    codeQr: a.code_qr,
    zoneId: a.zone_id ? String(a.zone_id) : undefined,
    zoneProposeeId: a.zone_proposee_id ? String(a.zone_proposee_id) : undefined,
    debut: versLocal(a.debut),
    fin: versLocal(a.fin),
    statut: a.statut,
    fichiersConformes: conditions?.fichiersConformes ?? a.fichier.statut_controle === 'CONFORME',
    conditions,
    scans,
    modifieLe: versLocal(a.modifie_le),
  }
}

export function serialiserZone(z: Prisma.zone_affichageGetPayload<object>): Zone {
  return {
    id: String(z.id),
    nom: z.nom,
    adresse: z.adresse,
    latitude: num(z.latitude) ?? 0,
    longitude: num(z.longitude) ?? 0,
    regles: z.regles ?? '',
    format: z.format_max,
    active: z.active,
  }
}

type PartenaireComplet = Prisma.partenaireGetPayload<{ include: { compte: { include: { acceptation_charte: true } } } }>

export function serialiserPartenaire(p: PartenaireComplet): Partenaire {
  const charte = p.compte.acceptation_charte.sort((a, b) => b.acceptee_le.getTime() - a.acceptee_le.getTime())[0]
  return {
    id: String(p.id),
    compteId: String(p.compte_id),
    nomStructure: p.nom_structure,
    secteur: p.secteur,
    adresse: p.adresse,
    contactNom: p.compte.nom_affiche,
    contactTelephone: p.contact_telephone ?? undefined,
    email: p.compte.email,
    statut: p.compte.statut,
    motifStatut: p.compte.motif_statut ?? undefined,
    charteAccepteeLe: versLocal(charte?.acceptee_le),
    creeLe: versLocal(p.compte.cree_le),
  }
}

export function serialiserSignalement(s: Prisma.signalementGetPayload<object>): Signalement {
  return {
    id: String(s.id),
    afficheId: s.affiche_id ? String(s.affiche_id) : undefined,
    animationId: s.animation_id ? String(s.animation_id) : undefined,
    motif: s.motif,
    commentaire: s.commentaire ?? undefined,
    statut: s.statut,
    creeLe: versLocal(s.cree_le),
  }
}

type DecisionComplete = Prisma.decisionGetPayload<{
  include: { compte_decision_agent_idTocompte: true; decision_signalement: true; compte_decision_compte_vise_idTocompte: { include: { partenaire: true } } }
}>

export function serialiserDecision(d: DecisionComplete): Decision {
  const contenuId =
    d.contenu_type === 'AFFICHE'
      ? d.affiche_id
      : d.contenu_type === 'ANIMATION'
        ? d.animation_id
        : d.contenu_type === 'FICHIER'
          ? d.fichier_id
          : (d.compte_decision_compte_vise_idTocompte?.partenaire?.id ?? d.compte_vise_id)
  return {
    id: String(d.id),
    agent: d.compte_decision_agent_idTocompte.nom_affiche,
    signalementIds: d.decision_signalement.map((x) => String(x.signalement_id)),
    contenuType: d.contenu_type,
    contenuId: contenuId ? String(contenuId) : '',
    action: d.action,
    motif: d.motif,
    decideLe: versLocal(d.decide_le),
    reponsePartenaire: d.reponse_partenaire ?? undefined,
    reexamenDemande: d.reexamen_demande,
  }
}

export function serialiserJournal(j: Prisma.journalGetPayload<object>): EntreeJournal {
  let details: Record<string, unknown> | null = null
  try {
    details = typeof j.details === 'string' ? JSON.parse(j.details) : (j.details as Record<string, unknown> | null)
  } catch {
    details = null
  }
  return {
    id: String(j.id),
    date: versLocal(j.cree_le),
    auteur: j.auteur_libelle,
    action: j.action,
    objetType: j.objet_type,
    objet: j.objet_libelle,
    details: details ? Object.values(details).map(String).join(' · ') : undefined,
  }
}

/** Nombre de statistiques par affiche ou animation (scans, lancements). */
export async function compterStatistiques(type: 'SCAN' | 'LANCEMENT', champ: 'affiche_id' | 'animation_id') {
  const groupes = await prisma.statistique.groupBy({ by: [champ], where: { type }, _count: { _all: true } })
  return new Map(groupes.map((g) => [g[champ] as number, g._count._all]))
}

// Module « animations » : création, dates de sortie et de fin, activation, choix de l'animation
// intégrée au GLB, suppression si aucune affiche ne l'utilise (BF-21, BF-22, BF-25, BF-26, BF-39).
import { Router } from 'express'
import { schemaAnimation, type DonneesAnimation } from '../../../src/commun/schemas.js'
import { depuisLocal } from '../dates.js'
import { prisma } from '../db.js'
import { ErreurApi, interdit, introuvable } from '../erreurs.js'
import { auteur, exigerConnexion, valider, verifierProprietaire, type Utilisateur } from '../middlewares/index.js'
import { journaliser } from '../services/journal.js'
import { chargerProprietaires, compterStatistiques, serialiserAnimation } from '../services/serialiser.js'
import { idParam, verifierPeutCreer } from './outils.js'

export const routesAnimations = Router()
routesAnimations.use(exigerConnexion)

const inclus = { fichier_clip: true, fichier_animation_modele_idTofichier: true, fichier_animation_son_idTofichier: true } as const

/** Contrôles communs à la création et à la modification ; renvoie les colonnes à écrire. */
async function preparer(u: Utilisateur, d: DonneesAnimation) {
  if (d.type === 'LIEU' && u.role !== 'AGENT') throw interdit('Les animations de lieu sont réservées aux agents de la mairie.')
  const modele = await prisma.fichier.findUnique({ where: { id: d.modeleId }, include: { fichier_clip: true } })
  if (!modele || modele.type !== 'MODELE_3D') throw new ErreurApi(400, 'Modèle 3D introuvable.')
  if (u.role !== 'AGENT' && modele.proprietaire_id !== u.compteId) throw interdit('Ce modèle appartient à un autre compte.')
  if (modele.statut_controle !== 'CONFORME') throw new ErreurApi(409, 'Le modèle 3D doit être conforme au contrôle automatique.')
  if (d.sonId) {
    const son = await prisma.fichier.findUnique({ where: { id: d.sonId } })
    if (!son || son.type !== 'SON' || son.statut_controle !== 'CONFORME') throw new ErreurApi(409, 'Le son doit être conforme au contrôle automatique.')
    if (u.role !== 'AGENT' && son.proprietaire_id !== u.compteId) throw interdit('Ce son appartient à un autre compte.')
  }
  if (d.type === 'LIEU' && !(await prisma.lieu.findUnique({ where: { id: d.lieuId! } }))) throw new ErreurApi(400, 'Lieu introuvable.')
  // L'animation choisie doit appartenir au modèle (clé composite modele_id + clip_id en base).
  const clip = d.clipIndice === null || d.clipIndice === undefined ? null : modele.fichier_clip.find((c) => c.indice === d.clipIndice)
  if (d.clipIndice !== null && d.clipIndice !== undefined && !clip) throw new ErreurApi(400, 'Cette animation n’existe pas dans le modèle 3D.')
  return {
    titre: d.titre,
    type: d.type,
    lieu_id: d.type === 'LIEU' ? d.lieuId! : null,
    modele_id: d.modeleId,
    son_id: d.sonId ?? null,
    clip_id: clip?.id ?? null,
    lecture: d.lecture,
    declencheur: d.declencheur,
    duree_s: d.dureeS,
    debut: depuisLocal(d.debut),
    fin: d.fin ? depuisLocal(d.fin) : null,
    transcription_fr: d.transcription.fr,
    transcription_en: d.transcription.en || null,
    transcription_de: d.transcription.de || null,
    // Animation d'affiche : position et taille par rapport à l'affiche reconnue.
    affiche_position: d.reglageAffiche?.position === 'dessus' ? ('DESSUS' as const) : ('DEVANT' as const),
    affiche_taille: d.reglageAffiche?.taille ?? 1.5,
    // Placement GPS en 3D : animation de lieu uniquement (une animation d'affiche suit l'affiche).
    ...(d.type === 'LIEU' && d.placement
      ? {
          position_latitude: d.placement.latitude,
          position_longitude: d.placement.longitude,
          position_hauteur_m: d.placement.hauteurM,
          position_orientation_deg: d.placement.orientationDeg ?? null,
          position_taille_m: d.placement.tailleM,
        }
      : { position_latitude: null, position_longitude: null, position_hauteur_m: 0, position_orientation_deg: null, position_taille_m: 10 }),
  }
}

async function repondre(id: number) {
  const [a, proprio, lancements] = await Promise.all([
    prisma.animation.findUniqueOrThrow({ where: { id }, include: inclus }),
    chargerProprietaires(),
    compterStatistiques('LANCEMENT', 'animation_id'),
  ])
  return serialiserAnimation(a, proprio, lancements.get(id) ?? 0)
}

/** Toutes les animations pour un agent ; un partenaire voit les siennes et les animations de lieu. */
routesAnimations.get('/', async (req, res) => {
  const u = req.utilisateur!
  const [liste, proprio, lancements] = await Promise.all([
    prisma.animation.findMany({
      where: u.role === 'AGENT' ? {} : { OR: [{ proprietaire_id: u.compteId }, { type: 'LIEU' }] },
      include: inclus,
      orderBy: { modifie_le: 'desc' },
    }),
    chargerProprietaires(),
    compterStatistiques('LANCEMENT', 'animation_id'),
  ])
  res.json(liste.map((a) => serialiserAnimation(a, proprio, lancements.get(a.id) ?? 0)))
})

routesAnimations.post('/', valider(schemaAnimation), async (req, res) => {
  const u = req.utilisateur!
  await verifierPeutCreer(u)
  const d = req.body as DonneesAnimation
  const donnees = await preparer(u, d)
  const a = await prisma.$transaction(async (tx) => {
    const cree = await tx.animation.create({ data: { ...donnees, proprietaire_id: u.compteId, statut: d.publier ? 'PUBLIEE' : 'BROUILLON' } })
    await journaliser(auteur(req), d.publier ? 'PUBLICATION' : 'CREATION', 'Animation', cree.id, cree.titre, undefined, tx)
    return cree
  })
  res.status(201).json(await repondre(a.id))
})

routesAnimations.patch('/:id', valider(schemaAnimation), async (req, res) => {
  const u = req.utilisateur!
  const existante = await prisma.animation.findUnique({ where: { id: idParam(req) } })
  if (!existante) throw introuvable('Animation introuvable.')
  verifierProprietaire(req, existante.proprietaire_id)
  // Une animation suspendue ou retirée par la mairie ne peut être modifiée que par un agent.
  if ((existante.statut === 'SUSPENDUE' || existante.statut === 'RETIREE') && u.role !== 'AGENT') throw interdit('Contenu suspendu ou retiré par la mairie.')
  const d = req.body as DonneesAnimation
  const donnees = await preparer(u, d)
  const statut = existante.statut === 'SUSPENDUE' || existante.statut === 'RETIREE' ? existante.statut : d.publier ? 'PUBLIEE' : existante.statut
  await prisma.$transaction(async (tx) => {
    await tx.animation.update({ where: { id: existante.id }, data: { ...donnees, statut, modifie_le: new Date() } })
    await journaliser(auteur(req), 'MODIFICATION', 'Animation', existante.id, donnees.titre, undefined, tx)
  })
  res.json(await repondre(existante.id))
})

/** Activer ou désactiver (publiée ↔ brouillon) ; les dates s'appliquent automatiquement. */
routesAnimations.patch('/:id/statut', async (req, res) => {
  const a = await prisma.animation.findUnique({ where: { id: idParam(req) } })
  if (!a) throw introuvable('Animation introuvable.')
  verifierProprietaire(req, a.proprietaire_id)
  if (a.statut === 'SUSPENDUE' || a.statut === 'RETIREE') throw new ErreurApi(409, 'Contenu suspendu ou retiré par la mairie.')
  const statut = a.statut === 'PUBLIEE' ? 'BROUILLON' : 'PUBLIEE'
  await prisma.$transaction(async (tx) => {
    await tx.animation.update({ where: { id: a.id }, data: { statut, modifie_le: new Date() } })
    await journaliser(auteur(req), statut === 'PUBLIEE' ? 'ACTIVATION' : 'DESACTIVATION', 'Animation', a.id, a.titre, undefined, tx)
  })
  res.json(await repondre(a.id))
})

/** Suppression refusée (409) tant qu'une affiche utilise l'animation. */
routesAnimations.delete('/:id', async (req, res) => {
  const a = await prisma.animation.findUnique({ where: { id: idParam(req) } })
  if (!a) throw introuvable('Animation introuvable.')
  verifierProprietaire(req, a.proprietaire_id)
  const liees = await prisma.affiche.findMany({ where: { OR: [{ animation_affiche_id: a.id }, { animation_lieu_id: a.id }] }, select: { nom: true } })
  if (liees.length)
    throw new ErreurApi(
      409,
      `Utilisée par ${liees.length > 1 ? 'les affiches' : 'l’affiche'} ${liees.map((x) => `« ${x.nom} »`).join(', ')} : associez-leur une autre animation d’abord.`,
    )
  await prisma.$transaction(async (tx) => {
    await tx.animation.delete({ where: { id: a.id } })
    await journaliser(auteur(req), 'SUPPRESSION', 'Animation', a.id, a.titre, undefined, tx)
  })
  res.status(204).end()
})

// Module « public » : API sans compte de l'application visiteur (aucun cookie posé).
// GET /public/lieux, /public/lieux/:id/cibles, /public/affiches/:code, POST /public/statistiques, /public/signalements.
import { Router } from 'express'
import { schemaSignalement, schemaStatistique } from '../../../src/commun/schemas.js'
import { heureArrondie } from '../dates.js'
import { prisma } from '../db.js'
import { ErreurApi, introuvable } from '../erreurs.js'
import { limiteSignalements, limiteStatistiques, valider } from '../middlewares/index.js'
import { creerDefi, verifierAltcha } from '../services/altcha.js'
import { journaliser, VISITEUR_ANONYME } from '../services/journal.js'
import { notifierAgents, notifierCompte } from '../services/notifications.js'
import { animationActive, conditionsAffiche, publiable } from '../services/regles.js'
import { chargerProprietaires, serialiserAffiche, serialiserAnimation, serialiserLieu } from '../services/serialiser.js'
import { cibleImage } from '../traitements/cibleImage.js'

export const routesPublic = Router()

const inclusAnimation = { fichier_clip: true, fichier_animation_modele_idTofichier: true, fichier_animation_son_idTofichier: true } as const
const inclusLieu = { fichier: true, _count: { select: { photo_facade: true } } } as const

/** Défi ALTCHA pour le widget anti-robot (inscription, signalement). */
routesPublic.get('/altcha', async (_req, res) => {
  res.set('Cache-Control', 'no-store').json(await creerDefi())
})

/** Lieux visibles et leurs animations en cours ou à venir (BF-05, BF-07, BF-22). */
routesPublic.get('/lieux', async (_req, res) => {
  const maintenant = new Date()
  const [lieux, animations, proprio] = await Promise.all([
    prisma.lieu.findMany({ where: { actif: true }, include: inclusLieu, orderBy: { nom: 'asc' } }),
    prisma.animation.findMany({
      where: {
        type: 'LIEU',
        statut: 'PUBLIEE',
        lieu: { actif: true },
        compte: { statut: 'VERIFIE' },
        OR: [{ fin: null }, { fin: { gte: maintenant } }],
      },
      include: inclusAnimation,
      orderBy: { debut: 'asc' },
    }),
    chargerProprietaires(),
  ])
  res.set('Cache-Control', 'public, max-age=60').json({
    lieux: lieux.map(serialiserLieu),
    animations: animations.map((a) => serialiserAnimation(a, proprio)),
  })
})

/**
 * Cibles de reconnaissance de la façade d'un lieu (photos de détails, de jour et de nuit), au format
 * 8th Wall : le téléphone les compare à l'image de la caméra pour poser l'animation au-dessus du monument.
 */
routesPublic.get('/lieux/:id/cibles', async (req, res) => {
  const id = Number(req.params.id)
  const lieu = Number.isInteger(id) ? await prisma.lieu.findFirst({ where: { id, actif: true }, select: { id: true } }) : null
  if (!lieu) throw introuvable('Lieu introuvable.')
  const photos = await prisma.photo_facade.findMany({
    where: { lieu_id: lieu.id, fichier: { statut_controle: 'CONFORME' } },
    include: { fichier: { select: { id: true, chemin: true } } },
    orderBy: { id: 'asc' },
  })
  // 8th Wall suit 32 cibles actives au plus.
  const cibles = await Promise.all(photos.slice(0, 32).map((p) => cibleImage(p.fichier.chemin, `visuel-${p.fichier.id}`)))
  res.set('Cache-Control', 'public, max-age=60').json(cibles.filter((c) => c !== null))
})

/** Affiches diffusées (scanner intégré à l'application visiteur). */
routesPublic.get('/affiches', async (_req, res) => {
  const maintenant = new Date()
  const candidates = await prisma.affiche.findMany({
    where: { statut: 'PUBLIEE', debut: { lte: maintenant }, fin: { gte: maintenant }, compte: { statut: 'VERIFIE' } },
    select: { id: true, nom: true, code_qr: true },
  })
  const diffusees = []
  for (const a of candidates) {
    const c = await conditionsAffiche(a.id)
    if (c && publiable(c)) diffusees.push({ codeQr: a.code_qr, nom: a.nom })
  }
  res.set('Cache-Control', 'public, max-age=60').json(diffusees)
})

/**
 * Description d'une affiche publiée, sinon « indisponible » (410). Mise en cache 60 s au plus :
 * un contenu suspendu ou retiré disparaît en moins de 5 minutes (CR-11).
 */
routesPublic.get('/affiches/:code', async (req, res) => {
  const a = await prisma.affiche.findUnique({ where: { code_qr: String(req.params.code) }, include: { fichier: true, compte: true } })
  if (!a) throw new ErreurApi(404, 'QR code inconnu.', { raison: 'INCONNUE' })
  res.set('Cache-Control', 'public, max-age=60')
  if (a.statut === 'SUSPENDUE' || a.statut === 'RETIREE' || a.compte.statut === 'SUSPENDU') throw new ErreurApi(410, 'Contenu retiré.', { raison: 'RETIREE' })
  const c = await conditionsAffiche(a.id)
  const maintenant = new Date()
  if (a.statut !== 'PUBLIEE' || a.fin < maintenant || a.debut > maintenant || !c || !publiable(c))
    throw new ErreurApi(410, 'Animation expirée ou indisponible.', { raison: 'EXPIREE' })

  // Lieu promu (carte), et spectacle de ce lieu s'il a été choisi.
  const [animAffiche, animLieu, lieu, proprio] = await Promise.all([
    prisma.animation.findUnique({ where: { id: a.animation_affiche_id }, include: inclusAnimation }),
    a.animation_lieu_id ? prisma.animation.findUnique({ where: { id: a.animation_lieu_id }, include: inclusAnimation }) : null,
    prisma.lieu.findUnique({ where: { id: a.lieu_id }, include: inclusLieu }),
    chargerProprietaires(),
  ])
  if (!animAffiche || !lieu) throw new ErreurApi(410, 'Animation indisponible.', { raison: 'EXPIREE' })
  const [partenaire, cible] = await Promise.all([
    a.compte.role === 'PARTENAIRE' ? prisma.partenaire.findUnique({ where: { compte_id: a.proprietaire_id } }) : null,
    // Cible 8th Wall du visuel : le téléphone reconnaît l'affiche imprimée et y accroche l'animation.
    cibleImage(a.fichier.chemin, `visuel-${a.image_id}`),
  ])
  res.json({
    affiche: serialiserAffiche(a, proprio),
    animationAffiche: serialiserAnimation(animAffiche, proprio),
    animationLieu: animLieu ? serialiserAnimation(animLieu, proprio) : null,
    lieu: serialiserLieu(lieu),
    proprietaire: partenaire?.nom_structure ?? 'Ville de Montbéliard',
    animationLieuActive: animLieu ? animationActive(animLieu) : false,
    cible,
  })
})

/** Statistique anonyme : scan de QR code ou lancement d'animation, arrondie à l'heure (BF-28). */
routesPublic.post('/statistiques', limiteStatistiques, valider(schemaStatistique), async (req, res) => {
  const s = req.body as { type: 'SCAN' | 'LANCEMENT'; afficheId?: number; animationId?: number; declencheur?: 'AFFICHE' | 'MONUMENT' | 'MANUEL' }
  if (!s.afficheId && !s.animationId) throw new ErreurApi(400, 'Contenu manquant.')
  await prisma.statistique.create({
    data: { type: s.type, affiche_id: s.afficheId ?? null, animation_id: s.animationId ?? null, declencheur: s.type === 'LANCEMENT' ? (s.declencheur ?? null) : null, heure: heureArrondie() },
  })
  res.status(204).end()
})

/**
 * Signalement anonyme (BF-45 à BF-51) : aucune identité enregistrée, preuve ALTCHA, 5 par heure.
 * Les agents et le partenaire concerné sont prévenus par mail (BF-50, BNF-26).
 */
routesPublic.post('/signalements', limiteSignalements, valider(schemaSignalement), async (req, res) => {
  const s = req.body as { afficheId?: number; animationId?: number; motif: 'ILLICITE' | 'TROMPEUR' | 'CHOQUANT' | 'PARTISAN' | 'ATTEINTE_DROITS' | 'AUTRE'; commentaire: string; altcha: string }
  await verifierAltcha(s.altcha)
  const contenu = s.afficheId
    ? await prisma.affiche.findUnique({ where: { id: s.afficheId }, select: { nom: true, proprietaire_id: true } })
    : await prisma.animation.findUnique({ where: { id: s.animationId! }, select: { titre: true, proprietaire_id: true } })
  if (!contenu) throw introuvable('Contenu introuvable.')
  const nom = 'nom' in contenu ? contenu.nom : contenu.titre
  const signalement = await prisma.$transaction(async (tx) => {
    const cree = await tx.signalement.create({
      data: { affiche_id: s.afficheId ?? null, animation_id: s.animationId ?? null, motif: s.motif, commentaire: s.commentaire || null },
    })
    await journaliser(VISITEUR_ANONYME, 'SIGNALEMENT', s.afficheId ? 'Affiche' : 'Animation', s.afficheId ?? s.animationId!, nom, { motif: s.motif }, tx)
    return cree
  })
  notifierAgents(`Nouveau signalement : ${nom}`, `Un visiteur a signalé « ${nom} » (motif : ${s.motif.toLowerCase()}). Consultez la file des signalements.`)
  notifierCompte(
    contenu.proprietaire_id,
    `Signalement sur « ${nom} »`,
    `Votre contenu « ${nom} » a été signalé (motif : ${s.motif.toLowerCase()}).${s.commentaire ? `\nCommentaire : « ${s.commentaire} »` : ''}\nLe contenu reste diffusé pendant l’examen par la mairie.`,
  )
  res.status(201).json({ id: String(signalement.id) })
})

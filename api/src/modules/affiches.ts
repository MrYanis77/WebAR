// Modules « affiches » et « zones » : affiche importée + QR code unique généré par le serveur,
// 4 conditions de publication, zone proposée/attribuée, export PDF (BF-31, BF-37 à BF-42, BNF-16).
import { Router } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import { schemaAffiche, schemaZone, schemaZoneAffiche, zId, type DonneesAffiche } from '../../../src/commun/schemas.js'
import { depuisLocal } from '../dates.js'
import { prisma } from '../db.js'
import { conflit, ErreurApi, interdit, introuvable } from '../erreurs.js'
import { auteur, exigerConnexion, exigerRole, valider, verifierProprietaire, type Utilisateur } from '../middlewares/index.js'
import { journaliser } from '../services/journal.js'
import { notifierAgents, notifierCompte } from '../services/notifications.js'
import { conditionsAffiche, publiable } from '../services/regles.js'
import { chargerProprietaires, compterStatistiques, serialiserAffiche, serialiserZone } from '../services/serialiser.js'
import { genererPdfAffiche, origineQr } from '../traitements/genererPDF.js'
import { filtreProprietaire, genererCodeQr, idParam, verifierPeutCreer } from './outils.js'

export const routesAffiches = Router()
export const routesZones = Router()
routesAffiches.use(exigerConnexion)
routesZones.use(exigerConnexion)

async function repondre(id: number) {
  const [a, proprio, scans, conditions] = await Promise.all([
    prisma.affiche.findUniqueOrThrow({ where: { id }, include: { fichier: true } }),
    chargerProprietaires(),
    compterStatistiques('SCAN', 'affiche_id'),
    conditionsAffiche(id),
  ])
  return serialiserAffiche(a, proprio, scans.get(id) ?? 0, conditions ?? undefined)
}

/** Vérifie que l'image et les animations peuvent être utilisées par l'éditeur. */
async function preparer(u: Utilisateur, d: DonneesAffiche) {
  const image = await prisma.fichier.findUnique({ where: { id: d.imageId } })
  if (!image || image.type !== 'IMAGE') throw new ErreurApi(400, 'Fichier d’affiche introuvable.')
  if (u.role !== 'AGENT' && image.proprietaire_id !== u.compteId) throw interdit('Ce fichier appartient à un autre compte.')
  const [animAffiche, animLieu, lieu] = await Promise.all([
    prisma.animation.findUnique({ where: { id: d.animationAfficheId } }),
    d.animationLieuId ? prisma.animation.findUnique({ where: { id: d.animationLieuId } }) : null,
    prisma.lieu.findUnique({ where: { id: d.lieuId } }),
  ])
  if (!animAffiche) throw new ErreurApi(400, 'Animation de l’affiche introuvable.')
  if (u.role !== 'AGENT' && animAffiche.proprietaire_id !== u.compteId && animAffiche.type !== 'LIEU') throw interdit('Cette animation appartient à un autre partenaire.')
  if (!lieu) throw new ErreurApi(400, 'Lieu promu introuvable.')
  if (d.animationLieuId && (!animLieu || animLieu.type !== 'LIEU' || animLieu.lieu_id !== d.lieuId))
    throw new ErreurApi(400, 'Le spectacle mis en avant doit être une animation du lieu promu.')
  return {
    image_id: d.imageId,
    animation_affiche_id: d.animationAfficheId,
    lieu_id: d.lieuId,
    animation_lieu_id: d.animationLieuId ?? null,
    nom: d.nom,
    accroche: d.accroche || null,
    texte: d.texte,
    format: d.format,
    qr_x: d.qr.x,
    qr_y: d.qr.y,
    qr_taille: d.qr.taille,
    qr_fond: d.qr.fond,
    qr_mention: d.qr.mention,
    debut: depuisLocal(d.debut),
    fin: depuisLocal(d.fin),
  }
}

/**
 * Animation propre à l'affiche (type AFFICHE, du même compte, utilisée par cette seule affiche) : elle
 * suit les dates de l'affiche. Sans cela, avancer la sortie d'une affiche à aujourd'hui laissait son
 * animation à l'ancienne date et le QR code affichait « animation indisponible ».
 */
async function synchroniserAnimationDediee(tx: Prisma.TransactionClient, afficheId: number, proprietaireId: number, d: { animation_affiche_id: number; debut: Date; fin: Date }) {
  const anim = await tx.animation.findUnique({ where: { id: d.animation_affiche_id } })
  if (!anim || anim.type !== 'AFFICHE' || anim.proprietaire_id !== proprietaireId) return
  const autres = await tx.affiche.count({ where: { animation_affiche_id: anim.id, id: { not: afficheId } } })
  if (autres > 0) return
  if (anim.debut.getTime() === d.debut.getTime() && anim.fin?.getTime() === d.fin.getTime()) return
  await tx.animation.update({ where: { id: anim.id }, data: { debut: d.debut, fin: d.fin } })
}

routesAffiches.get('/', async (req, res) => {
  const [liste, proprio, scans] = await Promise.all([
    prisma.affiche.findMany({ where: filtreProprietaire(req.utilisateur!), include: { fichier: true }, orderBy: { modifie_le: 'desc' } }),
    chargerProprietaires(),
    compterStatistiques('SCAN', 'affiche_id'),
  ])
  // Les 4 conditions de publication accompagnent chaque affiche (indicateurs de la liste et de l'éditeur).
  const conditions = await Promise.all(liste.map((a) => conditionsAffiche(a.id)))
  res.json(liste.map((a, i) => serialiserAffiche(a, proprio, scans.get(a.id) ?? 0, conditions[i] ?? undefined)))
})

/** Conditions de publication d'une affiche (affichées à l'étape « Validation »). */
routesAffiches.get('/:id/conditions', async (req, res) => {
  const a = await prisma.affiche.findUnique({ where: { id: idParam(req) } })
  if (!a) throw introuvable('Affiche introuvable.')
  verifierProprietaire(req, a.proprietaire_id)
  const c = (await conditionsAffiche(a.id))!
  res.json({ ...c, publiable: publiable(c) })
})

/** Création : le serveur génère le code du QR code (128 bits) ; l'éditeur ne saisit jamais de lien. */
routesAffiches.post('/', valider(schemaAffiche), async (req, res) => {
  const u = req.utilisateur!
  await verifierPeutCreer(u)
  const donnees = await preparer(u, req.body as DonneesAffiche)
  const a = await prisma.$transaction(async (tx) => {
    const cree = await tx.affiche.create({ data: { ...donnees, proprietaire_id: u.compteId, code_qr: genererCodeQr(), statut: 'BROUILLON' } })
    await synchroniserAnimationDediee(tx, cree.id, u.compteId, donnees)
    await journaliser(auteur(req), 'CREATION', 'Affiche', cree.id, cree.nom, undefined, tx)
    return cree
  })
  res.status(201).json(await repondre(a.id))
})

routesAffiches.patch('/:id', valider(schemaAffiche), async (req, res) => {
  const u = req.utilisateur!
  const a = await prisma.affiche.findUnique({ where: { id: idParam(req) } })
  if (!a) throw introuvable('Affiche introuvable.')
  verifierProprietaire(req, a.proprietaire_id)
  if ((a.statut === 'SUSPENDUE' || a.statut === 'RETIREE') && u.role !== 'AGENT') throw interdit('Contenu suspendu ou retiré par la mairie.')
  const donnees = await preparer(u, req.body as DonneesAffiche)
  await prisma.$transaction(async (tx) => {
    await tx.affiche.update({ where: { id: a.id }, data: { ...donnees, modifie_le: new Date(), chemin_pdf: null } })
    await synchroniserAnimationDediee(tx, a.id, a.proprietaire_id, donnees)
    await journaliser(auteur(req), 'MODIFICATION', 'Affiche', a.id, donnees.nom, a.image_id !== donnees.image_id ? { fichier: 'remplacé, contrôle relancé' } : undefined, tx)
  })
  res.json(await repondre(a.id))
})

/** Publication sans validation humaine préalable, seulement si les 4 conditions sont réunies (BF-41, BF-42). */
routesAffiches.post('/:id/publier', async (req, res) => {
  const a = await prisma.affiche.findUnique({ where: { id: idParam(req) } })
  if (!a) throw introuvable('Affiche introuvable.')
  verifierProprietaire(req, a.proprietaire_id)
  const c = (await conditionsAffiche(a.id))!
  if (!publiable(c)) throw conflit('Les 4 conditions de publication ne sont pas réunies.', c)
  if (a.statut === 'SUSPENDUE' || a.statut === 'RETIREE') throw conflit('Contenu suspendu ou retiré par la mairie.')
  await prisma.$transaction(async (tx) => {
    await tx.affiche.update({ where: { id: a.id }, data: { statut: 'PUBLIEE', modifie_le: new Date() } })
    await journaliser(auteur(req), 'PUBLICATION', 'Affiche', a.id, a.nom, undefined, tx)
  })
  res.json(await repondre(a.id))
})

/** Le partenaire propose une zone ; la mairie l'accepte ou la refuse (BF-40). */
routesAffiches.post('/:id/zone-proposee', exigerRole('PARTENAIRE'), async (req, res) => {
  const zoneId = zId.parse(req.body?.zoneId)
  const a = await prisma.affiche.findUnique({ where: { id: idParam(req) } })
  if (!a) throw introuvable('Affiche introuvable.')
  verifierProprietaire(req, a.proprietaire_id)
  const z = await prisma.zone_affichage.findUnique({ where: { id: zoneId } })
  if (!z || !z.active) throw new ErreurApi(400, 'Zone inconnue ou inactive.')
  await prisma.$transaction(async (tx) => {
    await tx.affiche.update({ where: { id: a.id }, data: { zone_proposee_id: zoneId } })
    await journaliser(auteur(req), 'ZONE_PROPOSEE', 'Affiche', a.id, a.nom, { zone: z.nom }, tx)
  })
  notifierAgents(`Zone proposée pour « ${a.nom} »`, `${req.utilisateur!.structure} propose la zone « ${z.nom} ».`)
  res.json(await repondre(a.id))
})

/** Attribution de la zone par un agent, ou refus de la zone proposée (BF-40, BNF-16). */
routesAffiches.put('/:id/zone', exigerRole('AGENT'), valider(schemaZoneAffiche), async (req, res) => {
  const { zoneId, refusProposition } = req.body as { zoneId: number | null; refusProposition: boolean }
  const a = await prisma.affiche.findUnique({ where: { id: idParam(req) } })
  if (!a) throw introuvable('Affiche introuvable.')
  const z = zoneId ? await prisma.zone_affichage.findUnique({ where: { id: zoneId } }) : null
  if (zoneId && (!z || !z.active)) throw new ErreurApi(400, 'Zone inconnue ou inactive.')
  await prisma.$transaction(async (tx) => {
    await tx.affiche.update({
      where: { id: a.id },
      data: refusProposition ? { zone_proposee_id: null } : { zone_id: zoneId, zone_proposee_id: null, chemin_pdf: null },
    })
    await journaliser(auteur(req), refusProposition ? 'ZONE_PROPOSEE_REFUSEE' : 'ZONE_ATTRIBUEE', 'Affiche', a.id, a.nom, z ? { zone: z.nom } : undefined, tx)
  })
  notifierCompte(
    a.proprietaire_id,
    `Zone d’affichage : « ${a.nom} »`,
    refusProposition ? 'La mairie a refusé la zone proposée.' : z ? `La mairie a attribué la zone « ${z.nom} » à votre affiche.` : 'La zone de votre affiche a été retirée.',
  )
  res.json(await repondre(a.id))
})

/** Export PDF prêt à imprimer, refusé (409) tant que les 4 conditions ne sont pas réunies. */
routesAffiches.get('/:id/pdf', async (req, res) => {
  const a = await prisma.affiche.findUnique({ where: { id: idParam(req) }, include: { fichier: true } })
  if (!a) throw introuvable('Affiche introuvable.')
  verifierProprietaire(req, a.proprietaire_id)
  const c = (await conditionsAffiche(a.id))!
  if (!publiable(c)) throw conflit('Export impossible : les 4 conditions de publication ne sont pas réunies.', c)
  const pdf = await genererPdfAffiche({
    origine: origineQr(req.headers['x-url-reseau']),
    nom: a.nom,
    codeQr: a.code_qr,
    format: a.format,
    image: { chemin: a.fichier.chemin, mime: a.fichier.type_mime, largeur: a.fichier.largeur_px ?? 1, hauteur: a.fichier.hauteur_px ?? 1 },
    qr: { x: Number(a.qr_x), y: Number(a.qr_y), taille: Number(a.qr_taille), fond: a.qr_fond, mention: a.qr_mention },
  })
  const nomFichier = a.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'affiche'
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nomFichier}-${a.format}.pdf"` }).send(Buffer.from(pdf))
})

routesAffiches.delete('/:id', async (req, res) => {
  const a = await prisma.affiche.findUnique({ where: { id: idParam(req) } })
  if (!a) throw introuvable('Affiche introuvable.')
  verifierProprietaire(req, a.proprietaire_id)
  await prisma.$transaction(async (tx) => {
    // Les signalements partent avec l'affiche (ON DELETE CASCADE) ; les décisions restent au journal.
    await tx.affiche.delete({ where: { id: a.id } })
    await journaliser(auteur(req), 'SUPPRESSION', 'Affiche', a.id, a.nom, undefined, tx)
  })
  res.status(204).end()
})

// ---------------------------------------------------------------- zones d'affichage

routesZones.get('/', async (_req, res) => {
  res.json((await prisma.zone_affichage.findMany({ orderBy: { nom: 'asc' } })).map(serialiserZone))
})

const versZone = (d: { nom: string; adresse: string; latitude?: number | null; longitude?: number | null; format: 'A4' | 'A3' | 'A2' | 'A1' | 'A0'; regles: string; active: boolean }) => ({
  nom: d.nom,
  adresse: d.adresse,
  latitude: d.latitude ?? null,
  longitude: d.longitude ?? null,
  format_max: d.format,
  regles: d.regles || null,
  active: d.active,
})

routesZones.post('/', exigerRole('AGENT'), valider(schemaZone), async (req, res) => {
  const z = await prisma.zone_affichage.create({ data: versZone(req.body) })
  await journaliser(auteur(req), 'ZONE_CREEE', 'Zone', z.id, z.nom)
  res.status(201).json(serialiserZone(z))
})

routesZones.patch('/:id', exigerRole('AGENT'), valider(schemaZone), async (req, res) => {
  const z = await prisma.zone_affichage.update({ where: { id: idParam(req) }, data: versZone(req.body) })
  await journaliser(auteur(req), 'ZONE_MAJ', 'Zone', z.id, z.nom)
  res.json(serialiserZone(z))
})

// Module « lieux » : lieux, fiches FR/EN/DE, rayon, visuel, photos de façade et score du match.
// Un nouveau lieu s'ajoute sans modifier le code (BF-24, BF-27, BF-52, BNF-13).
import { Router } from 'express'
import { schemaLieu, schemaScore, type DonneesLieu } from '../../../src/commun/schemas.js'
import { prisma } from '../db.js'
import { ErreurApi, introuvable } from '../erreurs.js'
import { auteur, exigerConnexion, exigerRole, valider } from '../middlewares/index.js'
import { journaliser } from '../services/journal.js'
import { serialiserLieu } from '../services/serialiser.js'
import { rangerFichier, reception } from '../services/stockage.js'
import { planifierControle } from '../traitements/controleFichiers.js'
import { idParam } from './outils.js'

export const routesLieux = Router()
routesLieux.use(exigerConnexion)
const inclus = { fichier: true, _count: { select: { photo_facade: true } } } as const

const versLieu = (d: DonneesLieu) => ({
  nom: d.nom,
  nom_court: d.nomCourt,
  categorie_fr: d.categorie.fr,
  categorie_en: d.categorie.en || null,
  categorie_de: d.categorie.de || null,
  adresse: d.adresse,
  description_fr: d.description.fr,
  description_en: d.description.en || null,
  description_de: d.description.de || null,
  latitude: d.latitude,
  longitude: d.longitude,
  rayon_m: d.rayonM,
  visuel_id: d.visuelId ?? null,
  acces_libre: d.accesLibre,
  actif: d.actif,
})

async function verifierVisuel(id?: number | null) {
  if (!id) return
  const f = await prisma.fichier.findUnique({ where: { id } })
  if (!f || f.type !== 'IMAGE') throw new ErreurApi(400, 'Visuel introuvable.')
}

/** Tous les lieux (y compris masqués) pour le back-office. */
routesLieux.get('/', async (_req, res) => {
  res.json((await prisma.lieu.findMany({ include: inclus, orderBy: { nom: 'asc' } })).map(serialiserLieu))
})

routesLieux.post('/', exigerRole('AGENT'), valider(schemaLieu), async (req, res) => {
  await verifierVisuel(req.body.visuelId)
  const l = await prisma.lieu.create({ data: versLieu(req.body), include: inclus })
  await journaliser(auteur(req), 'LIEU_CREE', 'Lieu', l.id, l.nom)
  res.status(201).json(serialiserLieu(l))
})

routesLieux.patch('/:id', exigerRole('AGENT'), valider(schemaLieu), async (req, res) => {
  await verifierVisuel(req.body.visuelId)
  const l = await prisma.lieu.update({ where: { id: idParam(req) }, data: { ...versLieu(req.body), modifie_le: new Date() }, include: inclus })
  await journaliser(auteur(req), 'LIEU_MAJ', 'Lieu', l.id, l.nom)
  res.json(serialiserLieu(l))
})

/** Suppression refusée tant qu'une animation porte sur le lieu (clé étrangère RESTRICT). */
routesLieux.delete('/:id', exigerRole('AGENT'), async (req, res) => {
  const l = await prisma.lieu.findUnique({ where: { id: idParam(req) } })
  if (!l) throw introuvable('Lieu introuvable.')
  const affiches = await prisma.affiche.findMany({ where: { lieu_id: l.id }, select: { nom: true } })
  if (affiches.length)
    throw new ErreurApi(409, `Ce lieu est promu par ${affiches.map((x) => `l’affiche « ${x.nom} »`).join(', ')} : changez le lieu de ces affiches d’abord.`)
  const liees = await prisma.animation.findMany({ where: { lieu_id: l.id }, select: { titre: true } })
  if (liees.length)
    throw new ErreurApi(
      409,
      `Ce lieu porte ${liees.length > 1 ? 'les animations' : 'l’animation'} ${liees.map((x) => `« ${x.titre} »`).join(', ')} : ${liees.length > 1 ? 'supprimez-les ou rattachez-les' : 'supprimez-la ou rattachez-la'} à un autre lieu d’abord.`,
    )
  await prisma.lieu.delete({ where: { id: l.id } })
  await journaliser(auteur(req), 'SUPPRESSION', 'Lieu', l.id, l.nom)
  res.status(204).end()
})

/** Score du match affiché dans l'animation du lieu (BF-52). */
routesLieux.put('/:id/score', exigerRole('AGENT'), valider(schemaScore), async (req, res) => {
  const s = req.body as { equipeDomicile: string; equipeExterieur: string; scoreDomicile: number; scoreExterieur: number; competition: string; minute: string }
  const l = await prisma.lieu.update({
    where: { id: idParam(req) },
    data: {
      equipe_domicile: s.equipeDomicile,
      equipe_exterieur: s.equipeExterieur,
      score_domicile: s.scoreDomicile,
      score_exterieur: s.scoreExterieur,
      competition: s.competition || null,
      etat_match: s.minute || null,
      score_maj_le: new Date(),
    },
    include: inclus,
  })
  await journaliser(auteur(req), 'SCORE_MAJ', 'Lieu', l.id, l.nom, { score: `${s.equipeDomicile} ${s.scoreDomicile} – ${s.scoreExterieur} ${s.equipeExterieur}` })
  res.json(serialiserLieu(l))
})

/** Photo de détail de façade (jour/nuit) pour la cible de reconnaissance du monument. */
routesLieux.post('/:id/photos', exigerRole('AGENT'), reception.single('fichier'), async (req, res) => {
  const l = await prisma.lieu.findUnique({ where: { id: idParam(req) } })
  if (!l) throw introuvable('Lieu introuvable.')
  if (!req.file) throw new ErreurApi(400, 'Aucun fichier reçu.')
  const range = await rangerFichier(req.file)
  if (range.type !== 'IMAGE') throw new ErreurApi(400, 'Une photo de façade doit être une image.')
  const f = await prisma.fichier.create({
    data: { proprietaire_id: req.utilisateur!.compteId, type: 'IMAGE', nom_original: req.file.originalname.slice(0, 255), chemin: range.chemin, type_mime: range.mime, taille_octets: req.file.size },
  })
  await prisma.photo_facade.create({ data: { lieu_id: l.id, fichier_id: f.id, moment: req.body?.moment === 'NUIT' ? 'NUIT' : 'JOUR' } })
  planifierControle(f.id)
  const maj = await prisma.lieu.findUniqueOrThrow({ where: { id: l.id }, include: inclus })
  res.status(201).json(serialiserLieu(maj))
})

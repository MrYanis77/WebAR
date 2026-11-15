// Module « fichiers » : import (multer + file-type), contrôle automatique en arrière-plan,
// validation après aperçu par l'éditeur, suppression si aucun contenu ne l'utilise (BF-36, BNF-19).
import { Router } from 'express'
import { rm } from 'node:fs/promises'
import { prisma } from '../db.js'
import { ErreurApi, introuvable } from '../erreurs.js'
import { auteur, exigerConnexion, verifierProprietaire } from '../middlewares/index.js'
import { journaliser } from '../services/journal.js'
import { chargerProprietaires, serialiserFichier } from '../services/serialiser.js'
import { cheminAbsolu, rangerFichier, reception } from '../services/stockage.js'
import { planifierControle } from '../traitements/controleFichiers.js'
import { filtreProprietaire, idParam, verifierPeutCreer } from './outils.js'

export const routesFichiers = Router()
routesFichiers.use(exigerConnexion)

routesFichiers.get('/', async (req, res) => {
  const [liste, proprio] = await Promise.all([
    prisma.fichier.findMany({ where: filtreProprietaire(req.utilisateur!), include: { fichier_clip: true }, orderBy: { cree_le: 'desc' } }),
    chargerProprietaires(),
  ])
  res.json(liste.map((f) => serialiserFichier(f, proprio)))
})

/**
 * Import d'un fichier (champ « fichier ») : la réponse est immédiate, le contrôle se fait en
 * arrière-plan et son résultat apparaît dans le back-office (statut, rapport, animations du GLB).
 */
routesFichiers.post('/', reception.single('fichier'), async (req, res) => {
  const u = req.utilisateur!
  if (!req.file) throw new ErreurApi(400, 'Aucun fichier reçu.')
  try {
    await verifierPeutCreer(u)
  } catch (e) {
    await rm(req.file.path, { force: true })
    throw e
  }
  const usage = req.body?.usage === 'LIEU' && u.role === 'AGENT' ? 'LIEU' : 'AFFICHE'
  const range = await rangerFichier(req.file)
  const f = await prisma.$transaction(async (tx) => {
    const cree = await tx.fichier.create({
      data: {
        proprietaire_id: u.compteId,
        type: range.type,
        usage_fichier: range.type === 'MODELE_3D' ? usage : range.type === 'SON' ? usage : null,
        nom_original: req.file!.originalname.slice(0, 255),
        chemin: range.chemin,
        type_mime: range.mime,
        taille_octets: req.file!.size,
      },
      include: { fichier_clip: true },
    })
    await journaliser(auteur(req), 'IMPORT_FICHIER', 'Fichier', cree.id, cree.nom_original, { controle: 'lancé' }, tx)
    return cree
  })
  planifierControle(f.id)
  res.status(201).json(serialiserFichier(f, await chargerProprietaires()))
})

/** Validation de l'enregistrement après l'aperçu : le statut passe à « conforme ». */
routesFichiers.patch('/:id/valider', async (req, res) => {
  const f = await prisma.fichier.findUnique({ where: { id: idParam(req) }, include: { fichier_clip: true } })
  if (!f) throw introuvable('Fichier introuvable.')
  verifierProprietaire(req, f.proprietaire_id)
  if (f.statut_controle === 'REFUSE') throw new ErreurApi(409, `Fichier refusé : ${f.raison_refus}`)
  if (!f.controle_termine_le) throw new ErreurApi(409, 'Le contrôle automatique est encore en cours.')
  const maj = await prisma.fichier.update({ where: { id: f.id }, data: { statut_controle: 'CONFORME' }, include: { fichier_clip: true } })
  await journaliser(auteur(req), 'FICHIER_VALIDE', 'Fichier', f.id, f.nom_original)
  res.json(serialiserFichier(maj, await chargerProprietaires()))
})

/** Suppression d'un fichier inutilisé (sinon 409 : une animation, une affiche ou un lieu l'utilise). */
routesFichiers.delete('/:id', async (req, res) => {
  const f = await prisma.fichier.findUnique({ where: { id: idParam(req) } })
  if (!f) throw introuvable('Fichier introuvable.')
  verifierProprietaire(req, f.proprietaire_id)
  const [anims, affiches, lieux] = await Promise.all([
    prisma.animation.count({ where: { OR: [{ modele_id: f.id }, { son_id: f.id }] } }),
    prisma.affiche.count({ where: { image_id: f.id } }),
    prisma.lieu.count({ where: { visuel_id: f.id } }),
  ])
  if (anims + affiches + lieux > 0) throw new ErreurApi(409, 'Fichier utilisé par une animation, une affiche ou un lieu.')
  await prisma.fichier.delete({ where: { id: f.id } })
  await rm(cheminAbsolu(f.chemin), { force: true })
  await journaliser(auteur(req), 'SUPPRESSION', 'Fichier', f.id, f.nom_original)
  res.status(204).end()
})

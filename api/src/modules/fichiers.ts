// Module « fichiers » : import (multer + file-type), contrôle automatique en arrière-plan,
// validation après aperçu par l'éditeur, suppression si aucun contenu ne l'utilise (BF-36, BNF-19).
// Atelier 3D : réglages d'un modèle (taille, rotation, ancrage…), optimisation par le serveur et
// restauration de l'original.
import { Router, type Request } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MODELE_3D_MAX_MO } from '../../../src/commun/constantes.js'
import { schemaAssemblage, schemaDossier, schemaOptimisation, schemaReglages3D } from '../../../src/commun/schemas.js'
import type { ParametresOptimisation, Reglages3D } from '../../../src/commun/types.js'
import { prisma } from '../db.js'
import { ErreurApi, introuvable } from '../erreurs.js'
import { auteur, exigerConnexion, valider, verifierProprietaire } from '../middlewares/index.js'
import { journaliser } from '../services/journal.js'
import { chargerProprietaires, serialiserFichier } from '../services/serialiser.js'
import { cheminAbsolu, rangerFichier, reception } from '../services/stockage.js'
import { planifierControle } from '../traitements/controleFichiers.js'
import { assemblerGlb } from '../traitements/assemblageModeles.js'
import { planifierOptimisation, restaurerOriginal } from '../traitements/optimisationModele.js'
import { filtreProprietaire, idParam, verifierPeutCreer } from './outils.js'

export const routesFichiers = Router()
routesFichiers.use(exigerConnexion)

/** Nom de dossier reçu avec un import (champ de formulaire) : texte court, sinon aucun dossier. */
const lireDossier = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null)

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
        dossier: lireDossier(req.body?.dossier),
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

/**
 * Studio d'assemblage : plusieurs modèles 3D (contrôlés, accessibles à l'utilisateur) réunis en un seul
 * GLB, chacun à la place choisie, avec leurs animations. Le nouveau modèle passe par le contrôle automatique.
 */
routesFichiers.post('/assembler', valider(schemaAssemblage), async (req, res) => {
  const u = req.utilisateur!
  await verifierPeutCreer(u)
  const d = req.body as { nom: string; usage: 'AFFICHE' | 'LIEU'; elements: { fichierId: number; matrice: number[] }[]; remplacerId?: number }
  // Modèle modifié sur place : il doit appartenir au compte (ou l'agent), et ses animations le gardent.
  const cible = d.remplacerId ? await prisma.fichier.findUnique({ where: { id: d.remplacerId } }) : null
  if (d.remplacerId) {
    if (!cible || cible.type !== 'MODELE_3D') throw introuvable('Modèle à modifier introuvable.')
    verifierProprietaire(req, cible.proprietaire_id)
  }
  const sources = await prisma.fichier.findMany({ where: { id: { in: [...new Set(d.elements.map((e) => e.fichierId))] } } })
  for (const e of d.elements) {
    const f = sources.find((s) => s.id === e.fichierId)
    if (!f || f.type !== 'MODELE_3D') throw new ErreurApi(400, 'Modèle 3D introuvable.')
    if (u.role !== 'AGENT' && f.proprietaire_id !== u.compteId) throw new ErreurApi(403, `« ${f.nom_original} » appartient à un autre compte.`)
    if (!f.controle_termine_le || f.statut_controle === 'REFUSE') throw new ErreurApi(409, `« ${f.nom_original} » doit d’abord réussir le contrôle automatique.`)
  }
  const octets = await assemblerGlb(
    d.elements.map((e) => {
      const f = sources.find((s) => s.id === e.fichierId)!
      return { source: cheminAbsolu(f.chemin), nom: f.nom_original.replace(/\.glb$/i, ''), matrice: e.matrice }
    }),
  )
  if (octets.byteLength > MODELE_3D_MAX_MO * 1_000_000) throw new ErreurApi(413, `Modèle assemblé trop lourd : ${MODELE_3D_MAX_MO} Mo maximum.`)
  const chemin = path.posix.join('3d', `${randomUUID()}.glb`)
  await mkdir(path.dirname(cheminAbsolu(chemin)), { recursive: true })
  await writeFile(cheminAbsolu(chemin), octets)
  const usage = d.usage === 'LIEU' && u.role === 'AGENT' ? 'LIEU' : 'AFFICHE'

  if (cible) {
    // Remplacement : même fichier (même identifiant, mêmes animations, même dossier), nouveau contenu.
    // Les animations repartent sur toutes les animations intégrées (les indices de clips changent).
    const anciens = [cible.chemin, cible.chemin_original].filter((c): c is string => !!c)
    const maj = await prisma.$transaction(async (tx) => {
      await tx.animation.updateMany({ where: { modele_id: cible.id }, data: { clip_id: null } })
      const m = await tx.fichier.update({
        where: { id: cible.id },
        data: {
          nom_original: `${d.nom.replace(/\.glb$/i, '').slice(0, 250)}.glb`,
          chemin,
          chemin_original: null,
          taille_octets: octets.byteLength,
          nb_triangles: null,
          texture_max_px: null,
          reglages_3d: null,
          optimisation: null,
          raison_refus: null,
          controle_termine_le: null,
          // Reste diffusable s'il l'était : validé automatiquement si le contrôle réussit.
          statut_controle: 'EN_COURS',
        },
        include: { fichier_clip: true },
      })
      await journaliser(auteur(req), 'MODIFICATION_3D', 'Fichier', m.id, m.nom_original, { modeles: sources.map((s) => s.nom_original).join(', ') }, tx)
      return m
    })
    for (const c of anciens) if (c !== chemin) await rm(cheminAbsolu(c), { force: true })
    planifierControle(maj.id, { validerSiConforme: cible.statut_controle === 'CONFORME' })
    res.json(serialiserFichier(maj, await chargerProprietaires()))
    return
  }

  // Copie : nouveau fichier, rangé dans le même dossier que le premier modèle.
  const dossier = sources.find((s) => s.id === d.elements[0].fichierId)?.dossier ?? null
  const f = await prisma.$transaction(async (tx) => {
    const cree = await tx.fichier.create({
      data: {
        proprietaire_id: u.compteId,
        type: 'MODELE_3D',
        usage_fichier: usage,
        nom_original: `${d.nom.replace(/\.glb$/i, '').slice(0, 250)}.glb`,
        dossier,
        chemin,
        type_mime: 'model/gltf-binary',
        taille_octets: octets.byteLength,
      },
      include: { fichier_clip: true },
    })
    await journaliser(auteur(req), 'ASSEMBLAGE_3D', 'Fichier', cree.id, cree.nom_original, { modeles: sources.map((s) => s.nom_original).join(', ') }, tx)
    return cree
  })
  planifierControle(f.id)
  res.status(201).json(serialiserFichier(f, await chargerProprietaires()))
})

/** Range un fichier dans un dossier (ou le sort de son dossier). */
routesFichiers.patch('/:id/dossier', valider(schemaDossier), async (req, res) => {
  const f = await prisma.fichier.findUnique({ where: { id: idParam(req) } })
  if (!f) throw introuvable('Fichier introuvable.')
  verifierProprietaire(req, f.proprietaire_id)
  const maj = await prisma.fichier.update({ where: { id: f.id }, data: { dossier: (req.body as { dossier: string | null }).dossier }, include: { fichier_clip: true } })
  res.json(serialiserFichier(maj, await chargerProprietaires()))
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

/** Modèle 3D de l'utilisateur (propriétaire ou agent), dont le contrôle automatique est terminé. */
async function modeleModifiable(req: Request) {
  const f = await prisma.fichier.findUnique({ where: { id: idParam(req) } })
  if (!f) throw introuvable('Fichier introuvable.')
  verifierProprietaire(req, f.proprietaire_id)
  if (f.type !== 'MODELE_3D') throw new ErreurApi(400, 'Seul un modèle 3D se règle dans l’atelier 3D.')
  if (!f.controle_termine_le) throw new ErreurApi(409, 'Le contrôle automatique est encore en cours.')
  return f
}

const repondreFichier = async (id: number) =>
  serialiserFichier(await prisma.fichier.findUniqueOrThrow({ where: { id }, include: { fichier_clip: true } }), await chargerProprietaires())

/** Atelier 3D : réglages du modèle, appliqués par Three.js partout où il est affiché (le fichier n'est pas modifié). */
routesFichiers.patch('/:id/reglages', valider(schemaReglages3D), async (req, res) => {
  const f = await modeleModifiable(req)
  const r = req.body as Reglages3D
  await prisma.fichier.update({ where: { id: f.id }, data: { reglages_3d: JSON.stringify(r) } })
  await journaliser(auteur(req), 'REGLAGES_3D', 'Fichier', f.id, f.nom_original, { ancrage: r.ancrage, vitesse: r.vitesse })
  res.json(await repondreFichier(f.id))
})

/** Atelier 3D : optimisation en tâche de fond (textures, simplification, compression) ; l'original est conservé. */
routesFichiers.post('/:id/optimiser', valider(schemaOptimisation), async (req, res) => {
  const f = await modeleModifiable(req)
  if (f.optimisation && (JSON.parse(f.optimisation) as { etat: string }).etat === 'EN_COURS') throw new ErreurApi(409, 'Une optimisation est déjà en cours.')
  const p = req.body as ParametresOptimisation
  await planifierOptimisation(f.id, p)
  await journaliser(auteur(req), 'OPTIMISATION_3D', 'Fichier', f.id, f.nom_original, {
    textures: p.textureMaxPx ?? 'conservées',
    simplification: `${Math.round(p.simplification * 100)} %`,
    compression: p.compression ? 'meshopt' : 'non',
  })
  res.status(202).json(await repondreFichier(f.id))
})

/** Atelier 3D : retour au modèle importé (le fichier optimisé est supprimé). */
routesFichiers.post('/:id/restaurer', async (req, res) => {
  const f = await modeleModifiable(req)
  if (!f.chemin_original) throw new ErreurApi(409, 'Ce modèle n’a pas été optimisé.')
  await restaurerOriginal(f.id)
  await journaliser(auteur(req), 'RESTAURATION_3D', 'Fichier', f.id, f.nom_original)
  res.json(await repondreFichier(f.id))
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
  if (f.chemin_original) await rm(cheminAbsolu(f.chemin_original), { force: true })
  await journaliser(auteur(req), 'SUPPRESSION', 'Fichier', f.id, f.nom_original)
  res.status(204).end()
})

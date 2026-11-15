// Modules « comptes » et « charte » : vérification, refus, suspension des partenaires par un agent
// (BF-34, BF-44) et acceptation de la charte d'utilisation par le partenaire (BF-41).
import { Router } from 'express'
import { schemaDecisionCompte } from '../../../src/commun/schemas.js'
import { config } from '../config.js'
import { versLocal } from '../dates.js'
import { prisma } from '../db.js'
import { ErreurApi, introuvable } from '../erreurs.js'
import { auteur, exigerConnexion, exigerRole, valider } from '../middlewares/index.js'
import { journaliser } from '../services/journal.js'
import { notifierCompte } from '../services/notifications.js'
import { serialiserPartenaire } from '../services/serialiser.js'
import { idParam } from './outils.js'

export const routesComptes = Router()
const inclus = { compte: { include: { acceptation_charte: true } } } as const

/** Liste des partenaires : tous pour un agent, sa propre fiche pour un partenaire. */
routesComptes.get('/partenaires', exigerConnexion, async (req, res) => {
  const u = req.utilisateur!
  const liste = await prisma.partenaire.findMany({ where: u.role === 'AGENT' ? {} : { compte_id: u.compteId }, include: inclus, orderBy: { id: 'asc' } })
  res.json(liste.map(serialiserPartenaire))
})

/** Accepter, refuser, suspendre ou réactiver un compte partenaire, avec motif (agents uniquement). */
routesComptes.patch('/admin/comptes/:id', exigerRole('AGENT'), valider(schemaDecisionCompte), async (req, res) => {
  const partenaireId = idParam(req)
  const { statut, motif } = req.body as { statut: 'VERIFIE' | 'REFUSE' | 'SUSPENDU'; motif?: string }
  if (statut !== 'VERIFIE' && (!motif || motif.length < 5)) throw new ErreurApi(400, 'Un motif est obligatoire pour refuser ou suspendre.')
  const p = await prisma.partenaire.findUnique({ where: { id: partenaireId }, include: { compte: true } })
  if (!p) throw introuvable('Partenaire introuvable.')
  const avant = p.compte.statut
  const action = statut === 'VERIFIE' ? (avant === 'SUSPENDU' ? 'REACTIVATION' : 'COMPTE_VERIFIE') : statut === 'REFUSE' ? 'COMPTE_REFUSE' : 'SUSPENSION'
  await prisma.$transaction(async (tx) => {
    await tx.compte.update({ where: { id: p.compte_id }, data: { statut, motif_statut: statut === 'VERIFIE' ? null : motif } })
    // Suspension et réactivation sont des décisions de modération (historique conservé, réexamen possible).
    if (statut === 'SUSPENDU' || (statut === 'VERIFIE' && avant === 'SUSPENDU'))
      await tx.decision.create({
        data: {
          agent_id: req.utilisateur!.compteId,
          contenu_type: 'COMPTE',
          compte_vise_id: p.compte_id,
          action: statut === 'SUSPENDU' ? 'SUSPENDRE' : 'REACTIVER',
          motif: motif && motif.length >= 5 ? motif : 'Compte conforme après examen.',
        },
      })
    await journaliser(auteur(req), action, 'Compte', p.id, p.nom_structure, motif ? { motif } : undefined, tx)
  })
  const textes: Record<string, string> = {
    VERIFIE: avant === 'SUSPENDU' ? 'Votre compte est réactivé.' : 'Votre compte partenaire est vérifié : vous pouvez vous connecter, accepter la charte puis créer vos affiches.',
    REFUSE: `Votre inscription est refusée. Motif : ${motif}`,
    SUSPENDU: `Votre compte est suspendu. Motif : ${motif}\nVous pouvez demander un réexamen depuis votre espace.`,
  }
  notifierCompte(p.compte_id, 'Décision sur votre compte partenaire', textes[statut])
  const maj = await prisma.partenaire.findUnique({ where: { id: partenaireId }, include: inclus })
  res.json(serialiserPartenaire(maj!))
})

/** Acceptation de la charte en vigueur ; la version et la date sont enregistrées. */
routesComptes.post('/charte/acceptation', exigerConnexion, async (req, res) => {
  const u = req.utilisateur!
  const existante = await prisma.acceptation_charte.findUnique({ where: { compte_id_version_charte: { compte_id: u.compteId, version_charte: config.versionCharte } } })
  const a =
    existante ??
    (await prisma.$transaction(async (tx) => {
      const cree = await tx.acceptation_charte.create({ data: { compte_id: u.compteId, version_charte: config.versionCharte } })
      await journaliser(auteur(req), 'CHARTE_ACCEPTEE', 'Compte', u.compteId, u.structure, { version: config.versionCharte }, tx)
      return cree
    }))
  res.json({ version: a.version_charte, accepteeLe: versLocal(a.acceptee_le) })
})

routesComptes.get('/charte', exigerConnexion, async (req, res) => {
  const a = await prisma.acceptation_charte.findFirst({ where: { compte_id: req.utilisateur!.compteId }, orderBy: { acceptee_le: 'desc' } })
  res.json({ version: config.versionCharte, accepteeLe: versLocal(a?.acceptee_le) ?? null })
})

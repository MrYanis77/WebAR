// Modules « signalements » et « moderation » : file des signalements (agents), vue en lecture seule
// du partenaire, décisions motivées, réponse et réexamen (BF-44, BF-48 à BF-50, BNF-25).
import { Router } from 'express'
import { z } from 'zod'
import { schemaClotureReexamen, schemaDecision, schemaReponseDecision, zId } from '../../../src/commun/schemas.js'
import { prisma } from '../db.js'
import { ErreurApi, interdit, introuvable } from '../erreurs.js'
import { auteur, exigerConnexion, exigerRole, valider } from '../middlewares/index.js'
import { journaliser } from '../services/journal.js'
import { notifierCompte } from '../services/notifications.js'
import { serialiserDecision, serialiserSignalement } from '../services/serialiser.js'
import { idParam } from './outils.js'

export const routesModeration = Router()
routesModeration.use(exigerConnexion)

const inclusDecision = {
  compte_decision_agent_idTocompte: true,
  decision_signalement: true,
  compte_decision_compte_vise_idTocompte: { include: { partenaire: true } },
} as const

/** Signalements visibles : tous pour un agent, ceux de ses contenus pour un partenaire (BNF-25). */
routesModeration.get('/signalements', async (req, res) => {
  const u = req.utilisateur!
  const liste = await prisma.signalement.findMany({
    where: u.role === 'AGENT' ? {} : { OR: [{ affiche: { proprietaire_id: u.compteId } }, { animation: { proprietaire_id: u.compteId } }] },
    orderBy: { cree_le: 'desc' },
  })
  res.json(liste.map(serialiserSignalement))
})

/** Prise en charge : les signalements « nouveaux » passent « en cours » (agents). */
routesModeration.patch('/signalements/prise-en-charge', exigerRole('AGENT'), valider(z.object({ ids: z.array(zId).min(1) })), async (req, res) => {
  await prisma.signalement.updateMany({ where: { id: { in: req.body.ids }, statut: 'NOUVEAU' }, data: { statut: 'EN_COURS' } })
  res.status(204).end()
})

/** Décisions : toutes pour un agent ; pour un partenaire, celles qui visent ses contenus ou son compte. */
routesModeration.get('/decisions', async (req, res) => {
  const u = req.utilisateur!
  const liste = await prisma.decision.findMany({
    where:
      u.role === 'AGENT'
        ? {}
        : { OR: [{ compte_vise_id: u.compteId }, { affiche: { proprietaire_id: u.compteId } }, { animation: { proprietaire_id: u.compteId } }] },
    include: inclusDecision,
    orderBy: { decide_le: 'desc' },
  })
  res.json(liste.map(serialiserDecision))
})

const statutApres = { MAINTENIR: null, SUSPENDRE: 'SUSPENDUE', SUPPRIMER: 'RETIREE', REACTIVER: 'PUBLIEE' } as const

/**
 * Décision d'un agent sur une affiche ou une animation, avec ou sans signalement : maintenir,
 * suspendre, supprimer (statut « retiré », rien n'est effacé) ou réactiver. Le partenaire est notifié.
 */
routesModeration.post('/admin/contenus/:type/:id/decision', exigerRole('AGENT'), valider(schemaDecision), async (req, res) => {
  const type = String(req.params.type).toUpperCase()
  if (type !== 'AFFICHE' && type !== 'ANIMATION') throw new ErreurApi(400, 'Type de contenu inconnu.')
  const id = idParam(req)
  const { action, motif, signalementIds } = req.body as { action: keyof typeof statutApres; motif: string; signalementIds: number[] }
  const contenu =
    type === 'AFFICHE'
      ? await prisma.affiche.findUnique({ where: { id }, select: { nom: true, proprietaire_id: true } }).then((a) => a && { nom: a.nom, proprietaire: a.proprietaire_id })
      : await prisma.animation.findUnique({ where: { id }, select: { titre: true, proprietaire_id: true } }).then((a) => a && { nom: a.titre, proprietaire: a.proprietaire_id })
  if (!contenu) throw introuvable('Contenu introuvable.')
  const nouveau = statutApres[action]
  await prisma.$transaction(async (tx) => {
    if (nouveau) {
      if (type === 'AFFICHE') await tx.affiche.update({ where: { id }, data: { statut: nouveau, modifie_le: new Date() } })
      else await tx.animation.update({ where: { id }, data: { statut: nouveau, modifie_le: new Date() } })
    }
    const d = await tx.decision.create({
      data: {
        agent_id: req.utilisateur!.compteId,
        contenu_type: type,
        affiche_id: type === 'AFFICHE' ? id : null,
        animation_id: type === 'ANIMATION' ? id : null,
        action,
        motif,
      },
    })
    if (signalementIds.length) {
      await tx.decision_signalement.createMany({ data: signalementIds.map((s) => ({ decision_id: d.id, signalement_id: s })) })
      await tx.signalement.updateMany({ where: { id: { in: signalementIds } }, data: { statut: 'TRAITE' } })
    }
    await journaliser(auteur(req), `DECISION_${action}`, type === 'AFFICHE' ? 'Affiche' : 'Animation', id, contenu.nom, { motif }, tx)
  })
  const libelle = { MAINTENIR: 'maintenu', SUSPENDRE: 'suspendu', SUPPRIMER: 'retiré', REACTIVER: 'réactivé' }[action]
  notifierCompte(contenu.proprietaire, `Décision de la mairie : « ${contenu.nom} »`, `Votre contenu « ${contenu.nom} » est ${libelle}.\nMotif : ${motif}\nVous pouvez répondre ou demander un réexamen depuis votre espace.`)
  res.status(201).json({ ok: true })
})

/** Réponse du partenaire à une décision, ou demande de réexamen (BF-50). */
routesModeration.post('/decisions/:id/reponse', exigerRole('PARTENAIRE'), valider(schemaReponseDecision), async (req, res) => {
  const u = req.utilisateur!
  const d = await prisma.decision.findUnique({ where: { id: idParam(req) }, include: { affiche: true, animation: true } })
  if (!d) throw introuvable('Décision introuvable.')
  const concerne = d.compte_vise_id === u.compteId || d.affiche?.proprietaire_id === u.compteId || d.animation?.proprietaire_id === u.compteId
  if (!concerne) throw interdit('Cette décision concerne un autre partenaire.')
  const { reponse, reexamen } = req.body as { reponse: string; reexamen: boolean }
  await prisma.$transaction(async (tx) => {
    await tx.decision.update({ where: { id: d.id }, data: { reponse_partenaire: reponse, reexamen_demande: reexamen } })
    await journaliser(auteur(req), reexamen ? 'REEXAMEN_DEMANDE' : 'REPONSE_PARTENAIRE', 'Décision', d.id, d.affiche?.nom ?? d.animation?.titre ?? u.structure, { reponse: reponse.slice(0, 120) }, tx)
  })
  res.status(204).end()
})

/** Clôture d'un réexamen par un agent : décision maintenue, ou mesure levée (réactivation). */
routesModeration.post('/admin/decisions/:id/cloture', exigerRole('AGENT'), valider(schemaClotureReexamen), async (req, res) => {
  const d = await prisma.decision.findUnique({ where: { id: idParam(req) }, include: { affiche: true, animation: true, compte_decision_compte_vise_idTocompte: true } })
  if (!d) throw introuvable('Décision introuvable.')
  const { conclusion, lever } = req.body as { conclusion: string; lever: boolean }
  const nom = d.affiche?.nom ?? d.animation?.titre ?? d.compte_decision_compte_vise_idTocompte?.nom_affiche ?? 'contenu'
  await prisma.$transaction(async (tx) => {
    if (lever) {
      if (d.contenu_type === 'COMPTE' && d.compte_vise_id) await tx.compte.update({ where: { id: d.compte_vise_id }, data: { statut: 'VERIFIE', motif_statut: null } })
      if (d.affiche_id) await tx.affiche.update({ where: { id: d.affiche_id }, data: { statut: 'PUBLIEE' } })
      if (d.animation_id) await tx.animation.update({ where: { id: d.animation_id }, data: { statut: 'PUBLIEE' } })
      await tx.decision.create({
        data: {
          agent_id: req.utilisateur!.compteId,
          contenu_type: d.contenu_type,
          affiche_id: d.affiche_id,
          animation_id: d.animation_id,
          compte_vise_id: d.compte_vise_id,
          action: 'REACTIVER',
          motif: conclusion,
        },
      })
    }
    await tx.decision.update({ where: { id: d.id }, data: { reexamen_demande: false, reexamen_clos_le: new Date() } })
    await journaliser(auteur(req), 'REEXAMEN_CLOS', 'Décision', d.id, nom, { conclusion }, tx)
  })
  const destinataire = d.compte_vise_id ?? d.affiche?.proprietaire_id ?? d.animation?.proprietaire_id
  if (destinataire) notifierCompte(destinataire, 'Réexamen de votre demande', `${lever ? 'La mesure est levée.' : 'La décision est maintenue.'}\nMotif : ${conclusion}`)
  res.status(204).end()
})

// Modules « statistiques » et « journal » : statistiques anonymes selon le rôle (BF-28, BF-43),
// journal horodaté consultable par les agents (BNF-17) et notifications de l'espace.
import { Router } from 'express'
import { prisma } from '../db.js'
import { exigerConnexion, exigerRole } from '../middlewares/index.js'
import { serialiserJournal } from '../services/serialiser.js'

export const routesSuivi = Router()
routesSuivi.use(exigerConnexion)

const jourDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Statistiques sur N jours : série quotidienne (scans, lancements), totaux de la période précédente,
 * répartition par lieu, affiche, animation et déclencheur. Un partenaire ne voit que ses contenus.
 */
routesSuivi.get('/statistiques', async (req, res) => {
  const u = req.utilisateur!
  const jours = Math.min(365, Math.max(1, Number(req.query.jours ?? 30)))
  const fin = new Date()
  const debut = new Date(fin)
  debut.setDate(debut.getDate() - jours + 1)
  debut.setHours(0, 0, 0, 0)
  const debutPrecedent = new Date(debut)
  debutPrecedent.setDate(debutPrecedent.getDate() - jours)

  const filtre =
    u.role === 'AGENT' ? {} : { OR: [{ affiche: { proprietaire_id: u.compteId } }, { animation: { proprietaire_id: u.compteId } }] }
  const [lignes, precedentes, affiches, animations, lieux] = await Promise.all([
    prisma.statistique.findMany({ where: { ...filtre, heure: { gte: debut } }, select: { type: true, heure: true, affiche_id: true, animation_id: true, declencheur: true } }),
    prisma.statistique.groupBy({ by: ['type'], where: { ...filtre, heure: { gte: debutPrecedent, lt: debut } }, _count: { _all: true } }),
    prisma.affiche.findMany({ where: u.role === 'AGENT' ? {} : { proprietaire_id: u.compteId }, select: { id: true, nom: true } }),
    prisma.animation.findMany({ where: u.role === 'AGENT' ? {} : { proprietaire_id: u.compteId }, select: { id: true, titre: true, lieu_id: true } }),
    prisma.lieu.findMany({ select: { id: true, nom_court: true } }),
  ])

  const serie = new Map<string, { jour: string; scans: number; lancements: number }>()
  for (let i = 0; i < jours; i++) {
    const d = new Date(debut)
    d.setDate(d.getDate() + i)
    serie.set(jourDe(d), { jour: jourDe(d), scans: 0, lancements: 0 })
  }
  const parAffiche = new Map<number, number>()
  const parAnimation = new Map<number, number>()
  const parDeclencheur = new Map<string, number>()
  for (const l of lignes) {
    const p = serie.get(jourDe(l.heure))
    if (l.type === 'SCAN') {
      if (p) p.scans++
      if (l.affiche_id) parAffiche.set(l.affiche_id, (parAffiche.get(l.affiche_id) ?? 0) + 1)
    } else {
      if (p) p.lancements++
      if (l.animation_id) parAnimation.set(l.animation_id, (parAnimation.get(l.animation_id) ?? 0) + 1)
      if (l.declencheur) parDeclencheur.set(l.declencheur, (parDeclencheur.get(l.declencheur) ?? 0) + 1)
    }
  }
  const parLieu = new Map<number, number>()
  for (const a of animations) if (a.lieu_id) parLieu.set(a.lieu_id, (parLieu.get(a.lieu_id) ?? 0) + (parAnimation.get(a.id) ?? 0))

  res.json({
    serie: [...serie.values()],
    precedent: {
      scans: precedentes.find((p) => p.type === 'SCAN')?._count._all ?? 0,
      lancements: precedentes.find((p) => p.type === 'LANCEMENT')?._count._all ?? 0,
    },
    parAffiche: affiches.map((a) => ({ libelle: a.nom, valeur: parAffiche.get(a.id) ?? 0 })),
    parAnimation: animations.map((a) => ({ libelle: a.titre, valeur: parAnimation.get(a.id) ?? 0 })),
    parLieu: u.role === 'AGENT' ? lieux.map((l) => ({ libelle: l.nom_court, valeur: parLieu.get(l.id) ?? 0 })) : [],
    parDeclencheur: (['AFFICHE', 'MONUMENT', 'MANUEL'] as const).map((d) => ({ libelle: d, valeur: parDeclencheur.get(d) ?? 0 })),
  })
})

/** Journal des actions (agents), 1 000 dernières entrées. */
routesSuivi.get('/admin/journal', exigerRole('AGENT'), async (_req, res) => {
  res.json((await prisma.journal.findMany({ orderBy: { cree_le: 'desc' }, take: 1000 })).map(serialiserJournal))
})

/**
 * Notifications de l'espace (également envoyées par mail) : pour un agent, les nouvelles demandes ;
 * pour un partenaire, ce que la mairie ou les visiteurs ont fait sur ses contenus.
 */
routesSuivi.get('/notifications', async (req, res) => {
  const u = req.utilisateur!
  if (u.role === 'AGENT') {
    const liste = await prisma.journal.findMany({
      where: { action: { in: ['SIGNALEMENT', 'INSCRIPTION', 'REEXAMEN_DEMANDE', 'ZONE_PROPOSEE', 'IMPORT_FICHIER'] } },
      orderBy: { cree_le: 'desc' },
      take: 8,
    })
    res.json(liste.map(serialiserJournal))
    return
  }
  const [affiches, animations] = await Promise.all([
    prisma.affiche.findMany({ where: { proprietaire_id: u.compteId }, select: { id: true } }),
    prisma.animation.findMany({ where: { proprietaire_id: u.compteId }, select: { id: true } }),
  ])
  const liste = await prisma.journal.findMany({
    where: {
      NOT: { auteur_id: u.compteId },
      OR: [
        { objet_type: 'Affiche', objet_id: { in: affiches.map((a) => a.id) } },
        { objet_type: 'Animation', objet_id: { in: animations.map((a) => a.id) } },
        { objet_type: 'Compte', objet_id: u.partenaireId ?? -1 },
      ],
    },
    orderBy: { cree_le: 'desc' },
    take: 8,
  })
  res.json(liste.map(serialiserJournal))
})

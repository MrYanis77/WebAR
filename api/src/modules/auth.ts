// Module « auth » : inscription des partenaires, connexion (mot de passe Argon2id puis, pour les agents,
// code à usage unique reçu par mail), blocage après 5 échecs, déconnexion (BF-34, BNF-10, BNF-23).
import argon2 from 'argon2'
import type { Request } from 'express'
import { Router } from 'express'
import { schemaCodeConnexion, schemaConnexion, schemaInscription } from '../../../src/commun/schemas.js'
import type { Session } from '../../../src/commun/types.js'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { ErreurApi } from '../erreurs.js'
import { generateCsrfToken, limiteConnexion, limiteInscription, valider, type Utilisateur } from '../middlewares/index.js'
import { verifierAltcha } from '../services/altcha.js'
import { journaliser } from '../services/journal.js'
import { envoyerCode, peutRenvoyer, verifierCode } from '../services/codeConnexion.js'
import { notifierAgents } from '../services/notifications.js'

export const routesAuth = Router()

const ECHECS_MAX = 5
const BLOCAGE_MS = 15 * 60 * 1000

export function versSession(u: Utilisateur): Session {
  return { role: u.role, nom: u.nom, email: u.email, structure: u.structure, partenaireId: u.partenaireId ? String(u.partenaireId) : undefined }
}

/** Ouvre une session neuve (régénération de l'identifiant après connexion). */
function ouvrirSession(req: Request, compteId: number) {
  return new Promise<void>((ok, ko) =>
    req.session.regenerate((err) => {
      if (err) return ko(err)
      req.session.compteId = compteId
      req.session.save((e) => (e ? ko(e) : ok()))
    }),
  )
}

/** Session courante (ou null), et jeton anti-CSRF à joindre aux requêtes connectées. */
routesAuth.get('/session', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ session: req.utilisateur ? versSession(req.utilisateur) : null })
})

routesAuth.get('/csrf', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ jeton: generateCsrfToken(req, res) })
})

/** Inscription d'un partenaire : compte inactif tant qu'un agent ne l'a pas vérifié (BF-34). */
routesAuth.post('/inscription', limiteInscription, valider(schemaInscription), async (req, res) => {
  const d = req.body as {
    nomStructure: string
    secteur: string
    adresse: string
    contactNom: string
    contactTelephone?: string
    email: string
    motDePasse: string
    altcha: string
  }
  await verifierAltcha(d.altcha)
  if (await prisma.compte.findUnique({ where: { email: d.email } })) throw new ErreurApi(409, 'Un compte existe déjà avec cette adresse.')
  const hash = await argon2.hash(d.motDePasse, { type: argon2.argon2id })
  await prisma.$transaction(async (tx) => {
    const c = await tx.compte.create({
      data: { email: d.email, mot_de_passe_hash: hash, role: 'PARTENAIRE', statut: 'EN_ATTENTE', nom_affiche: d.contactNom },
    })
    const p = await tx.partenaire.create({
      data: { compte_id: c.id, nom_structure: d.nomStructure, secteur: d.secteur, adresse: d.adresse, contact_telephone: d.contactTelephone || null },
    })
    await journaliser({ compteId: c.id, libelle: d.nomStructure }, 'INSCRIPTION', 'Compte', p.id, d.nomStructure, undefined, tx)
  })
  notifierAgents(`Inscription à vérifier : ${d.nomStructure}`, `${d.nomStructure} (${d.secteur}) demande un compte partenaire.`)
  res.status(201).json({ statut: 'EN_ATTENTE' })
})

/** 1re étape : e-mail et mot de passe. Un agent reçoit ensuite un code par mail (2e étape). */
routesAuth.post('/connexion', limiteConnexion, valider(schemaConnexion), async (req, res) => {
  const { email, motDePasse } = req.body as { email: string; motDePasse: string }
  const c = await prisma.compte.findUnique({ where: { email }, include: { partenaire: true } })
  if (c?.bloque_jusqua && c.bloque_jusqua > new Date()) throw new ErreurApi(429, 'Compte temporairement bloqué après 5 essais. Réessayez dans 15 minutes.')
  if (!c || !(await argon2.verify(c.mot_de_passe_hash, motDePasse))) {
    if (c) {
      const echecs = c.echecs_connexion + 1
      await prisma.compte.update({
        where: { id: c.id },
        data: { echecs_connexion: echecs >= ECHECS_MAX ? 0 : echecs, bloque_jusqua: echecs >= ECHECS_MAX ? new Date(Date.now() + BLOCAGE_MS) : null },
      })
      if (echecs >= ECHECS_MAX) throw new ErreurApi(429, 'Compte temporairement bloqué après 5 essais. Réessayez dans 15 minutes.')
      throw new ErreurApi(401, `Identifiants incorrects (${echecs}/${ECHECS_MAX}).`)
    }
    throw new ErreurApi(401, 'Identifiants incorrects.')
  }
  await prisma.compte.update({ where: { id: c.id }, data: { echecs_connexion: 0, bloque_jusqua: null } })
  if (c.statut === 'EN_ATTENTE') throw new ErreurApi(403, 'Votre compte est en attente de vérification par la mairie. Vous serez prévenu par mail.')
  if (c.statut === 'REFUSE') throw new ErreurApi(403, `Inscription refusée : ${c.motif_statut ?? 'motif communiqué par mail'}.`)
  if (c.statut === 'SUSPENDU') throw new ErreurApi(403, `Compte suspendu : ${c.motif_statut ?? 'motif communiqué par mail'}. Vous pouvez demander un réexamen.`)
  if (c.role === 'AGENT' && config.doubleAuthentification) {
    await envoyerCode(req, c)
    res.json({ etape: 'CODE' })
    return
  }
  await ouvrirSession(req, c.id)
  await prisma.compte.update({ where: { id: c.id }, data: { derniere_connexion: new Date() } })
  await journaliser({ compteId: c.id, libelle: c.partenaire?.nom_structure ?? c.nom_affiche }, 'CONNEXION', 'Compte', c.id, c.email)
  res.json({ etape: 'CONNECTE' })
})

/** 2e étape pour les agents : code à 6 chiffres reçu par mail. */
routesAuth.post('/code', limiteConnexion, valider(schemaCodeConnexion), async (req, res) => {
  const id = await verifierCode(req, (req.body as { code: string }).code)
  const c = await prisma.compte.findUnique({ where: { id } })
  if (!c || c.statut !== 'VERIFIE') throw new ErreurApi(401, 'Compte indisponible.')
  await ouvrirSession(req, c.id)
  await prisma.compte.update({ where: { id: c.id }, data: { derniere_connexion: new Date() } })
  await journaliser({ compteId: c.id, libelle: c.nom_affiche }, 'CONNEXION', 'Compte', c.id, c.email)
  res.json({ etape: 'CONNECTE' })
})

/** Nouveau code par mail (le précédent est remplacé). */
routesAuth.post('/code/renvoi', limiteConnexion, async (req, res) => {
  const c = await prisma.compte.findUnique({ where: { id: peutRenvoyer(req) } })
  if (!c) throw new ErreurApi(401, 'Session expirée : reprenez la connexion.')
  await envoyerCode(req, c)
  res.status(204).end()
})

routesAuth.post('/deconnexion', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('mtb.sid')
    res.status(204).end()
  })
})

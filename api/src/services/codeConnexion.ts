// Double authentification des agents (BNF-10) : après le mot de passe, un code à 6 chiffres est
// envoyé par mail (Nodemailer). Seule son empreinte HMAC est gardée dans la session, avec une
// expiration de 10 minutes et 5 essais au plus ; un nouveau code peut être demandé après 30 s.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { config } from '../config.js'
import { ErreurApi } from '../erreurs.js'
import { envoyerCodeConnexion } from './notifications.js'

export const VALIDITE_CODE_MIN = 10
const ESSAIS_MAX = 5
const DELAI_RENVOI_MS = 30_000

const empreinte = (compteId: number, code: string) => createHmac('sha256', config.secretSession).update(`${compteId}:${code}`).digest('hex')

/** Génère un code, l'enregistre (empreinte) dans la session et l'envoie par mail. */
export async function envoyerCode(req: Request, compte: { id: number; email: string; nom_affiche: string }) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  req.session.codeConnexion = { compteId: compte.id, empreinte: empreinte(compte.id, code), expireLe: Date.now() + VALIDITE_CODE_MIN * 60_000, essais: 0, envoyeLe: Date.now() }
  await new Promise<void>((ok, ko) => req.session.save((e) => (e ? ko(e) : ok())))
  if (!(await envoyerCodeConnexion(compte.email, compte.nom_affiche, code, VALIDITE_CODE_MIN)))
    throw new ErreurApi(503, 'Le mail contenant le code n’a pas pu être envoyé. Réessayez dans quelques instants.')
}

/** Un nouveau code ne peut être demandé que 30 s après le précédent. */
export function peutRenvoyer(req: Request) {
  const c = req.session.codeConnexion
  if (!c) throw new ErreurApi(401, 'Session expirée : reprenez la connexion.')
  if (Date.now() - c.envoyeLe < DELAI_RENVOI_MS) throw new ErreurApi(429, 'Patientez 30 secondes avant de demander un nouveau code.')
  return c.compteId
}

/** Vérifie le code saisi ; renvoie l'identifiant du compte, ou lève 401 (incorrect, expiré, trop d'essais). */
export async function verifierCode(req: Request, code: string): Promise<number> {
  const c = req.session.codeConnexion
  if (!c) throw new ErreurApi(401, 'Session expirée : reprenez la connexion.')
  if (Date.now() > c.expireLe) {
    delete req.session.codeConnexion
    throw new ErreurApi(401, 'Code expiré : demandez un nouveau code.')
  }
  const attendu = Buffer.from(c.empreinte, 'hex')
  const recu = Buffer.from(empreinte(c.compteId, code), 'hex')
  if (!timingSafeEqual(attendu, recu)) {
    c.essais++
    if (c.essais >= ESSAIS_MAX) delete req.session.codeConnexion
    await new Promise<void>((ok) => req.session.save(() => ok()))
    throw new ErreurApi(401, c.essais >= ESSAIS_MAX ? 'Trop d’essais : reprenez la connexion.' : `Code incorrect (${c.essais}/${ESSAIS_MAX}).`)
  }
  delete req.session.codeConnexion
  return c.compteId
}

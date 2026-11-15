// Petits utilitaires communs aux modules de routes.
import type { Request } from 'express'
import { randomBytes } from 'node:crypto'
import { ErreurApi } from '../erreurs.js'
import { prisma } from '../db.js'
import type { Utilisateur } from '../middlewares/index.js'

/** Identifiant numérique d'un paramètre d'URL (:id) ; 400 s'il est invalide. */
export function idParam(req: Request, nom = 'id'): number {
  const v = Number(req.params[nom])
  if (!Number.isInteger(v) || v <= 0) throw new ErreurApi(400, 'Identifiant invalide.')
  return v
}

/** Code unique de 128 bits en base64url (22 caractères) pour le QR code d'une affiche. */
export const genererCodeQr = () => randomBytes(16).toString('base64url')

/** Un partenaire peut importer et créer s'il a accepté la charte en vigueur (BF-41). */
export async function verifierPeutCreer(u: Utilisateur) {
  if (u.role === 'AGENT') return
  const charte = await prisma.acceptation_charte.findFirst({ where: { compte_id: u.compteId } })
  if (!charte) throw new ErreurApi(403, 'Acceptez la charte d’utilisation avant d’importer ou de créer.')
}

/** Clause « visible par l'utilisateur » : tout pour un agent, ses contenus pour un partenaire. */
export const filtreProprietaire = (u: Utilisateur) => (u.role === 'AGENT' ? {} : { proprietaire_id: u.compteId })

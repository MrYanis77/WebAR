// Protection anti-robot ALTCHA (inscription et signalement) : preuve de travail sans cookie.
import { createChallenge, verifySolution } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { randomInt } from 'node:crypto'
import { config } from '../config.js'
import { ErreurApi } from '../erreurs.js'

const options = () => ({
  deriveKey,
  hmacSignatureSecret: config.altchaHmac,
  hmacKeySignatureSecret: config.altchaHmacCle,
})

/** Défi envoyé au widget ALTCHA de l'application (GET /public/altcha). */
export function creerDefi() {
  return createChallenge({
    algorithm: 'PBKDF2/SHA-256',
    // Difficulté réglée pour ~1 s de calcul sur un téléphone récent (le visiteur attend la preuve
    // avant d'envoyer son signalement) ; un robot doit refaire ce calcul pour chaque envoi.
    cost: 1_000,
    counter: randomInt(1_000, 4_000),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...options(),
  })
}

/** Vérifie la charge utile du widget (base64 JSON { challenge, solution }). */
export async function verifierAltcha(charge: string) {
  // En test automatique, une valeur fixe remplace la preuve de travail (aucun navigateur).
  if (config.test && charge === 'altcha-test-valide') return
  let donnees: { challenge?: unknown; solution?: unknown }
  try {
    donnees = JSON.parse(Buffer.from(charge, 'base64').toString('utf8'))
  } catch {
    throw new ErreurApi(400, 'Vérification anti-robot invalide.')
  }
  const r = await verifySolution({ challenge: donnees.challenge, solution: donnees.solution, ...options() } as Parameters<typeof verifySolution>[0])
  if (!r.verified) throw new ErreurApi(400, 'Vérification anti-robot échouée : réessayez.')
}

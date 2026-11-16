// Définit un nouveau mot de passe pour un compte (agent ou partenaire), par exemple en cas d'oubli.
// Usage : npm run changer-mot-de-passe -- --email adresse@exemple.fr [--mot-de-passe "12 caractères min."]
// Sans --mot-de-passe, un mot de passe aléatoire est généré et affiché.
import argon2 from 'argon2'
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { prisma } from '../src/db.js'
import { journaliser } from '../src/services/journal.js'

const { values } = parseArgs({ options: { email: { type: 'string' }, 'mot-de-passe': { type: 'string' } } })
const email = values.email?.trim().toLowerCase()
if (!email) {
  console.error('Usage : npm run changer-mot-de-passe -- --email adresse@exemple.fr [--mot-de-passe "12 caractères min."]')
  process.exit(1)
}
const motDePasse = values['mot-de-passe'] ?? randomBytes(12).toString('base64url')
if (motDePasse.length < 12) {
  console.error('Le mot de passe doit compter au moins 12 caractères.')
  process.exit(1)
}
const compte = await prisma.compte.findUnique({ where: { email } })
if (!compte) {
  console.error(`Aucun compte pour ${email}.`)
  process.exit(1)
}
// Le blocage après 5 échecs est levé en même temps.
await prisma.compte.update({
  where: { id: compte.id },
  data: { mot_de_passe_hash: await argon2.hash(motDePasse, { type: argon2.argon2id }), echecs_connexion: 0, bloque_jusqua: null },
})
await journaliser({ compteId: null, libelle: 'Administration' }, 'MOT_DE_PASSE_CHANGE', 'Compte', compte.id, email)
console.log(`Mot de passe de ${email} modifié.`)
if (!values['mot-de-passe']) console.log(`Nouveau mot de passe : ${motDePasse}`)
await prisma.$disconnect()

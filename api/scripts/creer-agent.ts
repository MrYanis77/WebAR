// Création d'un compte agent de la mairie (aucun agent n'existe à l'installation).
// Usage : npm run creer-agent -- --email c.martin@montbeliard.fr --nom "Claire Martin" [--mot-de-passe "..."]
// À chaque connexion, l'agent reçoit un code à 6 chiffres sur cette adresse mail (double authentification).
import argon2 from 'argon2'
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { prisma } from '../src/db.js'
import { journaliser } from '../src/services/journal.js'

const { values } = parseArgs({ options: { email: { type: 'string' }, nom: { type: 'string' }, 'mot-de-passe': { type: 'string' } } })
const email = values.email?.trim().toLowerCase()
const nom = values.nom?.trim()
if (!email || !nom) {
  console.error('Usage : npm run creer-agent -- --email adresse@montbeliard.fr --nom "Prénom Nom" [--mot-de-passe "12 caractères min."]')
  process.exit(1)
}
const motDePasse = values['mot-de-passe'] ?? randomBytes(12).toString('base64url')
if (motDePasse.length < 12) {
  console.error('Le mot de passe doit compter au moins 12 caractères.')
  process.exit(1)
}
if (await prisma.compte.findUnique({ where: { email } })) {
  console.error(`Un compte existe déjà pour ${email}.`)
  process.exit(1)
}

const compte = await prisma.compte.create({
  data: {
    email,
    nom_affiche: nom,
    role: 'AGENT',
    statut: 'VERIFIE',
    mot_de_passe_hash: await argon2.hash(motDePasse, { type: argon2.argon2id }),
  },
})
await journaliser({ compteId: null, libelle: 'Installation' }, 'COMPTE_AGENT_CREE', 'Compte', compte.id, nom)

console.log(`\nCompte agent créé : ${email}`)
if (!values['mot-de-passe']) console.log(`Mot de passe généré : ${motDePasse}`)
console.log(`Double authentification : un code à 6 chiffres sera envoyé à ${email} à chaque connexion.`)
await prisma.$disconnect()

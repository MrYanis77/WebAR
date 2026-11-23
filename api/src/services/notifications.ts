// Service « notifications » : mails aux partenaires et aux agents (Nodemailer ; Mailpit en local).
// L'envoi passe par la file de traitements, avec un nouvel essai en cas d'échec (BNF-26).
import nodemailer from 'nodemailer'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { journalApi } from '../journaux.js'
import { ajouterTraitement } from './file.js'

const transport = config.test
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({ host: config.smtp.hote, port: config.smtp.port, secure: false, ignoreTLS: true })

/** Mails « envoyés » pendant les tests automatiques (transport JSON, aucun serveur SMTP). */
export const mailsDeTest: { destinataire: string; sujet: string; texte: string }[] = []

async function envoyer(destinataire: string, sujet: string, texte: string, essai = 1): Promise<void> {
  try {
    await transport.sendMail({ from: config.smtp.expediteur, to: destinataire, subject: sujet, text: texte })
    if (config.test) mailsDeTest.push({ destinataire, sujet, texte })
  } catch (e) {
    if (essai < 3) {
      await new Promise((r) => setTimeout(r, 2000 * essai))
      return envoyer(destinataire, sujet, texte, essai + 1)
    }
    // Sans serveur SMTP (Mailpit non lancé), le mail est consigné dans les journaux du serveur.
    journalApi.warn({ destinataire, sujet, erreur: (e as Error).message }, 'Mail non envoyé')
  }
}

/** Mail à un compte (partenaire ou agent), envoyé en tâche de fond. */
export function notifierCompte(compteId: number, sujet: string, texte: string) {
  ajouterTraitement(`mail:${compteId}:${sujet}`, async () => {
    const c = await prisma.compte.findUnique({ where: { id: compteId }, select: { email: true, nom_affiche: true } })
    if (c) await envoyer(c.email, sujet, `Bonjour ${c.nom_affiche},\n\n${texte}\n\n— Mindi`)
  })
}

/** Mail à tous les agents vérifiés (nouveau signalement, inscription à vérifier…). */
export function notifierAgents(sujet: string, texte: string) {
  ajouterTraitement(`mail:agents:${sujet}`, async () => {
    const agents = await prisma.compte.findMany({ where: { role: 'AGENT', statut: 'VERIFIE' }, select: { email: true } })
    for (const a of agents) await envoyer(a.email, sujet, `${texte}\n\n— Mindi`)
  })
}

/**
 * Code de connexion d'un agent (double authentification, BNF-10). Envoyé tout de suite, sans passer
 * par la file : l'agent attend ce mail pour se connecter. Renvoie false si le serveur SMTP est injoignable.
 */
export async function envoyerCodeConnexion(email: string, nom: string, code: string, validiteMin: number): Promise<boolean> {
  const sujet = `Code de connexion : ${code}`
  const texte = `Bonjour ${nom},\n\nVotre code de connexion au back-office est : ${code}\nIl est valable ${validiteMin} minutes et ne sert qu'une fois.\n\nSi vous n'êtes pas à l'origine de cette connexion, changez votre mot de passe et prévenez le service informatique.\n\n— Mindi`
  try {
    await transport.sendMail({ from: config.smtp.expediteur, to: email, subject: sujet, text: texte })
    if (config.test) mailsDeTest.push({ destinataire: email, sujet, texte })
    return true
  } catch (e) {
    // Hors production uniquement : le code est écrit dans les journaux pour pouvoir tester sans Mailpit.
    if (!config.production) journalApi.warn({ destinataire: email, code }, 'Mail du code de connexion non envoyé (SMTP injoignable) — code affiché pour le développement')
    else journalApi.error({ destinataire: email, erreur: (e as Error).message }, 'Mail du code de connexion non envoyé')
    return config.production ? false : true
  }
}

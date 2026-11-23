// Configuration de l'API, lue dans .env (jamais envoyé sur Git).
// L'heure de Paris sert de référence pour toutes les dates stockées en DATETIME.
import 'dotenv/config'

process.env.TZ = 'Europe/Paris'

function requis(nom: string): string {
  const v = process.env[nom]
  if (!v) throw new Error(`Variable d’environnement manquante : ${nom} (voir .env.example)`)
  return v
}

export const config = {
  // API_PORT d'abord : en développement, PORT peut être imposé à Vite par l'outil qui lance les serveurs.
  port: Number(process.env.API_PORT ?? process.env.PORT ?? 3000),
  production: process.env.NODE_ENV === 'production',
  test: process.env.NODE_ENV === 'test',
  urlBase: requis('DATABASE_URL'),
  domaine: process.env.DOMAINE_APPLICATION ?? 'https://experiences.montbeliard.fr',
  urlFront: process.env.URL_FRONT ?? 'http://localhost:5173',
  /** Développement : adresse forcée des QR codes (sinon celle transmise par Vite, X-Url-Reseau). */
  urlReseau: process.env.URL_RESEAU,
  dossierUploads: process.env.DOSSIER_UPLOADS ?? 'uploads',
  secretSession: requis('SESSION_SECRET'),
  secretCsrf: requis('CSRF_SECRET'),
  altchaHmac: requis('ALTCHA_HMAC'),
  altchaHmacCle: requis('ALTCHA_HMAC_CLE'),
  smtp: {
    hote: process.env.SMTP_HOTE ?? '127.0.0.1',
    port: Number(process.env.SMTP_PORT ?? 1025),
    expediteur: process.env.MAIL_EXPEDITEUR ?? 'Mindi <ne-pas-repondre@montbeliard.fr>',
  },
  /**
   * Double authentification des agents (code par mail). Désactivée provisoirement : mettre
   * DOUBLE_AUTHENTIFICATION=true dans .env pour la réactiver, sans autre modification.
   */
  doubleAuthentification: process.env.DOUBLE_AUTHENTIFICATION === 'true',
  /** Version de la charte d'utilisation en vigueur (BF-41). */
  versionCharte: '1.0',
  /** Durée d'inactivité avant expiration de la session (2 h, section 8). */
  sessionMs: 2 * 60 * 60 * 1000,
}

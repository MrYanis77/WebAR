// Middlewares de l'API, appliqués avant les contrôleurs (section 4.2 de la structuration) :
// session, protection CSRF, authentification, rôle, propriétaire, limitation, validation.
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import session from 'express-session'
import MySQLStoreFactory from 'express-mysql-session'
import { doubleCsrf } from 'csrf-csrf'
import { rateLimit } from 'express-rate-limit'
import type { ZodType } from 'zod'
import { config } from '../config.js'
import { optionsConnexion } from '../db.js'
import { prisma } from '../db.js'
import { interdit, nonConnecte } from '../erreurs.js'
import type { Auteur } from '../services/journal.js'

declare module 'express-session' {
  interface SessionData {
    compteId?: number
/** 2e étape de connexion d'un agent : code à usage unique envoyé par mail (empreinte seulement). */
    codeConnexion?: { compteId: number; empreinte: string; expireLe: number; essais: number; envoyeLe: number }
  }
}

/** Utilisateur connecté, chargé à chaque requête (le statut du compte peut changer). */
export interface Utilisateur {
  compteId: number
  role: 'AGENT' | 'PARTENAIRE'
  nom: string
  email: string
  partenaireId: number | null
  structure: string
  statut: string
}

declare module 'express-serve-static-core' {
  interface Request {
    utilisateur?: Utilisateur
  }
}

// ---------------------------------------------------------------- session (stockée dans MySQL)

const MySQLStore = MySQLStoreFactory(session as never) as unknown as new (options: object) => session.Store

export const sessionStore = new MySQLStore({
  ...optionsConnexion(),
  createDatabaseTable: false,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: config.sessionMs,
  schema: { tableName: 'session', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } },
})

export const sessionMiddleware = session({
  name: 'mtb.sid',
  secret: config.secretSession,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true, // expiration après 2 h d'inactivité
  cookie: { httpOnly: true, sameSite: 'strict', secure: config.production, maxAge: config.sessionMs },
})

// ---------------------------------------------------------------- protection CSRF (routes connectées)

export const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.secretCsrf,
  getSessionIdentifier: (req) => req.sessionID ?? '',
  cookieName: config.production ? '__Host-mtb.csrf' : 'mtb.csrf',
  cookieOptions: { sameSite: 'strict', secure: config.production, httpOnly: true, path: '/' },
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string | undefined,
})

// ---------------------------------------------------------------- authentification et rôles

/** Charge l'utilisateur de la session ; un compte suspendu ou refusé est déconnecté. */
export const chargerUtilisateur: RequestHandler = async (req, _res, next) => {
  try {
    const id = req.session?.compteId
    if (id) {
      const c = await prisma.compte.findUnique({ where: { id }, include: { partenaire: true } })
      if (!c || c.statut !== 'VERIFIE') {
        req.session.compteId = undefined
      } else {
        req.utilisateur = {
          compteId: c.id,
          role: c.role,
          nom: c.nom_affiche,
          email: c.email,
          partenaireId: c.partenaire?.id ?? null,
          structure: c.role === 'AGENT' ? 'Ville de Montbéliard' : (c.partenaire?.nom_structure ?? ''),
          statut: c.statut,
        }
      }
    }
    next()
  } catch (e) {
    next(e)
  }
}

/** Refuse avec 401 si aucune session (middleware « authentification »). */
export const exigerConnexion: RequestHandler = (req, _res, next) => (req.utilisateur ? next() : next(nonConnecte()))

/** Refuse avec 403 un partenaire sur une route d'agent, même en contournant l'interface (BNF-22). */
export const exigerRole =
  (role: 'AGENT' | 'PARTENAIRE'): RequestHandler =>
  (req, _res, next) => {
    if (!req.utilisateur) return next(nonConnecte())
    return req.utilisateur.role === role ? next() : next(interdit(role === 'AGENT' ? undefined : 'Action réservée aux partenaires.'))
  }

/** Un agent voit tout ; un partenaire seulement ses contenus (BNF-25, middleware « verifierProprietaire »). */
export function verifierProprietaire(req: Request, proprietaireId: number) {
  const u = req.utilisateur!
  if (u.role !== 'AGENT' && u.compteId !== proprietaireId) throw interdit('Ce contenu appartient à un autre compte.')
}

export const auteur = (req: Request): Auteur => ({
  compteId: req.utilisateur?.compteId ?? null,
  libelle: req.utilisateur ? (req.utilisateur.role === 'AGENT' ? req.utilisateur.nom : req.utilisateur.structure) : 'Système',
})

// ---------------------------------------------------------------- limitation des requêtes

const limite = (max: number, fenetreMs: number, message: string) =>
  rateLimit({ windowMs: fenetreMs, limit: config.test ? 10_000 : max, standardHeaders: 'draft-8', legacyHeaders: false, message: { erreur: message } })

/** 5 signalements par heure et par appareil (BF-51) ; l'adresse IP reste en mémoire seulement. */
export const limiteSignalements = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erreur: 'Limite atteinte : 5 signalements par heure depuis cet appareil.' },
  skip: (req) => config.test && req.headers['x-test-limite'] !== '1',
})
export const limiteConnexion = limite(30, 15 * 60 * 1000, 'Trop de tentatives : réessayez dans 15 minutes.')
export const limiteInscription = limite(10, 60 * 60 * 1000, 'Trop de demandes d’inscription : réessayez plus tard.')
export const limiteStatistiques = limite(600, 60 * 1000, 'Trop de requêtes.')

// ---------------------------------------------------------------- validation Zod

/** Valide le corps de la requête avec le schéma partagé ; 400 sinon (middleware « valider »). */
export const valider =
  (schema: ZodType): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body)
    if (!r.success) return next(r.error)
    req.body = r.data
    next()
  }

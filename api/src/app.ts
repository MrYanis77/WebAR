// Application Express : sécurité HTTP, journaux, session, API REST versionnée (/api/v1),
// fichiers importés (/uploads) et, en production, l'application React compilée (dist/).
import compression from 'compression'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pinoHttp } from 'pino-http'
import { config } from './config.js'
import { gestionErreurs, introuvable } from './erreurs.js'
import { journalApi } from './journaux.js'
import { chargerUtilisateur, doubleCsrfProtection, sessionMiddleware } from './middlewares/index.js'
import { routesAffiches, routesZones } from './modules/affiches.js'
import { routesAnimations } from './modules/animations.js'
import { routesAuth } from './modules/auth.js'
import { routesComptes } from './modules/comptes.js'
import { routesFichiers } from './modules/fichiers.js'
import { routesLieux } from './modules/lieux.js'
import { routesModeration } from './modules/moderation.js'
import { routesPublic } from './modules/public.js'
import { routesSuivi } from './modules/suivi.js'
import { racineUploads } from './services/stockage.js'

export function creerApplication() {
  const app = express()
  app.set('trust proxy', 1) // derrière Nginx/Caddy en production (HTTPS)
  app.disable('x-powered-by')

  // Middleware « securite » : en-têtes (dont la politique CSP) et compression des réponses.
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://tiles.openfreemap.org'],
          connectSrc: ["'self'", 'https://tiles.openfreemap.org', 'https://routing.openstreetmap.de'],
          workerSrc: ["'self'", 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
        },
      },
    }),
  )
  app.use(compression())
  app.use(pinoHttp({ logger: journalApi, autoLogging: !config.test }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  // Fichiers importés : noms générés par le serveur, servis sans exécution, en cache long.
  app.use(
    '/uploads',
    express.static(racineUploads, {
      index: false,
      dotfiles: 'deny',
      immutable: true,
      maxAge: '30d',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  )

  const api = express.Router()
  api.use(sessionMiddleware, chargerUtilisateur)
  // Routes publiques et connexion : aucun jeton anti-CSRF (pas de session à protéger).
  api.use('/public', routesPublic)
  api.use('/auth', routesAuth)
  // Routes connectées : jeton anti-CSRF obligatoire pour toute modification.
  api.use(doubleCsrfProtection)
  api.use('/fichiers', routesFichiers)
  api.use('/animations', routesAnimations)
  api.use('/affiches', routesAffiches)
  api.use('/zones', routesZones)
  api.use('/lieux', routesLieux)
  api.use(routesComptes)
  api.use(routesModeration)
  api.use(routesSuivi)
  api.use(() => {
    throw introuvable('Route inconnue.')
  })
  app.use('/api/v1', api)

  // Production : l'API sert aussi l'application React compilée (npm run build).
  const dist = path.resolve('dist')
  if (config.production && existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }))
    app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  app.use(gestionErreurs)
  return app
}

// Erreurs métier et transformation en réponses HTTP (middleware gestionErreurs, section 4.2).
import type { ErrorRequestHandler } from 'express'
import { MulterError } from 'multer'
import { ZodError } from 'zod'

/** Erreur prévue par les règles métier : 400, 401, 403, 404, 409, 410, 413, 429. */
export class ErreurApi extends Error {
  constructor(
    public statut: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const nonConnecte = () => new ErreurApi(401, 'Connexion requise.')
export const interdit = (m = 'Action réservée aux agents de la mairie.') => new ErreurApi(403, m)
export const introuvable = (m = 'Élément introuvable.') => new ErreurApi(404, m)
export const conflit = (m: string, details?: unknown) => new ErreurApi(409, m, details)

export const gestionErreurs: ErrorRequestHandler = (err, req, res, _next) => {
  void _next
  if (err instanceof ErreurApi) {
    res.status(err.statut).json({ erreur: err.message, details: err.details })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ erreur: 'Données invalides.', details: err.issues.map((i) => ({ champ: i.path.join('.'), message: i.message })) })
    return
  }
  if (err instanceof MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ erreur: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux.' : err.message })
    return
  }
  // Contrainte de la base (clé étrangère, CHECK, doublon) non anticipée par le code.
  const code = (err as { code?: string }).code
  if (code === 'P2003') {
    res.status(409).json({ erreur: 'Un autre contenu dépend de cet élément.' })
    return
  }
  if (code === 'P2002') {
    res.status(409).json({ erreur: 'Cette valeur existe déjà.' })
    return
  }
  if ((err as { code?: string }).code === 'EBADCSRFTOKEN' || (err as { message?: string }).message === 'invalid csrf token') {
    res.status(403).json({ erreur: 'Jeton anti-CSRF invalide : rechargez la page.' })
    return
  }
  req.log?.error(err)
  res.status(500).json({ erreur: 'Erreur interne du serveur.' })
}

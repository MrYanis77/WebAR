// Client HTTP de l'API (/api/v1) : cookies de session, jeton anti-CSRF pour les modifications,
// erreurs transformées en ErreurApi avec le message renvoyé par le serveur.
import { QueryClient } from '@tanstack/react-query'

export const BASE_API = '/api/v1'

export class ErreurApi extends Error {
  statut: number
  details?: unknown
  constructor(statut: number, message: string, details?: unknown) {
    super(message)
    this.statut = statut
    this.details = details
  }
}

/** Cache des requêtes (TanStack Query) partagé par toute l'application. */
export const clientRequetes = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (n, e) => !(e instanceof ErreurApi && e.statut < 500) && n < 2,
    },
  },
})

let jetonCsrf: string | null = null

async function obtenirJeton(forcer = false): Promise<string> {
  if (jetonCsrf && !forcer) return jetonCsrf
  const r = await fetch(`${BASE_API}/auth/csrf`, { credentials: 'same-origin' })
  jetonCsrf = ((await r.json()) as { jeton: string }).jeton
  return jetonCsrf
}

/** Après connexion ou déconnexion, la session change : le jeton doit être renouvelé. */
export function oublierJetonCsrf() {
  jetonCsrf = null
}

async function lireErreur(r: Response): Promise<ErreurApi> {
  let corps: { erreur?: string; details?: unknown } = {}
  try {
    corps = await r.json()
  } catch {
    /* réponse sans JSON */
  }
  const details = Array.isArray(corps.details) ? (corps.details as { message: string }[]).map((d) => d.message).join(' · ') : ''
  return new ErreurApi(r.status, `${corps.erreur ?? `Erreur ${r.status}`}${details ? ` ${details}` : ''}`, corps.details)
}

/**
 * Requête vers l'API. Les méthodes qui modifient des données joignent le jeton anti-CSRF ;
 * s'il a expiré (403), il est renouvelé et la requête rejouée une fois.
 */
export async function appelApi<T = unknown>(chemin: string, options: { methode?: string; corps?: unknown; formulaire?: FormData; publique?: boolean } = {}): Promise<T> {
  const methode = options.methode ?? 'GET'
  const modifie = methode !== 'GET'
  const envoyer = async (forcerJeton = false) => {
    const entetes: Record<string, string> = {}
    if (options.corps !== undefined) entetes['Content-Type'] = 'application/json'
    if (modifie && !options.publique) entetes['X-CSRF-Token'] = await obtenirJeton(forcerJeton)
    return fetch(`${BASE_API}${chemin}`, {
      method: methode,
      credentials: 'same-origin',
      headers: entetes,
      body: options.formulaire ?? (options.corps !== undefined ? JSON.stringify(options.corps) : undefined),
    })
  }
  let r = await envoyer()
  if (r.status === 403 && modifie && !options.publique) {
    const corps = await r.clone().json().catch(() => ({}) as { erreur?: string })
    if (/csrf/i.test(corps.erreur ?? '')) r = await envoyer(true)
  }
  if (!r.ok) throw await lireErreur(r)
  if (r.status === 204) return undefined as T
  const type = r.headers.get('Content-Type') ?? ''
  return (type.includes('application/json') ? r.json() : r.blob()) as Promise<T>
}

/** Envoi d'un fichier (multipart) avec suivi de la progression. */
export function envoyerFichier<T>(chemin: string, formulaire: FormData, progression?: (p: number) => void): Promise<T> {
  return obtenirJeton().then(
    (jeton) =>
      new Promise<T>((ok, ko) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${BASE_API}${chemin}`)
        xhr.withCredentials = true
        xhr.setRequestHeader('X-CSRF-Token', jeton)
        xhr.upload.onprogress = (e) => e.lengthComputable && progression?.(e.loaded / e.total)
        xhr.onload = () => {
          let corps: { erreur?: string } = {}
          try {
            corps = JSON.parse(xhr.responseText)
          } catch {
            /* ignoré */
          }
          if (xhr.status >= 200 && xhr.status < 300) ok(corps as T)
          else ko(new ErreurApi(xhr.status, corps.erreur ?? `Erreur ${xhr.status}`))
        }
        xhr.onerror = () => ko(new ErreurApi(0, 'Connexion au serveur impossible.'))
        xhr.send(formulaire)
      }),
  )
}

/** Message lisible d'une erreur quelconque. */
export const messageErreur = (e: unknown) => (e instanceof Error ? e.message : 'Erreur inattendue.')

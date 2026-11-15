// L'application échange des dates « locales » (heure de Paris, sans fuseau) : AAAA-MM-JJTHH:MM:SS.
// L'API tourne avec TZ=Europe/Paris, donc les getters locaux de Date donnent l'heure de Paris.

const deux = (n: number) => String(n).padStart(2, '0')

/** Date → « 2026-11-15T18:30:00 » (heure de Paris). */
export function versLocal(d: Date): string
export function versLocal(d: Date | null | undefined): string | undefined
export function versLocal(d: Date | null | undefined): string | undefined {
  if (!d) return undefined
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`
}

/** « 2026-11-15T18:30:00 » (heure de Paris) → Date. */
export function depuisLocal(s: string): Date {
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s)
  if (Number.isNaN(d.getTime())) throw new Error(`Date invalide : ${s}`)
  return d
}

/** Heure arrondie (statistiques anonymes, aucun identifiant). */
export function heureArrondie(d = new Date()): Date {
  const h = new Date(d)
  h.setMinutes(0, 0, 0)
  return h
}

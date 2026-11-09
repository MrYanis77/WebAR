import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import fr, { type CleTexte } from './fr'
import en from './en'
import de from './de'
import type { Langue, Texte3 } from '../types'

const dictionnaires: Record<Langue, Record<CleTexte, string>> = { fr, en, de }
const CLE = 'montbeliard-langue'

export const LANGUES: { code: Langue; nom: string }[] = [
  { code: 'fr', nom: 'Français' },
  { code: 'en', nom: 'English' },
  { code: 'de', nom: 'Deutsch' },
]

/** Langue du navigateur par défaut (BF-13), sinon la dernière choisie. */
function langueInitiale(): Langue {
  try {
    const memo = localStorage.getItem(CLE)
    if (memo === 'fr' || memo === 'en' || memo === 'de') return memo
  } catch {
    /* ignoré */
  }
  const nav = (navigator.language || 'fr').slice(0, 2)
  return nav === 'en' || nav === 'de' ? nav : 'fr'
}

interface ContexteLangue {
  langue: Langue
  changerLangue: (l: Langue) => void
  t: (cle: CleTexte, vars?: Record<string, string | number>) => string
  tr: (texte: Texte3) => string
  date: (iso: string, options: Intl.DateTimeFormatOptions) => string
}

const Contexte = createContext<ContexteLangue | null>(null)

export function FournisseurLangue({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue>(langueInitiale)

  const changerLangue = useCallback((l: Langue) => {
    setLangue(l)
    document.documentElement.lang = l
    try {
      localStorage.setItem(CLE, l)
    } catch {
      /* ignoré */
    }
  }, [])

  const valeur = useMemo<ContexteLangue>(() => {
    const dico = dictionnaires[langue]
    const locale = langue === 'fr' ? 'fr-FR' : langue === 'de' ? 'de-DE' : 'en-GB'
    return {
      langue,
      changerLangue,
      t: (cle, vars) => {
        let s = dico[cle] ?? fr[cle] ?? cle
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
        return s
      },
      tr: (texte) => texte[langue] || texte.fr,
      date: (iso, options) => new Intl.DateTimeFormat(locale, options).format(new Date(iso)),
    }
  }, [langue, changerLangue])

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useLangue(): ContexteLangue {
  const c = useContext(Contexte)
  if (!c) throw new Error('useLangue doit être utilisé dans FournisseurLangue')
  return c
}

export type { CleTexte }

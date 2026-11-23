// Réglages d'accessibilité de l'application visiteur (RGAA 4.1 / WCAG 2.1 AA, loi du 11 février 2005
// et décret 2019-768) : taille du texte jusqu'à 200 %, contraste renforcé, espacement du texte
// (critère 10.12), réduction des animations, liens soulignés et focus très visible.
// Les choix sont propres à l'appareil (localStorage) et appliqués par des attributs sur <html>.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useLangue, type CleTexte } from '../../commun/i18n'
import { Icone, type NomIcone } from '../../commun/Icone'
import { CoucheModale, EnteteFeuille } from './Couche'

export type TailleTexte = 'normal' | 'grand' | 'tresGrand'

export interface ReglagesAccessibilite {
  taille: TailleTexte
  contraste: boolean
  dyslexie: boolean
  mouvement: boolean
  liens: boolean
  focus: boolean
}

const DEFAUT: ReglagesAccessibilite = { taille: 'normal', contraste: false, dyslexie: false, mouvement: false, liens: false, focus: false }
const CLE = 'mindi-accessibilite'
/** Agrandissement appliqué à l'interface (le texte atteint 200 % avec le zoom du navigateur). */
export const ZOOM_TAILLE: Record<TailleTexte, number> = { normal: 1, grand: 1.15, tresGrand: 1.3 }

function lire(): ReglagesAccessibilite {
  try {
    const brut = localStorage.getItem(CLE)
    if (brut) return { ...DEFAUT, ...(JSON.parse(brut) as Partial<ReglagesAccessibilite>) }
  } catch {
    /* stockage indisponible : réglages par défaut */
  }
  return { ...DEFAUT }
}

function appliquer(r: ReglagesAccessibilite) {
  const html = document.documentElement
  html.style.setProperty('--a11y-zoom', String(ZOOM_TAILLE[r.taille]))
  html.dataset.a11yTaille = r.taille
  html.classList.toggle('a11y-contraste', r.contraste)
  html.classList.toggle('a11y-dyslexie', r.dyslexie)
  html.classList.toggle('a11y-mouvement', r.mouvement)
  html.classList.toggle('a11y-liens', r.liens)
  html.classList.toggle('a11y-focus', r.focus)
}

interface ContexteAccessibilite {
  reglages: ReglagesAccessibilite
  modifier: (p: Partial<ReglagesAccessibilite>) => void
  reinitialiser: () => void
  ouvrir: () => void
}

const Contexte = createContext<ContexteAccessibilite | null>(null)

export function FournisseurAccessibilite({ children }: { children: ReactNode }) {
  const [reglages, setReglages] = useState<ReglagesAccessibilite>(lire)
  const [ouvert, setOuvert] = useState(false)

  useEffect(() => {
    appliquer(reglages)
    try {
      localStorage.setItem(CLE, JSON.stringify(reglages))
    } catch {
      /* ignoré */
    }
  }, [reglages])

  // Les réglages ne concernent que l'application visiteur : on les retire en la quittant (back-office).
  useEffect(() => () => appliquer(DEFAUT), [])

  const modifier = useCallback((p: Partial<ReglagesAccessibilite>) => setReglages((r) => ({ ...r, ...p })), [])
  const reinitialiser = useCallback(() => setReglages({ ...DEFAUT }), [])
  const valeur = useMemo(() => ({ reglages, modifier, reinitialiser, ouvrir: () => setOuvert(true) }), [reglages, modifier, reinitialiser])

  return (
    <Contexte.Provider value={valeur}>
      {children}
      <FeuilleAccessibilite ouverte={ouvert} onFermer={() => setOuvert(false)} />
    </Contexte.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useAccessibilite() {
  const c = useContext(Contexte)
  if (!c) throw new Error('useAccessibilite doit être utilisé dans FournisseurAccessibilite')
  return c
}

/** Bouton d'accès aux réglages, présent dans l'en-tête de chaque page. */
export function BoutonAccessibilite({ clair = false }: { clair?: boolean }) {
  const { t } = useLangue()
  const { ouvrir, reglages } = useAccessibilite()
  const actif = reglages.taille !== 'normal' || reglages.contraste || reglages.dyslexie || reglages.mouvement || reglages.liens || reglages.focus
  return (
    <button type="button" className={`bouton-langue bouton-a11y ${clair ? 'clair' : ''} ${actif ? 'actif' : ''}`} onClick={ouvrir} aria-label={t('a11y.bouton')} title={t('a11y.bouton')}>
      <Icone nom="accessibilite" taille={20} />
    </button>
  )
}

const OPTIONS: { cle: Exclude<keyof ReglagesAccessibilite, 'taille'>; icone: NomIcone; titre: CleTexte; note: CleTexte }[] = [
  { cle: 'contraste', icone: 'contraste', titre: 'a11y.contraste', note: 'a11y.contrasteNote' },
  { cle: 'dyslexie', icone: 'texte', titre: 'a11y.dyslexie', note: 'a11y.dyslexieNote' },
  { cle: 'mouvement', icone: 'pause', titre: 'a11y.mouvement', note: 'a11y.mouvementNote' },
  { cle: 'liens', icone: 'lien', titre: 'a11y.liens', note: 'a11y.liensNote' },
  { cle: 'focus', icone: 'viseur', titre: 'a11y.focus', note: 'a11y.focusNote' },
]

function FeuilleAccessibilite({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { t } = useLangue()
  const navigate = useNavigate()
  const { reglages, modifier, reinitialiser } = useAccessibilite()
  return (
    <CoucheModale ouverte={ouverte} onFermer={onFermer} etiquette={t('a11y.titre')}>
      <EnteteFeuille titre={t('a11y.titre')} onFermer={onFermer} libelleFermer={t('commun.fermer')} />
      <p className="feuille-intro">{t('a11y.intro')}</p>

      <fieldset className="a11y-taille">
        <legend>{t('a11y.taille')}</legend>
        <div role="radiogroup" aria-label={t('a11y.taille')}>
          {(['normal', 'grand', 'tresGrand'] as const).map((taille, i) => (
            <button key={taille} type="button" role="radio" aria-checked={reglages.taille === taille} onClick={() => modifier({ taille })}>
              <span aria-hidden="true" style={{ fontSize: 14 + i * 4 }}>
                A
              </span>
              {t(`a11y.taille.${taille}` as CleTexte)}
            </button>
          ))}
        </div>
      </fieldset>

      <ul className="a11y-options">
        {OPTIONS.map((o) => (
          <li key={o.cle}>
            <button type="button" role="switch" aria-checked={reglages[o.cle]} onClick={() => modifier({ [o.cle]: !reglages[o.cle] })}>
              <span className="a11y-icone">
                <Icone nom={o.icone} taille={18} />
              </span>
              <span className="a11y-texte">
                <strong>{t(o.titre)}</strong>
                <small>{t(o.note)}</small>
              </span>
              <i className="a11y-interrupteur" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <div className="a11y-pied">
        <button type="button" className="btn btn-secondaire" onClick={reinitialiser}>
          <Icone nom="relancer" taille={16} />
          {t('a11y.reinitialiser')}
        </button>
        <button
          type="button"
          className="btn-texte"
          onClick={() => {
            onFermer()
            navigate('/mentions#accessibilite')
          }}
        >
          {t('a11y.declaration')}
        </button>
      </div>
      <p className="a11y-conformite">{t('a11y.conformite')}</p>
    </CoucheModale>
  )
}

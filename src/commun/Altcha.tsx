// Widget anti-robot ALTCHA (preuve de travail, sans cookie ni service tiers, BNF-20).
// Le défi est fourni par l'API (/api/v1/public/altcha) ; la preuve calculée par le navigateur
// est renvoyée avec le formulaire et vérifiée par le serveur (altcha-lib).
import { useEffect, useRef, useState } from 'react'
import 'altcha/types/react'
import { BASE_API } from './api'

interface Props {
  /** Appelé avec la preuve (payload base64) une fois la vérification réussie, null sinon. */
  onChange: (preuve: string | null) => void
  langue?: 'fr' | 'en' | 'de'
  /** Résolution automatique et sans case à cocher (signalement visiteur, BF-51). */
  invisible?: boolean
}

export function Altcha({ onChange, langue = 'fr', invisible = false }: Props) {
  const ref = useRef<HTMLElement>(null)
  const [pret, setPret] = useState(false)
  const rappel = useRef(onChange)
  rappel.current = onChange

  // Le composant web n'est chargé qu'à l'ouverture d'un formulaire (il n'alourdit pas l'application).
  useEffect(() => {
    let actif = true
    // Version « i18n » : le widget avec ses traductions (fr, en, de).
    void import('altcha/i18n').then(() => actif && setPret(true))
    return () => {
      actif = false
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || !pret) return
    const changement = (e: Event) => {
      const d = (e as CustomEvent<{ state: string; payload?: string }>).detail
      rappel.current(d.state === 'verified' && d.payload ? d.payload : null)
    }
    el.addEventListener('statechange', changement)
    return () => el.removeEventListener('statechange', changement)
  }, [pret])

  if (!pret) return invisible ? null : <div className="altcha-chargement">Vérification anti-robot…</div>
  return (
    <altcha-widget
      ref={ref}
      challenge={`${BASE_API}/public/altcha`}
      language={langue}
      name="altcha"
      {...(invisible ? { auto: 'onload' as const, display: 'invisible' as const } : {})}
    />
  )
}

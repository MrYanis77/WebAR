import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icone } from '../../commun/Icone'

// Les fenêtres s'ouvrent « par-dessus l'animation, sans la quitter » (BF-45) : elles sont rendues
// dans l'écran du téléphone via un portail, au-dessus de la page courante.

export const EcranContexte = createContext<HTMLElement | null>(null)

export function CoucheModale({
  ouverte,
  onFermer,
  children,
  etiquette,
  sombre = true,
}: {
  ouverte: boolean
  onFermer: () => void
  children: ReactNode
  etiquette: string
  sombre?: boolean
}) {
  const ecran = useContext(EcranContexte)
  useEffect(() => {
    if (!ouverte) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [ouverte, onFermer])
  if (!ouverte || !ecran) return null
  return createPortal(
    <div className={`couche-modale ${sombre ? '' : 'claire'}`} onClick={onFermer}>
      <div className="feuille" role="dialog" aria-modal="true" aria-label={etiquette} onClick={(e) => e.stopPropagation()}>
        <div className="poignee" aria-hidden="true" />
        {children}
      </div>
    </div>,
    ecran,
  )
}

export function EnteteFeuille({ surtitre, titre, onFermer, libelleFermer = 'Fermer' }: { surtitre?: ReactNode; titre: string; onFermer: () => void; libelleFermer?: string }) {
  return (
    <div className="entete-feuille">
      <div>
        {surtitre}
        <h2>{titre}</h2>
      </div>
      <button type="button" className="bouton-fermer" onClick={onFermer} aria-label={libelleFermer}>
        <Icone nom="fermer" taille={18} />
      </button>
    </div>
  )
}

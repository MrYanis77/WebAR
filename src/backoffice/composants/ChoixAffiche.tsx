// Choix de l'affiche montrée dans les aperçus 3D (atelier 3D, placement d'une animation d'affiche) :
// d'abord les affiches liées aux animations concernées, puis les autres, ou un gabarit vierge au format choisi.
import { useMemo } from 'react'
import { FORMATS_MM } from '../../commun/AfficheQr'
import { useEtat } from '../../commun/store'
import type { Affiche } from '../../commun/types'
import { useSession } from '../session'
import { BAS_AFFICHE_M, dimensionsAffiche } from './sceneApercu'

const cm = (m: number) => String(Math.round(m * 1000) / 10).replace('.', ',')

/** Affiches avec image visibles par la session : celles des animations `idsAnimations` d'abord. */
export function useAffichesProposees(idsAnimations: (string | undefined)[]) {
  const etat = useEtat()
  const session = useSession()
  const agent = session.role === 'AGENT'
  const cle = idsAnimations.filter(Boolean).join('|')
  return useMemo(() => {
    const ids = new Set(cle ? cle.split('|') : [])
    const avecImage = etat.affiches.filter((x) => x.image?.url && (agent || x.proprietaireId === session.partenaireId))
    return { liees: avecImage.filter((x) => ids.has(x.animationAfficheId)), autres: avecImage.filter((x) => !ids.has(x.animationAfficheId)) }
  }, [etat.affiches, cle, agent, session.partenaireId])
}

export function ChoixAffiche({
  liees,
  autres,
  affiche,
  onAffiche,
  formatGabarit,
  onFormatGabarit,
  libelleLiees = 'Affiches qui utilisent ce modèle',
}: {
  liees: Affiche[]
  autres: Affiche[]
  /** Affiche montrée ; absente : gabarit vierge. */
  affiche?: Affiche
  onAffiche: (id: string) => void
  formatGabarit: string
  onFormatGabarit: (format: string) => void
  libelleLiees?: string
}) {
  const { format, pageL, pageH } = dimensionsAffiche(affiche, formatGabarit)
  return (
    <div className="choix-affiche-apercu">
      <label className="champ">
        <span className="etiquette">Affiche montrée</span>
        <select value={affiche?.id ?? ''} onChange={(e) => onAffiche(e.target.value)}>
          <option value="">Gabarit vierge</option>
          {liees.length > 0 && (
            <optgroup label={libelleLiees}>
              {liees.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nom}
                </option>
              ))}
            </optgroup>
          )}
          {autres.length > 0 && (
            <optgroup label="Autres affiches">
              {autres.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nom}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {!affiche && (
        <div className="choix-segment" role="group" aria-label="Format du gabarit">
          <span>Format</span>
          {Object.keys(FORMATS_MM).map((f) => (
            <button key={f} type="button" className={formatGabarit === f ? 'actif' : ''} aria-pressed={formatGabarit === f} onClick={() => onFormatGabarit(f)}>
              {f}
            </button>
          ))}
        </div>
      )}
      <small className="aide-champ">
        {format} · {cm(pageL)} × {cm(pageH)} cm, bas de l’affiche à {cm(BAS_AFFICHE_M)} cm du sol.
      </small>
    </div>
  )
}

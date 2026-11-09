import { useMemo } from 'react'
import { CarteInteractive, type Centrage } from '../../commun/Carte'
import { EMPRISE, METRES_PAR_UNITE, projeter, type Coordonnees } from '../../commun/geo'
import { Icone } from '../../commun/Icone'
import type { Lieu } from '../../commun/types'

/** Carte des points de spectacle (BF-05), position du visiteur (BF-06) et lieu promu (BF-32). */
export function CarteLieux({
  lieux,
  selection,
  onSelection,
  position,
  misEnAvant,
  centrage,
}: {
  lieux: Lieu[]
  selection: string | null
  onSelection: (id: string) => void
  position: Coordonnees | null
  misEnAvant?: string | null
  centrage: Centrage | null
}) {
  const lieuSel = lieux.find((l) => l.id === selection)
  const pSel = lieuSel ? projeter(lieuSel) : null
  const pUser = useMemo(() => (position ? projeter(position) : null), [position])
  const userDansCarte = !!pUser && pUser.x > -100 && pUser.x < EMPRISE.largeur + 100 && pUser.y > -100 && pUser.y < EMPRISE.hauteur + 100

  return (
    <CarteInteractive
      className="carte-visiteur"
      centrage={centrage}
      calques={
        <>
          {lieuSel && pSel && (
            <circle
              cx={pSel.x}
              cy={pSel.y}
              r={lieuSel.rayonM / METRES_PAR_UNITE}
              fill="rgb(123 30 46 / 0.08)"
              stroke="rgb(123 30 46 / 0.45)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}
        </>
      }
      surcouche={(versEcran) => (
        <>
          {lieux.map((l) => {
            const p = projeter(l)
            const e = versEcran(p.x, p.y)
            const sel = l.id === selection
            return (
              <button
                key={l.id}
                type="button"
                className={`marqueur ${sel ? 'selectionne' : ''} ${misEnAvant === l.id ? 'mis-en-avant' : ''}`}
                style={{ left: e.left, top: e.top }}
                onClick={() => onSelection(l.id)}
                aria-pressed={sel}
                aria-label={`Sélectionner ${l.nom}`}
              >
                <Icone nom="pin" taille={16} />
                {l.nomCourt}
              </button>
            )
          })}
          {pUser && userDansCarte && (
            <span className="point-utilisateur" style={versEcran(pUser.x, pUser.y)} aria-label="Votre position">
              <span />
            </span>
          )}
        </>
      )}
    />
  )
}

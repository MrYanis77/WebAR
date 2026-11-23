// Pages « Zones d'affichage » et « Zones à attribuer » (sous-menu Affiches) : une zone d'affichage est un
// emplacement de la ville où une affiche peut être collée. Elle ne sert qu'aux affiches.
import { useState } from 'react'
import { Icone } from '../../commun/Icone'
import { enregistrerZone, useEtat } from '../../commun/store'
import type { Zone } from '../../commun/types'
import { EditeurZone, nouvelleZone, OngletAttributions, OngletZones } from '../composants/ZonesAffichage'
import { EnTetePage, executer, useToast } from '../ui'

export function PageZones() {
  const etat = useEtat()
  const toast = useToast()
  const [zone, setZone] = useState<Zone | null>(null)
  return (
    <>
      <EnTetePage
        titre="Zones d’affichage"
        description="Les emplacements de la ville où les affiches peuvent être collées (panneaux, vitrines…). Chaque affiche d’un partenaire doit recevoir une zone avant d’être publiée."
        actions={
          <button type="button" className="btn btn-primaire" onClick={() => setZone(nouvelleZone())}>
            <Icone nom="plus" taille={16} /> Ajouter une zone
          </button>
        }
      />
      <div className="bo-defilement">
        <p className="encart-aide">
          <Icone nom="info" taille={16} />
          <span>
            Une <strong>zone d’affichage</strong> sert uniquement aux <strong>affiches</strong>. Pour placer une animation 3D dans la ville, créez un <strong>monument</strong>.
          </span>
        </p>
        <OngletZones etat={etat} toast={toast} onEditer={setZone} />
      </div>
      {zone && (
        <EditeurZone
          zone={zone}
          onFermer={() => setZone(null)}
          onEnregistrer={async (z) => {
            if (await executer(toast, () => enregistrerZone(z), `Zone « ${z.nom} » enregistrée`)) setZone(null)
          }}
        />
      )}
      {toast.element}
    </>
  )
}

export function PageAttributions() {
  const etat = useEtat()
  const toast = useToast()
  return (
    <>
      <EnTetePage
        titre="Zones à attribuer"
        description="Les affiches des partenaires qui attendent une zone d’affichage. Acceptez la zone proposée par le partenaire ou choisissez-en une autre : il est prévenu par mail."
      />
      <div className="bo-defilement">
        <OngletAttributions etat={etat} toast={toast} />
      </div>
      {toast.element}
    </>
  )
}

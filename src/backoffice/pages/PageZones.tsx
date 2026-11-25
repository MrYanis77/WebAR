// Pages « Zones d'affichage » et « Zones à attribuer » (sous-menu Affiches) : une zone d'affichage est un
// emplacement de la ville où une affiche peut être collée. Elle ne sert qu'aux affiches.
import { useState } from 'react'
import { Link } from 'react-router'
import { Icone } from '../../commun/Icone'
import { enregistrerZone, useEtat } from '../../commun/store'
import type { Zone } from '../../commun/types'
import { affichesEnAttente, CommentCaMarche, EditeurZone, nouvelleZone, OngletAttributions, OngletZones } from '../composants/ZonesAffichage'
import { CarteStat, EnTetePage, executer, useToast } from '../ui'

const CLE_AIDE = 'mindi-aide-zones'

/** Le mode d'emploi reste ouvert tant que l'agent ne l'a pas replié (choix gardé sur l'appareil). */
function lireAideOuverte() {
  try {
    return localStorage.getItem(CLE_AIDE) !== 'replie'
  } catch {
    return true
  }
}

export function PageZones() {
  const etat = useEtat()
  const toast = useToast()
  const [zone, setZone] = useState<Zone | null>(null)
  const [aide, setAide] = useState(lireAideOuverte)
  const actives = etat.zones.filter((z) => z.active).length
  const placees = etat.affiches.filter((a) => a.zoneId && a.statut !== 'RETIREE').length
  const attente = affichesEnAttente(etat).length

  function basculerAide() {
    setAide(!aide)
    try {
      localStorage.setItem(CLE_AIDE, aide ? 'replie' : 'ouvert')
    } catch {
      /* stockage indisponible : le choix n'est simplement pas gardé */
    }
  }

  return (
    <>
      <EnTetePage
        titre="Zones d’affichage"
        description="Une zone d’affichage est un endroit de la ville où la mairie autorise le collage d’affiches : un panneau, une vitrine, un mur d’expression libre… Chaque affiche d’un partenaire doit avoir sa zone pour être publiée."
        actions={
          <button type="button" className="btn btn-primaire btn-grand" onClick={() => setZone(nouvelleZone())}>
            <Icone nom="plus" taille={18} /> Ajouter une zone
          </button>
        }
      />
      <div className="bo-defilement">
        <CommentCaMarche ouvert={aide || etat.zones.length === 0} onBasculer={basculerAide} />
        <div className="grille-stats stats-zones">
          <CarteStat libelle="Zones ouvertes" valeur={String(actives)} icone="zone" note={`sur ${etat.zones.length} zone${etat.zones.length > 1 ? 's' : ''} au total`} />
          <CarteStat libelle="Affiches placées" valeur={String(placees)} icone="affiche" note="avec une zone attribuée" />
          <div className={`carte-stat ${attente ? 'a-traiter' : ''}`}>
            <div className="carte-stat-haut">
              <span>Demandes à traiter</span>
              <i>
                <Icone nom="drapeau" taille={16} />
              </i>
            </div>
            <strong>{attente}</strong>
            {attente ? (
              <Link className="lien-panneau" to="/backoffice/affiches/attributions">
                Traiter les demandes <Icone nom="droite" taille={14} />
              </Link>
            ) : (
              <small>aucune affiche n’attend de zone</small>
            )}
          </div>
        </div>
        <p className="encart-aide">
          <Icone nom="info" taille={16} />
          <span>
            Une <strong>zone d’affichage</strong> sert uniquement aux <strong>affiches</strong>. Pour faire apparaître une animation 3D autour d’un bâtiment, créez un{' '}
            <Link to="/backoffice/lieux">monument</Link>.
          </span>
        </p>
        <OngletZones etat={etat} toast={toast} onEditer={setZone} />
      </div>
      {zone && (
        <EditeurZone
          zone={zone}
          onFermer={() => setZone(null)}
          onEnregistrer={async (z) => {
            if (await executer(toast, () => enregistrerZone(z), z.id ? `Zone « ${z.nom} » enregistrée` : `Zone « ${z.nom} » créée : les partenaires peuvent la choisir`)) setZone(null)
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
        description="Les affiches des partenaires qui attendent une zone d’affichage. Acceptez la zone demandée par le partenaire, ou choisissez-en une autre : il est prévenu par mail dans les deux cas."
        actions={
          <Link to="/backoffice/affiches/zones" className="btn btn-secondaire">
            <Icone nom="zone" taille={16} /> Voir les zones
          </Link>
        }
      />
      <div className="bo-defilement">
        <OngletAttributions etat={etat} toast={toast} />
      </div>
      {toast.element}
    </>
  )
}

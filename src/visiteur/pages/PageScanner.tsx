import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { distanceM, formaterDistance } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { useAffichesDiffusees, useDonneesPubliques } from '../donneesPubliques'
import { BoutonLangue } from '../composants/Feuilles'
import { NavBas } from '../composants/NavBas'
import { usePosition } from '../contexte/position'
import { animationsDuLieu, lieuxVisibles } from '../utils'

/** Onglet « Scanner » : viser une affiche ou lancer le spectacle d'un lieu (relance sans QR code, BF-10). */
export default function PageScanner() {
  const { t, tr } = useLangue()
  const navigate = useNavigate()
  const etat = useDonneesPubliques()
  const { coords } = usePosition()
  const lieux = useMemo(() => lieuxVisibles(etat), [etat])
  // Le scanner intégré ouvre une affiche diffusée (même parcours que le scan de son QR code).
  const diffusees = useAffichesDiffusees()
  const afficheDemo = diffusees[0]

  return (
    <div className="page page-defilante page-scanner">
      <div className="entete-mobile">
        <span className="marque-mini" aria-hidden="true">
          M
        </span>
        <BoutonLangue />
      </div>
      <main>
        <p className="eyebrow">{t('nav.scanner')}</p>
        <h1>{t('scanner.titre')}</h1>
        <button type="button" className="choix-scan principal" disabled={!afficheDemo} onClick={() => afficheDemo && navigate(`/a/${afficheDemo.codeQr}`)}>
          <span className="icone-choix">
            <Icone nom="qr" taille={26} />
          </span>
          <div>
            <strong>{t('scanner.affiche')}</strong>
            <small>{t('scanner.afficheNote')}</small>
          </div>
          <Icone nom="droite" taille={18} />
        </button>
        <h2 className="sous-titre-section">{t('scanner.lieu')}</h2>
        {lieux.map((l) => {
          const { active } = animationsDuLieu(etat, l.id)
          const distance = coords ? distanceM(coords, l) : null
          // Le scan n'est proposé que dans le rayon du lieu ; ailleurs, la fiche propose l'aperçu et l'itinéraire.
          const dansZone = distance !== null && distance <= l.rayonM
          return (
            <button key={l.id} type="button" className="choix-scan" disabled={!active} onClick={() => navigate(dansZone ? `/lieux/${l.id}/ra` : `/lieux/${l.id}`)}>
              {l.image ? <img src={l.image} alt="" /> : <span className="icone-choix"><Icone nom="pin" taille={24} /></span>}
              <div>
                <strong>{l.nom}</strong>
                <small>
                  {active ? active.titre : t('carte.aucunSpectacle')} · {tr(l.categorie)}
                  {distance !== null && ` · ${formaterDistance(distance)}`}
                </small>
                {active && <small className={dansZone ? 'dans-zone' : ''}>{dansZone ? t('carte.dansZone') : t('carte.horsZone', { r: l.rayonM })}</small>}
              </div>
              <Icone nom={dansZone ? 'scan' : 'droite'} taille={18} />
            </button>
          )
        })}
      </main>
      <NavBas />
    </div>
  )
}

import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { distanceM, formaterDistance } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { afficheDiffusee, useEtat } from '../../commun/store'
import { BoutonLangue } from '../composants/Feuilles'
import { NavBas } from '../composants/NavBas'
import { usePosition } from '../contexte/position'
import { animationsDuLieu, lieuxVisibles } from '../utils'

/** Onglet « Scanner » : viser une affiche ou lancer le spectacle d'un lieu (relance sans QR code, BF-10). */
export default function PageScanner() {
  const { t, tr } = useLangue()
  const navigate = useNavigate()
  const etat = useEtat()
  const { coords } = usePosition()
  const lieux = useMemo(() => lieuxVisibles(etat), [etat])
  const afficheDemo = etat.affiches.find((a) => !afficheDiffusee(etat, a.codeQr).raison)

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
          return (
            <button key={l.id} type="button" className="choix-scan" disabled={!active} onClick={() => navigate(`/lieux/${l.id}/ra`)}>
              {imageLieu(l.image) ? <img src={imageLieu(l.image)} alt="" /> : <span className="icone-choix"><Icone nom="pin" taille={24} /></span>}
              <div>
                <strong>{l.nom}</strong>
                <small>
                  {active ? active.titre : t('carte.aucunSpectacle')} · {tr(l.categorie)}
                  {coords && ` · ${formaterDistance(distanceM(coords, l))}`}
                </small>
              </div>
              <Icone nom="scan" taille={18} />
            </button>
          )
        })}
      </main>
      <NavBas />
    </div>
  )
}

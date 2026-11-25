import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { distanceM, formaterDistance, minutesAPied } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { positionAffiche, useAffichesDiffusees, type AfficheDiffusee } from '../donneesPubliques'
import { BoutonLangue } from '../composants/Feuilles'
import { NavBas } from '../composants/NavBas'
import { usePosition } from '../contexte/position'
import { lienNavigation } from '../services/itineraire'

/**
 * « Les affiches animées » : toutes les affiches diffusées en ce moment, avec ce qu'il faut pour les
 * trouver (emplacement, adresse, distance), le monument vers lequel elles invitent et leur fin de
 * diffusion. Le visiteur sait ainsi quelles expériences existent et où les vivre.
 */
export default function PageAffichesVille() {
  const { t, date } = useLangue()
  const navigate = useNavigate()
  const { affiches, chargement } = useAffichesDiffusees()
  const position = usePosition()
  const [prochesDabord, setProchesDabord] = useState(true)

  const liste = useMemo(() => {
    const avecDistance = affiches.map((a) => {
      const p = positionAffiche(a)
      return { a, p, distance: p && position.coords ? distanceM(position.coords, p) : null }
    })
    if (prochesDabord && position.coords) avecDistance.sort((x, y) => (x.distance ?? Infinity) - (y.distance ?? Infinity))
    return avecDistance
  }, [affiches, position.coords, prochesDabord])

  const carte = ({ a, p, distance }: { a: AfficheDiffusee; p: { latitude: number; longitude: number } | null; distance: number | null }) => (
    <li key={a.codeQr} id={`affiche-${a.codeQr}`}>
      <article className="carte-affiche-ville">
        <div className="vignette-affiche">{a.image ? <img src={a.image.url} alt="" loading="lazy" /> : <Icone nom="affiche" taille={30} />}</div>
        <div className="texte-affiche-ville">
          {a.accroche && <span className="eyebrow">{a.accroche}</span>}
          <h2>{a.nom}</h2>
          <p className="info-affiche-ville">
            <Icone nom="pin" taille={16} />
            {a.emplacement ? (
              <span>
                <strong>{a.emplacement.nom}</strong>
                <small>{a.emplacement.adresse}</small>
                {distance !== null && <small className="distance">{t('affiches.aPied', { d: formaterDistance(distance), m: minutesAPied(distance) })}</small>}
              </span>
            ) : (
              <span>
                <small>{t('affiches.emplacementInconnu')}</small>
              </span>
            )}
          </p>
          {a.lieu && (
            <p className="info-affiche-ville">
              <Icone nom="etoile" taille={16} />
              <span>
                <small>{t('affiches.invite')}</small>
                <strong>{a.lieu.nom}</strong>
              </span>
            </p>
          )}
          <p className="info-affiche-ville discret">
            <Icone nom="calendrier" taille={16} />
            <span>
              <small>{t('affiches.jusquau', { date: date(a.fin, { day: 'numeric', month: 'long' }) })}</small>
            </span>
          </p>
        </div>
        <div className="actions-affiche-ville">
          {p && (
            <a className="btn btn-primaire" href={lienNavigation(p, 'pied')} target="_blank" rel="noopener noreferrer">
              <Icone nom="itineraire" taille={17} /> {t('affiches.yAller')}
            </a>
          )}
          {p && (
            <button type="button" className="btn btn-secondaire" onClick={() => navigate(`/?repere=${encodeURIComponent(a.codeQr)}`)}>
              <Icone nom="carte" taille={17} /> {t('affiches.surCarte')}
            </button>
          )}
          {a.lieu && (
            <button type="button" className="btn btn-fantome-carte" onClick={() => navigate(`/lieux/${a.lieu!.id}`)}>
              <Icone nom="pin" taille={17} /> {t('affiches.voirMonument')}
            </button>
          )}
        </div>
      </article>
    </li>
  )

  return (
    <div className="page page-defilante page-affiches-ville">
      <div className="entete-mobile">
        <span className="marque-mini" aria-hidden="true">
          M
        </span>
        <BoutonLangue />
      </div>
      <main>
        <p className="eyebrow">{t('affiches.surtitre')}</p>
        <h1>{t('affiches.titre')}</h1>
        <p className="intro-page">{t('affiches.intro')}</p>
        <ol className="parcours-affiche" aria-label={t('affiches.commentFaire')}>
          <li>
            <span>
              <Icone nom="pin" taille={20} />
            </span>
            {t('affiches.etape1')}
          </li>
          <li>
            <span>
              <Icone nom="qr" taille={20} />
            </span>
            {t('affiches.etape2')}
          </li>
          <li>
            <span>
              <Icone nom="cube" taille={20} />
            </span>
            {t('affiches.etape3')}
          </li>
        </ol>
        <button type="button" className="btn btn-primaire btn-bloc btn-scan-affiches" onClick={() => navigate('/scanner')}>
          <Icone nom="scan" taille={20} /> {t('affiches.scanner')}
        </button>

        <div className="tete-liste-affiches">
          <h2 className="sous-titre-section">{affiches.length > 1 ? t('affiches.compteN', { n: affiches.length }) : affiches.length === 1 ? t('affiches.compte1') : t('affiches.titreListe')}</h2>
          {affiches.length > 1 && (
            <button
              type="button"
              className={`filtre-proximite ${prochesDabord && position.coords ? 'actif' : ''}`}
              aria-pressed={prochesDabord && !!position.coords}
              onClick={() => {
                if (!position.coords) position.demander()
                setProchesDabord(!position.coords || !prochesDabord)
              }}
            >
              <Icone nom="pin" taille={15} /> {t('affiches.proches')}
            </button>
          )}
        </div>
        {chargement ? (
          <p className="note-vide">
            <span className="spinner" /> {t('affiches.chargement')}
          </p>
        ) : affiches.length === 0 ? (
          <div className="vide-affiches">
            <Icone nom="affiche" taille={30} />
            <p>{t('affiches.vide')}</p>
            <button type="button" className="btn btn-secondaire" onClick={() => navigate('/')}>
              <Icone nom="carte" taille={17} /> {t('ra.voirCarte')}
            </button>
          </div>
        ) : (
          <ul className="liste-affiches-ville">{liste.map(carte)}</ul>
        )}
      </main>
      <NavBas />
    </div>
  )
}

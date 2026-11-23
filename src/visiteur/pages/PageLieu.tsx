import { lazy, Suspense, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { distanceM, formaterDistance, minutesAPied } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { useDonneesPubliques } from '../donneesPubliques'
import type { Animation } from '../../commun/types'
import { BoutonLangue } from '../composants/Feuilles'
import { FormulaireSignalement, type CibleSignalement } from '../composants/FormulaireSignalement'
import { MessageErreur } from '../composants/MessageErreur'
import { NavBas } from '../composants/NavBas'
import { usePosition } from '../contexte/position'
import { CoucheModale, EnteteFeuille } from '../composants/Couche'
import { animationsDuLieu } from '../utils'

// Aperçu 3D sans caméra (Three.js), chargé seulement à l'ouverture de la prévisualisation.
const ModeleSimule = lazy(() => import('../composants/ModeleSimule'))

/** Fiche du lieu (BF-07), consultable en entier sans caméra (BNF-11). */
export default function PageLieu() {
  const { id } = useParams()
  const { t, tr, date } = useLangue()
  const etat = useDonneesPubliques()
  const navigate = useNavigate()
  const position = usePosition()
  const [transcription, setTranscription] = useState(false)
  const [cible, setCible] = useState<CibleSignalement | null>(null)
  const [apercu, setApercu] = useState(false)
  const lieu = etat.lieux.find((l) => l.id === id && l.actif)

  if (etat.chargement)
    return (
      <div className="page page-centree">
        <span className="spinner" />
      </div>
    )

  if (!lieu) {
    return (
      <div className="page page-centree">
        <MessageErreur cas="retiree" onAction={() => navigate('/')} />
      </div>
    )
  }

  const { active, prochaines } = animationsDuLieu(etat, lieu.id)
  const distance = position.coords ? distanceM(position.coords, lieu) : null
  // Réalité augmentée seulement sur place ; ailleurs : prévisualisation 3D et itinéraire.
  const dansZone = distance !== null && distance <= lieu.rayonM
  const itineraire = () => navigate(`/?lieu=${lieu.id}&itineraire=1`)
  const image = lieu.image

  const ligne = (a: Animation, enCours: boolean) => (
    <div className="ligne-horaire" key={a.id}>
      <div className="bloc-date">
        <strong>{enCours ? '●' : date(a.debut, { day: '2-digit' })}</strong>
        <span>{enCours ? t('agenda.enCours') : date(a.debut, { month: 'short' }).replace('.', '').toUpperCase()}</span>
      </div>
      <div>
        <strong>{a.titre}</strong>
        <p>
          {enCours
            ? a.fin
              ? t('agenda.jusquau', { date: date(a.fin, { day: 'numeric', month: 'long' }) })
              : t('lieu.permanent')
            : date(a.debut, { weekday: 'long', hour: '2-digit', minute: '2-digit' })}{' '}
          · {t('lieu.duree', { m: Math.round(a.dureeS / 60) })}
        </p>
      </div>
    </div>
  )

  return (
    <div className="page page-defilante page-lieu">
      <div className="hero-lieu">
        {image ? <img src={image} alt="" /> : <div className="image-vide" />}
        <div className="hero-ombre" />
        <div className="entete-mobile">
          <button type="button" className="bouton-icone" onClick={() => navigate(-1)} aria-label={t('commun.retour')}>
            <Icone nom="gauche" taille={20} />
          </button>
          <BoutonLangue />
        </div>
        {active && <span className="pill pill-cyan hero-pill">{t('carte.experienceRA')}</span>}
      </div>

      <div className="contenu-lieu">
        <div className="titre-lieu">
          <div>
            <p className="eyebrow">{t('lieu.emblematique')}</p>
            <h1>{lieu.nom}</h1>
          </div>
          <button type="button" className="bouton-icone" onClick={() => navigate('/agenda')} aria-label={t('nav.agenda')}>
            <Icone nom="calendrier" taille={19} />
          </button>
        </div>
        <p className="adresse">
          <Icone nom="pin" taille={15} />
          {lieu.adresse}
        </p>
        <p className="description">{tr(lieu.description)}</p>

        <section className="carte-horaires" aria-label={t('lieu.prochainesDates')}>
          <div className="titre-section">
            <div>
              <span className="pill pill-cyan">RA</span>
              <h3>{active ? t('lieu.enCours') : t('lieu.prochain')}</h3>
            </div>
            {lieu.accesLibre && <span className="point-direct">{t('lieu.accesLibre')}</span>}
          </div>
          {!active && <p className="note-vide">{t('lieu.aucunSpectacle')}</p>}
          {active && ligne(active, true)}
          {prochaines.slice(0, 3).map((a) => ligne(a, false))}
        </section>

        {lieu.scoreDomicile !== undefined && (
          <section className="carte-score" aria-label={t('lieu.score')}>
            <small>
              {t('lieu.score')} · {lieu.competition}
            </small>
            <div>
              <b>{lieu.equipeDomicile}</b>
              <strong>
                {lieu.scoreDomicile} <i>–</i> {lieu.scoreExterieur}
              </strong>
              <b>{lieu.equipeExterieur}</b>
            </div>
            <span>{lieu.minute}</span>
          </section>
        )}

        <button
          type="button"
          className="carte-distance"
          onClick={() => (distance === null ? position.demander() : itineraire())}
        >
          <span className="mini-icone">
            <Icone nom="itineraire" taille={18} />
          </span>
          <div>
            <small>{t('lieu.depuis')}</small>
            <strong>
              {distance !== null
                ? t('lieu.aPied', { d: formaterDistance(distance), m: minutesAPied(distance) })
                : position.etat === 'demande'
                  ? t('carte.recherchePosition')
                  : t('lieu.positionInconnue')}
            </strong>
          </div>
          <Icone nom="droite" taille={18} />
        </button>

        {active && tr(active.transcription).trim() && (
          <section className={`transcription ${transcription ? 'ouverte' : ''}`}>
            <button type="button" onClick={() => setTranscription(!transcription)} aria-expanded={transcription}>
              <Icone nom="sousTitres" taille={18} />
              {t('lieu.sansRA')}
              <Icone nom={transcription ? 'haut' : 'bas'} taille={16} />
            </button>
            {transcription && (
              <div>
                <small>{t('lieu.transcription')}</small>
                <p>{tr(active.transcription)}</p>
              </div>
            )}
          </section>
        )}

        {active && (
          <button type="button" className="lien-signaler" onClick={() => setCible({ animationId: active.id, nom: `${active.titre} — ${lieu.nomCourt}` })}>
            <Icone nom="drapeau" taille={14} />
            {t('lieu.signaler')}
          </button>
        )}
      </div>

      <div className="cta-collant">
        {active && dansZone ? (
          <button type="button" className="btn btn-primaire btn-bloc" onClick={() => navigate(`/lieux/${lieu.id}/ra`)}>
            <Icone nom="scan" taille={18} />
            {t('lieu.voirRA')}
          </button>
        ) : (
          <>
            {active && (
              <p className="note-cta" role="status">
                {distance !== null ? t('lieu.horsZone', { d: formaterDistance(distance), r: lieu.rayonM }) : t('lieu.positionPourRA')}
              </p>
            )}
            <div className="cta-double">
              <button type="button" className="btn btn-secondaire" disabled={!active?.modeleUrl} onClick={() => setApercu(true)}>
                <Icone nom="cube" taille={18} />
                {t('lieu.previsualisation')}
              </button>
              <button type="button" className="btn btn-primaire" onClick={itineraire}>
                <Icone nom="itineraire" taille={18} />
                {t('lieu.itineraire')}
              </button>
            </div>
          </>
        )}
      </div>
      <NavBas />
      <FormulaireSignalement cible={cible} onFermer={() => setCible(null)} />
      <CoucheModale ouverte={apercu} onFermer={() => setApercu(false)} etiquette={t('lieu.previsualisationTitre')}>
        <EnteteFeuille surtitre={<span className="eyebrow">{lieu.nomCourt}</span>} titre={active?.titre ?? t('lieu.previsualisationTitre')} onFermer={() => setApercu(false)} libelleFermer={t('commun.fermer')} />
        <div className="scene-previsualisation">
          {active?.modeleUrl ? (
            <Suspense fallback={<span className="spinner" />}>
              <ModeleSimule animation={active} cycle={0} centre />
            </Suspense>
          ) : (
            <p className="note-vide">{t('lieu.pasDeModele')}</p>
          )}
        </div>
        <p className="feuille-intro">{t('lieu.previsualisationTexte')}</p>
        <button
          type="button"
          className="btn btn-primaire btn-bloc"
          onClick={() => {
            setApercu(false)
            itineraire()
          }}
        >
          <Icone nom="itineraire" taille={18} />
          {t('lieu.itineraire')}
        </button>
      </CoucheModale>
    </div>
  )
}

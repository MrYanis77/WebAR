import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { distanceM, formaterDistance, minutesAPied } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { useEtat } from '../../commun/store'
import type { Animation } from '../../commun/types'
import { BoutonLangue } from '../composants/Feuilles'
import { FormulaireSignalement, type CibleSignalement } from '../composants/FormulaireSignalement'
import { MessageErreur } from '../composants/MessageErreur'
import { NavBas } from '../composants/NavBas'
import { usePosition } from '../contexte/position'
import { animationsDuLieu } from '../utils'

/** Fiche du lieu (BF-07), consultable en entier sans caméra (BNF-11). */
export default function PageLieu() {
  const { id } = useParams()
  const { t, tr, date } = useLangue()
  const etat = useEtat()
  const navigate = useNavigate()
  const position = usePosition()
  const [transcription, setTranscription] = useState(false)
  const [cible, setCible] = useState<CibleSignalement | null>(null)
  const lieu = etat.lieux.find((l) => l.id === id && l.actif)

  if (!lieu) {
    return (
      <div className="page page-centree">
        <MessageErreur cas="retiree" onAction={() => navigate('/')} />
      </div>
    )
  }

  const { active, prochaines } = animationsDuLieu(etat, lieu.id)
  const distance = position.coords ? distanceM(position.coords, lieu) : null
  const image = imageLieu(lieu.image)

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
          onClick={() => (distance === null ? position.demander() : navigate(`/?lieu=${lieu.id}`))}
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

        {active && (
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
        <button type="button" className="btn btn-primaire btn-bloc" disabled={!active} onClick={() => navigate(`/lieux/${lieu.id}/ra`)}>
          <Icone nom="scan" taille={18} />
          {t('lieu.voirRA')}
        </button>
      </div>
      <NavBas />
      <FormulaireSignalement cible={cible} onFermer={() => setCible(null)} />
    </div>
  )
}

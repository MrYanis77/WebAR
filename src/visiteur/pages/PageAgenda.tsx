import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { animationActive } from '../../commun/store'
import type { Animation, Lieu } from '../../commun/types'
import { useDonneesPubliques } from '../donneesPubliques'
import { BoutonLangue } from '../composants/Feuilles'
import { NavBas } from '../composants/NavBas'
import { lieuxVisibles } from '../utils'

const JOUR_MS = 86_400_000

/**
 * Agenda en deux parties : « À vivre en ce moment » (spectacles en cours, à voir dès maintenant sur
 * place) et « Bientôt » (prochaines sorties), selon la période de validité des animations (BF-22, BF-26).
 */
export default function PageAgenda() {
  const { t, date } = useLangue()
  const etat = useDonneesPubliques()
  const navigate = useNavigate()
  const lieux = useMemo(() => lieuxVisibles(etat), [etat])
  const [filtre, setFiltre] = useState<string>('tous')
  const now = new Date()

  const elements = etat.animations
    .filter((a) => a.type === 'LIEU' && a.statut === 'PUBLIEE' && lieux.some((l) => l.id === a.lieuId))
    .filter((a) => !a.fin || new Date(a.fin) >= now)
    .filter((a) => filtre === 'tous' || a.lieuId === filtre)
    .map((a) => ({ a, lieu: lieux.find((l) => l.id === a.lieuId)!, enCours: animationActive(a, now) }))
  const maintenant = elements.filter((e) => e.enCours).sort((x, y) => (x.a.fin ?? '9999').localeCompare(y.a.fin ?? '9999'))
  const bientot = elements.filter((e) => !e.enCours).sort((x, y) => x.a.debut.localeCompare(y.a.debut))

  /** « Aujourd'hui à 20:30 », « Demain à 18:00 », sinon la date complète. */
  function quand(debut: string) {
    const d = new Date(debut)
    const h = date(debut, { hour: '2-digit', minute: '2-digit' })
    const jours = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / JOUR_MS)
    if (jours === 0) return t('agenda.aujourdhuiA', { h })
    if (jours === 1) return t('agenda.demainA', { h })
    return t('agenda.des', { date: date(debut, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })
  }

  const carte = ({ a, lieu, enCours }: { a: Animation; lieu: Lieu; enCours: boolean }) => {
    const jours = Math.ceil((new Date(a.debut).getTime() - now.getTime()) / JOUR_MS)
    return (
      <li key={a.id}>
        <button type="button" className="carte-agenda" onClick={() => navigate(`/lieux/${lieu.id}`)}>
          {lieu.image ? <img src={lieu.image} alt="" /> : <div className="image-vide" />}
          <div>
            <span className={`pill ${enCours ? 'pill-cyan' : 'pill-wine'}`}>
              {enCours ? t('agenda.enCours') : jours > 1 ? t('agenda.dansJours', { n: jours }) : date(a.debut, { day: 'numeric', month: 'short' })}
            </span>
            <h3>{a.titre}</h3>
            <p>
              <Icone nom="pin" taille={12} /> {lieu.nom}
            </p>
            <p>
              <Icone nom="horloge" taille={12} />{' '}
              {enCours ? (a.fin ? t('agenda.jusquau', { date: date(a.fin, { day: 'numeric', month: 'long' }) }) : t('lieu.permanent')) : quand(a.debut)} ·{' '}
              {t('lieu.duree', { m: Math.round(a.dureeS / 60) })}
            </p>
          </div>
          <Icone nom="droite" taille={18} />
        </button>
      </li>
    )
  }

  return (
    <div className="page page-defilante page-agenda">
      <div className="entete-mobile">
        <span className="marque-mini" aria-hidden="true">
          M
        </span>
        <BoutonLangue />
      </div>
      <main>
        <p className="eyebrow">{t('agenda.sur')}</p>
        <h1>{t('agenda.titre')}</h1>
        <div className="filtres" role="group" aria-label={t('nav.agenda')}>
          <button type="button" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}>
            {t('agenda.tous')}
          </button>
          {lieux.map((l) => (
            <button key={l.id} type="button" aria-pressed={filtre === l.id} onClick={() => setFiltre(l.id)}>
              {l.nomCourt}
            </button>
          ))}
        </div>

        <section className="section-agenda" aria-labelledby="agenda-maintenant">
          <div className="titre-agenda">
            <span className="point-direct" aria-hidden="true" />
            <div>
              <h2 id="agenda-maintenant">{t('agenda.maintenant')}</h2>
              <small>{t('agenda.maintenantNote')}</small>
            </div>
          </div>
          {maintenant.length === 0 ? <p className="note-vide">{t('agenda.videMaintenant')}</p> : <ul>{maintenant.map(carte)}</ul>}
        </section>

        <section className="section-agenda" aria-labelledby="agenda-bientot">
          <div className="titre-agenda">
            <Icone nom="calendrier" taille={18} />
            <div>
              <h2 id="agenda-bientot">{t('agenda.bientot')}</h2>
              <small>{t('agenda.bientotNote')}</small>
            </div>
          </div>
          {bientot.length === 0 ? <p className="note-vide">{t('agenda.videBientot')}</p> : <ul>{bientot.map(carte)}</ul>}
        </section>
      </main>
      <NavBas />
    </div>
  )
}

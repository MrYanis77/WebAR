import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { animationActive, useEtat } from '../../commun/store'
import { BoutonLangue } from '../composants/Feuilles'
import { NavBas } from '../composants/NavBas'
import { lieuxVisibles } from '../utils'

/** Agenda : animations de lieu en cours et à venir, selon leur période de validité (BF-22, BF-26). */
export default function PageAgenda() {
  const { t, date } = useLangue()
  const etat = useEtat()
  const navigate = useNavigate()
  const lieux = useMemo(() => lieuxVisibles(etat), [etat])
  const [filtre, setFiltre] = useState<string>('tous')
  const now = new Date()

  const elements = etat.animations
    .filter((a) => a.type === 'LIEU' && a.statut === 'PUBLIEE' && lieux.some((l) => l.id === a.lieuId))
    .filter((a) => !a.fin || new Date(a.fin) >= now)
    .filter((a) => filtre === 'tous' || a.lieuId === filtre)
    .map((a) => ({ a, lieu: lieux.find((l) => l.id === a.lieuId)!, enCours: animationActive(a, now) }))
    .sort((x, y) => Number(y.enCours) - Number(x.enCours) || x.a.debut.localeCompare(y.a.debut))

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
        <div className="filtres" role="group">
          <button type="button" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}>
            {t('agenda.tous')}
          </button>
          {lieux.map((l) => (
            <button key={l.id} type="button" aria-pressed={filtre === l.id} onClick={() => setFiltre(l.id)}>
              {l.nomCourt}
            </button>
          ))}
        </div>
        {elements.length === 0 && <p className="note-vide">{t('agenda.vide')}</p>}
        {elements.map(({ a, lieu, enCours }) => (
          <button key={a.id} type="button" className="carte-agenda" onClick={() => navigate(`/lieux/${lieu.id}`)}>
            {imageLieu(lieu.image) ? <img src={imageLieu(lieu.image)} alt="" /> : <div className="image-vide" />}
            <div>
              <span className={`pill ${enCours ? 'pill-cyan' : 'pill-wine'}`}>
                {enCours ? t('agenda.enCours') : date(a.debut, { day: 'numeric', month: 'short' })}
              </span>
              <h3>{a.titre}</h3>
              <p>
                <Icone nom="pin" taille={12} /> {lieu.nom}
              </p>
              <p>
                <Icone nom="horloge" taille={12} />{' '}
                {enCours
                  ? a.fin
                    ? t('agenda.jusquau', { date: date(a.fin, { day: 'numeric', month: 'long' }) })
                    : t('lieu.permanent')
                  : t('agenda.des', { date: date(a.debut, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })}{' '}
                · {t('lieu.duree', { m: Math.round(a.dureeS / 60) })}
              </p>
            </div>
            <Icone nom="droite" taille={18} />
          </button>
        ))}
      </main>
      <NavBas />
    </div>
  )
}

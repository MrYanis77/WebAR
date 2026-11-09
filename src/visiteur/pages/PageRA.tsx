import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { useEtat } from '../../commun/store'
import { Consignes } from '../composants/Consignes'
import { MessageErreur } from '../composants/MessageErreur'
import { VueRA } from '../composants/VueRA'
import { useCompatibilite } from '../hooks/capteurs'
import { deverrouillerSon } from '../services/son'
import { animationsDuLieu, consignesVues, marquerConsignesVues } from '../utils'

/** Animation de lieu : reconnaissance de la façade, ou lancement manuel dans le rayon (BF-17, BF-18). */
export default function PageRA() {
  const { id } = useParams()
  const { t, date } = useLangue()
  const navigate = useNavigate()
  const etat = useEtat()
  const compat = useCompatibilite()
  const [simulee, setSimulee] = useState(false)
  const [etape, setEtape] = useState<'consignes' | 'ra' | 'refus' | 'incompatible'>(() =>
    !compat.compatible ? 'incompatible' : consignesVues() ? 'ra' : 'consignes',
  )
  const lieu = etat.lieux.find((l) => l.id === id && l.actif)
  const quitter = useCallback(() => navigate(id ? `/?lieu=${id}` : '/'), [navigate, id])
  const refus = useCallback(() => setEtape('refus'), [])

  if (!lieu) {
    return (
      <div className="page page-centree">
        <MessageErreur cas="retiree" onAction={() => navigate('/')} />
      </div>
    )
  }

  const { active, prochaines } = animationsDuLieu(etat, lieu.id)

  if (etape === 'incompatible') {
    return (
      <div className="page page-centree">
        <MessageErreur cas="incompatible" onAction={() => navigate(`/lieux/${lieu.id}`)} />
      </div>
    )
  }

  if (etape === 'consignes') {
    return (
      <Consignes
        onRetour={() => navigate(-1)}
        onTerminer={() => {
          deverrouillerSon()
          marquerConsignesVues()
          setEtape('ra')
        }}
      />
    )
  }

  if (etape === 'refus') {
    return (
      <div className="page page-centree colonne">
        <MessageErreur
          cas="camera"
          onAction={() => navigate(`/?lieu=${lieu.id}`)}
          secondaire={{ libelle: t('lieu.sansRA'), onClick: () => navigate(`/lieux/${lieu.id}`) }}
        />
        <button type="button" className="btn btn-texte btn-bloc" onClick={() => { setSimulee(true); setEtape('ra') }}>
          {t('ra.camSimulee')}
        </button>
      </div>
    )
  }

  if (!active) {
    const p = prochaines[0]
    return (
      <div className="page page-centree">
        <div className="message-erreur-bloc">
          <h2>{t('carte.aucunSpectacle')}</h2>
          <p>
            {t('ra.indisponible')}
            {p && ` ${t('agenda.des', { date: date(p.debut, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })} : ${p.titre}.`}
          </p>
          <button type="button" className="btn btn-primaire btn-bloc" onClick={() => navigate('/agenda')}>
            {t('erreur.expiree.action')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <VueRA
      key={active.id}
      mode="monument"
      lieu={lieu}
      animation={active}
      cameraAutorisee={!simulee}
      onQuitter={quitter}
      onCameraRefusee={refus}
    />
  )
}

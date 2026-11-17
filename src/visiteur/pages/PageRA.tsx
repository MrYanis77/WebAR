import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { useDonneesPubliques } from '../donneesPubliques'
import { Consignes } from '../composants/Consignes'
import { MessageErreur } from '../composants/MessageErreur'
import { VueRA } from '../composants/VueRA'
import { useCompatibilite } from '../hooks/capteurs'
import { demanderCapteursMouvement, prechargerRA } from '../ra/moteur'
import { deverrouillerSon } from '../services/son'
import { animationsDuLieu, consignesVues, marquerConsignesVues } from '../utils'

/**
 * Animation de monument : posée à son point GPS en 3D (position, hauteur, orientation, taille réglées
 * dans le back-office) dès que le visiteur est dans le rayon du lieu, grâce au GPS et à la boussole.
 */
export default function PageRA() {
  const { id } = useParams()
  const { t, date } = useLangue()
  const navigate = useNavigate()
  const etat = useDonneesPubliques()
  const compat = useCompatibilite()
  const [simulee, setSimulee] = useState(false)
  // Consignes toujours proposées (le dernier écran seulement si elles ont déjà été lues) : sur iPhone,
  // leur bouton est le geste qui autorise les capteurs de mouvement (SLAM) et la boussole.
  const [etape, setEtape] = useState<'consignes' | 'ra' | 'refus' | 'incompatible'>(() => (!compat.compatible ? 'incompatible' : 'consignes'))
  const lieu = etat.lieux.find((l) => l.id === id && l.actif)
  const aPrecharger = lieu ? animationsDuLieu(etat, lieu.id).active : undefined

  // Téléchargement en arrière-plan pendant les consignes : moteur de RA, modèle 3D et son.
  const [modeleUrl, sonUrl] = [aPrecharger?.modeleUrl, aPrecharger?.sonUrl]
  useEffect(() => {
    if (modeleUrl && compat.compatible) prechargerRA([modeleUrl, sonUrl])
  }, [modeleUrl, sonUrl, compat.compatible])
  const quitter = useCallback(() => navigate(id ? `/?lieu=${id}` : '/'), [navigate, id])
  const refus = useCallback(() => setEtape('refus'), [])

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
        etapeDepart={consignesVues() ? 2 : 0}
        onTerminer={() => {
          // Dans le clic : autorisations demandées pendant le geste du visiteur (iPhone).
          void demanderCapteursMouvement()
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
